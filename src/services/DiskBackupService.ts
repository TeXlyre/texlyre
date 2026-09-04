// src/services/DiskBackupService.ts
import * as Y from 'yjs';

import { t } from '@/i18n';
import { createNamedLogger } from '@/logging';
import type {
	BackupActivity,
	BackupDiscoveryResult,
	BackupStatus,
} from '../types/backup';
import type { Project } from '../types/projects';
import { mergeAnnotatedSources } from '../utils/annotationMerge';
import { stripAnnotationTagsWithSpans } from '../utils/annotationTagUtils';
import { authService } from './AuthService';
import { DiskHandleStore, ensurePermission } from './DiskHandleStore';
import { UnifiedDataStructureService } from './BackupLayoutService';
import {
	mergeResolutionService,
	type ConflictResolution,
	type FileConflict,
} from './MergeResolutionService';
import { ProjectDataService } from './ProjectDataService';
import { projectImportService } from './ProjectImportService';
import { DirectoryTarget, WriteTargetService } from './WriteTargetService';

const moduleLog = createNamedLogger('DiskBackupService');

class DiskBackupService {
	private rootHandle: FileSystemDirectoryHandle | null = null;
	private handleStore = new DiskHandleStore<FileSystemDirectoryHandle>(
		'texlyre-backup-handles',
	);
	private isEnabled = false;
	private status: BackupStatus = {
		isConnected: false,
		isEnabled: false,
		lastSync: null,
		status: 'idle',
	};
	private listeners: Array<(status: BackupStatus) => void> = [];
	private dataSerializer = new ProjectDataService();
	private fileSystemManager = new WriteTargetService();
	private unifiedService = new UnifiedDataStructureService();
	private activities: BackupActivity[] = [];
	private activityListeners: Array<(activities: BackupActivity[]) => void> = [];
	private discoveryListeners: Array<(result: BackupDiscoveryResult) => void> =
		[];

	addActivity(activity: Omit<BackupActivity, 'id' | 'timestamp'>): void {
		const fullActivity: BackupActivity = {
			id: Math.random().toString(36).substring(2),
			timestamp: Date.now(),
			...activity,
		};

		this.activities = [...this.activities.slice(-50), fullActivity];
		this.notifyActivityListeners();
	}

	getActivities(): BackupActivity[] {
		return [...this.activities];
	}

	clearActivity(id: string): void {
		this.activities = this.activities.filter((a) => a.id !== id);
		this.notifyActivityListeners();
	}

	clearAllActivities(): void {
		this.activities = [];
		this.notifyActivityListeners();
	}

	addActivityListener(
		callback: (activities: BackupActivity[]) => void,
	): () => void {
		this.activityListeners.push(callback);
		return () => {
			this.activityListeners = this.activityListeners.filter(
				(l) => l !== callback,
			);
		};
	}

	addDiscoveryListener(
		callback: (result: BackupDiscoveryResult) => void,
	): () => void {
		this.discoveryListeners.push(callback);
		return () => {
			this.discoveryListeners = this.discoveryListeners.filter(
				(l) => l !== callback,
			);
		};
	}

	getRootHandle(): FileSystemDirectoryHandle | null {
		return this.rootHandle;
	}

	async requestAccess(isAutoStart = false, scope = 'global'): Promise<boolean> {
		try {
			if (!('showDirectoryPicker' in window)) {
				throw new Error(t('File System Access API not supported'));
			}

			this.rootHandle = await (window as any).showDirectoryPicker({
				mode: 'readwrite',
				id: 'texlyre-backup',
			});
			await this.saveHandle(scope, this.rootHandle);

			this.updateStatus({
				isConnected: true,
				status: 'idle',
				error: undefined,
			});
			this.performDiscoveryScan();
			return true;
		} catch (error) {
			this.handleAccessError(error, isAutoStart);
			return false;
		}
	}

	async restoreAccess(scope = 'global'): Promise<boolean> {
		const handle = await this.loadHandle(scope);
		if (!handle) return false;

		if (!(await ensurePermission(handle, 'readwrite'))) return false;

		this.rootHandle = handle;
		this.updateStatus({ isConnected: true, status: 'idle', error: undefined });
		this.performDiscoveryScan();
		return true;
	}

