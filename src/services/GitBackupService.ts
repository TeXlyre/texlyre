// src/services/GitBackupService.ts
import { t } from '@/i18n';
import type { SecretsContextType } from '../contexts/SecretsContext';
import { getMimeType, isBinaryFile, isTemporaryFile } from '../utils/fileUtils';
import { authService } from './AuthService';
import { UnifiedDataStructureService } from './DataStructureService';
import {
    fileStorageService,
    fileStorageEventEmitter,
} from './FileStorageService';
import { ProjectDataService } from './ProjectDataService';

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

    getFileRefForPath?(
        item: GitTreeItem,
        path: string,
        branch: string,
    ): string;

    commitChanges(
        token: string,
        target: TTarget,
        branch: string,
        message: string,
        changes: GitBackupChange[],
    ): Promise<void>;
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
    private activityListeners: Array<(activities: GitBackupActivity[]) => void> = [];

    private dataSerializer = new ProjectDataService();
    private unifiedService = new UnifiedDataStructureService();

    private currentTarget: TTarget | null = null;
    private secretsContext: SecretsContextType | null = null;

    private lastOperationTime = 0;
    private readonly MIN_OPERATION_INTERVAL = 2000;

    private settingsCache: GitBackupSettings = {};

    constructor(private adapter: GitBackupAdapter<TTarget>) { }

    setSettings(settings: GitBackupSettings): void {
        this.settingsCache = { ...settings };

        if (settings.apiEndpoint) {
            this.adapter.setBaseUrl?.(settings.apiEndpoint);
        }

        if (settings.requestTimeout) {
            this.adapter.setRequestTimeout?.(settings.requestTimeout);
        }
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
    ): Promise<{ success: boolean; targets?: any[]; repositories?: any[]; projects?: any[]; error?: string }> {
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

            this.currentTarget = target;
            const scopeOptions = this._getScopeOptions(projectId);
            const finalBranch = branch || this.getDefaultBranch();
            const targetLabel = this.adapter.getTargetLabel(target);

            await this.secretsContext.setSecret(
                this.adapter.pluginId,
                this.adapter.tokenSecretKey,
                token,
                {
                    ...scopeOptions,
                    metadata: { tokenType: this.adapter.tokenType },
                },
            );

            await this.secretsContext.setSecret(
                this.adapter.pluginId,
                this.adapter.targetSecretKey,
                this.adapter.getTargetSecretValue(target),
                {
                    ...scopeOptions,
                    metadata: {
                        ...this.adapter.getTargetMetadata(target),
                        connectedAt: Date.now(),
                        branch: finalBranch,
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

        const scopeOptions = this._getScopeOptions(projectId);

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

        this.currentTarget = null;

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
            this._getScopeOptions(projectId),
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
            this._getScopeOptions(projectId),
        );

        return metadata?.branch || this.getDefaultBranch();
    }

    async hasStoredCredentials(projectId?: string): Promise<boolean> {
        if (!this.secretsContext) return false;

        const scopeOptions = this._getScopeOptions(projectId);

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
        await this._throttleOperation();

        this.status = { ...this.status, status: 'syncing' };

        this.addActivity({
            type: 'backup_start',
            message: projectId
                ? t('Syncing project: {projectId}', { projectId })
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

            if (!localProjects || localProjects.some((p) => !p)) {
                throw new Error(t('Could not load projects.'));
            }

            const tree = await this.adapter.getRecursiveTree(
                credentials.token,
                credentials.target,
                finalBranch,
            );

            const existingFileRefs = new Map(
                tree
                    .filter((item) => item.type === 'blob' && item.path)
                    .map((item) => [
                        item.path!,
                        this.getFileRef(item, item.path!, finalBranch),
                    ]),
            );

            const existingFiles = new Set(existingFileRefs.keys());

            const changes: GitBackupChange[] = [];
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

                changes.push({
                    type: existingFiles.has(metadataPath) ? 'update' : 'create',
                    path: metadataPath,
                    content: JSON.stringify(
                        this.unifiedService.convertProjectToMetadata(project, 'backup'),
                        null,
                        2,
                    ),
                    previousRef: existingFileRefs.get(metadataPath),
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

                    changes.push({
                        type: existingFiles.has(docMetadataPath) ? 'update' : 'create',
                        path: docMetadataPath,
                        content: JSON.stringify(documentsMetadata, null, 2),
                        previousRef: existingFileRefs.get(docMetadataPath),
                    });
                }

                documents.documents.forEach((doc) => {
                    const content = documents.documentContents.get(doc.id);

                    if (content?.readableContent) {
                        const txtPath = `${projectPath}/documents/${doc.id}.txt`;

                        changes.push({
                            type: existingFiles.has(txtPath) ? 'update' : 'create',
                            path: txtPath,
                            content: content.readableContent,
                        });
                    }

                    if (content?.yjsState) {
                        const yjsPath = `${projectPath}/documents/${doc.id}.yjs`;

                        changes.push({
                            type: existingFiles.has(yjsPath) ? 'update' : 'create',
                            path: yjsPath,
                            content: content.yjsState,
                            previousRef: existingFileRefs.get(yjsPath),
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

                    changes.push({
                        type: existingFiles.has(filesMetadataPath) ? 'update' : 'create',
                        path: filesMetadataPath,
                        content: JSON.stringify(allFilesMetadata, null, 2),
                        previousRef: existingFileRefs.get(filesMetadataPath),
                    });
                }

                files.files.forEach((file) => {
                    const content = files.fileContents.get(file.path);

                    if (file.type !== 'file' || content === undefined) return;

                    if (isTemporaryFile(file.path) || this.shouldIgnoreFile(file.path)) {
                        return;
                    }

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
                        return;
                    }

                    const filePath = `${projectPath}/files${file.path}`;

                    changes.push({
                        type: existingFiles.has(filePath) ? 'update' : 'create',
                        path: filePath,
                        content,
                        previousRef: existingFileRefs.get(filePath),
                    });
                });

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
            }

            if (changes.length === 0) {
                this.status = {
                    ...this.status,
                    status: 'idle',
                    lastSync: Date.now(),
                    error: undefined,
                };
                this.notifyListeners();
                return;
            }

            await this.commitWithRetry(
                credentials.token,
                credentials.target,
                finalBranch,
                commitMessage || this.getDefaultCommitMessage(),
                changes,
            );

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
        } catch (error) {
            this._handleError(
                error,
                'backup_error',
                t('{provider} sync failed', {
                    provider: this.adapter.displayName,
                }),
            );
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
                ? t('Importing project: {projectId}', { projectId })
                : t('Importing from {provider}...', {
                    provider: this.adapter.displayName,
                }),
        });

        this.notifyListeners();

        try {
            const credentials = await this.ensureValidCredentials(projectId);
            const finalBranch = branch || credentials.branch;

            const tree = await this.adapter.getRecursiveTree(
                credentials.token,
                credentials.target,
                finalBranch,
            );

            const projectFiles = this.groupProjectFiles(tree, projectId, finalBranch);

            const user = await authService.getCurrentUser();
            if (!user) throw new Error(t('No authenticated user'));

            const existingProjects = await authService.getProjectsByUser(user.id);
            const existingProjectIds = new Set(existingProjects.map((p) => p.id));

            const missingProjects: string[] = [];
            const processableProjects: string[] = [];

            for (const [projId, data] of projectFiles.entries()) {
                if (!data.metadataRef) continue;

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
                    const metadataContent = await this.adapter.readFile(
                        credentials.token,
                        credentials.target,
                        data.metadataRef!,
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
                        message: t('Auto-imported missing project: {projectName}', {
                            projectName: projectMetadata.name,
                        }),
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

                const metadataContent = await this.adapter.readFile(
                    credentials.token,
                    credentials.target,
                    data.metadataRef!,
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

            let successMessage = t('{provider} import completed successfully', {
                provider: this.adapter.displayName,
            });

            if (importedMissingCount > 0) {
                successMessage += ` (${importedMissingCount} missing project${importedMissingCount === 1 ? '' : 's'
                    } auto-imported)`;
            }

            this.addActivity({
                type: 'import_complete',
                message: successMessage,
            });

            this.status = {
                ...this.status,
                status: 'idle',
                lastSync: Date.now(),
                error: undefined,
            };

            fileStorageEventEmitter.emitChange();
        } catch (error) {
            this._handleError(
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
            this.listeners = this.listeners.filter((listener) => listener !== cb);
        };
    };

    addActivityListener = (
        cb: (activities: GitBackupActivity[]) => void,
    ): (() => void) => {
        this.activityListeners.push(cb);

        return () => {
            this.activityListeners = this.activityListeners.filter(
                (listener) => listener !== cb,
            );
        };
    };

    clearActivity = (id: string): void => {
        this.activities = this.activities.filter((activity) => activity.id !== id);
        this.notifyActivityListeners();
    };

    clearAllActivities = (): void => {
        this.activities = [];
        this.notifyActivityListeners();
    };

    private async ensureValidCredentials(
        projectId?: string,
    ): Promise<{ token: string; target: TTarget; branch: string }> {
        if (!this.secretsContext) {
            throw new Error(
                t('{provider} credentials not available. Please reconnect.', {
                    provider: this.adapter.displayName,
                }),
            );
        }

        const scopeOptions = this._getScopeOptions(projectId);

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

        this.currentTarget = target;

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
    ) {
        const projectFiles = new Map<
            string,
            {
                metadataRef?: string;
                documents: Map<string, { txtRef: string | null; yjsRef: string | null }>;
                files: Map<string, string>;
                filesMetadataRef?: string;
                documentsMetadataRef?: string;
            }
        >();

        for (const item of tree) {
            if (item.type !== 'blob' || !item.path?.startsWith('projects/')) {
                continue;
            }

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

            if (pathParts[2] === 'metadata.json') {
                projectData.metadataRef = ref;
            } else if (pathParts[2] === 'documents') {
                if (pathParts[3] === 'metadata.json') {
                    projectData.documentsMetadataRef = ref;
                } else if (pathParts[3]) {
                    const fileName = pathParts[3];
                    const docId = fileName.replace(/\.(txt|yjs)$/, '');

                    if (!projectData.documents.has(docId)) {
                        projectData.documents.set(docId, {
                            txtRef: null,
                            yjsRef: null,
                        });
                    }

                    const docData = projectData.documents.get(docId)!;

                    if (fileName.endsWith('.txt')) {
                        docData.txtRef = ref;
                    } else if (fileName.endsWith('.yjs')) {
                        docData.yjsRef = ref;
                    }
                }
            } else if (pathParts[2] === 'files') {
                if (pathParts[3] === 'metadata.json') {
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
            ownerId,
            tags: projectMetadata.tags,
            isFavorite: projectMetadata.isFavorite,
        };

        await authDb.put('projects', newProject);
    }

    private async importProjectSafely(
        projectId: string,
        projectMetadata: any,
        data: {
            documents: Map<string, { txtRef: string | null; yjsRef: string | null }>;
            files: Map<string, string>;
            filesMetadataRef?: string;
            documentsMetadataRef?: string;
        },
        credentials: { token: string; target: TTarget },
        branch: string,
    ): Promise<void> {
        await authService.createOrUpdateProject(
            this.unifiedService.convertMetadataToProject(projectMetadata),
            false,
        );

        let remoteDocumentsMetadata: any[] = [];

        if (data.documentsMetadataRef) {
            try {
                const metadataContent = await this.adapter.readFile(
                    credentials.token,
                    credentials.target,
                    data.documentsMetadataRef,
                    branch,
                );

                remoteDocumentsMetadata = JSON.parse(metadataContent);
            } catch (error) {
                console.error('Failed to load documents metadata from remote:', error);
            }
        }

        const docMetadataById = new Map<string, any>();

        remoteDocumentsMetadata.forEach((docMetadata) => {
            docMetadataById.set(docMetadata.id, docMetadata);
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

            const contentData: {
                readableContent?: string;
                yjsState?: Uint8Array;
            } = {};

            if (docData.txtRef) {
                contentData.readableContent = await this.adapter.readFile(
                    credentials.token,
                    credentials.target,
                    docData.txtRef,
                    branch,
                );
            }

            if (docData.yjsRef) {
                const yjsContent = await this.adapter.readFile(
                    credentials.token,
                    credentials.target,
                    docData.yjsRef,
                    branch,
                );

                const bytes = new Uint8Array(yjsContent.length);

                for (let i = 0; i < yjsContent.length; i++) {
                    bytes[i] = yjsContent.charCodeAt(i);
                }

                contentData.yjsState = bytes;
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

                if (!documents.find((document) => document.id === docId)) {
                    documents.push(newDocInfo);
                }
            }
        }

        await fileStorageService.switchToProject(projectMetadata.docUrl);

        let remoteFilesMetadata: any[] = [];

        if (data.filesMetadataRef) {
            try {
                const metadataContent = await this.adapter.readFile(
                    credentials.token,
                    credentials.target,
                    data.filesMetadataRef,
                    branch,
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
                    {
                        showConflictDialog: false,
                        preserveTimestamp: true,
                    },
                );

                this.addActivity({
                    type: 'import_complete',
                    message: `Restored deleted file metadata: ${filePath}`,
                });

                fileStorageEventEmitter.emitChange();
            } catch (error) {
                console.error(`Failed to restore deleted file metadata ${filePath}:`, error);
            }
        }

        let importedFilesCount = 0;
        let failedFilesCount = 0;

        for (const [filePath, fileRef] of data.files.entries()) {
            if (isTemporaryFile(filePath) || this.shouldIgnoreFile(filePath)) {
                continue;
            }
            try {
                await fileStorageService.createDirectoryPath(filePath);

                const rawContentString = await this.adapter.readFile(
                    credentials.token,
                    credentials.target,
                    fileRef,
                    branch,
                );

                const existingFile = await fileStorageService.getFileByPath(
                    filePath,
                    true,
                );

                const remoteMetadata = metadataByPath.get(filePath);
                const isBinary = remoteMetadata
                    ? remoteMetadata.isBinary
                    : isBinaryFile(filePath);

                let finalContent: string | ArrayBuffer;

                if (isBinary) {
                    const uint8Array = new Uint8Array(rawContentString.length);

                    for (let i = 0; i < rawContentString.length; i++) {
                        uint8Array[i] = rawContentString.charCodeAt(i);
                    }

                    finalContent = uint8Array.buffer;
                } else {
                    finalContent = rawContentString;
                }

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
                        isBinary,
                        content: finalContent,
                        isDeleted: false,
                    };

                await fileStorageService.storeFile(fileToStore, {
                    showConflictDialog: false,
                    preserveTimestamp: !!remoteMetadata,
                });

                importedFilesCount++;
            } catch (error) {
                failedFilesCount++;

                console.error(`Failed to import file ${filePath}:`, error);

                this.addActivity({
                    type: 'import_error',
                    message: t('Failed to import file: {filePath}', { filePath }),
                });
            }
        }

        if (failedFilesCount > 0) {
            throw new Error(
                t('Imported with {count} file error(s)', {
                    count: failedFilesCount,
                }),
            );
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
                message: t('Imported {count} document for project: {projectName}', {
                    count: documents.length,
                    projectName: projectMetadata.name,
                }),
            });
        }

        fileStorageEventEmitter.emitChange();
    }

    private async commitWithRetry(
        token: string,
        target: TTarget,
        branch: string,
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
                    token,
                    target,
                    branch,
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
    ): void {
        const errorMessage = error instanceof Error ? error.message : String(error);

        this.addActivity({
            type,
            message: `${messagePrefix}: ${errorMessage}`,
        });

        this.status = {
            ...this.status,
            status: 'error',
            error: errorMessage,
        };

        this.notifyListeners();
    }

    private async _throttleOperation(): Promise<void> {
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
        this.activityListeners.forEach((listener) =>
            listener([...this.activities]),
        );
    }

    private addActivity(
        activity: Omit<GitBackupActivity, 'id' | 'timestamp'>,
    ): void {
        const fullActivity: GitBackupActivity = {
            id: Math.random().toString(36).substring(2),
            timestamp: Date.now(),
            ...activity,
        };

        const limit = this.getActivityHistoryLimit();

        this.activities = [...this.activities.slice(-limit + 1), fullActivity];

        this.notifyActivityListeners();
    }
}