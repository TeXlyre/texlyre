// src/services/GitBackupSyncService.ts
import { t } from '@/i18n';
import { mergeAnnotatedSources } from '../utils/annotationMerge';
import { stripAnnotationTagsWithSpans } from '../utils/annotationTagUtils';
import {
	gitContentToText,
	readGitFileAtRefBytesSafe,
	readGitFileAtRefTextSafe,
} from '../utils/gitBackupUtils';
import {
	computeGitBlobSha,
	isBinaryFile,
	isTemporaryFile,
	toArrayBuffer,
} from '../utils/fileUtils';
import { yjsStateFromText } from '../utils/yjsUtils';
import {
	mergeResolutionService,
	type FileConflict,
} from './MergeResolutionService';
import { UnifiedDataStructureService } from './BackupLayoutService';
import { ProjectDataService } from './ProjectDataService';
import type {
	GitBackupActivityInput,
	GitBackupAdapter,
	GitBackupBuildOptions,
	GitBackupChange,
	GitTreeItem,
	LinkedBackupDocument,
	ResolvedGitCredentials,
} from '../types/gitBackup';

const FILES_METADATA = '.texlyre_metadata.json';

interface GitBackupSyncServiceOptions {
	reportActivity?: (activity: GitBackupActivityInput) => void;
	dataSerializer?: ProjectDataService;
	unifiedService?: UnifiedDataStructureService;
}

export class GitBackupSyncService<TTarget> {
	private reportActivity: (activity: GitBackupActivityInput) => void;
	private dataSerializer: ProjectDataService;
	private unifiedService: UnifiedDataStructureService;

	constructor(
		private adapter: GitBackupAdapter<TTarget>,
		options: GitBackupSyncServiceOptions = {},
	) {
		this.reportActivity = options.reportActivity ?? (() => {});
		this.dataSerializer = options.dataSerializer ?? new ProjectDataService();
		this.unifiedService =
			options.unifiedService ?? new UnifiedDataStructureService();
	}

	async buildChangesForProjects(
		projects: any[],
		existingFiles: Set<string>,
		existingFileRefs: Map<string, string>,
		options: GitBackupBuildOptions,
	): Promise<{
		changes: GitBackupChange[];
		linkedDocuments: Map<string, LinkedBackupDocument>;
	}> {
		const changes: GitBackupChange[] = [];
		const linkedDocuments = new Map<string, LinkedBackupDocument>();

		for (const project of projects) {
			changes.push(
				...(await this.buildChangesForProject(
					project,
					existingFiles,
					existingFileRefs,
					linkedDocuments,
					options,
				)),
			);
		}

		return { changes, linkedDocuments };
	}

	indexRemoteTree(tree: GitTreeItem[]) {
		const existingFileRefs = new Map(
			tree
				.filter(
					(item) => item.type === 'blob' && item.path && (item.sha || item.id),
				)
				.map((item) => [item.path!, item.sha || item.id || '']),
		);
		const existingFiles = new Set(existingFileRefs.keys());
		return { existingFiles, existingFileRefs };
	}

