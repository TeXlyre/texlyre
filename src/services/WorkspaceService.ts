// src/services/WorkspaceService.ts
import { nanoid } from 'nanoid';

import { t } from '@/i18n';
import { createNamedLogger } from '@/logging';
import type { FileNode } from '../types/files';
import { stripAnnotations } from '../utils/fileCommentUtils';
import { getMimeType, isBinaryFile, isTemporaryFile } from '../utils/fileUtils';
import { fileHandlerService } from './FileHandlerService';
import { fileStoreService } from './FileStoreService';
import {
	type ConflictResolution,
	fileConflictPromptService,
} from './FileConflictPromptService';
import { collabService } from './CollabService';
import { DiskHandleStore, ensurePermission } from './DiskHandleStore';
import { workspaceActivityService } from './WorkspaceActivityService';
import { authService } from './AuthService';
import { DirectoryTarget } from './WriteTargetService';

const moduleLog = createNamedLogger('WorkspaceService');
const IGNORED_DIRECTORIES = new Set([
	'.git',
	'.svn',
	'node_modules',
	'.texlyre',
]);

export interface DiskSnapshotEntry {
	lastModified: number;
	size: number;
	isDirectory?: boolean;
}

export interface WorkspaceMergeResult {
	imported: number;
	exported: number;
	merged: number;
	skipped: number;
}

export interface ReconcileResult {
	changed: boolean;
	files: FileNode[];
	stats: Map<string, number>;
	added: number;
	removed: number;
	renamed: number;
}

export interface WorkspaceStatus {
	isConnected: boolean;
	needsPermission: boolean;
	projectId: string | null;
	directoryName: string | null;
	fileCount: number;
	lastSyncedAt: number | null;
}

type WorkspaceListener = (status: WorkspaceStatus) => void;

class WorkspaceService {
	private handleStore = new DiskHandleStore<FileSystemDirectoryHandle>(
		'texlyre-workspace-handles',
	);
	private rootHandle: FileSystemDirectoryHandle | null = null;
	private projectId: string | null = null;
	private listeners: WorkspaceListener[] = [];
	private snapshot = new Map<string, DiskSnapshotEntry>();
	private needsPermission = false;
	private linkedCount = 0;
	private lastSyncedAt: number | null = null;

	isSupported(): boolean {
		return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
	}

	getStatus(): WorkspaceStatus {
		return {
			isConnected: this.rootHandle !== null && !this.needsPermission,
			needsPermission: this.needsPermission,
			projectId: this.projectId,
			directoryName: this.rootHandle?.name ?? null,
			fileCount: this.linkedCount,
			lastSyncedAt: this.lastSyncedAt,
		};
	}

	async reconnect(): Promise<boolean> {
		if (!this.projectId) return false;

		const handle =
			this.rootHandle ?? (await this.handleStore.load(this.projectId));
		if (!handle) return false;

		if (!(await ensurePermission(handle, 'readwrite'))) {
			this.rootHandle = handle;
			this.needsPermission = true;
			this.notify();
			return false;
		}

		await this.activate(this.projectId, handle);
		await this.refreshLinks();
		await workspaceActivityService.record(this.projectId, {
			type: 'reconnected',
			message: t('Restored access to folder: {folder}', {
				folder: handle.name,
			}),
		});
		return true;
	}

	async changeFolder(): Promise<boolean> {
		if (!this.projectId) return false;

		const handle = await this.pickFolder();
		if (!handle) return false;

		const adapter = new DirectoryTarget(handle);
		const entries = await adapter.listEntries('');
		if (entries.length > 0) {
			throw new Error(
				t('Choose an empty folder, or import it as a separate project'),
			);
		}

		const projectId = this.projectId;
		await this.handleStore.save(projectId, handle);
		await this.activate(projectId, handle);
		this.snapshot.clear();

		const files = await fileStoreService.getAllFiles(false, false, true);
		const mirroredFiles = files.filter((file) => file.type === 'file');
		await fileHandlerService.mirrorFiles(mirroredFiles);
		await this.refreshLinks();
		if (mirroredFiles.length > 0) {
			await workspaceActivityService.record(projectId, {
				type: 'exported',
				message: t('Wrote project files to folder: {files}', {
					files: mirroredFiles.map((file) => file.path).join(', '),
				}),
			});
		}
		await workspaceActivityService.record(projectId, {
			type: 'folder-changed',
			message: t('Changed folder to: {folder}', { folder: handle.name }),
		});
		return true;
	}