	async changeDirectory(scope = 'global'): Promise<boolean> {
		try {
			this.rootHandle = await (window as any).showDirectoryPicker({
				mode: 'readwrite',
				id: 'texlyre-backup-new',
			});
			await this.saveHandle(scope, this.rootHandle);

			this.updateStatus({
				isConnected: true,
				status: 'idle',
				error: undefined,
			});
			this.addActivity({
				type: 'backup_complete',
				message: t('Backup directory changed successfully'),
			});
			this.performDiscoveryScan();
			return true;
		} catch (error) {
			this.updateStatus({
				status: 'error',
				error:
					error instanceof Error
						? error.message
						: t('Failed to change directory'),
			});
			return false;
		}
	}

	async disconnect(scope = 'global'): Promise<void> {
		this.rootHandle = null;
		this.isEnabled = false;
		await this.clearHandle(scope);
		this.updateStatus({ isConnected: false, isEnabled: false });
	}

	setEnabled(enabled: boolean): void {
		this.isEnabled = enabled;
		this.updateStatus({ isEnabled: enabled });
	}

	async exportToFileSystem(projectId?: string): Promise<void> {
		if (!this.canSync()) {
			this.addActivity({
				type: 'backup_error',
				message: t('Backup not enabled or folder not connected'),
			});
			return;
		}

		this.updateStatus({ status: 'syncing' });
		this.addActivity({
			type: 'backup_start',
			message: projectId
				? t('Starting export for project: {projectId}', { projectId })
				: t('Starting full export...'),
		});

		try {
			const exportData = await this.prepareExportData(projectId);
			const adapter = new DirectoryTarget(this.rootHandle!);

			await this.fileSystemManager.writeUnifiedStructure(adapter, exportData);

			this.addActivity({
				type: 'backup_complete',
				message: t('Export completed successfully'),
			});
			this.updateStatus({
				status: 'idle',
				lastSync: Date.now(),
				error: undefined,
			});
		} catch (error) {
			this.handleError('backup_error', 'Export failed', error);
		}
	}

	async synchronize(projectId?: string): Promise<void> {
		await this.exportToFileSystem(projectId);
	}

	async importChanges(projectId?: string): Promise<void> {
		if (!this.canSync()) {
			this.addActivity({
				type: 'import_error',
				message: t('Backup not enabled or folder not connected.'),
			});
			return;
		}

		this.updateStatus({ status: 'syncing' });
		this.addActivity({
			type: 'import_start',
			message: projectId
				? t('Starting import for project: {projectId}', { projectId })
				: t('Starting import from filesystem...'),
		});

		try {
			const adapter = new DirectoryTarget(this.rootHandle!);

			if (!(await adapter.exists(this.unifiedService.getPaths().MANIFEST))) {
				throw new Error(t('No backup data found in filesystem'));
			}

			const filesystemData =
				await this.fileSystemManager.readUnifiedStructure(adapter);

			if (!this.unifiedService.validateStructure(filesystemData)) {
				throw new Error(t('Invalid backup structure'));
			}

			await this.processImport(filesystemData, projectId);

			this.addActivity({
				type: 'import_complete',
				message: projectId
					? t('Successfully imported project: {projectId}', { projectId })
					: t('Successfully imported projects from filesystem'),
			});
			this.updateStatus({
				status: 'idle',
				lastSync: Date.now(),
				error: undefined,
			});
		} catch (error) {
			this.handleError('import_error', t('Import failed'), error);
		}
	}

	getStatus(): BackupStatus {
		return { ...this.status };
	}

	addStatusListener(callback: (status: BackupStatus) => void): () => void {
		this.listeners.push(callback);
		return () => {
			this.listeners = this.listeners.filter((l) => l !== callback);
		};
	}

	private handleAccessError(error: any, isAutoStart: boolean): void {
		let errorMessage = t('Failed to access file system');

		if (error instanceof DOMException) {
			if (error.name === 'SecurityError' && isAutoStart) {
				errorMessage = t(
					'Auto-backup requires manual folder selection. Click to select backup folder.',
				);
			} else if (error.name === 'AbortError') {
				errorMessage = t('Folder selection was cancelled');
			}
		} else if (error instanceof Error) {
			errorMessage = error.message;
		}

		this.updateStatus({ status: 'error', error: errorMessage });
	}

