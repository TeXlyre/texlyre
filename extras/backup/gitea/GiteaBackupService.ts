// extras/backup/gitea/GiteaBackupService.ts
import { t } from '@/i18n';
import {
    GitBackupService,
    type GitBackupAdapter,
    type GitBackupChange,
} from '@/services/GitBackupService';
import { toBase64 } from '@/utils/fileUtils.ts';
import { giteaAPIService } from './GiteaAPIService';

interface GiteaTarget {
    owner: string;
    repo: string;
    fullName: string;
}

type GiteaCommitAction =
    | {
        operation: 'delete';
        path: string;
        sha?: string;
    }
    | {
        operation: 'create' | 'update';
        path: string;
        content: string;
        encoding: 'base64';
        sha?: string;
    };

function parseGiteaRepository(repoName: string): GiteaTarget {
    if (!repoName || !repoName.includes('/')) {
        throw new Error(t('Invalid repository format. Use owner/repo'));
    }

    const [owner, repo] = repoName.split('/');

    return { owner, repo, fullName: repoName };
}

function mapGiteaChanges(changes: GitBackupChange[]): GiteaCommitAction[] {
    return changes.map((change): GiteaCommitAction => {
        if (change.type === 'delete') {
            return {
                operation: 'delete',
                path: change.path,
                sha: change.previousRef,
            };
        }

        return {
            operation: change.type,
            path: change.path,
            content: toBase64(change.content),
            encoding: 'base64',
            sha: change.previousRef,
        };
    });
}

const giteaBackupAdapter: GitBackupAdapter<GiteaTarget> = {
    displayName: 'Gitea',
    pluginId: 'texlyre-gitea-backup',
    tokenSecretKey: 'gitea-token',
    targetSecretKey: 'selected-repository',
    statusTargetKey: 'repository',
    tokenType: 'gitea-access-token',
    importIdPrefix: 'gitea-import',

    setBaseUrl: (url) => giteaAPIService.setBaseUrl(url),
    setRequestTimeout: (timeout) => giteaAPIService.setRequestTimeout(timeout),

    testConnection: (token) => giteaAPIService.testConnection(token),
    listTargets: (token) => giteaAPIService.getRepositories(token),

    parseTarget: (repoName: string) => parseGiteaRepository(repoName),

    targetFromStoredValue: (value, metadata) => {
        const fullName = metadata?.fullName || value;
        return parseGiteaRepository(fullName);
    },

    getTargetLabel: (target) => target.fullName,
    getTargetSecretValue: (target) => target.fullName,

    getTargetMetadata: (target) => ({
        owner: target.owner,
        repo: target.repo,
        fullName: target.fullName,
    }),

    getRecursiveTree: (token, target, branch) =>
        giteaAPIService.getRecursiveTree(
            token,
            target.owner,
            target.repo,
            branch,
        ),

    getFileRefForPath: (_item, path) => path,

    getLatestCommitSha: (token, target, branch) =>
        giteaAPIService.getBranchHeadSha(token, target.owner, target.repo, branch),

    readFileAtRef: (token, target, path, ref) =>
        giteaAPIService.getFileContentAtRef(token, target.owner, target.repo, path, ref),

    readFile: (token, target, path, branch) =>
        giteaAPIService.getFileContent(
            token,
            target.owner,
            target.repo,
            path,
            branch,
        ),

    commitChanges: async (token, target, branch, message, changes) => {
        await giteaAPIService.createOrUpdateFiles(
            token,
            target.owner,
            target.repo,
            branch,
            message,
            mapGiteaChanges(changes),
        );
    },
};

const sharedGiteaBackupService = new GitBackupService(giteaBackupAdapter);

export const giteaBackupService = {
    setSettings: sharedGiteaBackupService.setSettings.bind(sharedGiteaBackupService),

    setSecretsContext: sharedGiteaBackupService.setSecretsContext.bind(
        sharedGiteaBackupService,
    ),

    setRecordsContext: sharedGiteaBackupService.setRecordsContext.bind(
        sharedGiteaBackupService,
    ),
    setCurrentProjectId: sharedGiteaBackupService.setCurrentProjectId.bind(
        sharedGiteaBackupService,
    ),

    requestAccess: sharedGiteaBackupService.requestAccess.bind(
        sharedGiteaBackupService,
    ),

    connectWithToken: async (token: string) => {
        const result = await sharedGiteaBackupService.connectWithToken(token);

        return {
            success: result.success,
            repositories: result.repositories || result.targets,
            error: result.error,
        };
    },

    connectToRepository: async (
        token: string,
        repoName: string,
        projectId?: string,
        branch?: string,
    ): Promise<boolean> => {
        const target = giteaBackupAdapter.parseTarget(repoName);

        return sharedGiteaBackupService.connectToTarget(
            token,
            target,
            projectId,
            branch,
        );
    },

    disconnect: sharedGiteaBackupService.disconnect.bind(
        sharedGiteaBackupService),
    getStoredRepository: sharedGiteaBackupService.getStoredTarget.bind(
        sharedGiteaBackupService,
    ),
    getStoredBranch: sharedGiteaBackupService.getStoredBranch.bind(
        sharedGiteaBackupService,
    ),
    getStoredCredentials: sharedGiteaBackupService.getStoredCredentials.bind(
        sharedGiteaBackupService,
    ),
    hasStoredCredentials: sharedGiteaBackupService.hasStoredCredentials.bind(
        sharedGiteaBackupService,
    ),
    synchronize: sharedGiteaBackupService.synchronize.bind(sharedGiteaBackupService),
    exportData: sharedGiteaBackupService.exportData.bind(sharedGiteaBackupService),
    importChanges: sharedGiteaBackupService.importChanges.bind(
        sharedGiteaBackupService,
    ),
    getStatus: sharedGiteaBackupService.getStatus.bind(sharedGiteaBackupService),
    getActivities: sharedGiteaBackupService.getActivities.bind(
        sharedGiteaBackupService,
    ),
    addStatusListener: sharedGiteaBackupService.addStatusListener.bind(
        sharedGiteaBackupService,
    ),
    addActivityListener: sharedGiteaBackupService.addActivityListener.bind(
        sharedGiteaBackupService,
    ),
    clearActivity: sharedGiteaBackupService.clearActivity.bind(
        sharedGiteaBackupService,
    ),
    clearAllActivities: sharedGiteaBackupService.clearAllActivities.bind(
        sharedGiteaBackupService,
    ),
};