	addStatusListener(listener: WorkspaceListener): () => void {
		this.listeners.push(listener);
		return () => {
			this.listeners = this.listeners.filter((l) => l !== listener);
		};
	}

	async pickFolder(): Promise<FileSystemDirectoryHandle | null> {
		if (!this.isSupported()) {
			throw new Error(t('File System Access API not supported'));
		}

		return (window as any).showDirectoryPicker({
			mode: 'readwrite',
			id: 'texlyre-workspace',
		});
	}

	async link(
		projectId: string,
		handle: FileSystemDirectoryHandle,
	): Promise<void> {
		if (!(await ensurePermission(handle, 'readwrite'))) {
			throw new Error(t('Write access to the folder was not granted'));
		}
		await this.handleStore.save(projectId, handle);
		await this.handleStore.savePending(projectId);
		await this.setDiskLinkedFlag(projectId, true);
	}

	async connect(projectId: string): Promise<boolean> {
		const handle = await this.pickFolder();
		if (!handle) return false;

		await this.link(projectId, handle);
		await this.activate(projectId, handle);
		await this.mergeDirectory();
		await workspaceActivityService.record(projectId, {
			type: 'connected',
			message: t('Connected to folder: {folder}', { folder: handle.name }),
		});
		await this.handleStore.clearPending(projectId);
		return true;
	}

	async mergeDirectory(): Promise<WorkspaceMergeResult> {
		const summary: WorkspaceMergeResult = {
			imported: 0,
			exported: 0,
			merged: 0,
			skipped: 0,
		};
		if (!this.rootHandle) return summary;

		const adapter = new DirectoryTarget(this.rootHandle);
		const directories: FileNode[] = [];
		const files: FileNode[] = [];
		await this.walk(adapter, '', directories, files);

		const stored = await fileStoreService.getAllFiles(false, false, true);
		const tracked = new Map(
			stored
				.filter((file) => !isTemporaryFile(file.path))
				.map((file) => [file.path, file]),
		);

		const toStore: FileNode[] = [];
		const toExport: FileNode[] = [];
		const mergedBack: FileNode[] = [];
		const importedPaths: string[] = [];
		const mergedPaths: string[] = [];
		const keptProjectPaths: string[] = [];

		for (const directory of directories) {
			if (!tracked.has(directory.path)) toStore.push(directory);
		}

		for (const incoming of files) {
			const existing = tracked.get(incoming.path);

			if (!existing) {
				toStore.push(incoming);
				importedPaths.push(incoming.path);
				summary.imported++;
				continue;
			}

			const resolution = await this.resolveContentConflict(existing, incoming);
			if (resolution === 'keep-disk') {
				const stored = { ...incoming, id: existing.id };
				toStore.push(stored);
				if (incoming.content !== undefined) mergedBack.push(stored);
				mergedPaths.push(incoming.path);
				summary.merged++;
			} else if (resolution === 'keep-project') {
				toExport.push(existing);
				keptProjectPaths.push(existing.path);
			} else {
				summary.skipped++;
			}
		}

		if (toStore.length > 0) {
			await fileHandlerService.withoutMirroring(() =>
				fileStoreService.batchStoreFiles(toStore, {
					showConflictDialog: false,
					preserveTimestamp: true,
				}),
			);
			await this.syncLinkedDocuments(toStore);
		}

		const projectOnly = stored.filter(
			(file) =>
				file.type === 'file' &&
				!isTemporaryFile(file.path) &&
				!files.some((incoming) => incoming.path === file.path),
		);
		const projectOnlyPaths = projectOnly.map((file) => file.path);
		const outgoing = [...projectOnly, ...toExport, ...mergedBack];
		if (outgoing.length > 0) {
			await fileHandlerService.mirrorFiles(outgoing);
			summary.exported = outgoing.length;
		}

		await this.refreshLinks();
		if (this.projectId) {
			if (importedPaths.length > 0) {
				await workspaceActivityService.record(this.projectId, {
					type: 'imported',
					message: t('Imported from folder: {files}', {
						files: importedPaths.join(', '),
					}),
				});
			}
			if (mergedPaths.length > 0) {
				await workspaceActivityService.record(this.projectId, {
					type: 'merged',
					message: t('Applied folder changes to TeXlyre: {files}', {
						files: mergedPaths.join(', '),
					}),
				});
			}
			if (keptProjectPaths.length > 0) {
				await workspaceActivityService.record(this.projectId, {
					type: 'exported',
					message: t('Kept TeXlyre version on disk: {files}', {
						files: keptProjectPaths.join(', '),
					}),
				});
			}
			if (projectOnlyPaths.length > 0) {
				await workspaceActivityService.record(this.projectId, {
					type: 'exported',
					message: t('Wrote project files to folder: {files}', {
						files: projectOnlyPaths.join(', '),
					}),
				});
			}
		}

		return summary;
	}

