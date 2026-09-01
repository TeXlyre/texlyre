// src/hooks/useDiskFiles.ts
import { useCallback, useEffect, useRef, useState } from 'react';

import { t } from '@/i18n';
import { createNamedLogger } from '@/logging';
import { collabService } from '../services/CollabService';
import { fileHandlerService } from '../services/FileHandlerService';
import { fileStoreService } from '../services/FileStoreService';
import { notificationService } from '../services/NotificationService';
import type { PendingShareFile } from '../services/ShareTargetService';
import { useRecords } from './useRecords';
import { workspaceActivityService } from '../services/WorkspaceActivityService';
import type { FileNode } from '../types/files';
import { workspaceService } from '../services/WorkspaceService';

const moduleLog = createNamedLogger('useDiskFiles');

const applyToProject = async (
	projectId: string,
	file: FileNode,
	content: string | ArrayBuffer,
): Promise<void> => {
	await fileStoreService.updateFileContent(file.id, content);

	if (!file.documentId) return;

	const text =
		typeof content === 'string' ? content : new TextDecoder().decode(content);
	await collabService.updateDocumentContent(
		projectId,
		file.documentId,
		() => text,
	);
};
const SYNC_COOLDOWN_MS = 2000;

export const useDiskFiles = (docUrl: string | null) => {
	const [launchedFiles, setLaunchedFiles] = useState<PendingShareFile[]>([]);
	const isSyncingRef = useRef(false);
	const lastSyncRef = useRef(0);
	const recordsContext = useRecords();

	useEffect(() => {
		workspaceActivityService.setRecordsContext(recordsContext);
	}, [recordsContext]);

	useEffect(() => {
		fileHandlerService.initialize();
		return fileHandlerService.addLaunchListener((files) => {
			setLaunchedFiles(
				files.map(({ name, type, buffer, handle }) => ({
					name,
					type,
					buffer,
					handle,
				})),
			);
		});
	}, []);

	const clearLaunchedFiles = useCallback(() => {
		setLaunchedFiles([]);
	}, []);

	useEffect(() => {
		if (!docUrl) return;

		const projectId = docUrl.replace(/^yjs:/, '');
		let isCancelled = false;

		const seedLinks = async () => {
			if (await workspaceService.restore(projectId)) {
				await workspaceService.refreshLinks();
				return;
			}

			if (!fileHandlerService.isSupported()) return;
			const files = await fileStoreService.getAllFiles(false, false, false);
			if (isCancelled) return;
			fileHandlerService.resetLinks(
				files.filter((file) => file.launchHandle).map((file) => file.id),
			);
		};

		const syncFromDisk = async () => {
			if (document.visibilityState !== 'visible') return;
			if (isSyncingRef.current) return;
			if (Date.now() - lastSyncRef.current < SYNC_COOLDOWN_MS) return;

			isSyncingRef.current = true;
			try {
				let files: FileNode[] = [];
				let stats: Map<string, number> | undefined;

				if (fileHandlerService.hasWorkspace()) {
					const reconciled = await workspaceService.reconcile();
					const launchIds = fileHandlerService.getLaunchLinkedIds();
					if (!reconciled.changed && launchIds.length === 0) return;

					files = reconciled.changed ? reconciled.files : [];
					stats = reconciled.stats;

					if (launchIds.length > 0) {
						const tracked = new Set(files.map((file) => file.id));
						const launched = (
							await fileStoreService.getFilesByIds(launchIds)
						).filter((file) => !tracked.has(file.id));
						files = [...files, ...launched];
					}

					if (reconciled.added || reconciled.removed || reconciled.renamed) {
						document.dispatchEvent(new CustomEvent('refresh-file-tree'));
					}
				} else {
					const linkedIds = fileHandlerService.getLinkedIds();
					if (linkedIds.length === 0) return;
					files = await fileStoreService.getFilesByIds(linkedIds);
				}

				const summary = await fileHandlerService.syncFromDisk(
					files,
					(file, content) => applyToProject(projectId, file, content),
					stats,
				);

				if (summary.applied.length > 0) {
					notificationService.showInfo(
						t('Reloaded {count} files from disk', {
							count: summary.applied.length,
						}),
					);
				}
				if (summary.merged.length > 0) {
					notificationService.showInfo(
						t('Merged folder changes into {count} files', {
							count: summary.merged.length,
						}),
					);
				}
				if (summary.droppedAnnotations > 0) {
					notificationService.showInfo(
						t('{count} annotations were dropped on edited lines', {
							count: summary.droppedAnnotations,
						}),
					);
				}
				if (summary.conflicted.length > 0) {
					notificationService.showError(
						t('{count} files changed on disk but also have local changes', {
							count: summary.conflicted.length,
						}),
					);
				}

				const appliedFiles = summary.appliedPaths ?? summary.applied;
				const mergedFiles = summary.mergedPaths ?? summary.merged;
				const conflictedFiles = summary.conflictedPaths ?? summary.conflicted;
				const annotationDrops = summary.annotationDrops ?? [];

				if (appliedFiles.length > 0) {
					await workspaceActivityService.record(projectId, {
						type: 'pulled',
						message: t('Reloaded from folder: {files}', {
							files: appliedFiles.join(', '),
						}),
					});
				}
				if (mergedFiles.length > 0) {
					await workspaceActivityService.record(projectId, {
						type: 'merged',
						message: t('Merged external edits: {files}', {
							files: mergedFiles.join(', '),
						}),
					});
				}
				if (conflictedFiles.length > 0) {
					await workspaceActivityService.record(projectId, {
						type: 'conflict',
						message: t('Folder changes conflict with local edits: {files}', {
							files: conflictedFiles.join(', '),
						}),
					});
				}
				if (annotationDrops.length > 0) {
					await workspaceActivityService.record(projectId, {
						type: 'annotations-dropped',
						message: t('Dropped annotations while merging: {files}', {
							files: annotationDrops
								.map(({ path, count }) => `${path} (${count})`)
								.join(', '),
						}),
					});
				}
			} catch (error) {
				moduleLog.error('Failed to sync files from disk:', error);
			} finally {
				lastSyncRef.current = Date.now();
				isSyncingRef.current = false;
			}
		};

		const initialize = async () => {
			try {
				await seedLinks();
				if (!isCancelled) await syncFromDisk();
			} catch (error) {
				moduleLog.error('Failed to resolve disk-linked files:', error);
			}
		};

		void initialize();
		window.addEventListener('focus', syncFromDisk);
		document.addEventListener('visibilitychange', syncFromDisk);

		return () => {
			isCancelled = true;
			workspaceService.deactivate();
			window.removeEventListener('focus', syncFromDisk);
			document.removeEventListener('visibilitychange', syncFromDisk);
		};
	}, [docUrl]);

	return { launchedFiles, clearLaunchedFiles };
};
