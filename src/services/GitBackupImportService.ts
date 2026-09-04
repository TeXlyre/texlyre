// src/services/GitBackupImportService.ts
import { t } from '@/i18n';
import { createNamedLogger } from '@/logging';
import type {
	GitBackupActivityInput,
	GitBackupAdapter,
	GitBackupProjectFiles,
	GitTreeItem,
	ResolvedGitCredentials,
} from '../types/gitBackup';
import {
	getGitFileRef,
	readGitFileBytes,
	readGitFileText,
} from '../utils/gitBackupUtils';
import {
	computeGitBlobSha,
	getMimeType,
	isBinaryFile,
	isTemporaryFile,
	toArrayBuffer,
} from '../utils/fileUtils';
import { authService } from './AuthService';
import { UnifiedDataStructureService } from './BackupLayoutService';
import { fileStoreService, fileStorageEventEmitter } from './FileStoreService';
import { ProjectDataService } from './ProjectDataService';

const moduleLog = createNamedLogger('GitBackupImportService');
const FILES_METADATA = '.texlyre_metadata.json';
const PROJECT_METADATA = 'metadata.json';

interface GitBackupImportServiceOptions {
	shouldIgnoreFile?: (filePath: string) => boolean;
	reportActivity?: (activity: GitBackupActivityInput) => void;
	dataSerializer?: ProjectDataService;
	unifiedService?: UnifiedDataStructureService;
}

export class GitBackupImportService<TTarget> {
	private shouldIgnoreFile: (filePath: string) => boolean;
	private reportActivity: (activity: GitBackupActivityInput) => void;
	private dataSerializer: ProjectDataService;
	private unifiedService: UnifiedDataStructureService;

	constructor(
		private adapter: GitBackupAdapter<TTarget>,
		options: GitBackupImportServiceOptions = {},
	) {
		this.shouldIgnoreFile = options.shouldIgnoreFile ?? (() => false);
		this.reportActivity = options.reportActivity ?? (() => {});
		this.dataSerializer = options.dataSerializer ?? new ProjectDataService();
		this.unifiedService =
			options.unifiedService ?? new UnifiedDataStructureService();
	}

	async importProjects(
		projectFiles: Map<string, GitBackupProjectFiles>,
		credentials: ResolvedGitCredentials<TTarget>,
		ownerId: string,
	): Promise<number> {
		const importedMissing = await this.importMissingProjects(
			projectFiles,
			credentials,
			ownerId,
		);
		await this.importExistingProjects(projectFiles, credentials, ownerId);
		return importedMissing;
	}

	private async importMissingProjects(
		projectFiles: Map<string, GitBackupProjectFiles>,
		credentials: ResolvedGitCredentials<TTarget>,
		ownerId: string,
	): Promise<number> {
		const existingProjects = await authService.getProjectsByUser(ownerId);
		const existingProjectIds = new Set(existingProjects.map((p) => p.id));

		let imported = 0;
		for (const [projId, data] of projectFiles.entries()) {
			if (!data.metadataRef || existingProjectIds.has(projId)) continue;

			try {
				const metadataContent = await readGitFileText(
					this.adapter,
					credentials,
					data.metadataRef,
				);
				const projectMetadata = JSON.parse(metadataContent);

				await this.createProjectDirectly(projectMetadata, ownerId);
				await this.importProjectSafely(
					projId,
					projectMetadata,
					data,
					credentials,
				);

				imported++;
				this.reportActivity({
					type: 'import_complete',
					message: t('Auto-imported missing project: {projectName}', {
						projectName: projectMetadata.name,
					}),
				});
				fileStorageEventEmitter.emitChange();
			} catch (error) {
				moduleLog.error(`Failed to import missing project ${projId}:`, error);
				this.reportActivity({
					type: 'import_error',
					message: t('Failed to import missing project: {missingProjId}', {
						missingProjId: projId,
					}),
				});
			}
		}

		return imported;
	}

	private async importExistingProjects(
		projectFiles: Map<string, GitBackupProjectFiles>,
		credentials: ResolvedGitCredentials<TTarget>,
		ownerId: string,
	): Promise<void> {
		const existingProjects = await authService.getProjectsByUser(ownerId);
		const existingProjectIds = new Set(existingProjects.map((p) => p.id));

		for (const [projId, data] of projectFiles.entries()) {
			if (!data.metadataRef || !existingProjectIds.has(projId)) continue;

			const metadataContent = await readGitFileText(
				this.adapter,
				credentials,
				data.metadataRef,
			);
			const projectMetadata = JSON.parse(metadataContent);
			await this.importProjectSafely(
				projId,
				projectMetadata,
				data,
				credentials,
			);
		}
	}