	private async prepareExportData(projectId?: string) {
		const user = authService.getCurrentUser();
		if (!user) throw new Error(t('No authenticated user'));

		const localProjects = projectId
			? [await authService.getProjectById(projectId)].filter(
					(p): p is Project => !!p,
				)
			: await authService.getProjectsByUser(user.id);

		if (localProjects.length === 0) {
			throw new Error(
				projectId
					? t('Project {projectId} not found', { projectId })
					: t('No projects found'),
			);
		}

		const account = await this.dataSerializer.serializeUserData(user.id);

		// Read existing projects from filesystem and merge with new ones
		const existingData = await this.readExistingBackupData();
		const mergedProjects = this.mergeProjectsData(
			existingData.projects,
			localProjects,
		);

		const projectData = new Map();
		for (const project of localProjects) {
			const [documents, files] = await Promise.all([
				this.dataSerializer.serializeProjectDocuments(project),
				this.dataSerializer.serializeProjectFiles(project),
			]);

			projectData.set(project.id, {
				metadata: this.unifiedService.convertProjectToMetadata(
					project,
					'backup',
				),
				documents: documents.documents,
				documentContents: documents.documentContents,
				files: files.files,
				fileContents: files.fileContents,
			});
		}

		// Merge existing project data with new project data
		const mergedProjectData = this.mergeProjectData(
			existingData.projectData,
			projectData,
		);

		return {
			manifest: this.unifiedService.createManifest('backup'),
			account,
			projects: mergedProjects,
			projectData: mergedProjectData,
		};
	}

	private async readExistingBackupData(): Promise<{
		projects: any[];
		projectData: Map<string, any>;
	}> {
		if (!this.rootHandle) {
			return { projects: [], projectData: new Map() };
		}

		try {
			const adapter = new DirectoryTarget(this.rootHandle);

			if (!(await adapter.exists(this.unifiedService.getPaths().MANIFEST))) {
				return { projects: [], projectData: new Map() };
			}

			const existingData =
				await this.fileSystemManager.readUnifiedStructure(adapter);
			return {
				projects: existingData.projects || [],
				projectData: existingData.projectData || new Map(),
			};
		} catch (error) {
			moduleLog.warn('Could not read existing backup data:', error);
			return { projects: [], projectData: new Map() };
		}
	}

	private mergeProjectsData(
		existingProjects: any[],
		newProjects: Project[],
	): any[] {
		const existingProjectsMap = new Map();
		existingProjects.forEach((project) => {
			existingProjectsMap.set(project.docUrl, project);
		});

		// Convert new projects to metadata and update/add them
		newProjects.forEach((project) => {
			const metadata = this.unifiedService.convertProjectToMetadata(
				project,
				'backup',
			);
			existingProjectsMap.set(project.docUrl, metadata);
		});

		return Array.from(existingProjectsMap.values());
	}

	private mergeProjectData(
		existingProjectData: Map<string, any>,
		newProjectData: Map<string, any>,
	): Map<string, any> {
		const mergedData = new Map(existingProjectData);

		for (const [projectId, data] of newProjectData) {
			mergedData.set(projectId, data);
		}

		return mergedData;
	}

	private async processImport(
		filesystemData: any,
		projectId?: string,
	): Promise<void> {
		const user = authService.getCurrentUser();
		if (!user) throw new Error('No authenticated user');

		const projectsToProcess = projectId
			? filesystemData.projects.filter((p: any) => p.id === projectId)
			: filesystemData.projects;

		if (projectId && projectsToProcess.length === 0) {
			throw new Error(
				t('Project {projectId} not found in backup data', { projectId }),
			);
		}

		for (const projectMetadata of projectsToProcess) {
			const existingProject = await authService.getProjectById(
				projectMetadata.id,
			);

			if (!existingProject) {
				await this.createProjectDirectly(projectMetadata, user.id);
			}

			let projectData = filesystemData.projectData.get(projectMetadata.id);
			if (projectData && existingProject) {
				projectData = await this.mergeExistingProjectData(
					existingProject,
					projectData,
				);
			}

			if (projectData) {
				await this.dataSerializer.deserializeToIndexedDB({
					manifest: filesystemData.manifest,
					account: null,
					projects: [projectMetadata],
					projectData: new Map([[projectMetadata.id, projectData]]),
				});
			}
		}
	}

