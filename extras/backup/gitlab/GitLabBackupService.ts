// extras/backup/gitlab/GitLabBackupService.ts
import { t } from '@/i18n';
import type { SecretsContextType } from '@/contexts/SecretsContext';
import { authService } from '@/services/AuthService';
import { UnifiedDataStructureService } from '@/services/DataStructureService';
import {
    fileStorageService,
    fileStorageEventEmitter,
} from '@/services/FileStorageService';
import { ProjectDataService } from '@/services/ProjectDataService';
import { getMimeType, isBinaryFile } from '@/utils/fileUtils.ts';
import { gitLabApiService } from './GitLabApiService';

interface BackupStatus {
    isConnected: boolean;
    isEnabled: boolean;
    lastSync: number | null;
    status: 'idle' | 'syncing' | 'error';
    error?: string;
    project?: string;
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

export class GitLabBackupService {
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
    private currentProject: { id: string; pathWithNamespace: string } | null =
        null;
    private secretsContext: SecretsContextType | null = null;
    private lastOperationTime = 0;
    private readonly MIN_OPERATION_INTERVAL = 2000;
    private readonly PLUGIN_ID = 'texlyre-gitlab-backup';
    private readonly SECRET_KEYS = {
        TOKEN: 'gitlab-token',
        PROJECT: 'selected-project',
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
            gitLabApiService.setBaseUrl(settings.apiEndpoint);
        }