	private async importProjectSafely(
		projectId: string,
		projectMetadata: any,
		data: GitBackupProjectFiles,
		credentials: ResolvedGitCredentials<TTarget>,
	): Promise<void> {
		const docUrl = projectMetadata.docUrl ?? `yjs:${projectId}`;
		const resolvedMetadata = { ...projectMetadata, docUrl };

		await authService.createOrUpdateProject(
			this.unifiedService.convertMetadataToProject(resolvedMetadata),
			false,
		);

		const { documents, documentContents } = await this.importDocuments(
			data,
			credentials,
		);
		await fileStoreService.switchToProject(resolvedMetadata.docUrl);
		await this.importFiles(data, credentials, resolvedMetadata);

		const unifiedData = {
			manifest: this.unifiedService.createManifest('import'),
			account: null,
			projects: [resolvedMetadata],
			projectData: new Map([
				[
					projectId,
					{
						metadata: resolvedMetadata,
						documents,
						documentContents,
						files: [],
						fileContents: new Map(),
					},
				],
			]),
		};

		await this.dataSerializer.deserializeToIndexedDB(
			unifiedData,
			projectId,
			resolvedMetadata.docUrl,
		);

		if (documents.length > 0) {
			this.reportActivity({
				type: 'import_complete',
				message: t('Imported {count} document for project: {projectName}', {
					count: documents.length,
					projectName: projectMetadata.name,
				}),
			});
		}

		fileStorageEventEmitter.emitChange();
	}

	private async importDocuments(
		data: GitBackupProjectFiles,
		credentials: ResolvedGitCredentials<TTarget>,
	): Promise<{ documents: any[]; documentContents: Map<string, any> }> {
		let remoteDocumentsMetadata: any[] = [];

		if (data.documentsMetadataRef) {
			try {
				const metadataContent = await readGitFileText(
					this.adapter,
					credentials,
					data.documentsMetadataRef,
				);
				remoteDocumentsMetadata = JSON.parse(metadataContent);
			} catch (error) {
				moduleLog.error(
					'Failed to load documents metadata from remote:',
					error,
				);
			}
		}

		const docMetadataById = new Map<string, any>();
		remoteDocumentsMetadata.forEach((meta) => {
			docMetadataById.set(meta.id, meta);
		});

		const documents: any[] = [];
		const documentContents = new Map();

		for (const [docId, docData] of data.documents.entries()) {
			const remoteDocMetadata = docMetadataById.get(docId);
			const docInfo = remoteDocMetadata || {
				id: docId,
				name: `Document ${docId}`,
				lastModified: Date.now(),
				hasYjsState: !!docData.yjsRef,
				hasReadableContent: !!docData.txtRef,
			};
			documents.push(docInfo);

			const contentData: { readableContent?: string; yjsState?: Uint8Array } =
				{};

			if (docData.txtRef) {
				contentData.readableContent = await readGitFileText(
					this.adapter,
					credentials,
					docData.txtRef,
				);
			}

			if (docData.yjsRef) {
				contentData.yjsState = await readGitFileBytes(
					this.adapter,
					credentials,
					docData.yjsRef,
				);
			}

			documentContents.set(docId, contentData);
		}

		for (const [docId, docData] of data.documents.entries()) {
			if (docData.txtRef && !docData.yjsRef && !docMetadataById.has(docId)) {
				const newDocInfo = {
					id: docId,
					name: `${docId}.txt`,
					lastModified: Date.now(),
					hasYjsState: false,
					hasReadableContent: true,
				};
				if (!documents.find((d) => d.id === docId)) documents.push(newDocInfo);
			}
		}

		return { documents, documentContents };
	}