	private async mergeExistingProjectData(
		project: Project,
		backupData: any,
	): Promise<any> {
		const [localDocuments, localFiles] = await Promise.all([
			this.dataSerializer.serializeProjectDocuments(project),
			this.dataSerializer.serializeProjectFiles(project),
		]);

		const merged = {
			...backupData,
			documents: [...(backupData.documents ?? [])],
			documentContents: new Map(backupData.documentContents ?? []),
			files: [...(backupData.files ?? [])],
			fileContents: new Map(backupData.fileContents ?? []),
		};

		const localFileMetadata = new Map<string, any>(
			localFiles.files.map((file) => [file.path, file]),
		);
		const localDocumentContents = localDocuments.documentContents;
		const linkedDocumentIds = new Set<string>();
		const conflicts: FileConflict[] = [];
		const applyResolved = new Map<
			string,
			(resolution: ConflictResolution) => void
		>();

		const updateDocumentText = (documentId: string, content: string) => {
			const existing = merged.documentContents.get(documentId) ?? {};
			merged.documentContents.set(documentId, {
				...existing,
				readableContent: content,
				yjsState: this.yjsStateFromText(content),
			});
			merged.documents = merged.documents.map((document: any) =>
				document.id === documentId
					? { ...document, lastModified: Date.now() }
					: document,
			);
		};

		const updateFileContent = (
			filePath: string,
			content: string | ArrayBuffer,
			documentId?: string,
		) => {
			merged.fileContents.set(filePath, content);
			const size =
				typeof content === 'string' ? content.length : content.byteLength;
			merged.files = merged.files.map((file: any) =>
				file.path === filePath
					? { ...file, size, lastModified: Date.now() }
					: file,
			);
			if (documentId && typeof content === 'string') {
				updateDocumentText(documentId, content);
			}
		};

		for (const backupFile of merged.files) {
			if (backupFile.type !== 'file') continue;

			const localFile = localFileMetadata.get(backupFile.path);
			if (!localFile) continue;

			const documentId = backupFile.documentId ?? localFile.documentId;
			if (documentId) linkedDocumentIds.add(documentId);

			const localContent = localFiles.fileContents.get(backupFile.path);
			const backupContent = merged.fileContents.get(backupFile.path);
			if (localContent === undefined || backupContent === undefined) continue;
			if (this.contentsEqual(localContent, backupContent)) continue;

			if (
				typeof localContent === 'string' &&
				typeof backupContent === 'string'
			) {
				const localView = stripAnnotationTagsWithSpans(localContent);
				const backupView = stripAnnotationTagsWithSpans(backupContent);

				if (localView.content === backupView.content) {
					updateFileContent(
						backupFile.path,
						mergeAnnotatedSources(
							[localContent, backupContent],
							localView.content,
						).content,
						documentId,
					);
					continue;
				}

				conflicts.push({
					path: backupFile.path,
					isBinary: false,
					baseContent: undefined,
					localContent,
					remoteContent: backupContent,
					localViewContent: localView.content,
					remoteViewContent: backupView.content,
					localAnnotationSpans: localView.spans,
					annotationSpans: backupView.spans,
				});
			} else {
				conflicts.push({
					path: backupFile.path,
					isBinary: true,
					baseContent: undefined,
					localContent: this.toConflictContent(localContent),
					remoteContent: this.toConflictContent(backupContent),
				});
			}

			applyResolved.set(backupFile.path, (resolution) => {
				if (resolution.action === 'keep-local') {
					updateFileContent(backupFile.path, localContent, documentId);
				} else if (resolution.action === 'merged') {
					updateFileContent(backupFile.path, resolution.content, documentId);
				}
			});
		}

		for (const backupDocument of merged.documents) {
			if (linkedDocumentIds.has(backupDocument.id)) continue;

			const localContent = localDocumentContents.get(
				backupDocument.id,
			)?.readableContent;
			const backupContent = merged.documentContents.get(
				backupDocument.id,
			)?.readableContent;

			if (
				typeof localContent !== 'string' ||
				typeof backupContent !== 'string' ||
				localContent === backupContent
			) {
				continue;
			}

			const localView = stripAnnotationTagsWithSpans(localContent);
			const backupView = stripAnnotationTagsWithSpans(backupContent);

			if (localView.content === backupView.content) {
				updateDocumentText(
					backupDocument.id,
					mergeAnnotatedSources(
						[localContent, backupContent],
						localView.content,
					).content,
				);
				continue;
			}

			const path = `documents/${backupDocument.id}.txt`;
			conflicts.push({
				path,
				isBinary: false,
				baseContent: undefined,
				localContent,
				remoteContent: backupContent,
				localViewContent: localView.content,
				remoteViewContent: backupView.content,
				localAnnotationSpans: localView.spans,
				annotationSpans: backupView.spans,
			});
			applyResolved.set(path, (resolution) => {
				if (resolution.action === 'keep-local') {
					updateDocumentText(backupDocument.id, localContent);
				} else if (
					resolution.action === 'merged' &&
					typeof resolution.content === 'string'
				) {
					updateDocumentText(backupDocument.id, resolution.content);
				}
			});
		}

		if (conflicts.length === 0) return merged;

		const resolutions = await mergeResolutionService.resolveConflicts(
			conflicts,
			{
				keepLocal: t('Keep TeXlyre'),
				keepRemote: t('Keep Backup'),
			},
		);
		if (!resolutions) {
			throw new Error(t('Import cancelled due to unresolved conflicts'));
		}

		for (const [path, apply] of applyResolved) {
			const resolution = resolutions.get(path);
			if (resolution) apply(resolution);
		}

		return merged;
	}