	private async buildChangesForProject(
		project: any,
		existingFiles: Set<string>,
		existingFileRefs: Map<string, string>,
		linkedDocuments: Map<string, LinkedBackupDocument>,
		options: GitBackupBuildOptions,
	): Promise<GitBackupChange[]> {
		const changes: GitBackupChange[] = [];
		const projectPath = `projects/${project.id}`;
		const maxFileSize = options.maxFileSize;

		const pushIfChanged = async (
			path: string,
			content: string | Uint8Array | ArrayBuffer,
		): Promise<void> => {
			const remoteRef = existingFileRefs.get(path);
			if (remoteRef) {
				const localSha = await computeGitBlobSha(
					content instanceof Uint8Array ? toArrayBuffer(content) : content,
				);
				if (localSha === remoteRef) return;
			}
			changes.push({
				type: existingFiles.has(path) ? 'update' : 'create',
				path,
				content,
				previousRef: remoteRef,
			});
		};

		const documents =
			await this.dataSerializer.serializeProjectDocuments(project);
		const files = await this.dataSerializer.serializeProjectFiles(
			project,
			true,
		);

		await pushIfChanged(
			`${projectPath}/metadata.json`,
			JSON.stringify(
				this.unifiedService.convertProjectToMetadata(project, 'backup'),
				null,
				2,
			),
		);

		if (documents.documents.length > 0) {
			const documentsMetadata = documents.documents.map((doc) => ({
				id: doc.id,
				name: doc.name,
				createdAt: doc.createdAt,
				lastModified: doc.lastModified,
				hasYjsState: doc.hasYjsState,
				hasReadableContent: doc.hasReadableContent,
			}));
			await pushIfChanged(
				`${projectPath}/documents/${FILES_METADATA}`,
				JSON.stringify(documentsMetadata, null, 2),
			);
		}

		for (const doc of documents.documents) {
			const content = documents.documentContents.get(doc.id);
			if (content?.readableContent) {
				await pushIfChanged(
					`${projectPath}/documents/${doc.id}.txt`,
					content.readableContent,
				);
			}
			if (content?.yjsState) {
				await pushIfChanged(
					`${projectPath}/documents/${doc.id}.yjs`,
					content.yjsState,
				);
			}
		}

		if (files.files.length > 0 || files.deletedFiles.length > 0) {
			const activePaths = new Set(files.files.map((f) => f.path));
			const allFilesMetadata = [
				...files.files.map((file) =>
					this.unifiedService.convertFileToMetadata(file),
				),
				...files.deletedFiles
					.filter((file) => !activePaths.has(file.path))
					.map((file) => ({
						...this.unifiedService.convertFileToMetadata(file),
						isDeleted: true,
					})),
			];
			await pushIfChanged(
				`${projectPath}/files/${FILES_METADATA}`,
				JSON.stringify(allFilesMetadata, null, 2),
			);
		}

		for (const file of files.files) {
			if (file.type === 'file' && file.documentId) {
				linkedDocuments.set(`${projectPath}/files${file.path}`, {
					txtPath: `${projectPath}/documents/${file.documentId}.txt`,
					yjsPath: `${projectPath}/documents/${file.documentId}.yjs`,
				});
			}

			const content = files.fileContents.get(file.path);
			if (file.type !== 'file' || content === undefined) continue;
			if (isTemporaryFile(file.path) || options.shouldIgnoreFile(file.path))
				continue;

			const fileSize =
				content instanceof ArrayBuffer ? content.byteLength : content.length;
			if (fileSize > maxFileSize) {
				this.reportActivity({
					type: 'backup_error',
					message: t('Skipped file {path}: exceeds max size of {size}MB', {
						path: file.path,
						size: Math.round(maxFileSize / 1024 / 1024),
					}),
				});
				continue;
			}

			await pushIfChanged(`${projectPath}/files${file.path}`, content);
		}

		for (const deletedFile of files.deletedFiles) {
			if (deletedFile.type !== 'file') continue;
			const filePath = `${projectPath}/files${deletedFile.path}`;
			if (existingFiles.has(filePath)) {
				changes.push({
					type: 'delete',
					path: filePath,
					previousRef: existingFileRefs.get(filePath),
				});
			}
		}

		return changes;
	}

	async resolveConflicts(
		credentials: ResolvedGitCredentials<TTarget>,
		changes: GitBackupChange[],
		baselineCommitSha: string | undefined,
		linkedDocuments: Map<string, LinkedBackupDocument>,
		existingFiles: Set<string>,
		existingFileRefs: Map<string, string>,
	): Promise<GitBackupChange[] | null> {
		if (
			!baselineCommitSha ||
			!this.adapter.getLatestCommitSha ||
			(!this.adapter.readFileAtRef && !this.adapter.readFileBytesAtRef)
		) {
			return changes;
		}

		const currentRemoteSha = await this.adapter.getLatestCommitSha(
			credentials.token,
			credentials.target,
			credentials.branch,
		);
		if (currentRemoteSha === baselineCommitSha) return changes;

		const conflicts: FileConflict[] = [];
		const nonConflicting: GitBackupChange[] = [];
		const resolvedLinkedContents = new Map<string, string>();

		for (const change of changes) {
			if (change.type === 'create' || change.type === 'delete') {
				nonConflicting.push(change);
				continue;
			}

			const binary = isBinaryFile(change.path);

			if (binary) {
				const conflict = await this.detectBinaryConflict(
					credentials,
					change,
					baselineCommitSha,
					currentRemoteSha,
				);
				if (conflict === 'skip') continue;
				if (conflict === 'push') {
					nonConflicting.push(change);
					continue;
				}
				conflicts.push(conflict);
				continue;
			}

			const baseContent = await readGitFileAtRefTextSafe(
				this.adapter,
				credentials,
				change.path,
				baselineCommitSha,
			);
			const remoteContent = await readGitFileAtRefTextSafe(
				this.adapter,
				credentials,
				change.path,
				currentRemoteSha,
			);

			if (remoteContent === undefined) {
				nonConflicting.push(change);
				continue;
			}

			const localText = gitContentToText(change.content);
			const localView = stripAnnotationTagsWithSpans(localText);
			const remoteView = stripAnnotationTagsWithSpans(remoteContent);
			const baseView =
				baseContent === undefined
					? undefined
					: stripAnnotationTagsWithSpans(baseContent).content;

			const merge = mergeResolutionService.tryAutoMerge(
				baseView,
				localView.content,
				remoteView.content,
				false,
			);

			if (merge.resolved) {
				const merged = mergeAnnotatedSources(
					[localText, remoteContent],
					merge.content,
				).content;

				if (linkedDocuments.has(change.path)) {
					resolvedLinkedContents.set(change.path, merged);
				}

				if (merged === remoteContent) continue;
				nonConflicting.push({ ...change, content: merged });
				continue;
			}

			conflicts.push({
				path: change.path,
				isBinary: false,
				baseContent: baseView,
				localContent: toArrayBuffer(change.content),
				remoteContent,
				localViewContent: localView.content,
				remoteViewContent: remoteView.content,
				localAnnotationSpans: localView.spans,
				annotationSpans: remoteView.spans,
				previousRef: change.previousRef,
			});
		}

		if (conflicts.length === 0) {
			return this.reconcileLinkedDocumentChanges(
				nonConflicting,
				resolvedLinkedContents,
				linkedDocuments,
				existingFiles,
				existingFileRefs,
			);
		}

		const resolutions =
			await mergeResolutionService.resolveConflicts(conflicts);
		if (!resolutions) return null;

		for (const conflict of conflicts) {
			const resolution = resolutions.get(conflict.path);
			if (!resolution) continue;

			if (linkedDocuments.has(conflict.path)) {
				const resolvedContent =
					resolution.action === 'keep-local'
						? conflict.localContent
						: resolution.action === 'keep-remote'
							? conflict.remoteContent
							: resolution.content;
				resolvedLinkedContents.set(
					conflict.path,
					gitContentToText(resolvedContent),
				);
			}

			if (resolution.action === 'keep-local') {
				nonConflicting.push({
					type: 'update',
					path: conflict.path,
					content: conflict.localContent,
					previousRef: conflict.previousRef,
				});
			} else if (resolution.action === 'merged') {
				nonConflicting.push({
					type: 'update',
					path: conflict.path,
					content: resolution.content,
					previousRef: conflict.previousRef,
				});
			}
		}

		return this.reconcileLinkedDocumentChanges(
			nonConflicting,
			resolvedLinkedContents,
			linkedDocuments,
			existingFiles,
			existingFileRefs,
		);
	}

