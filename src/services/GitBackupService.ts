// src/services/GitBackupService.ts
import { t } from '@/i18n';
import type { SecretsContextType } from '../contexts/SecretsContext';
import type { RecordsContextType } from '../contexts/RecordsContext';
import {
	computeGitBlobSha,
	getMimeType,
	isBinaryFile,
	isTemporaryFile,
	toArrayBuffer,
	latin1ToBytes,
} from '../utils/fileUtils';
import { authService } from './AuthService';
import {
	conflictResolutionService,
	type FileConflict,
} from './ConflictResolutionService';
import { UnifiedDataStructureService } from './DataStructureService';
import {
	fileStorageService,
	fileStorageEventEmitter,
} from './FileStorageService';
import { ProjectDataService } from './ProjectDataService';

const FILES_METADATA = '.texlyre_metadata.json';
const PROJECT_METADATA = 'metadata.json';

export interface GitBackupStatus {
	isConnected: boolean;
	isEnabled: boolean;
	lastSync: number | null;
	status: 'idle' | 'syncing' | 'error';
	error?: string;
	[key: string]: any;
}

export interface GitBackupActivity {
	id: string;
	type:
		| 'backup_start'
		| 'backup_complete'
		| 'backup_error'
		| 'import_start'
		| 'import_complete'
		| 'import_error';
	message: string;
	timestamp: number;
	data?: any;
}

export interface GitBackupSettings {
	apiEndpoint?: string;
	defaultBranch?: string;
	defaultCommitMessage?: string;
	ignorePatterns?: string[];
	maxFileSize?: number;
	requestTimeout?: number;
	maxRetryAttempts?: number;
	activityHistoryLimit?: number;
	importAfterPush?: boolean;
}

export interface GitTreeItem {
	type: string;
	path?: string;
	sha?: string;
	id?: string;
}

export type GitBackupChange =
	| {
			type: 'create' | 'update';
			path: string;
			content: string | Uint8Array | ArrayBuffer;
			previousRef?: string;
	  }
	| {
			type: 'delete';
			path: string;
			previousRef?: string;
	  };

export interface GitBackupAdapter<TTarget> {
	displayName: string;
	pluginId: string;
	tokenSecretKey: string;
	targetSecretKey: string;
	statusTargetKey: string;
	tokenType: string;
	importIdPrefix: string;

	setBaseUrl?(url: string): void;
	setRequestTimeout?(timeout: number): void;

	testConnection(token: string): Promise<boolean>;
	listTargets(token: string): Promise<any[]>;

	parseTarget(...args: any[]): TTarget;
	targetFromStoredValue(value: string, metadata?: Record<string, any>): TTarget;
	getTargetLabel(target: TTarget): string;
	getTargetSecretValue(target: TTarget): string;
	getTargetMetadata(target: TTarget): Record<string, any>;

	getRecursiveTree(
		token: string,
		target: TTarget,
		branch: string,
	): Promise<GitTreeItem[]>;

	readFile(
		token: string,
		target: TTarget,
		ref: string,
		branch: string,
	): Promise<string>;

	getFileRefForPath?(item: GitTreeItem, path: string, branch: string): string;

	commitChanges(
		token: string,
		target: TTarget,
		branch: string,
		message: string,
		changes: GitBackupChange[],
	): Promise<void>;

	getLatestCommitSha?(
		token: string,
		target: TTarget,
		branch: string,
	): Promise<string>;

	readFileAtRef?(
		token: string,
		target: TTarget,
		path: string,
		ref: string,
	): Promise<string>;

	readFileBytesAtRef?(
		token: string,
		target: TTarget,
		path: string,
		ref: string,
	): Promise<ArrayBuffer>;
}

interface ResolvedCredentials<TTarget> {
	token: string;
	target: TTarget;
	branch: string;
}

interface ProjectFilesData {
	metadataRef?: string;
	documentsMetadataRef?: string;
	filesMetadataRef?: string;
	documents: Map<string, { txtRef: string | null; yjsRef: string | null }>;
	files: Map<string, string>;
}

export class GitBackupService<TTarget> {
	private status: GitBackupStatus = {
		isConnected: false,
		isEnabled: false,
		lastSync: null,
		status: 'idle',
	};

	private listeners: Array<(status: GitBackupStatus) => void> = [];
	private activities: GitBackupActivity[] = [];
	private activityListeners: Array<(activities: GitBackupActivity[]) => void> =
		[];

	private dataSerializer = new ProjectDataService();
	private unifiedService = new UnifiedDataStructureService();

	private secretsContext: SecretsContextType | null = null;
	private recordsContext: RecordsContextType | null = null;
	private currentProjectId: string | undefined;

