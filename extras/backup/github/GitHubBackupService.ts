// extras/backup/github/GitHubBackupService.ts
import { t } from '@/i18n';
import type { SecretsContextType } from '@/contexts/SecretsContext';
import { authService } from '@/services/AuthService';
import { UnifiedDataStructureService } from '@/services/DataStructureService';
import { fileStorageService, fileStorageEventEmitter } from '@/services/FileStorageService';
import { ProjectDataService } from '@/services/ProjectDataService';
import { getMimeType, isBinaryFile } from '@/utils/fileUtils.ts';
import { gitHubApiService } from './GitHubApiService';

interface BackupStatus {
	isConnected: boolean;
	isEnabled: boolean;
	lastSync: number | null;
	status: 'idle' | 'syncing' | 'error';
	error?: string;
	repository?: string;
}

interface BackupActivity {
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

export class GitHubBackupService {
	private status: BackupStatus = {
		isConnected: false,
		isEnabled: false,
		lastSync: null,
		status: 'idle',
	};
	private listeners: Array<(status: BackupStatus) => void> = [];
	private activities: BackupActivity[] = [];
	private activityListeners: Array<(activities: BackupActivity[]) => void> = [];
	private dataSerializer = new ProjectDataService();
	private unifiedService = new UnifiedDataStructureService();
	private currentRepo: { owner: string; repo: string } | null = null;
	private secretsContext: SecretsContextType | null = null;
	private lastOperationTime = 0;
	private readonly MIN_OPERATION_INTERVAL = 2000;
	private readonly PLUGIN_ID = 'texlyre-github-backup';
	private readonly SECRET_KEYS = {
		TOKEN: 'github-token',
		REPOSITORY: 'selected-repository',
	} as const;

	private settingsCache: {
		apiEndpoint?: string;
		defaultBranch?: string;
		defaultCommitMessage?: string;
		ignorePatterns?: string[];
		maxFileSize?: number;
		requestTimeout?: number;
		maxRetryAttempts?: number;
		activityHistoryLimit?: number;
	} = {};

	setSettings(settings: {
		apiEndpoint?: string;
		defaultBranch?: string;
		defaultCommitMessage?: string;
		ignorePatterns?: string[];
		maxFileSize?: number;
		requestTimeout?: number;
		maxRetryAttempts?: number;
		activityHistoryLimit?: number;
	}): void {
		this.settingsCache = { ...settings };

		if (settings.apiEndpoint) {
			gitHubApiService.setBaseUrl(settings.apiEndpoint);
		}

		if (settings.requestTimeout) {
			gitHubApiService.setRequestTimeout(settings.requestTimeout);
		}
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

			if (regex.test(fileName) || regex.test(filePath)) {
				return true;
			}
		}

		return false;
	}

	private _getScopeOptions(projectId?: string) {
		return {
			scope: projectId ? 'project' : ('global' as 'project' | 'global'),
			projectId,
		};
	}