	private async syncLinkedDocuments(files: FileNode[]): Promise<void> {
		if (!this.projectId) return;

		for (const file of files) {
			if (!file.documentId || typeof file.content !== 'string') continue;

			try {
				await collabService.updateDocumentContent(
					this.projectId,
					file.documentId,
					() => file.content as string,
				);
			} catch (error) {
				moduleLog.error(`Failed to update document for ${file.path}:`, error);
			}
		}
	}

	private async resolveContentConflict(
		existing: FileNode,
		incoming: FileNode,
	): Promise<'keep-disk' | 'keep-project' | 'identical'> {
		if (existing.type !== 'file') return 'identical';

		if (
			typeof existing.content === 'string' &&
			typeof incoming.content === 'string'
		) {
			if (stripAnnotations(existing.content) === incoming.content) {
				return 'identical';
			}
		} else if (
			existing.content instanceof ArrayBuffer &&
			incoming.content instanceof ArrayBuffer &&
			existing.content.byteLength === incoming.content.byteLength
		) {
			return 'identical';
		}

		let resolution: ConflictResolution;
		try {
			resolution = await fileConflictPromptService.resolveConflict(
				existing,
				incoming,
			);
		} catch {
			return 'keep-project';
		}

		if (resolution === 'overwrite') return 'keep-disk';
		if (resolution !== 'merge') return 'keep-project';

		return this.resolveWithMergeView(existing, incoming);
	}

	private async resolveWithMergeView(
		existing: FileNode,
		incoming: FileNode,
	): Promise<'keep-disk' | 'keep-project' | 'identical'> {
		if (typeof incoming.content !== 'string') return 'keep-disk';

		const reviewed = await fileHandlerService.mergeWithView(
			existing,
			incoming.content,
		);
		if (reviewed === null) return 'keep-project';

		incoming.content = reviewed;
		incoming.size = new Blob([reviewed]).size;
		return 'keep-disk';
	}

	async restore(projectId: string): Promise<boolean> {
		const project = await authService.getProjectById(projectId);
		const handle = await this.handleStore.load(projectId);

		if (!project?.isDiskLinked && !handle) return false;
		if (handle && !project?.isDiskLinked) {
			await this.setDiskLinkedFlag(projectId, true);
		}

		if (!handle) {
			this.projectId = projectId;
			this.needsPermission = true;
			this.notify();
			return true;
		}

		if (!(await ensurePermission(handle, 'readwrite', false))) {
			this.projectId = projectId;
			this.rootHandle = handle;
			this.needsPermission = true;
			this.notify();
			await workspaceActivityService.record(projectId, {
				type: 'permission-lost',
				message: t('Folder access required: {folder}', {
					folder: handle.name,
				}),
			});
			return true;
		}

		await this.activate(projectId, handle);

		if (await this.handleStore.isPending(projectId)) {
			await this.importDirectory();
			await this.handleStore.clearPending(projectId);
		} else {
			await this.refreshLinks();
		}

		return true;
	}