	private lastOperationTime = 0;
	private readonly MIN_OPERATION_INTERVAL = 2000;

	private settingsCache: GitBackupSettings = {};

	constructor(private adapter: GitBackupAdapter<TTarget>) {}

	setCurrentProjectId(projectId: string | undefined): void {
		if (this.currentProjectId === projectId) return;
		this.currentProjectId = projectId;
		this.hydrateActivities();
	}

	setSettings(settings: GitBackupSettings): void {
		this.settingsCache = { ...settings };
		if (settings.apiEndpoint) this.adapter.setBaseUrl?.(settings.apiEndpoint);
		if (settings.requestTimeout)
			this.adapter.setRequestTimeout?.(settings.requestTimeout);
	}

	setSecretsContext(secretsContext: SecretsContextType): void {
		this.secretsContext = secretsContext;
	}

	setRecordsContext(recordsContext: RecordsContextType): void {
		this.recordsContext = recordsContext;
		this.hydrateActivities();
	}

	async requestAccess(): Promise<{ success: boolean; error?: string }> {
		if (!authService.getCurrentUser()) {
			return { success: false, error: t('No authenticated user') };
		}
		return { success: true };
	}

	async getStoredCredentials(
		projectId?: string,
	): Promise<{ token: string; target: string; branch: string } | null> {
		if (!this.secretsContext) return null;

		const scopeOptions = this.getScopeOptions(projectId);
		const tokenSecret = await this.secretsContext.getSecret(
			this.adapter.pluginId,
			this.adapter.tokenSecretKey,
			scopeOptions,
		);
		const targetSecret = await this.secretsContext.getSecret(
			this.adapter.pluginId,
			this.adapter.targetSecretKey,
			scopeOptions,
		);
		const targetMetadata = await this.secretsContext.getSecretMetadata(
			this.adapter.pluginId,
			this.adapter.targetSecretKey,
			scopeOptions,
		);

		if (!tokenSecret?.value || !targetSecret?.value) return null;

		return {
			token: tokenSecret.value,
			target: targetSecret.value,
			branch: targetMetadata?.branch || this.getDefaultBranch(),
		};
	}