	private async importFiles(
		data: GitBackupProjectFiles,
		credentials: ResolvedGitCredentials<TTarget>,
		projectMetadata: any,
	): Promise<void> {
		const { metadataByPath, deletedFilesMetadata } =
			await this.loadRemoteFilesMetadata(data, credentials);

		await this.restoreDeletedFileTombstones(deletedFilesMetadata, data);

		let importedCount = 0;
		let failedCount = 0;

		for (const [filePath, fileRef] of data.files.entries()) {
			if (isTemporaryFile(filePath) || this.shouldIgnoreFile(filePath))
				continue;

			try {
				await this.importSingleFile(
					filePath,
					fileRef,
					metadataByPath,
					credentials,
				);
				importedCount++;
			} catch (error) {
				failedCount++;
				moduleLog.error(`Failed to import file ${filePath}:`, error);
				this.reportActivity({
					type: 'import_error',
					message: t('Failed to import file: {filePath}', { filePath }),
				});
			}
		}

		if (failedCount > 0) {
			throw new Error(
				t('Imported with {count} file error(s)', { count: failedCount }),
			);
		}

		if (importedCount > 0) {
			this.reportActivity({
				type: 'import_complete',
				message: t('Imported {count} file for project: {projectName}', {
					count: importedCount,
					projectName: projectMetadata.name,
				}),
			});
			fileStorageEventEmitter.emitChange();
		}
	}

	private async loadRemoteFilesMetadata(
		data: GitBackupProjectFiles,
		credentials: ResolvedGitCredentials<TTarget>,
	): Promise<{
		metadataByPath: Map<string, any>;
		deletedFilesMetadata: Map<string, any>;
	}> {
		let remoteFilesMetadata: any[] = [];

		if (data.filesMetadataRef) {
			try {
				const metadataContent = await readGitFileText(
					this.adapter,
					credentials,
					data.filesMetadataRef,
				);
				remoteFilesMetadata = JSON.parse(metadataContent);
			} catch (error) {
				moduleLog.error('Failed to load files metadata from remote:', error);
			}
		}

		const metadataByPath = new Map<string, any>();
		const deletedFilesMetadata = new Map<string, any>();

		remoteFilesMetadata.forEach((fileMetadata) => {
			if (fileMetadata.isDeleted) {
				deletedFilesMetadata.set(fileMetadata.path, fileMetadata);
			} else {
				metadataByPath.set(fileMetadata.path, fileMetadata);
			}
		});

		return { metadataByPath, deletedFilesMetadata };
	}

	private async restoreDeletedFileTombstones(
		deletedFilesMetadata: Map<string, any>,
		data: GitBackupProjectFiles,
	): Promise<void> {
		for (const [filePath, fileMetadata] of deletedFilesMetadata.entries()) {
			if (data.files.has(filePath)) continue;

			try {
				await fileStoreService.storeFile(
					{
						id:
							fileMetadata.id ||
							`deleted-${Math.random().toString(36).substring(2, 15)}`,
						name: fileMetadata.name,
						path: fileMetadata.path,
						type: fileMetadata.type as 'file' | 'directory',
						createdAt: fileMetadata.createdAt,
						lastModified: fileMetadata.lastModified || Date.now(),
						size: 0,
						mimeType: fileMetadata.mimeType,
						isBinary: fileMetadata.isBinary,
						documentId: fileMetadata.documentId,
						content: undefined,
						isDeleted: true,
					},
					{ showConflictDialog: false, preserveTimestamp: true },
				);
				fileStorageEventEmitter.emitChange();
			} catch (error) {
				moduleLog.error(
					`Failed to restore deleted file metadata ${filePath}:`,
					error,
				);
			}
		}
	}