	deactivate(): void {
		if (!this.rootHandle && !this.projectId) return;
		this.rootHandle = null;
		this.projectId = null;
		this.needsPermission = false;
		this.lastSyncedAt = null;
		this.linkedCount = 0;
		this.snapshot.clear();
		fileHandlerService.detachWorkspace();
		this.notify();
	}

	async disconnect(): Promise<void> {
		if (this.projectId) await this.handleStore.clear(this.projectId);
		const projectId = this.projectId;
		this.rootHandle = null;
		this.projectId = null;
		this.needsPermission = false;
		this.lastSyncedAt = null;
		this.linkedCount = 0;
		this.snapshot.clear();
		fileHandlerService.detachWorkspace();

		if (projectId) {
			await this.setDiskLinkedFlag(projectId, false);
			await workspaceActivityService.clear(projectId);
		}

		this.notify();
	}

	async importDirectory(): Promise<number> {
		if (!this.rootHandle) return 0;

		const adapter = new DirectoryTarget(this.rootHandle);
		const directories: FileNode[] = [];
		const files: FileNode[] = [];
		await this.walk(adapter, '', directories, files);

		if (directories.length > 0 || files.length > 0) {
			await fileHandlerService.withoutMirroring(() =>
				fileStoreService.batchStoreFiles([...directories, ...files], {
					showConflictDialog: false,
					preserveTimestamp: true,
				}),
			);
		}

		await this.refreshLinks();
		return files.length;
	}

	async refreshLinks(): Promise<string[]> {
		if (!this.rootHandle) return [];

		const stored = await fileStoreService.getAllFiles(false, false, false);
		const linked = stored
			.filter((file) => file.type === 'file' && !isTemporaryFile(file.path))
			.map((file) => file.id);

		fileHandlerService.resetLinks(linked);
		fileHandlerService.setLaunchLinks(
			stored.filter((file) => file.launchHandle).map((file) => file.id),
		);
		this.linkedCount = linked.length;
		this.notify();
		return linked;
	}