	async connectWithToken(token: string): Promise<{
		success: boolean;
		targets?: any[];
		repositories?: any[];
		projects?: any[];
		error?: string;
	}> {
		try {
			if (!(await this.adapter.testConnection(token))) {
				return {
					success: false,
					error: t('Invalid {provider} token', {
						provider: this.adapter.displayName,
					}),
				};
			}
			const targets = await this.adapter.listTargets(token);
			return {
				success: true,
				targets,
				repositories: targets,
				projects: targets,
			};
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: t('Failed to connect to {provider}', {
								provider: this.adapter.displayName,
							}),
			};
		}
	}

	async connectToTarget(
		token: string,
		target: TTarget,
		projectId?: string,
		branch?: string,
	): Promise<boolean> {
		try {
			if (!this.secretsContext) {
				throw new Error(t('Secrets context not initialized'));
			}

			const scopeOptions = this.getScopeOptions(projectId);
			const finalBranch = branch || this.getDefaultBranch();
			const targetLabel = this.adapter.getTargetLabel(target);
			const targetValue = this.adapter.getTargetSecretValue(target);

			await this.secretsContext.setSecret(
				this.adapter.pluginId,
				this.adapter.tokenSecretKey,
				token,
				{ ...scopeOptions, metadata: { tokenType: this.adapter.tokenType } },
			);

			const existingTargetSecret = await this.secretsContext.getSecret(
				this.adapter.pluginId,
				this.adapter.targetSecretKey,
				scopeOptions,
			);
			const existingMeta = await this.secretsContext.getSecretMetadata(
				this.adapter.pluginId,
				this.adapter.targetSecretKey,
				scopeOptions,
			);

			const sameTarget =
				existingTargetSecret?.value === targetValue &&
				existingMeta?.branch === finalBranch;

			await this.secretsContext.setSecret(
				this.adapter.pluginId,
				this.adapter.targetSecretKey,
				targetValue,
				{
					...scopeOptions,
					metadata: {
						...this.adapter.getTargetMetadata(target),
						connectedAt: Date.now(),
						branch: finalBranch,
						...(sameTarget && existingMeta?.lastSyncedCommitSha
							? { lastSyncedCommitSha: existingMeta.lastSyncedCommitSha }
							: {}),
					},
				},
			);

			this.status = {
				...this.status,
				isConnected: true,
				isEnabled: true,
				error: undefined,
				[this.adapter.statusTargetKey]: targetLabel,
			};
			this.notifyListeners();

			this.addActivity({
				type: 'backup_complete',
				message: t('Connected to {provider}: {target} ({branch})', {
					provider: this.adapter.displayName,
					target: targetLabel,
					branch: finalBranch,
				}),
			});

			return true;
		} catch (error) {
			this.status = {
				...this.status,
				status: 'error',
				error:
					error instanceof Error
						? error.message
						: t('Failed to connect to {provider}', {
								provider: this.adapter.displayName,
							}),
			};
			this.notifyListeners();
			return false;
		}
	}

	async disconnect(projectId?: string): Promise<void> {
		if (!this.secretsContext) return;
		const scopeOptions = this.getScopeOptions(projectId);

		await this.secretsContext.removeSecret(
			this.adapter.pluginId,
			this.adapter.tokenSecretKey,
			scopeOptions,
		);
		await this.secretsContext.removeSecret(
			this.adapter.pluginId,
			this.adapter.targetSecretKey,
			scopeOptions,
		);

		this.status = {
			...this.status,
			isConnected: false,
			isEnabled: false,
			[this.adapter.statusTargetKey]: undefined,
		};
		this.notifyListeners();
	}

	async getStoredTarget(projectId?: string): Promise<string | null> {
		if (!this.secretsContext) return null;
		const metadata = await this.secretsContext.getSecretMetadata(
			this.adapter.pluginId,
			this.adapter.targetSecretKey,
			this.getScopeOptions(projectId),
		);
		return (
			metadata?.fullName ||
			metadata?.pathWithNamespace ||
			metadata?.label ||
			metadata?.target ||
			null
		);
	}

	async getStoredBranch(projectId?: string): Promise<string> {
		if (!this.secretsContext) return this.getDefaultBranch();
		const metadata = await this.secretsContext.getSecretMetadata(
			this.adapter.pluginId,
			this.adapter.targetSecretKey,
			this.getScopeOptions(projectId),
		);
		return metadata?.branch || this.getDefaultBranch();
	}

	async hasStoredCredentials(projectId?: string): Promise<boolean> {
		if (!this.secretsContext) return false;
		const scopeOptions = this.getScopeOptions(projectId);
		const hasToken = await this.secretsContext.hasSecret(
			this.adapter.pluginId,
			this.adapter.tokenSecretKey,
			scopeOptions,
		);
		const hasTarget = await this.secretsContext.hasSecret(
			this.adapter.pluginId,
			this.adapter.targetSecretKey,
			scopeOptions,
		);
		return hasToken && hasTarget;
	}

	async synchronize(
		projectId?: string,
		commitMessage?: string,
		branch?: string,
	): Promise<void> {
		await this.throttleOperation();

		this.status = { ...this.status, status: 'syncing' };
		this.addActivity({
			type: 'backup_start',
			message: projectId
				? t('Syncing project: {projectId}', { projectId })
				: t('Syncing all projects...'),
		});
		this.notifyListeners();

		let shouldImportAfterPush = false;

		try {
			const credentials = await this.ensureValidCredentials(projectId);
			const resolvedCredentials = {
				...credentials,
				branch: branch || credentials.branch,
			};

			const localProjects = await this.loadLocalProjects(projectId);
			const tree = await this.adapter.getRecursiveTree(
				resolvedCredentials.token,
				resolvedCredentials.target,
				resolvedCredentials.branch,
			);
			const { existingFiles, existingFileRefs } = this.indexRemoteTree(tree);

			const changes: GitBackupChange[] = [];
			for (const project of localProjects) {
				const projectChanges = await this.buildChangesForProject(
					project,
					existingFiles,
					existingFileRefs,
				);
				changes.push(...projectChanges);
			}

			const baselineCommitSha = await this.loadBaselineSha(projectId);
			const resolvedChanges = await this.detectAndResolveConflicts(
				resolvedCredentials,
				changes,
				baselineCommitSha,
			);

			if (resolvedChanges === null) {
				this.addActivity({
					type: 'backup_error',
					message: t('Push cancelled due to unresolved conflicts'),
				});
				this.status = { ...this.status, status: 'idle', error: undefined };
				this.notifyListeners();
				return;
			}

			if (resolvedChanges.length > 0) {
				await this.commitWithRetry(
					resolvedCredentials,
					commitMessage || this.getDefaultCommitMessage(),
					resolvedChanges,
				);
			}

			await this.persistBaseline(resolvedCredentials, projectId);

			this.addActivity({
				type: 'backup_complete',
				message: t('{provider} sync completed successfully', {
					provider: this.adapter.displayName,
				}),
			});

			this.status = {
				...this.status,
				status: 'idle',
				lastSync: Date.now(),
				error: undefined,
			};
			shouldImportAfterPush = true;
		} catch (error) {
			this.handleError(
				error,
				'backup_error',
				t('{provider} sync failed', {
					provider: this.adapter.displayName,
				}),
			);
			this.notifyListeners();
			return;
		}

		this.notifyListeners();

		if (shouldImportAfterPush && this.getImportAfterPush()) {
			try {
				await this.importChanges(projectId, branch);
			} catch (error) {
				console.warn('Post-push reconciliation import failed:', error);
				this.addActivity({
					type: 'import_error',
					message: t(
						'Push succeeded but local reconciliation failed. Run import manually to sync local state.',
					),
				});
			}
		}
	}

	async exportData(
		projectId?: string,
		commitMessage?: string,
		branch?: string,
	): Promise<void> {
		await this.synchronize(projectId, commitMessage, branch);
	}

	async importChanges(projectId?: string, branch?: string): Promise<void> {
		await this.throttleOperation();

		this.status = { ...this.status, status: 'syncing' };
		this.addActivity({
			type: 'import_start',
			message: projectId
				? t('Importing project: {projectId}', { projectId })
				: t('Importing from {provider}...', {
						provider: this.adapter.displayName,
					}),
		});
		this.notifyListeners();

		try {
			const credentials = await this.ensureValidCredentials(projectId);
			const finalBranch = branch || credentials.branch;
			const resolvedCredentials = { ...credentials, branch: finalBranch };

			const tree = await this.adapter.getRecursiveTree(
				credentials.token,
				credentials.target,
				finalBranch,
			);
			const projectFiles = this.groupProjectFiles(tree, projectId, finalBranch);

			const user = await authService.getCurrentUser();
			if (!user) throw new Error(t('No authenticated user'));

			const importedMissing = await this.importMissingProjects(
				projectFiles,
				resolvedCredentials,
				user.id,
			);
			await this.importExistingProjects(
				projectFiles,
				resolvedCredentials,
				user.id,
			);

			let successMessage = t('{provider} import completed successfully', {
				provider: this.adapter.displayName,
			});
			if (importedMissing > 0) {
				successMessage += ` (${importedMissing} missing project${importedMissing === 1 ? '' : 's'} auto-imported)`;
			}

			this.addActivity({ type: 'import_complete', message: successMessage });
			this.status = {
				...this.status,
				status: 'idle',
				lastSync: Date.now(),
				error: undefined,
			};

			await this.persistBaseline(resolvedCredentials, projectId);
			fileStorageEventEmitter.emitChange();
		} catch (error) {
			console.error(error);
			this.handleError(
				error,
				'import_error',
				t('{provider} import failed', {
					provider: this.adapter.displayName,
				}),
			);
		}

		this.notifyListeners();
	}

	getStatus = (): GitBackupStatus => ({ ...this.status });
	getActivities = (): GitBackupActivity[] => [...this.activities];

	addStatusListener = (cb: (status: GitBackupStatus) => void): (() => void) => {
		this.listeners.push(cb);
		return () => {
			this.listeners = this.listeners.filter((l) => l !== cb);
		};
	};

	addActivityListener = (
		cb: (activities: GitBackupActivity[]) => void,
	): (() => void) => {
		this.activityListeners.push(cb);
		return () => {
			this.activityListeners = this.activityListeners.filter((l) => l !== cb);
		};
	};

	clearActivity = (id: string): void => {
		this.recordsContext?.removeRecord(
			this.getActivityRecordKey(),
			id,
			this.getActivityScopeOptions(),
		);
		this.activities = this.activities.filter((a) => a.id !== id);
		this.notifyActivityListeners();
	};

	clearAllActivities = (): void => {
		this.recordsContext?.clearRecords(
			this.getActivityRecordKey(),
			this.getActivityScopeOptions(),
		);
		this.activities = [];
		this.notifyActivityListeners();
	};

	private async loadLocalProjects(projectId?: string) {
		const user = await authService.getCurrentUser();
		if (!user) throw new Error(t('No authenticated user'));

		const projects = projectId
			? [await authService.getProjectById(projectId)]
			: await authService.getProjectsByUser(user.id);

		if (!projects || projects.some((p) => !p)) {
			throw new Error(t('Could not load projects.'));
		}

		return projects.filter((p): p is NonNullable<typeof p> => !!p);
	}

	private indexRemoteTree(tree: GitTreeItem[]) {
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
	): Promise<GitBackupChange[]> {
		const changes: GitBackupChange[] = [];
		const projectPath = `projects/${project.id}`;
		const maxFileSize = this.getMaxFileSize();

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
			const content = files.fileContents.get(file.path);
			if (file.type !== 'file' || content === undefined) continue;
			if (isTemporaryFile(file.path) || this.shouldIgnoreFile(file.path))
				continue;

			const fileSize =
				content instanceof ArrayBuffer ? content.byteLength : content.length;
			if (fileSize > maxFileSize) {
				this.addActivity({
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

	private async detectAndResolveConflicts(
		credentials: ResolvedCredentials<TTarget>,
		changes: GitBackupChange[],
		baselineCommitSha: string | undefined,
	): Promise<GitBackupChange[] | null> {
		if (
			!baselineCommitSha ||
			!this.adapter.getLatestCommitSha ||
			!this.adapter.readFileAtRef
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

			const baseContent = await this.readFileAtRefSafe(
				credentials,
				change.path,
				baselineCommitSha,
			);
			const remoteContent = await this.readFileAtRefSafe(
				credentials,
				change.path,
				currentRemoteSha,
			);

			if (remoteContent === undefined) {
				nonConflicting.push(change);
				continue;
			}

			const localText = this.changeContentAsText(change.content);
			const merge = conflictResolutionService.tryAutoMerge(
				baseContent,
				localText,
				remoteContent,
				false,
			);

			if (merge.resolved) {
				if (merge.unchanged) continue;
				nonConflicting.push({ ...change, content: merge.content });
				continue;
			}

			conflicts.push({
				path: change.path,
				isBinary: false,
				baseContent,
				localContent: toArrayBuffer(change.content),
				remoteContent,
				previousRef: change.previousRef,
			});
		}

		if (conflicts.length === 0) return nonConflicting;

		const resolutions =
			await conflictResolutionService.resolveConflicts(conflicts);
		if (!resolutions) return null;

		for (const conflict of conflicts) {
			const resolution = resolutions.get(conflict.path);
			if (!resolution) continue;

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

		return nonConflicting;
	}

	private async detectBinaryConflict(
		credentials: ResolvedCredentials<TTarget>,
		change: Extract<GitBackupChange, { type: 'create' | 'update' }>,
		baselineCommitSha: string,
		currentRemoteSha: string,
	): Promise<'skip' | 'push' | FileConflict> {
		const localContent = toArrayBuffer(change.content);
		const localSha = await computeGitBlobSha(localContent);

		const remoteText = await this.readFileAtRefSafe(
			credentials,
			change.path,
			currentRemoteSha,
		);
		if (remoteText === undefined) return 'push';

		const remoteBytes = toArrayBuffer(latin1ToBytes(remoteText));
		const remoteSha = await computeGitBlobSha(remoteBytes);
		if (localSha === remoteSha) return 'skip';

		const baseText = await this.readFileAtRefSafe(
			credentials,
			change.path,
			baselineCommitSha,
		);
		const baseSha = baseText
			? await computeGitBlobSha(toArrayBuffer(latin1ToBytes(baseText)))
			: undefined;

		if (baseSha === localSha) return 'skip';
		if (baseSha === remoteSha) return 'push';

		return {
			path: change.path,
			isBinary: true,
			baseContent: undefined,
			localContent,
			remoteContent: remoteBytes,
			previousRef: change.previousRef,
		};
	}

	private async readFileAtRefSafe(
		credentials: ResolvedCredentials<TTarget>,
		path: string,
		ref: string,
	): Promise<string | undefined> {
		if (!this.adapter.readFileAtRef) return undefined;
		try {
			return await this.adapter.readFileAtRef(
				credentials.token,
				credentials.target,
				path,
				ref,
			);
		} catch {
			return undefined;
		}
	}

	private changeContentAsText(
		content: string | Uint8Array | ArrayBuffer,
	): string {
		if (typeof content === 'string') return content;
		return new TextDecoder().decode(content as ArrayBuffer);
	}

	private async importMissingProjects(
		projectFiles: Map<string, ProjectFilesData>,
		credentials: ResolvedCredentials<TTarget>,
		ownerId: string,
	): Promise<number> {
		const existingProjects = await authService.getProjectsByUser(ownerId);
		const existingProjectIds = new Set(existingProjects.map((p) => p.id));

		let imported = 0;
		for (const [projId, data] of projectFiles.entries()) {
			if (!data.metadataRef || existingProjectIds.has(projId)) continue;

			try {
				const metadataContent = await this.adapter.readFile(
					credentials.token,
					credentials.target,
					data.metadataRef,
					credentials.branch,
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
				this.addActivity({
					type: 'import_complete',
					message: t('Auto-imported missing project: {projectName}', {
						projectName: projectMetadata.name,
					}),
				});
				fileStorageEventEmitter.emitChange();
			} catch (error) {
				console.error(`Failed to import missing project ${projId}:`, error);
				this.addActivity({
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
		projectFiles: Map<string, ProjectFilesData>,
		credentials: ResolvedCredentials<TTarget>,
		ownerId: string,
	): Promise<void> {
		const existingProjects = await authService.getProjectsByUser(ownerId);
		const existingProjectIds = new Set(existingProjects.map((p) => p.id));

		for (const [projId, data] of projectFiles.entries()) {
			if (!data.metadataRef || !existingProjectIds.has(projId)) continue;

			const metadataContent = await this.adapter.readFile(
				credentials.token,
				credentials.target,
				data.metadataRef,
				credentials.branch,
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
		data: ProjectFilesData,
		credentials: ResolvedCredentials<TTarget>,
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
		await fileStorageService.switchToProject(resolvedMetadata.docUrl);
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
			this.addActivity({
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
		data: ProjectFilesData,
		credentials: ResolvedCredentials<TTarget>,
	): Promise<{ documents: any[]; documentContents: Map<string, any> }> {
		let remoteDocumentsMetadata: any[] = [];

		if (data.documentsMetadataRef) {
			try {
				const metadataContent = await this.adapter.readFile(
					credentials.token,
					credentials.target,
					data.documentsMetadataRef,
					credentials.branch,
				);
				remoteDocumentsMetadata = JSON.parse(metadataContent);
			} catch (error) {
				console.error('Failed to load documents metadata from remote:', error);
			}
		}

		const docMetadataById = new Map<string, any>();
		remoteDocumentsMetadata.forEach((meta) =>
			docMetadataById.set(meta.id, meta),
		);

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
				contentData.readableContent = await this.adapter.readFile(
					credentials.token,
					credentials.target,
					docData.txtRef,
					credentials.branch,
				);
			}

			if (docData.yjsRef) {
				const yjsContent = await this.adapter.readFile(
					credentials.token,
					credentials.target,
					docData.yjsRef,
					credentials.branch,
				);
				contentData.yjsState = latin1ToBytes(yjsContent);
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
		data: ProjectFilesData,
		credentials: ResolvedCredentials<TTarget>,
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
				console.error(`Failed to import file ${filePath}:`, error);
				this.addActivity({
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
			this.addActivity({
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
		data: ProjectFilesData,
		credentials: ResolvedCredentials<TTarget>,
	): Promise<{
		metadataByPath: Map<string, any>;
		deletedFilesMetadata: Map<string, any>;
	}> {
		let remoteFilesMetadata: any[] = [];

		if (data.filesMetadataRef) {
			try {
				const metadataContent = await this.adapter.readFile(
					credentials.token,
					credentials.target,
					data.filesMetadataRef,
					credentials.branch,
				);
				remoteFilesMetadata = JSON.parse(metadataContent);
			} catch (error) {
				console.error('Failed to load files metadata from remote:', error);
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
		data: ProjectFilesData,
	): Promise<void> {
		for (const [filePath, fileMetadata] of deletedFilesMetadata.entries()) {
			if (data.files.has(filePath)) continue;

			try {
				await fileStorageService.storeFile(
					{
						id:
							fileMetadata.id ||
							`deleted-${Math.random().toString(36).substring(2, 15)}`,
						name: fileMetadata.name,
						path: fileMetadata.path,
						type: fileMetadata.type as 'file' | 'directory',
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
				console.error(
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
		credentials: ResolvedCredentials<TTarget>,
	): Promise<void> {
		const existingFile = await fileStorageService.getFileByPath(filePath, true);
		if (existingFile?.content) {
			const localSha = await computeGitBlobSha(
				existingFile.content as string | ArrayBuffer,
			);
			if (localSha === fileRef) return;
		}

		await fileStorageService.createDirectoryPath(filePath);

		const rawContentString = await this.adapter.readFile(
			credentials.token,
			credentials.target,
			fileRef,
			credentials.branch,
		);

		const remoteMetadata = metadataByPath.get(filePath);
		const binary = remoteMetadata
			? remoteMetadata.isBinary
			: isBinaryFile(filePath);

		const finalContent: string | ArrayBuffer = binary
			? toArrayBuffer(latin1ToBytes(rawContentString))
			: new TextDecoder('utf-8').decode(latin1ToBytes(rawContentString));

		const fileSize =
			finalContent instanceof ArrayBuffer
				? finalContent.byteLength
				: finalContent.length;

		const fileToStore = remoteMetadata
			? {
					id:
						existingFile?.id ||
						remoteMetadata.id ||
						`${this.adapter.importIdPrefix}-${Math.random().toString(36).substring(2, 15)}`,
					name: remoteMetadata.name,
					path: remoteMetadata.path,
					type: remoteMetadata.type as 'file' | 'directory',
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
						`${this.adapter.importIdPrefix}-${Math.random().toString(36).substring(2, 15)}`,
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

		await fileStorageService.storeFile(fileToStore, {
			showConflictDialog: false,
			preserveTimestamp: !!remoteMetadata,
		});
	}

	private async loadBaselineSha(
		projectId?: string,
	): Promise<string | undefined> {
		const metadata = await this.secretsContext?.getSecretMetadata(
			this.adapter.pluginId,
			this.adapter.targetSecretKey,
			this.getScopeOptions(projectId),
		);
		return metadata?.lastSyncedCommitSha as string | undefined;
	}

	private async persistBaseline(
		credentials: ResolvedCredentials<TTarget>,
		projectId?: string,
	): Promise<void> {
		if (!this.adapter.getLatestCommitSha || !this.secretsContext) return;

		try {
			const newSha = await this.adapter.getLatestCommitSha(
				credentials.token,
				credentials.target,
				credentials.branch,
			);
			const existingMeta = await this.secretsContext.getSecretMetadata(
				this.adapter.pluginId,
				this.adapter.targetSecretKey,
				this.getScopeOptions(projectId),
			);
			await this.secretsContext.setSecret(
				this.adapter.pluginId,
				this.adapter.targetSecretKey,
				this.adapter.getTargetSecretValue(credentials.target),
				{
					...this.getScopeOptions(projectId),
					metadata: { ...existingMeta, lastSyncedCommitSha: newSha },
				},
			);
		} catch (error) {
			console.warn('Failed to persist baseline commit sha:', error);
		}
	}

	private async ensureValidCredentials(
		projectId?: string,
	): Promise<ResolvedCredentials<TTarget>> {
		if (!this.secretsContext) {
			throw new Error(
				t('{provider} credentials not available. Please reconnect.', {
					provider: this.adapter.displayName,
				}),
			);
		}

		const scopeOptions = this.getScopeOptions(projectId);
		const tokenSecret = await this.secretsContext.getSecret(
			this.adapter.pluginId,
			this.adapter.tokenSecretKey,
			scopeOptions,
		);
		const targetSecret = await this.secretsContext.getSecret(
			this.adapter.pluginId,
			this.adapter.targetSecretKey,
			scopeOptions,
		);
		const targetMetadata = await this.secretsContext.getSecretMetadata(
			this.adapter.pluginId,
			this.adapter.targetSecretKey,
			scopeOptions,
		);

		if (!tokenSecret?.value || !targetSecret?.value) {
			throw new Error(
				t('{provider} credentials not available. Please reconnect.', {
					provider: this.adapter.displayName,
				}),
			);
		}

		if (!(await this.adapter.testConnection(tokenSecret.value))) {
			throw new Error(
				t('{provider} token is invalid or expired. Please reconnect.', {
					provider: this.adapter.displayName,
				}),
			);
		}

		const target = this.adapter.targetFromStoredValue(
			targetSecret.value,
			targetMetadata,
		);
		this.status = {
			...this.status,
			isConnected: true,
			isEnabled: true,
			error: undefined,
			[this.adapter.statusTargetKey]: this.adapter.getTargetLabel(target),
		};
		this.notifyListeners();

		return {
			token: tokenSecret.value,
			target,
			branch: targetMetadata?.branch || this.getDefaultBranch(),
		};
	}

	private groupProjectFiles(
		tree: GitTreeItem[],
		projectId?: string,
		branch = this.getDefaultBranch(),
	): Map<string, ProjectFilesData> {
		const projectFiles = new Map<string, ProjectFilesData>();

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
			const ref = this.getFileRef(item, item.path, branch);

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

	private async commitWithRetry(
		credentials: ResolvedCredentials<TTarget>,
		commitMessage: string,
		changes: GitBackupChange[],
	): Promise<void> {
		const maxRetries = this.getMaxRetryAttempts();

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				if (attempt > 1) {
					await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
					this.addActivity({
						type: 'backup_start',
						message: t('Retrying commit (attempt {attempt}/{maxRetries})...', {
							attempt,
							maxRetries,
						}),
					});
				}
				await this.adapter.commitChanges(
					credentials.token,
					credentials.target,
					credentials.branch,
					commitMessage,
					changes,
				);
				return;
			} catch (error) {
				console.warn(`Commit attempt ${attempt} failed:`, error);
				if (attempt === maxRetries) throw error;
			}
		}
	}

	private getFileRef(item: GitTreeItem, path: string, branch: string): string {
		return (
			this.adapter.getFileRefForPath?.(item, path, branch) ||
			item.sha ||
			item.id ||
			path
		);
	}

	private getDefaultBranch(): string {
		return this.settingsCache.defaultBranch || 'main';
	}

	private getDefaultCommitMessage(): string {
		const template =
			this.settingsCache.defaultCommitMessage || 'TeXlyre Backup: {date}';
		const now = new Date();
		return template
			.replace('{date}', now.toLocaleDateString())
			.replace('{time}', now.toLocaleTimeString());
	}

	private getIgnorePatterns(): string[] {
		return this.settingsCache.ignorePatterns || [];
	}

	private getMaxFileSize(): number {
		return (this.settingsCache.maxFileSize || 100) * 1024 * 1024;
	}

	private getMaxRetryAttempts(): number {
		return this.settingsCache.maxRetryAttempts || 3;
	}

	private getActivityHistoryLimit(): number {
		return this.settingsCache.activityHistoryLimit || 50;
	}

	private getImportAfterPush(): boolean {
		return this.settingsCache.importAfterPush ?? true;
	}

	private shouldIgnoreFile(filePath: string): boolean {
		const patterns = this.getIgnorePatterns();
		if (patterns.length === 0) return false;

		for (const pattern of patterns) {
			const trimmedPattern = pattern.trim();
			if (!trimmedPattern) continue;

			const regexPattern = trimmedPattern
				.replace(/\./g, '\\.')
				.replace(/\*/g, '.*')
				.replace(/\?/g, '.');

			const regex = new RegExp(`^${regexPattern}$`);
			const fileName = filePath.split('/').pop() || '';
			if (regex.test(fileName) || regex.test(filePath)) return true;
		}

		return false;
	}

	private getScopeOptions(projectId?: string) {
		return {
			scope: projectId ? 'project' : ('global' as 'project' | 'global'),
			projectId,
		};
	}

	private getActivityRecordKey(): string {
		return `${this.adapter.pluginId}-activity`;
	}

	private getActivityScopeOptions() {
		return {
			scope: this.currentProjectId ? ('project' as const) : ('global' as const),
			projectId: this.currentProjectId,
			maxEntries: this.getActivityHistoryLimit(),
		};
	}

	private hydrateActivities(): void {
		if (!this.recordsContext) return;
		const entries = this.recordsContext.listRecords<
			Omit<GitBackupActivity, 'id' | 'timestamp'>
		>(this.getActivityRecordKey(), {
			scope: this.currentProjectId ? 'project' : 'global',
			projectId: this.currentProjectId,
		});
		this.activities = entries.map((entry) => ({
			id: entry.id,
			timestamp: entry.timestamp,
			...entry.data,
		}));
		this.notifyActivityListeners();
	}

	private handleError(
		error: unknown,
		type: 'backup_error' | 'import_error',
		messagePrefix: string,
	): void {
		const errorMessage = error instanceof Error ? error.message : String(error);
		this.addActivity({ type, message: `${messagePrefix}: ${errorMessage}` });
		this.status = { ...this.status, status: 'error', error: errorMessage };
		this.notifyListeners();
	}

	private async throttleOperation(): Promise<void> {
		const now = Date.now();
		const timeSinceLastOp = now - this.lastOperationTime;
		if (timeSinceLastOp < this.MIN_OPERATION_INTERVAL) {
			await new Promise((resolve) =>
				setTimeout(resolve, this.MIN_OPERATION_INTERVAL - timeSinceLastOp),
			);
		}
		this.lastOperationTime = Date.now();
	}

	private notifyListeners(): void {
		this.listeners.forEach((listener) => listener(this.status));
	}

	private notifyActivityListeners(): void {
		this.activityListeners.forEach((listener) =>
			listener([...this.activities]),
		);
	}

	private addActivity(
		activity: Omit<GitBackupActivity, 'id' | 'timestamp'>,
	): void {
		const entry = this.recordsContext?.appendRecord(
			this.getActivityRecordKey(),
			activity,
			this.getActivityScopeOptions(),
		);

		const fullActivity: GitBackupActivity = entry
			? { id: entry.id, timestamp: entry.timestamp, ...activity }
			: {
					id: Math.random().toString(36).substring(2),
					timestamp: Date.now(),
					...activity,
				};

		const limit = this.getActivityHistoryLimit();
		this.activities = [...this.activities.slice(-limit + 1), fullActivity];
		this.notifyActivityListeners();
	}
}