	private _handleError(
		error: unknown,
		type: 'backup_error' | 'import_error',
		messagePrefix: string,
	) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		this.addActivity({ type, message: `${messagePrefix}: ${errorMessage}` });
		this.status = { ...this.status, status: 'error', error: errorMessage };
		this.notifyListeners();
	}

	private async _throttleOperation() {
		const now = Date.now();
		const timeSinceLastOp = now - this.lastOperationTime;
		if (timeSinceLastOp < this.MIN_OPERATION_INTERVAL) {
			const waitTime = this.MIN_OPERATION_INTERVAL - timeSinceLastOp;
			await new Promise((resolve) => setTimeout(resolve, waitTime));
		}
		this.lastOperationTime = Date.now();
	}

	private notifyListeners(): void {
		this.listeners.forEach((listener) => listener(this.status));
	}

	private notifyActivityListeners(): void {
		this.activityListeners.forEach((listener) => listener(this.activities));
	}

	private addActivity(activity: Omit<BackupActivity, 'id' | 'timestamp'>) {
		const fullActivity: BackupActivity = {
			id: Math.random().toString(36).substring(2),
			timestamp: Date.now(),
			...activity,
		};
		const limit = this.getActivityHistoryLimit();
		this.activities = [...this.activities.slice(-limit + 1), fullActivity];
		this.notifyActivityListeners();
	}

	setSecretsContext(secretsContext: SecretsContextType): void {
		this.secretsContext = secretsContext;
	}

	async requestAccess(): Promise<{ success: boolean; error?: string }> {
		if (!authService.getCurrentUser()) {
			return { success: false, error: t('No authenticated user') };
		}
		return { success: true };
	}

	async connectWithToken(
		token: string,
	): Promise<{ success: boolean; repositories?: any[]; error?: string }> {
		try {
			if (!(await gitHubApiService.testConnection(token)))
				return { success: false, error: t('Invalid GitHub token') };
			const repositories = await gitHubApiService.getRepositories(token);
			return { success: true, repositories };
		} catch (error) {
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: t('Failed to connect to GitHub'),
			};
		}
	}

	async connectToRepository(
		token: string,
		repoName: string,
		projectId?: string,
		branch?: string,
	): Promise<boolean> {
		try {
			if (!this.secretsContext)
				throw new Error(t('Secrets context not initialized'));
			if (!repoName || !repoName.includes('/'))
				throw new Error(t('Invalid repository format. Use owner/repo'));

			const [owner, repo] = repoName.split('/');
			this.currentRepo = { owner, repo };
			const scopeOptions = this._getScopeOptions(projectId);

			const finalBranch = branch || this.getDefaultBranch();

			await this.secretsContext.setSecret(
				this.PLUGIN_ID,
				this.SECRET_KEYS.TOKEN,
				token,
				{
					...scopeOptions,
					metadata: { tokenType: 'github-personal-access-token' },
				},
			);
			await this.secretsContext.setSecret(
				this.PLUGIN_ID,
				this.SECRET_KEYS.REPOSITORY,
				repoName,
				{
					...scopeOptions,
					metadata: {
						owner,
						repo,
						fullName: repoName,
						connectedAt: Date.now(),
						branch: finalBranch,
					},
				},
			);

			this.status = {
				...this.status,
				isConnected: true,
				isEnabled: true,
				repository: repoName,
				error: undefined,
			};
			this.notifyListeners();
			this.addActivity({
				type: 'backup_complete',
				message: t(`Connected to GitHub repository: {repoName} ({branch})`, { repoName, branch: finalBranch }),
			});
			return true;
		} catch (error) {
			this.status = {
				...this.status,
				status: 'error',
				error:
					error instanceof Error
						? error.message
						: t('Failed to connect to GitHub'),
			};
			this.notifyListeners();
			return false;
		}
	}

	async disconnect(projectId?: string): Promise<void> {
		if (!this.secretsContext) return;
		const scopeOptions = this._getScopeOptions(projectId);
		await this.secretsContext.removeSecret(
			this.PLUGIN_ID,
			this.SECRET_KEYS.TOKEN,
			scopeOptions,
		);
		await this.secretsContext.removeSecret(
			this.PLUGIN_ID,
			this.SECRET_KEYS.REPOSITORY,
			scopeOptions,
		);
		this.currentRepo = null;
		this.status = {
			...this.status,
			isConnected: false,
			isEnabled: false,
			repository: undefined,
		};
		this.notifyListeners();
	}

	private async getGitHubCredentials(
		projectId?: string,
	): Promise<{ token: string; repository: string } | null> {
		if (!this.secretsContext) return null;
		const scopeOptions = this._getScopeOptions(projectId);
		try {
			const tokenSecret = await this.secretsContext.getSecret(
				this.PLUGIN_ID,
				this.SECRET_KEYS.TOKEN,
				scopeOptions,
			);
			const repoSecret = await this.secretsContext.getSecret(
				this.PLUGIN_ID,
				this.SECRET_KEYS.REPOSITORY,
				scopeOptions,
			);
			if (!tokenSecret?.value || !repoSecret?.value) return null;
			return { token: tokenSecret.value, repository: repoSecret.value };
		} catch (error) {
			console.error(t('Error retrieving GitHub credentials:'), error);
			return null;
		}
	}

	async getStoredRepository(projectId?: string): Promise<string | null> {
		if (!this.secretsContext) return null;
		const repoMetadata = await this.secretsContext.getSecretMetadata(
			this.PLUGIN_ID,
			this.SECRET_KEYS.REPOSITORY,
			this._getScopeOptions(projectId),
		);
		return repoMetadata?.fullName || null;
	}

	async getStoredBranch(projectId?: string): Promise<string> {
		if (!this.secretsContext) return this.getDefaultBranch();
		const repoMetadata = await this.secretsContext.getSecretMetadata(
			this.PLUGIN_ID,
			this.SECRET_KEYS.REPOSITORY,
			this._getScopeOptions(projectId),
		);
		return repoMetadata?.branch || this.getDefaultBranch();
	}

	async hasStoredCredentials(projectId?: string): Promise<boolean> {
		if (!this.secretsContext) return false;
		const scopeOptions = this._getScopeOptions(projectId);
		const hasToken = await this.secretsContext.hasSecret(
			this.PLUGIN_ID,
			this.SECRET_KEYS.TOKEN,
			scopeOptions,
		);
		const hasRepo = await this.secretsContext.hasSecret(
			this.PLUGIN_ID,
			this.SECRET_KEYS.REPOSITORY,
			scopeOptions,
		);
		return hasToken && hasRepo;
	}

	private async ensureValidCredentials(
		projectId?: string,
	): Promise<{ token: string; repository: string; branch: string }> {
		const credentials = await this.getGitHubCredentials(projectId);
		const branch = await this.getStoredBranch(projectId);
		if (!credentials)
			throw new Error(t('GitHub credentials not available. Please reconnect.'));
		if (!(await gitHubApiService.testConnection(credentials.token)))
			throw new Error(t('GitHub token is invalid or expired. Please reconnect.'));

		const [owner, repo] = credentials.repository.split('/');
		this.currentRepo = { owner, repo };
		this.status = {
			...this.status,
			isConnected: true,
			isEnabled: true,
			repository: credentials.repository,
			error: undefined,
		};
		this.notifyListeners();
		return { ...credentials, branch };
	}

	private async createCommitWithRetry(
		token: string,
		owner: string,
		repo: string,
		commitMessage: string,
		filesToCommit: {
			path: string;
			content: string | Uint8Array | ArrayBuffer;
		}[],
		branch = 'main',
		filesToDelete: { path: string }[] = [],
	): Promise<void> {
		const maxRetries = this.getMaxRetryAttempts();

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				if (attempt > 1) {
					await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
					this.addActivity({
						type: 'backup_start',
						message: t(`Retrying commit (attempt {attempt}/{maxRetries})...`, { attempt, maxRetries }),
					});
				}
				await gitHubApiService.createCommitFromFiles(
					token,
					owner,
					repo,
					commitMessage,
					filesToCommit,
					branch,
					filesToDelete,
				);
				return;
			} catch (error) {
				console.warn(`Commit attempt ${attempt} failed:`, error);
				if (attempt === maxRetries) throw error;
			}
		}
	}

	async synchronize(
		projectId?: string,
		commitMessage?: string,
		branch?: string,
	): Promise<void> {
		await this._throttleOperation();
		this.status = { ...this.status, status: 'syncing' };
		this.addActivity({
			type: 'backup_start',
			message: projectId
				? t(`Syncing project: {projectId}`, { projectId })
				: t('Syncing all projects...'),
		});
		this.notifyListeners();

		try {
			const user = await authService.getCurrentUser();
			if (!user) throw new Error(t('No authenticated user'));

			const credentials = await this.ensureValidCredentials(projectId);
			const finalBranch = branch || credentials.branch;
			const localProjects = projectId
				? [await authService.getProjectById(projectId)]
				: await authService.getProjectsByUser(user.id);
			if (!localProjects || localProjects.some((p) => !p))
				throw new Error(t('Could not load projects.'));

			const filesToCommit: {
				path: string;
				content: string | Uint8Array | ArrayBuffer;
			}[] = [];
			const filesToDelete: { path: string }[] = [];
			const maxFileSize = this.getMaxFileSize();

			for (const project of localProjects) {
				if (!project) continue;
				const projectPath = `projects/${project.id}`;
				const documents =
					await this.dataSerializer.serializeProjectDocuments(project);
				const files = await this.dataSerializer.serializeProjectFiles(
					project,
					true,
				);

				filesToCommit.push({
					path: `${projectPath}/metadata.json`,
					content: JSON.stringify(
						this.unifiedService.convertProjectToMetadata(project, 'backup'),
						null,
						2,
					),
				});

				if (documents.documents.length > 0) {
					const documentsMetadata = documents.documents.map((doc) => ({
						id: doc.id,
						name: doc.name,
						lastModified: doc.lastModified,
						hasYjsState: doc.hasYjsState,
						hasReadableContent: doc.hasReadableContent,
					}));
					filesToCommit.push({
						path: `${projectPath}/documents/metadata.json`,
						content: JSON.stringify(documentsMetadata, null, 2),
					});
				}

				documents.documents.forEach((doc) => {
					const content = documents.documentContents.get(doc.id);
					if (content?.readableContent) {
						filesToCommit.push({
							path: `${projectPath}/documents/${doc.id}.txt`,
							content: content.readableContent,
						});
					}
					if (content?.yjsState) {
						filesToCommit.push({
							path: `${projectPath}/documents/${doc.id}.yjs`,
							content: content.yjsState,
						});
					}
				});

				if (files.files.length > 0 || files.deletedFiles.length > 0) {
					const allFilesMetadata = [
						...files.files.map((file) =>
							this.unifiedService.convertFileToMetadata(file),
						),
						...files.deletedFiles.map((file) => ({
							...this.unifiedService.convertFileToMetadata(file),
							isDeleted: true,
						})),
					];
					filesToCommit.push({
						path: `${projectPath}/files/metadata.json`,
						content: JSON.stringify(allFilesMetadata, null, 2),
					});
				}

				files.files.forEach((file) => {
					const content = files.fileContents.get(file.path);
					if (file.type === 'file' && content !== undefined) {
						if (this.shouldIgnoreFile(file.path)) {
							return;
						}

						const fileSize =
							content instanceof ArrayBuffer
								? content.byteLength
								: content.length;
						if (fileSize > maxFileSize) {
							this.addActivity({
								type: 'backup_error',
								message: t(
									'Skipped file {path}: exceeds max size of {size}MB',
									{
										path: file.path,
										size: Math.round(maxFileSize / 1024 / 1024),
									},
								),
							});
							return;
						}

						filesToCommit.push({
							path: `${projectPath}/files${file.path}`,
							content,
						});
					}
				});

				for (const deletedFile of files.deletedFiles) {
					if (deletedFile.type === 'file') {
						const filePath = `${projectPath}/files${deletedFile.path}`;
						filesToDelete.push({ path: filePath });
					}
				}
			}

			const finalCommitMessage =
				commitMessage || this.getDefaultCommitMessage();

			await this.createCommitWithRetry(
				credentials.token,
				this.currentRepo?.owner,
				this.currentRepo?.repo,
				finalCommitMessage,
				filesToCommit,
				finalBranch,
				filesToDelete,
			);

			this.addActivity({
				type: 'backup_complete',
				message: t('GitHub sync completed successfully'),
			});
			this.status = {
				...this.status,
				status: 'idle',
				lastSync: Date.now(),
				error: undefined,
			};
		} catch (error) {
			this._handleError(error, 'backup_error', t('GitHub sync failed'));
		}
		this.notifyListeners();
	}

	async exportData(
		projectId?: string,
		commitMessage?: string,
		branch?: string,
	): Promise<void> {
		await this.synchronize(projectId, commitMessage, branch);
	}

	async importChanges(projectId?: string, branch?: string): Promise<void> {
		await this._throttleOperation();
		this.status = { ...this.status, status: 'syncing' };
		this.addActivity({
			type: 'import_start',
			message: projectId
				? t(`Importing project: {projectId}`, { projectId })
				: t('Importing from GitHub...'),
		});
		this.notifyListeners();

		try {
			const credentials = await this.ensureValidCredentials(projectId);
			const finalBranch = branch || credentials.branch;
			const tree = await gitHubApiService.getRecursiveTree(
				credentials.token,
				this.currentRepo?.owner,
				this.currentRepo?.repo,
				finalBranch,
			);

			const projectFiles = new Map<
				string,
				{
					metadataSha?: string;
					documents: Map<
						string,
						{ txtSha: string | null; yjsSha: string | null }
					>;
					files: Map<string, string>;
					filesMetadataSha?: string;
					documentsMetadataSha?: string;
				}
			>();

			for (const item of tree) {
				if (item.type !== 'blob' || !item.path?.startsWith('projects/'))
					continue;
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

				if (pathParts[2] === 'metadata.json') {
					projectData.metadataSha = item.sha!;
				} else if (pathParts[2] === 'documents') {
					if (pathParts[3] === 'metadata.json') {
						projectData.documentsMetadataSha = item.sha!;
					} else if (pathParts[3]) {
						const fileName = pathParts[3];
						const docId = fileName.replace(/\.(txt|yjs)$/, '');
						if (!projectData.documents.has(docId)) {
							projectData.documents.set(docId, { txtSha: null, yjsSha: null });
						}
						const docData = projectData.documents.get(docId)!;
						if (fileName.endsWith('.txt')) {
							docData.txtSha = item.sha!;
						} else if (fileName.endsWith('.yjs')) {
							docData.yjsSha = item.sha!;
						}
					}
				} else if (pathParts[2] === 'files') {
					if (pathParts[3] === 'metadata.json') {
						projectData.filesMetadataSha = item.sha!;
					} else if (pathParts[3]) {
						projectData.files.set(
							`/${pathParts.slice(3).join('/')}`,
							item.sha!,
						);
					}
				}
			}

			const user = await authService.getCurrentUser();
			if (!user) throw new Error(t('No authenticated user'));

			const existingProjects = await authService.getProjectsByUser(user.id);
			const existingProjectIds = new Set(existingProjects.map((p) => p.id));

			const missingProjects: string[] = [];
			const processableProjects: string[] = [];

			for (const [projId, data] of projectFiles.entries()) {
				if (!data.metadataSha) continue;

				if (existingProjectIds.has(projId)) {
					processableProjects.push(projId);
				} else {
					missingProjects.push(projId);
				}
			}

			let importedMissingCount = 0;
			for (const missingProjId of missingProjects) {
				const data = projectFiles.get(missingProjId)!;
				try {
					const metadataContent = await gitHubApiService.getBlobContent(
						credentials.token,
						this.currentRepo?.owner,
						this.currentRepo?.repo,
						data.metadataSha!,
					);
					const projectMetadata = JSON.parse(metadataContent);

					await this.createProjectDirectly(projectMetadata, user.id);
					await this.importProjectSafely(
						missingProjId,
						projectMetadata,
						data,
						credentials,
					);
					importedMissingCount++;

					this.addActivity({
						type: 'import_complete',
						message: t(`Auto-imported missing project: {projectName}`, { projectName: projectMetadata.name }),
					});
					fileStorageEventEmitter.emitChange();
				} catch (error) {
					console.error(
						`Failed to import missing project ${missingProjId}:`,
						error,
					);
					this.addActivity({
						type: 'import_error',
						message: t(`Failed to import missing project: {missingProjId}`, { missingProjId }),
					});
				}
			}

			for (const projId of processableProjects) {
				const data = projectFiles.get(projId)!;
				const metadataContent = await gitHubApiService.getBlobContent(
					credentials.token,
					this.currentRepo?.owner,
					this.currentRepo?.repo,
					data.metadataSha!,
				);
				const projectMetadata = JSON.parse(metadataContent);
				await this.importProjectSafely(
					projId,
					projectMetadata,
					data,
					credentials,
				);
			}

			let successMessage = t('GitHub import completed successfully');
			if (importedMissingCount > 0) {
				successMessage += ` (${importedMissingCount} missing project${importedMissingCount === 1 ? '' : 's'} auto-imported)`;
			}

			this.addActivity({ type: 'import_complete', message: successMessage });
			this.status = {
				...this.status,
				status: 'idle',
				lastSync: Date.now(),
				error: undefined,
			};
			fileStorageEventEmitter.emitChange();
		} catch (error) {
			this._handleError(error, 'import_error', t('GitHub import failed'));
		}
		this.notifyListeners();
	}

	private async createProjectDirectly(
		projectMetadata: any,
		ownerId: string,
	): Promise<void> {
		const authDb =
			(await authService.db) ||
			(await authService.initialize().then(() => authService.db));
		if (!authDb) throw new Error(t('Could not access auth database'));

		const now = Date.now();
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
			updatedAt: now,
			ownerId: ownerId,
			tags: projectMetadata.tags,
			isFavorite: projectMetadata.isFavorite,
			skipPeerCheck: true,
		};

		await authDb.put('projects', newProject);
	}

	private async importProjectSafely(
		projectId: string,
		projectMetadata: any,
		data: {
			documents: Map<string, { txtSha: string | null; yjsSha: string | null }>;
			files: Map<string, string>;
			filesMetadataSha?: string;
			documentsMetadataSha?: string;
		},
		credentials: { token: string; repository: string },
	): Promise<void> {
		await authService.createOrUpdateProject(
			this.unifiedService.convertMetadataToProject(projectMetadata),
			false,
		);

		let githubDocumentsMetadata: any[] = [];
		if (data.documentsMetadataSha) {
			try {
				const metadataContent = await gitHubApiService.getBlobContent(
					credentials.token,
					this.currentRepo?.owner,
					this.currentRepo?.repo,
					data.documentsMetadataSha,
				);
				githubDocumentsMetadata = JSON.parse(metadataContent);
			} catch (error) {
				console.error('Failed to load documents metadata from GitHub:', error);
			}
		}

		const docMetadataById = new Map<string, any>();
		githubDocumentsMetadata.forEach((docMetadata) => {
			docMetadataById.set(docMetadata.id, docMetadata);
		});

		const documents: any[] = [];
		const documentContents = new Map();

		for (const [docId, docData] of data.documents.entries()) {
			const githubDocMetadata = docMetadataById.get(docId);

			const docInfo = githubDocMetadata || {
				id: docId,
				name: `Document ${docId}`,
				lastModified: Date.now(),
				hasYjsState: !!docData.yjsSha,
				hasReadableContent: !!docData.txtSha,
			};

			documents.push(docInfo);

			const contentData: { readableContent?: string; yjsState?: Uint8Array } =
				{};

			if (docData.txtSha) {
				contentData.readableContent = await gitHubApiService.getBlobContent(
					credentials.token,
					this.currentRepo?.owner,
					this.currentRepo?.repo,
					docData.txtSha,
				);
			}

			if (docData.yjsSha) {
				const yjsContent = await gitHubApiService.getBlobContent(
					credentials.token,
					this.currentRepo?.owner,
					this.currentRepo?.repo,
					docData.yjsSha,
				);

				if (typeof yjsContent === 'string') {
					const bytes = new Uint8Array(yjsContent.length);
					for (let i = 0; i < yjsContent.length; i++) {
						bytes[i] = yjsContent.charCodeAt(i);
					}
					contentData.yjsState = bytes;
				} else {
					contentData.yjsState = new Uint8Array(yjsContent);
				}
			}

			documentContents.set(docId, contentData);
		}

		for (const [docId, docData] of data.documents.entries()) {
			if (docData.txtSha && !docData.yjsSha && !docMetadataById.has(docId)) {
				const txtFileName = `${docId}.txt`;
				const newDocInfo = {
					id: docId,
					name: txtFileName,
					lastModified: Date.now(),
					hasYjsState: false,
					hasReadableContent: true,
				};

				if (!documents.find((d) => d.id === docId)) {
					documents.push(newDocInfo);
				}
			}
		}

		await fileStorageService.switchToProject(projectMetadata.docUrl);

		let githubFilesMetadata: any[] = [];
		if (data.filesMetadataSha) {
			try {
				const metadataContent = await gitHubApiService.getBlobContent(
					credentials.token,
					this.currentRepo?.owner,
					this.currentRepo?.repo,
					data.filesMetadataSha,
				);
				githubFilesMetadata = JSON.parse(metadataContent);
			} catch (error) {
				console.error('Failed to load files metadata from GitHub:', error);
			}
		}

		const metadataByPath = new Map<string, any>();
		const deletedFilesMetadata = new Map<string, any>();
		githubFilesMetadata.forEach((fileMetadata) => {
			if (fileMetadata.isDeleted) {
				deletedFilesMetadata.set(fileMetadata.path, fileMetadata);
			} else {
				metadataByPath.set(fileMetadata.path, fileMetadata);
			}
		});

		for (const [filePath, fileMetadata] of deletedFilesMetadata.entries()) {
			if (!data.files.has(filePath)) {
				try {
					const fileToStore = {
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
					};

					await fileStorageService.storeFile(fileToStore, {
						showConflictDialog: false,
						preserveTimestamp: true,
					});

					this.addActivity({
						type: 'import_complete',
						message: `Restored deleted file metadata: ${filePath}`,
					});
					fileStorageEventEmitter.emitChange();
				} catch (error) {
					console.error(
						`Failed to restore deleted file metadata ${filePath}:`,
						error,
					);
				}
			}
		}

		let importedFilesCount = 0;
		for (const [filePath, fileSha] of data.files.entries()) {
			try {
				await fileStorageService.createDirectoryPath(filePath);

				const rawContentString = await gitHubApiService.getBlobContent(
					credentials.token,
					this.currentRepo?.owner,
					this.currentRepo?.repo,
					fileSha,
				);
				const existingFile = await fileStorageService.getFileByPath(
					filePath,
					true,
				);
				const githubMetadata = metadataByPath.get(filePath);

				const isBinary = githubMetadata
					? githubMetadata.isBinary
					: isBinaryFile(filePath);

				let finalContent;
				if (isBinary) {
					const uint8Array = new Uint8Array(rawContentString.length);
					for (let i = 0; i < rawContentString.length; i++) {
						uint8Array[i] = rawContentString.charCodeAt(i);
					}
					finalContent = uint8Array.buffer;
				} else {
					finalContent = rawContentString;
				}

				let fileToStore;
				if (githubMetadata) {
					fileToStore = {
						id:
							existingFile?.id ||
							githubMetadata.id ||
							`github-import-${Math.random().toString(36).substring(2, 15)}`,
						name: githubMetadata.name,
						path: githubMetadata.path,
						type: githubMetadata.type as 'file' | 'directory',
						lastModified: githubMetadata.lastModified || Date.now(),
						size:
							githubMetadata.size ||
							(finalContent instanceof ArrayBuffer
								? finalContent.byteLength
								: finalContent.length),
						mimeType: githubMetadata.mimeType,
						isBinary: githubMetadata.isBinary,
						documentId: githubMetadata.documentId,
						content: finalContent,
						isDeleted: false,
					};
				} else {
					const fileName = filePath.split('/').pop() || '';
					const fileSize =
						finalContent instanceof ArrayBuffer
							? finalContent.byteLength
							: finalContent.length;

					fileToStore = {
						id:
							existingFile?.id ||
							`github-import-${Math.random().toString(36).substring(2, 15)}`,
						name: fileName,
						path: filePath,
						type: 'file' as const,
						lastModified: Date.now(),
						size: fileSize,
						mimeType: getMimeType(filePath),
						isBinary: isBinary,
						content: finalContent,
						isDeleted: false,
					};
				}

				await fileStorageService.storeFile(fileToStore, {
					showConflictDialog: false,
					preserveTimestamp: !!githubMetadata,
				});

				importedFilesCount++;
			} catch (error) {
				console.error(`Failed to import file ${filePath}:`, error);
				this.addActivity({
					type: 'import_error',
					message: t(`Failed to import file: {filePath}`, { filePath }),
				});
			}
		}

		if (importedFilesCount > 0) {
			this.addActivity({
				type: 'import_complete',
				message: t(`Imported {count} file for project: {projectName}`, { count: importedFilesCount, projectName: projectMetadata.name }),
			});
			fileStorageEventEmitter.emitChange();
		}

		const unifiedData = {
			manifest: this.unifiedService.createManifest('import'),
			account: null,
			projects: [projectMetadata],
			projectData: new Map([
				[
					projectId,
					{
						metadata: projectMetadata,
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
			projectMetadata.docUrl,
		);

		if (documents.length > 0) {
			this.addActivity({
				type: 'import_complete',
				message: t(`Imported {count} document for project: {projectName}`, { count: documents.length, projectName: projectMetadata.name }),
			});
		}

		fileStorageEventEmitter.emitChange();
	}

	getStatus = (): BackupStatus => ({ ...this.status });
	getActivities = (): BackupActivity[] => [...this.activities];

	addStatusListener = (cb: (status: BackupStatus) => void): (() => void) => {
		this.listeners.push(cb);
		return () => {
			this.listeners = this.listeners.filter((l) => l !== cb);
		};
	};

	addActivityListener = (
		cb: (activities: BackupActivity[]) => void,
	): (() => void) => {
		this.activityListeners.push(cb);
		return () => {
			this.activityListeners = this.activityListeners.filter((l) => l !== cb);
		};
	};

	clearActivity = (id: string): void => {
		this.activities = this.activities.filter((a) => a.id !== id);
		this.notifyActivityListeners();
	};

	clearAllActivities = (): void => {
		this.activities = [];
		this.notifyActivityListeners();
	};
}

export const gitHubBackupService = new GitHubBackupService();