	async reconcile(): Promise<ReconcileResult> {
		const empty: ReconcileResult = {
			changed: false,
			files: [],
			stats: new Map(),
			added: 0,
			removed: 0,
			renamed: 0,
		};
		if (!this.rootHandle) return empty;

		const adapter = new DirectoryTarget(this.rootHandle);
		const disk = new Map<string, DiskSnapshotEntry>();
		await this.collectStats(adapter, '', disk);

		this.lastSyncedAt = Date.now();
		if (this.isUnchanged(disk)) return empty;
		this.snapshot = disk;

		const stored = await fileStoreService.getAllFiles(false, false, true);
		const tracked = stored.filter((file) => !isTemporaryFile(file.path));
		const trackedPaths = new Map(tracked.map((file) => [file.path, file]));

		const addedPaths = [...disk.keys()].filter(
			(path) => !trackedPaths.has(path),
		);
		fileHandlerService.setLaunchLinks(
			stored.filter((file) => file.launchHandle).map((file) => file.id),
		);
		const removedFiles = tracked.filter(
			(file) => !disk.has(file.path) && !file.launchHandle,
		);

		const renamed = this.pairRenames(addedPaths, removedFiles, disk);
		const toStore: FileNode[] = [];
		const toExport: FileNode[] = [];
		const mergedBack: FileNode[] = [];
		const toDelete: string[] = [];
		const addedActivityPaths: string[] = [];
		const removedActivityPaths: string[] = [];
		const renamedActivityPaths: string[] = [];

		for (const [newPath, source] of renamed) {
			renamedActivityPaths.push(`${source.path} → ${newPath}`);
			toStore.push({
				...source,
				id: nanoid(),
				name: newPath.split('/').pop() ?? source.name,
				path: newPath,
				lastModified: disk.get(newPath)?.lastModified ?? Date.now(),
			});
			toDelete.push(source.id);
		}

		for (const path of addedPaths) {
			if (renamed.has(path)) continue;

			const entry = disk.get(path);
			if (entry?.isDirectory) {
				toStore.push({
					id: nanoid(),
					name: path.split('/').pop() ?? path,
					path,
					type: 'directory',
					lastModified: Date.now(),
				});
				addedActivityPaths.push(path);
				continue;
			}

			const node = await this.readNode(adapter, path, entry);
			if (node) {
				toStore.push(node);
				addedActivityPaths.push(path);
			}
		}

		for (const file of removedFiles) {
			if (toDelete.includes(file.id)) continue;
			removedActivityPaths.push(file.path);
			toDelete.push(file.id);
		}

		await fileHandlerService.withoutMirroring(async () => {
			if (toStore.length > 0) {
				await fileStoreService.batchStoreFiles(toStore, {
					showConflictDialog: false,
					preserveTimestamp: true,
				});
			}
			if (toDelete.length > 0) {
				await fileStoreService.batchDeleteFiles(toDelete, {
					showDeleteDialog: false,
					allowLinkedFileDelete: true,
				});
			}
		});

		const files = (
			toStore.length > 0 || toDelete.length > 0
				? await fileStoreService.getAllFiles(false, false, true)
				: tracked
		).filter((file) => file.type === 'file' && !isTemporaryFile(file.path));

		fileHandlerService.resetLinks(files.map((file) => file.id));
		this.linkedCount = files.length;
		this.notify();

		if (this.projectId) {
			if (addedActivityPaths.length > 0) {
				await workspaceActivityService.record(this.projectId, {
					type: 'added',
					message: t('Added from folder: {files}', {
						files: addedActivityPaths.join(', '),
					}),
				});
			}
			if (removedActivityPaths.length > 0) {
				await workspaceActivityService.record(this.projectId, {
					type: 'removed',
					message: t('Removed after deletion on disk: {files}', {
						files: removedActivityPaths.join(', '),
					}),
				});
			}
			if (renamedActivityPaths.length > 0) {
				await workspaceActivityService.record(this.projectId, {
					type: 'renamed',
					message: t('Renamed on disk: {files}', {
						files: renamedActivityPaths.join(', '),
					}),
				});
			}
		}

		return {
			changed: true,
			files,
			stats: new Map(
				[...disk.entries()]
					.filter(([, entry]) => !entry.isDirectory)
					.map(([path, entry]) => [path, entry.lastModified]),
			),
			added: addedPaths.length - renamed.size,
			removed: removedFiles.length - renamed.size,
			renamed: renamed.size,
		};
	}

	private isUnchanged(disk: Map<string, DiskSnapshotEntry>): boolean {
		if (this.snapshot.size !== disk.size) return false;

		for (const [path, entry] of disk) {
			const previous = this.snapshot.get(path);
			if (
				!previous ||
				previous.lastModified !== entry.lastModified ||
				previous.size !== entry.size
			) {
				return false;
			}
		}

		return true;
	}

	private pairRenames(
		addedPaths: string[],
		removedFiles: FileNode[],
		disk: Map<string, DiskSnapshotEntry>,
	): Map<string, FileNode> {
		const pairs = new Map<string, FileNode>();
		const claimed = new Set<string>();

		for (const path of addedPaths) {
			const entry = disk.get(path);
			if (!entry || entry.isDirectory) continue;

			const match = removedFiles.find(
				(file) =>
					file.type === 'file' &&
					!claimed.has(file.id) &&
					file.size === entry.size &&
					file.lastModified === entry.lastModified,
			);

			if (match) {
				pairs.set(path, match);
				claimed.add(match.id);
			}
		}

		return pairs;
	}