	private contentsEqual(
		a: string | ArrayBuffer,
		b: string | ArrayBuffer,
	): boolean {
		if (typeof a === 'string' && typeof b === 'string') return a === b;

		const aBytes =
			typeof a === 'string' ? new TextEncoder().encode(a) : new Uint8Array(a);
		const bBytes =
			typeof b === 'string' ? new TextEncoder().encode(b) : new Uint8Array(b);
		if (aBytes.byteLength !== bBytes.byteLength) return false;

		for (let i = 0; i < aBytes.byteLength; i++) {
			if (aBytes[i] !== bBytes[i]) return false;
		}
		return true;
	}

	private toConflictContent(
		content: string | ArrayBuffer,
	): string | ArrayBuffer {
		return content;
	}

	private yjsStateFromText(text: string): Uint8Array {
		const doc = new Y.Doc();
		doc.getText('codemirror').insert(0, text);
		const state = Y.encodeStateAsUpdate(doc);
		doc.destroy();
		return state;
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
			description: projectMetadata.description,
			type: projectMetadata.type || 'latex',
			group: projectMetadata.group,
			docUrl: projectMetadata.docUrl,
			createdAt: projectMetadata.createdAt,
			updatedAt: Date.now(),
			ownerId: ownerId,
			tags: projectMetadata.tags,
			isFavorite: projectMetadata.isFavorite,
		};

		await authDb.put('projects', newProject);
	}

	private async performDiscoveryScan(): Promise<void> {
		if (!this.rootHandle) return;

		setTimeout(async () => {
			try {
				const projects = await projectImportService.scanBackupDirectory(
					this.rootHandle!,
				);
				if (projects.length > 0) {
					this.addActivity({
						type: 'backup_complete',
						message: t('Found {count} importable project in backup directory', {
							count: projects.length,
						}),
					});
					this.notifyDiscoveryListeners({
						hasImportableProjects: true,
						projects,
					});
				}
			} catch (_error) {
				this.addActivity({
					type: 'backup_error',
					message: t('Error scanning for importable projects'),
				});
			}
		}, 1000);
	}

	private updateStatus(updates: Partial<BackupStatus>): void {
		this.status = { ...this.status, ...updates };
		this.notifyListeners();
	}

	private handleError(type: string, message: string, error: any): void {
		const errorMessage = `${message}: ${error instanceof Error ? error.message : t('Unknown error')}`;
		this.addActivity({ type: type as any, message: errorMessage });
		this.updateStatus({
			status: 'error',
			error: error instanceof Error ? error.message : message,
		});
	}

	private canSync(): boolean {
		return this.rootHandle !== null && this.isEnabled;
	}

	private async saveHandle(
		scope: string,
		handle: FileSystemDirectoryHandle,
	): Promise<void> {
		await this.handleStore.save(scope, handle);
	}

	private async loadHandle(
		scope: string,
	): Promise<FileSystemDirectoryHandle | null> {
		return this.handleStore.load(scope);
	}

	private async clearHandle(scope: string): Promise<void> {
		await this.handleStore.clear(scope);
	}

	private notifyListeners(): void {
		this.listeners.forEach((listener) => {
			listener(this.status);
		});
	}

	private notifyActivityListeners(): void {
		this.activityListeners.forEach((listener) => {
			listener(this.activities);
		});
	}

	private notifyDiscoveryListeners(result: BackupDiscoveryResult): void {
		this.discoveryListeners.forEach((listener) => {
			listener(result);
		});
	}
}

export const diskBackupService = new DiskBackupService();