	private async importSingleFile(
		filePath: string,
		fileRef: string,
		metadataByPath: Map<string, any>,
		credentials: ResolvedGitCredentials<TTarget>,
	): Promise<void> {
		const existingFile = await fileStoreService.getFileByPath(filePath, true);
		if (existingFile?.content) {
			const localSha = await computeGitBlobSha(
				existingFile.content as string | ArrayBuffer,
			);
			if (localSha === fileRef) return;
		}

		await fileStoreService.createDirectoryPath(filePath);

		const remoteBytes = await readGitFileBytes(
			this.adapter,
			credentials,
			fileRef,
		);

		const remoteMetadata = metadataByPath.get(filePath);
		const binary = remoteMetadata
			? remoteMetadata.isBinary
			: isBinaryFile(filePath);

		const finalContent: string | ArrayBuffer = binary
			? toArrayBuffer(remoteBytes)
			: new TextDecoder('utf-8').decode(remoteBytes);

		const fileSize =
			finalContent instanceof ArrayBuffer
				? finalContent.byteLength
				: finalContent.length;

		const fileToStore = remoteMetadata
			? {
					id:
						existingFile?.id ||
						remoteMetadata.id ||
						`${this.adapter.importIdPrefix}-${Math.random()
							.toString(36)
							.substring(2, 15)}`,
					name: remoteMetadata.name,
					path: remoteMetadata.path,
					type: remoteMetadata.type as 'file' | 'directory',
					createdAt: remoteMetadata.createdAt,
					lastModified: remoteMetadata.lastModified || Date.now(),
					size: remoteMetadata.size || fileSize,
					mimeType: remoteMetadata.mimeType,
					isBinary: remoteMetadata.isBinary,
					documentId: remoteMetadata.documentId,
					content: finalContent,
					isDeleted: false,
				}
			: {
					id:
						existingFile?.id ||
						`${this.adapter.importIdPrefix}-${Math.random()
							.toString(36)
							.substring(2, 15)}`,
					name: filePath.split('/').pop() || '',
					path: filePath,
					type: 'file' as const,
					lastModified: Date.now(),
					size: fileSize,
					mimeType: getMimeType(filePath),
					isBinary: binary,
					content: finalContent,
					isDeleted: false,
				};

		await fileStoreService.storeFile(fileToStore, {
			showConflictDialog: false,
			preserveTimestamp: !!remoteMetadata,
		});
	}

	groupProjectFiles(
		tree: GitTreeItem[],
		projectId?: string,
		branch = 'main',
	): Map<string, GitBackupProjectFiles> {
		const projectFiles = new Map<string, GitBackupProjectFiles>();

		for (const item of tree) {
			if (item.type !== 'blob' || !item.path?.startsWith('projects/')) continue;

			const pathParts = item.path.split('/');
			const currentProjectId = pathParts[1];
			if (projectId && currentProjectId !== projectId) continue;

			if (!projectFiles.has(currentProjectId)) {
				projectFiles.set(currentProjectId, {
					documents: new Map(),
					files: new Map(),
				});
			}

			const projectData = projectFiles.get(currentProjectId)!;
			const ref = getGitFileRef(this.adapter, item, item.path, branch);

			if (pathParts[2] === `${PROJECT_METADATA}`) {
				projectData.metadataRef = ref;
			} else if (pathParts[2] === 'documents') {
				if (pathParts[3] === `${FILES_METADATA}`) {
					projectData.documentsMetadataRef = ref;
				} else if (pathParts[3]) {
					const fileName = pathParts[3];
					const docId = fileName.replace(/\.(txt|yjs)$/, '');
					if (!projectData.documents.has(docId)) {
						projectData.documents.set(docId, { txtRef: null, yjsRef: null });
					}
					const docData = projectData.documents.get(docId)!;
					if (fileName.endsWith('.txt')) docData.txtRef = ref;
					else if (fileName.endsWith('.yjs')) docData.yjsRef = ref;
				}
			} else if (pathParts[2] === 'files') {
				if (pathParts[3] === `${FILES_METADATA}`) {
					projectData.filesMetadataRef = ref;
				} else if (pathParts[3]) {
					projectData.files.set(`/${pathParts.slice(3).join('/')}`, ref);
				}
			}
		}

		return projectFiles;
	}

	private async createProjectDirectly(
		projectMetadata: any,
		ownerId: string,
	): Promise<void> {
		const authDb =
			(await authService.db) ||
			(await authService.initialize().then(() => authService.db));
		if (!authDb) throw new Error(t('Could not access auth database'));

		const newProject = {
			id: projectMetadata.id,
			name: projectMetadata.name,
			type: projectMetadata.type || 'latex',
			latexEngine: projectMetadata.latexEngine || 'pdftex',
			typstEngine: projectMetadata.typstEngine || 'typst',
			typstOutputFormat: projectMetadata.typstOutputFormat || 'pdf',
			mainFile: projectMetadata.mainFile || 'main.tex',
			description: projectMetadata.description,
			docUrl: projectMetadata.docUrl,
			createdAt: projectMetadata.createdAt,
			updatedAt: Date.now(),
			ownerId,
			tags: projectMetadata.tags,
			isFavorite: projectMetadata.isFavorite,
		};

		await authDb.put('projects', newProject);
	}
}