	private async readNode(
		adapter: DirectoryTarget,
		path: string,
		entry?: DiskSnapshotEntry,
	): Promise<FileNode | null> {
		try {
			return {
				id: nanoid(),
				name: path.split('/').pop() ?? path,
				path,
				type: 'file',
				content: await adapter.readFile(path),
				lastModified: entry?.lastModified ?? Date.now(),
				size: entry?.size,
				mimeType: getMimeType(path) || 'application/octet-stream',
				isBinary: isBinaryFile(path),
			};
		} catch (error) {
			moduleLog.error(`Failed to read ${path}:`, error);
			return null;
		}
	}

	private async collectStats(
		adapter: DirectoryTarget,
		path: string,
		into: Map<string, DiskSnapshotEntry>,
	): Promise<void> {
		let entries: Array<{ name: string; isDirectory: boolean }>;
		try {
			entries = await adapter.listEntries(path);
		} catch (error) {
			moduleLog.error(`Failed to list ${path || '/'}:`, error);
			return;
		}

		for (const entry of entries) {
			const entryPath = `${path}/${entry.name}`;

			if (entry.isDirectory) {
				if (IGNORED_DIRECTORIES.has(entry.name)) continue;
				if (isTemporaryFile(entryPath)) continue;
				into.set(entryPath, {
					lastModified: 0,
					size: 0,
					isDirectory: true,
				});
				await this.collectStats(adapter, entryPath, into);
				continue;
			}

			if (isTemporaryFile(entryPath)) continue;
			const stats = await adapter.stat(entryPath);
			if (stats) into.set(entryPath, stats);
		}
	}

	private async setDiskLinkedFlag(
		projectId: string,
		isDiskLinked: boolean,
	): Promise<void> {
		try {
			const project = await authService.getProjectById(projectId);
			if (!project || project.isDiskLinked === isDiskLinked) return;
			await authService.updateProject({ ...project, isDiskLinked });
		} catch (error) {
			moduleLog.error(`Failed to flag ${projectId} as disk linked:`, error);
		}
	}

	private async activate(
		projectId: string,
		handle: FileSystemDirectoryHandle,
	): Promise<void> {
		this.rootHandle = handle;
		this.projectId = projectId;
		this.needsPermission = false;
		fileHandlerService.attachWorkspace(new DirectoryTarget(handle));
		this.notify();
	}

	private async walk(
		adapter: DirectoryTarget,
		path: string,
		directories: FileNode[],
		files: FileNode[],
	): Promise<void> {
		let entries: Array<{ name: string; isDirectory: boolean }>;
		try {
			entries = await adapter.listEntries(path);
		} catch (error) {
			moduleLog.error(`Failed to list ${path || '/'}:`, error);
			return;
		}

		for (const entry of entries) {
			const entryPath = `${path}/${entry.name}`;

			if (entry.isDirectory) {
				if (IGNORED_DIRECTORIES.has(entry.name)) continue;
				directories.push({
					id: nanoid(),
					name: entry.name,
					path: entryPath,
					type: 'directory',
					lastModified: Date.now(),
				});
				await this.walk(adapter, entryPath, directories, files);
				continue;
			}

			if (isTemporaryFile(entryPath)) continue;

			try {
				const stats = await adapter.stat(entryPath);
				const content = await adapter.readFile(entryPath);
				files.push({
					id: nanoid(),
					name: entry.name,
					path: entryPath,
					type: 'file',
					content,
					lastModified: stats?.lastModified ?? Date.now(),
					size: stats?.size,
					mimeType: getMimeType(entry.name) || 'application/octet-stream',
					isBinary: isBinaryFile(entryPath),
				});
			} catch (error) {
				moduleLog.error(`Failed to read ${entryPath}:`, error);
			}
		}
	}

	private notify(): void {
		const status = this.getStatus();
		for (const listener of this.listeners) listener(status);
	}
}

export const workspaceService = new WorkspaceService();