	private reconcileLinkedDocumentChanges(
		changes: GitBackupChange[],
		resolvedLinkedContents: Map<string, string>,
		linkedDocuments: Map<string, LinkedBackupDocument>,
		existingFiles: Set<string>,
		existingFileRefs: Map<string, string>,
	): GitBackupChange[] {
		if (resolvedLinkedContents.size === 0) return changes;

		const result = [...changes];
		const indexByPath = new Map(
			result.map((change, index) => [change.path, index]),
		);

		const upsert = (path: string, content: string | ArrayBuffer): void => {
			const change: GitBackupChange = {
				type: existingFiles.has(path) ? 'update' : 'create',
				path,
				content,
				previousRef: existingFileRefs.get(path),
			};

			const index = indexByPath.get(path);
			if (index === undefined) {
				indexByPath.set(path, result.length);
				result.push(change);
			} else {
				result[index] = change;
			}
		};

		for (const [filePath, content] of resolvedLinkedContents) {
			const linked = linkedDocuments.get(filePath);
			if (!linked) continue;

			upsert(linked.txtPath, content);
			upsert(linked.yjsPath, yjsStateFromText(content));
		}

		return result;
	}

	private async detectBinaryConflict(
		credentials: ResolvedGitCredentials<TTarget>,
		change: Extract<GitBackupChange, { type: 'create' | 'update' }>,
		baselineCommitSha: string,
		currentRemoteSha: string,
	): Promise<'skip' | 'push' | FileConflict> {
		const localContent = toArrayBuffer(change.content);
		const localSha = await computeGitBlobSha(localContent);

		const remoteBytes = await readGitFileAtRefBytesSafe(
			this.adapter,
			credentials,
			change.path,
			currentRemoteSha,
		);
		if (remoteBytes === undefined) return 'push';

		const remoteBuffer = toArrayBuffer(remoteBytes);
		const remoteSha = await computeGitBlobSha(remoteBuffer);
		if (localSha === remoteSha) return 'skip';

		const baseBytes = await readGitFileAtRefBytesSafe(
			this.adapter,
			credentials,
			change.path,
			baselineCommitSha,
		);
		const baseSha = baseBytes
			? await computeGitBlobSha(toArrayBuffer(baseBytes))
			: undefined;

		if (baseSha === localSha) return 'skip';
		if (baseSha === remoteSha) return 'push';

		return {
			path: change.path,
			isBinary: true,
			baseContent: undefined,
			localContent,
			remoteContent: remoteBuffer,
			previousRef: change.previousRef,
		};
	}
}
