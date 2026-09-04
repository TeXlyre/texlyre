// src/services/GitBackupService.ts
import { t } from '@/i18n';
import { createNamedLogger } from '@/logging';
import type { RecordsContextType } from '../contexts/RecordsContext';
import type { SecretsContextType } from '../contexts/SecretsContext';
import type {
	GitBackupActivity,
	GitBackupAdapter,
	GitBackupChange,
	GitBackupSettings,
	GitBackupStatus,
	ResolvedGitCredentials,
} from '../types/gitBackup';
import { authService } from './AuthService';
import { fileStorageEventEmitter } from './FileStoreService';
import { GitBackupImportService } from './GitBackupImportService';
import { GitBackupSyncService } from './GitBackupSyncService';

export type {
	GitBackupActivity,
	GitBackupAdapter,
	GitBackupChange,
	GitBackupSettings,
	GitBackupStatus,
	GitTreeItem,
} from '../types/gitBackup';

const moduleLog = createNamedLogger('GitBackupService');

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

	private secretsContext: SecretsContextType | null = null;
	private recordsContext: RecordsContextType | null = null;
	private currentProjectId: string | undefined;

	private lastOperationTime = 0;
	private readonly MIN_OPERATION_INTERVAL = 2000;

	private settingsCache: GitBackupSettings = {};
	private syncService: GitBackupSyncService<TTarget>;
	private importService: GitBackupImportService<TTarget>;

	constructor(private adapter: GitBackupAdapter<TTarget>) {
		this.syncService = new GitBackupSyncService(adapter, {
			reportActivity: (activity) => this.addActivity(activity),
		});
		this.importService = new GitBackupImportService(adapter, {
			shouldIgnoreFile: (filePath) => this.shouldIgnoreFile(filePath),
			reportActivity: (activity) => this.addActivity(activity),
		});
	}

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
			const { existingFiles, existingFileRefs } =
				this.syncService.indexRemoteTree(tree);
			const { changes, linkedDocuments } =
				await this.syncService.buildChangesForProjects(
					localProjects,
					existingFiles,
					existingFileRefs,
					{
						maxFileSize: this.getMaxFileSize(),
						shouldIgnoreFile: (filePath) => this.shouldIgnoreFile(filePath),
					},
				);

			const baselineCommitSha = await this.loadBaselineSha(projectId);
			const resolvedChanges = await this.syncService.resolveConflicts(
				resolvedCredentials,
				changes,
				baselineCommitSha,
				linkedDocuments,
				existingFiles,
				existingFileRefs,
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
				moduleLog.warn('Post-push reconciliation import failed:', error);
				this.addActivity({
					type: 'import_error',
					message: t(
						'Push succeeded but local reconciliation failed. ' +
							'Run import manually to sync local state.',
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
			const projectFiles = this.importService.groupProjectFiles(
				tree,
				projectId,
				finalBranch,
			);

			const user = await authService.getCurrentUser();
			if (!user) throw new Error(t('No authenticated user'));

			const importedMissing = await this.importService.importProjects(
				projectFiles,
				resolvedCredentials,
				user.id,
			);

			let successMessage = t('{provider} import completed successfully', {
				provider: this.adapter.displayName,
			});
			if (importedMissing > 0) {
				successMessage += ` (${importedMissing} missing project${
					importedMissing === 1 ? '' : 's'
				} auto-imported)`;
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
			moduleLog.error(error);
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
		credentials: ResolvedGitCredentials<TTarget>,
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
			moduleLog.warn('Failed to persist baseline commit sha:', error);
		}
	}

	private async ensureValidCredentials(
		projectId?: string,
	): Promise<ResolvedGitCredentials<TTarget>> {
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

	private async commitWithRetry(
		credentials: ResolvedGitCredentials<TTarget>,
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
				moduleLog.warn(`Commit attempt ${attempt} failed:`, error);
				if (attempt === maxRetries) throw error;
			}
		}
	}

	private getDefaultBranch(): string {
		return this.settingsCache.defaultBranch || 'main';
	}

	private getDefaultCommitMessage(): string {
		const template =
			this.settingsCache.defaultCommitMessage ||
			t('Add commit message to push changes (e.g. "Backup on {date}")');
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
		this.listeners.forEach((listener) => {
			listener(this.status);
		});
	}

	private notifyActivityListeners(): void {
		this.activityListeners.forEach((listener) => {
			listener([...this.activities]);
		});
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