        if (settings.requestTimeout) {
            gitLabApiService.setRequestTimeout(settings.requestTimeout);
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

    private _encodeContent(content: string | Uint8Array | ArrayBuffer): string {
        if (typeof content === 'string')
            return btoa(unescape(encodeURIComponent(content)));

        const uint8Array =
            content instanceof ArrayBuffer ? new Uint8Array(content) : content;
        let binaryString = '';
        for (let i = 0; i < uint8Array.length; i++) {
            binaryString += String.fromCharCode(uint8Array[i]);
        }
        return btoa(binaryString);
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
    ): Promise<{ success: boolean; projects?: any[]; error?: string }> {
        try {
            if (!(await gitLabApiService.testConnection(token)))
                return { success: false, error: t('Invalid GitLab token') };
            const projects = await gitLabApiService.getProjects(token);
            return { success: true, projects };
        } catch (error) {
            return {
                success: false,
                error:
                    error instanceof Error
                        ? error.message
                        : t('Failed to connect to GitLab'),
            };
        }
    }

    async connectToProject(
        token: string,
        projectId: string,
        projectPathWithNamespace: string,
        localProjectId?: string,
        branch?: string,
    ): Promise<boolean> {
        try {
            if (!this.secretsContext)
                throw new Error(t('Secrets context not initialized'));
            if (!projectId) throw new Error(t('Invalid project format'));

            this.currentProject = {
                id: projectId,
                pathWithNamespace: projectPathWithNamespace,
            };
            const scopeOptions = this._getScopeOptions(localProjectId);

            const finalBranch = branch || this.getDefaultBranch();

            await this.secretsContext.setSecret(
                this.PLUGIN_ID,
                this.SECRET_KEYS.TOKEN,
                token,
                {
                    ...scopeOptions,
                    metadata: { tokenType: 'gitlab-personal-access-token' },
                },
            );
            await this.secretsContext.setSecret(
                this.PLUGIN_ID,
                this.SECRET_KEYS.PROJECT,
                projectId,
                {
                    ...scopeOptions,
                    metadata: {
                        projectId,
                        pathWithNamespace: projectPathWithNamespace,
                        connectedAt: Date.now(),
                        branch: finalBranch,
                    },
                },
            );

            this.status = {
                ...this.status,
                isConnected: true,
                isEnabled: true,
                project: projectPathWithNamespace,
                error: undefined,
            };
            this.notifyListeners();
            this.addActivity({
                type: 'backup_complete',
                message: t('Connected to GitLab project: {project} ({branch})', {
                    project: projectPathWithNamespace,
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
                        : t('Failed to connect to GitLab'),
            };
            this.notifyListeners();
            return false;
        }
    }

    async disconnect(localProjectId?: string): Promise<void> {
        if (!this.secretsContext) return;
        const scopeOptions = this._getScopeOptions(localProjectId);
        await this.secretsContext.removeSecret(
            this.PLUGIN_ID,
            this.SECRET_KEYS.TOKEN,
            scopeOptions,
        );
        await this.secretsContext.removeSecret(
            this.PLUGIN_ID,
            this.SECRET_KEYS.PROJECT,
            scopeOptions,
        );
        this.currentProject = null;
        this.status = {
            ...this.status,
            isConnected: false,
            isEnabled: false,
            project: undefined,
        };
        this.notifyListeners();
    }

    private async getGitLabCredentials(
        localProjectId?: string,
    ): Promise<{ token: string; projectId: string } | null> {
        if (!this.secretsContext) return null;
        const scopeOptions = this._getScopeOptions(localProjectId);
        try {
            const tokenSecret = await this.secretsContext.getSecret(
                this.PLUGIN_ID,
                this.SECRET_KEYS.TOKEN,
                scopeOptions,
            );
            const projectSecret = await this.secretsContext.getSecret(
                this.PLUGIN_ID,
                this.SECRET_KEYS.PROJECT,
                scopeOptions,
            );
            if (!tokenSecret?.value || !projectSecret?.value) return null;
            return { token: tokenSecret.value, projectId: projectSecret.value };
        } catch (error) {
            console.error('Error retrieving GitLab credentials:', error);
            return null;
        }
    }

    async getStoredProject(localProjectId?: string): Promise<string | null> {
        if (!this.secretsContext) return null;
        const projectMetadata = await this.secretsContext.getSecretMetadata(
            this.PLUGIN_ID,
            this.SECRET_KEYS.PROJECT,
            this._getScopeOptions(localProjectId),
        );
        return projectMetadata?.pathWithNamespace || null;
    }

    async getStoredBranch(localProjectId?: string): Promise<string> {
        if (!this.secretsContext) return this.getDefaultBranch();
        const projectMetadata = await this.secretsContext.getSecretMetadata(
            this.PLUGIN_ID,
            this.SECRET_KEYS.PROJECT,
            this._getScopeOptions(localProjectId),
        );
        return projectMetadata?.branch || this.getDefaultBranch();
    }

    async hasStoredCredentials(localProjectId?: string): Promise<boolean> {
        if (!this.secretsContext) return false;
        const scopeOptions = this._getScopeOptions(localProjectId);
        const hasToken = await this.secretsContext.hasSecret(
            this.PLUGIN_ID,
            this.SECRET_KEYS.TOKEN,
            scopeOptions,
        );
        const hasProject = await this.secretsContext.hasSecret(
            this.PLUGIN_ID,
            this.SECRET_KEYS.PROJECT,
            scopeOptions,
        );
        return hasToken && hasProject;
    }

    private async ensureValidCredentials(
        localProjectId?: string,
    ): Promise<{ token: string; projectId: string; branch: string }> {
        const credentials = await this.getGitLabCredentials(localProjectId);
        const branch = await this.getStoredBranch(localProjectId);
        if (!credentials)
            throw new Error(
                t('GitLab credentials not available. Please reconnect.'),
            );
        if (!(await gitLabApiService.testConnection(credentials.token)))
            throw new Error(
                t('GitLab token is invalid or expired. Please reconnect.'),
            );

        const projectMetadata = await this.secretsContext?.getSecretMetadata(
            this.PLUGIN_ID,
            this.SECRET_KEYS.PROJECT,
            this._getScopeOptions(localProjectId),
        );

        this.currentProject = {
            id: credentials.projectId,
            pathWithNamespace:
                projectMetadata?.pathWithNamespace || credentials.projectId,
        };
        this.status = {
            ...this.status,
            isConnected: true,
            isEnabled: true,
            project: this.currentProject.pathWithNamespace,
            error: undefined,
        };
        this.notifyListeners();
        return { ...credentials, branch };
    }

    private async createCommitWithRetry(
        token: string,
        projectId: string,
        branch: string,
        commitMessage: string,
        actions: any[],
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
                await gitLabApiService.createCommit(
                    token,
                    projectId,
                    branch,
                    commitMessage,
                    actions,
                );
                return;
            } catch (error) {
                console.warn(`Commit attempt ${attempt} failed:`, error);
                if (attempt === maxRetries) throw error;
            }
        }
    }

    async synchronize(
        localProjectId?: string,
        commitMessage?: string,
        branch?: string,
    ): Promise<void> {
        await this._throttleOperation();
        this.status = { ...this.status, status: 'syncing' };
        this.addActivity({
            type: 'backup_start',
            message: localProjectId
                ? t(`Syncing project: {projectId}`, { projectId: localProjectId })
                : t('Syncing all projects...'),
        });
        this.notifyListeners();

        try {
            const user = await authService.getCurrentUser();
            if (!user) throw new Error(t('No authenticated user'));

            const credentials = await this.ensureValidCredentials(localProjectId);
            const finalBranch = branch || credentials.branch;
            const localProjects = localProjectId
                ? [await authService.getProjectById(localProjectId)]
                : await authService.getProjectsByUser(user.id);
            if (!localProjects || localProjects.some((p) => !p))
                throw new Error(t('Could not load projects.'));

            const tree = await gitLabApiService.getRecursiveTree(
                credentials.token,
                this.currentProject?.id!,
                finalBranch,
            );
            const existingFiles = new Set(
                tree.filter((item) => item.type === 'blob').map((item) => item.path),
            );

            const actions: any[] = [];
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

                const metadataPath = `${projectPath}/metadata.json`;
                actions.push({
                    action: existingFiles.has(metadataPath) ? 'update' : 'create',
                    file_path: metadataPath,
                    content: this._encodeBase64(
                        JSON.stringify(
                            this.unifiedService.convertProjectToMetadata(project, 'backup'),
                            null,
                            2,
                        ),
                    ),
                    encoding: 'base64',
                });

                if (documents.documents.length > 0) {
                    const documentsMetadata = documents.documents.map((doc) => ({
                        id: doc.id,
                        name: doc.name,
                        lastModified: doc.lastModified,
                        hasYjsState: doc.hasYjsState,
                        hasReadableContent: doc.hasReadableContent,
                    }));
                    const docMetadataPath = `${projectPath}/documents/metadata.json`;
                    actions.push({
                        action: existingFiles.has(docMetadataPath) ? 'update' : 'create',
                        file_path: docMetadataPath,
                        content: this._encodeBase64(
                            JSON.stringify(documentsMetadata, null, 2),
                        ),
                        encoding: 'base64',
                    });
                }

                documents.documents.forEach((doc) => {
                    const content = documents.documentContents.get(doc.id);
                    if (content?.readableContent) {
                        const txtPath = `${projectPath}/documents/${doc.id}.txt`;
                        actions.push({
                            action: existingFiles.has(txtPath) ? 'update' : 'create',
                            file_path: txtPath,
                            content: this._encodeBase64(content.readableContent),
                            encoding: 'base64',
                        });
                    }
                    if (content?.yjsState) {
                        const yjsPath = `${projectPath}/documents/${doc.id}.yjs`;
                        actions.push({
                            action: existingFiles.has(yjsPath) ? 'update' : 'create',
                            file_path: yjsPath,
                            content: this._encodeContent(content.yjsState),
                            encoding: 'base64',
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
                    const filesMetadataPath = `${projectPath}/files/metadata.json`;
                    actions.push({
                        action: existingFiles.has(filesMetadataPath) ? 'update' : 'create',
                        file_path: filesMetadataPath,
                        content: this._encodeBase64(
                            JSON.stringify(allFilesMetadata, null, 2),
                        ),
                        encoding: 'base64',
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

                        const filePath = `${projectPath}/files${file.path}`;
                        actions.push({
                            action: existingFiles.has(filePath) ? 'update' : 'create',
                            file_path: filePath,
                            content: this._encodeContent(content),
                            encoding: 'base64',
                        });
                    }
                });

                for (const deletedFile of files.deletedFiles) {
                    if (deletedFile.type === 'file') {
                        const filePath = `${projectPath}/files${deletedFile.path}`;
                        if (existingFiles.has(filePath)) {
                            actions.push({
                                action: 'delete',
                                file_path: filePath,
                            });
                        }
                    }
                }
            }

            if (actions.length === 0) return;

            const finalCommitMessage =
                commitMessage || this.getDefaultCommitMessage();

            await this.createCommitWithRetry(
                credentials.token,
                this.currentProject?.id!,
                finalBranch,
                finalCommitMessage,
                actions,
            );

            this.addActivity({
                type: 'backup_complete',
                message: t('GitLab sync completed successfully'),
            });
            this.status = {
                ...this.status,
                status: 'idle',
                lastSync: Date.now(),
                error: undefined,
            };
        } catch (error) {
            this._handleError(error, 'backup_error', t('GitLab sync failed'));
        }
        this.notifyListeners();
    }

    private _encodeBase64(content: string): string {
        return btoa(unescape(encodeURIComponent(content)));
    }

    async exportData(
        localProjectId?: string,
        commitMessage?: string,
        branch?: string,
    ): Promise<void> {
        await this.synchronize(localProjectId, commitMessage, branch);
    }

    async importChanges(localProjectId?: string, branch?: string): Promise<void> {
        await this._throttleOperation();
        this.status = { ...this.status, status: 'syncing' };
        this.addActivity({
            type: 'import_start',
            message: localProjectId
                ? t('Importing project: {projectId}', { projectId: localProjectId })
                : t('Importing from GitLab...'),
        });
        this.notifyListeners();

        try {
            const credentials = await this.ensureValidCredentials(localProjectId);
            const finalBranch = branch || credentials.branch;
            const tree = await gitLabApiService.getRecursiveTree(
                credentials.token,
                this.currentProject?.id!,
                finalBranch,
            );

            const projectFiles = new Map<
                string,
                {
                    metadataId?: string;
                    documents: Map<string, { txtId: string | null; yjsId: string | null }>;
                    files: Map<string, string>;
                    filesMetadataId?: string;
                    documentsMetadataId?: string;
                }
            >();

            for (const item of tree) {
                if (item.type !== 'blob' || !item.path?.startsWith('projects/'))
                    continue;
                const pathParts = item.path.split('/');
                const currentProjectId = pathParts[1];
                if (localProjectId && currentProjectId !== localProjectId) continue;

                if (!projectFiles.has(currentProjectId)) {
                    projectFiles.set(currentProjectId, {
                        documents: new Map(),
                        files: new Map(),
                    });
                }
                const projectData = projectFiles.get(currentProjectId)!;

                if (pathParts[2] === 'metadata.json') {
                    projectData.metadataId = item.id;
                } else if (pathParts[2] === 'documents') {
                    if (pathParts[3] === 'metadata.json') {
                        projectData.documentsMetadataId = item.id;
                    } else if (pathParts[3]) {
                        const fileName = pathParts[3];
                        const docId = fileName.replace(/\.(txt|yjs)$/, '');
                        if (!projectData.documents.has(docId)) {
                            projectData.documents.set(docId, { txtId: null, yjsId: null });
                        }
                        const docData = projectData.documents.get(docId)!;
                        if (fileName.endsWith('.txt')) {
                            docData.txtId = item.id;
                        } else if (fileName.endsWith('.yjs')) {
                            docData.yjsId = item.id;
                        }
                    }
                } else if (pathParts[2] === 'files') {
                    if (pathParts[3] === 'metadata.json') {
                        projectData.filesMetadataId = item.id;
                    } else if (pathParts[3]) {
                        projectData.files.set(`/${pathParts.slice(3).join('/')}`, item.id);
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
                if (!data.metadataId) continue;

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
                    const metadataContent = await gitLabApiService.getFileContent(
                        credentials.token,
                        this.currentProject?.id!,
                        `projects/${missingProjId}/metadata.json`,
                        finalBranch,
                    );
                    const projectMetadata = JSON.parse(metadataContent);

                    await this.createProjectDirectly(projectMetadata, user.id);
                    await this.importProjectSafely(
                        missingProjId,
                        projectMetadata,
                        data,
                        credentials,
                        finalBranch,
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
                        message: t('Failed to import missing project: {missingProjId}', {
                            missingProjId,
                        }),
                    });
                }
            }

            for (const projId of processableProjects) {
                const data = projectFiles.get(projId)!;
                const metadataContent = await gitLabApiService.getFileContent(
                    credentials.token,
                    this.currentProject?.id!,
                    `projects/${projId}/metadata.json`,
                    finalBranch,
                );
                const projectMetadata = JSON.parse(metadataContent);
                await this.importProjectSafely(
                    projId,
                    projectMetadata,
                    data,
                    credentials,
                    finalBranch,
                );
            }

            let successMessage = t('GitLab import completed successfully');
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
            this._handleError(error, 'import_error', t('GitLab import failed'));
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
            documents: Map<string, { txtId: string | null; yjsId: string | null }>;
            files: Map<string, string>;
            filesMetadataId?: string;
            documentsMetadataId?: string;
        },
        credentials: { token: string; projectId: string },
        branch: string,
    ): Promise<void> {
        await authService.createOrUpdateProject(
            this.unifiedService.convertMetadataToProject(projectMetadata),
            false,
        );

        let gitlabDocumentsMetadata: any[] = [];
        if (data.documentsMetadataId) {
            try {
                const metadataContent = await gitLabApiService.getFileContent(
                    credentials.token,
                    this.currentProject?.id!,
                    `projects/${projectId}/documents/metadata.json`,
                    branch,
                );
                gitlabDocumentsMetadata = JSON.parse(metadataContent);
            } catch (error) {
                console.error('Failed to load documents metadata from GitLab:', error);
            }
        }

        const docMetadataById = new Map<string, any>();
        gitlabDocumentsMetadata.forEach((docMetadata) => {
            docMetadataById.set(docMetadata.id, docMetadata);
        });

        const documents: any[] = [];
        const documentContents = new Map();

        for (const [docId, docData] of data.documents.entries()) {
            const gitlabDocMetadata = docMetadataById.get(docId);

            const docInfo = gitlabDocMetadata || {
                id: docId,
                name: `Document ${docId}`,
                lastModified: Date.now(),
                hasYjsState: !!docData.yjsId,
                hasReadableContent: !!docData.txtId,
            };

            documents.push(docInfo);

            const contentData: { readableContent?: string; yjsState?: Uint8Array } =
                {};

            if (docData.txtId) {
                contentData.readableContent = await gitLabApiService.getFileContent(
                    credentials.token,
                    this.currentProject?.id!,
                    `projects/${projectId}/documents/${docId}.txt`,
                    branch,
                );
            }

            if (docData.yjsId) {
                const yjsContent = await gitLabApiService.getFileContent(
                    credentials.token,
                    this.currentProject?.id!,
                    `projects/${projectId}/documents/${docId}.yjs`,
                    branch,
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
            if (docData.txtId && !docData.yjsId && !docMetadataById.has(docId)) {
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

        let gitlabFilesMetadata: any[] = [];
        if (data.filesMetadataId) {
            try {
                const metadataContent = await gitLabApiService.getFileContent(
                    credentials.token,
                    this.currentProject?.id!,
                    `projects/${projectId}/files/metadata.json`,
                    branch,
                );
                gitlabFilesMetadata = JSON.parse(metadataContent);
            } catch (error) {
                console.error('Failed to load files metadata from GitLab:', error);
            }
        }

        const metadataByPath = new Map<string, any>();
        const deletedFilesMetadata = new Map<string, any>();
        gitlabFilesMetadata.forEach((fileMetadata) => {
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
        for (const [filePath, fileId] of data.files.entries()) {
            try {
                await fileStorageService.createDirectoryPath(filePath);

                const rawContentString = await gitLabApiService.getFileContent(
                    credentials.token,
                    this.currentProject?.id!,
                    `projects/${projectId}/files${filePath}`,
                    branch,
                );
                const existingFile = await fileStorageService.getFileByPath(
                    filePath,
                    true,
                );
                const gitlabMetadata = metadataByPath.get(filePath);

                const isBinary = gitlabMetadata
                    ? gitlabMetadata.isBinary
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
                if (gitlabMetadata) {
                    fileToStore = {
                        id:
                            existingFile?.id ||
                            gitlabMetadata.id ||
                            `gitlab-import-${Math.random().toString(36).substring(2, 15)}`,
                        name: gitlabMetadata.name,
                        path: gitlabMetadata.path,
                        type: gitlabMetadata.type as 'file' | 'directory',
                        lastModified: gitlabMetadata.lastModified || Date.now(),
                        size:
                            gitlabMetadata.size ||
                            (finalContent instanceof ArrayBuffer
                                ? finalContent.byteLength
                                : finalContent.length),
                        mimeType: gitlabMetadata.mimeType,
                        isBinary: gitlabMetadata.isBinary,
                        documentId: gitlabMetadata.documentId,
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
                            `gitlab-import-${Math.random().toString(36).substring(2, 15)}`,
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
                    preserveTimestamp: !!gitlabMetadata,
                });

                importedFilesCount++;
            } catch (error) {
                console.error(`Failed to import file ${filePath}:`, error);
                this.addActivity({
                    type: 'import_error',
                    message: t('Failed to import file: {filePath}', { filePath }),
                });
            }
        }

        if (importedFilesCount > 0) {
            this.addActivity({
                type: 'import_complete',
                message: t('Imported {count} file for project: {projectName}', {
                    count: importedFilesCount,
                    projectName: projectMetadata.name,
                }),
            });
            fileStorageEventEmitter.emitChange();
        }

        if (documents.length > 0) {
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

            this.addActivity({
                type: 'import_complete',
                message: t('Imported {count} document for project: {projectName}', {
                    count: documents.length,
                    projectName: projectMetadata.name,
                }),
            });
            fileStorageEventEmitter.emitChange();
        }
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

    private notifyListeners = (): void => {
        this.listeners.forEach((listener) => listener(this.status));
    };
    private notifyActivityListeners = (): void => {
        this.activityListeners.forEach((listener) => listener(this.activities));
    };

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
}

export const gitLabBackupService = new GitLabBackupService();