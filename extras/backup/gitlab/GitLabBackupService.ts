// extras/backup/gitlab/GitLabBackupService.ts
import { t } from '@/i18n';
import {
    GitBackupService,
    type GitBackupAdapter,
    type GitBackupChange,
    type GitTreeItem,
} from '@/services/GitBackupService';
import { toBase64 } from '@/utils/fileUtils';
import { gitLabAPIService } from './GitLabAPIService';

interface GitLabTarget {
    projectId: string;
    pathWithNamespace: string;
}

function parseGitLabProject(
    projectId: string,
    pathWithNamespace?: string,
): GitLabTarget {
    if (!projectId) {
        throw new Error(t('Invalid project format'));
    }

    return {
        projectId,
        pathWithNamespace: pathWithNamespace || projectId,
    };
}

type GitLabCommitAction =
    | {
        action: 'delete';
        file_path: string;
    }
    | {
        action: 'create' | 'update';
        file_path: string;
        content: string;
        encoding: 'base64';
    };

function mapGitLabChanges(changes: GitBackupChange[]): GitLabCommitAction[] {
    return changes.map((change): GitLabCommitAction => {
        if (change.type === 'delete') {
            return {
                action: 'delete',
                file_path: change.path,
            };
        }

        return {
            action: change.type,
            file_path: change.path,
            content: toBase64(change.content),
            encoding: 'base64',
        };
    });
}

const gitLabBackupAdapter: GitBackupAdapter<GitLabTarget> = {
    displayName: 'GitLab',
    pluginId: 'texlyre-gitlab-backup',
    tokenSecretKey: 'gitlab-token',
    targetSecretKey: 'selected-project',
    statusTargetKey: 'project',
    tokenType: 'gitlab-personal-access-token',
    importIdPrefix: 'gitlab-import',

    setBaseUrl: (url) => gitLabAPIService.setBaseUrl(url),
    setRequestTimeout: (timeout) => gitLabAPIService.setRequestTimeout(timeout),

    testConnection: (token) => gitLabAPIService.testConnection(token),

    listTargets: (token) => gitLabAPIService.getProjects(token),

    parseTarget: (projectId: string, pathWithNamespace?: string) =>
        parseGitLabProject(projectId, pathWithNamespace),

    targetFromStoredValue: (value, metadata) =>
        parseGitLabProject(value, metadata?.pathWithNamespace),

    getTargetLabel: (target) => target.pathWithNamespace,

    getTargetSecretValue: (target) => target.projectId,

    getTargetMetadata: (target) => ({
        projectId: target.projectId,
        pathWithNamespace: target.pathWithNamespace,
    }),

    getRecursiveTree: (token, target, branch) =>
        gitLabAPIService.getRecursiveTree(token, target.projectId, branch),

    getFileRefForPath: (_item: GitTreeItem, path: string) => path,

    getLatestCommitSha: (token, target, branch) =>
        gitLabAPIService.getBranchHeadSha(token, target.projectId, branch),

    readFileAtRef: (token, target, path, ref) =>
        gitLabAPIService.getFileContentAtRef(token, target.projectId, path, ref),

    readFile: (token, target, path, branch) =>
        gitLabAPIService.getFileContent(token, target.projectId, path, branch),

    commitChanges: async (token, target, branch, message, changes) => {
        await gitLabAPIService.createCommit(
            token,
            target.projectId,
            branch,
            message,
            mapGitLabChanges(changes),
        );
    },
};

const sharedGitLabBackupService = new GitBackupService(gitLabBackupAdapter);

export const gitLabBackupService = {
    setSettings: sharedGitLabBackupService.setSettings.bind(
        sharedGitLabBackupService,
    ),
    setSecretsContext: sharedGitLabBackupService.setSecretsContext.bind(
        sharedGitLabBackupService,
    ),
    requestAccess: sharedGitLabBackupService.requestAccess.bind(
        sharedGitLabBackupService,
    ),

    connectWithToken: async (token: string) => {
        const result = await sharedGitLabBackupService.connectWithToken(token);

        return {
            success: result.success,
            projects: result.projects || result.targets,
            error: result.error,
        };
    },

    connectToProject: async (
        token: string,
        projectId: string,
        projectPathWithNamespace: string,
        localProjectId?: string,
        branch?: string,
    ): Promise<boolean> => {
        const target = gitLabBackupAdapter.parseTarget(
            projectId,
            projectPathWithNamespace,
        );

        return sharedGitLabBackupService.connectToTarget(
            token,
            target,
            localProjectId,
            branch,
        );
    },

    disconnect: sharedGitLabBackupService.disconnect.bind(
        sharedGitLabBackupService,
    ),
    getStoredProject: sharedGitLabBackupService.getStoredTarget.bind(
        sharedGitLabBackupService,
    ),
    getStoredBranch: sharedGitLabBackupService.getStoredBranch.bind(
        sharedGitLabBackupService,
    ),
    getStoredCredentials: sharedGitLabBackupService.getStoredCredentials.bind(
        sharedGitLabBackupService,
    ),
    hasStoredCredentials: sharedGitLabBackupService.hasStoredCredentials.bind(
        sharedGitLabBackupService,
    ),
    synchronize: sharedGitLabBackupService.synchronize.bind(
        sharedGitLabBackupService,
    ),
    exportData: sharedGitLabBackupService.exportData.bind(
        sharedGitLabBackupService,
    ),
    importChanges: sharedGitLabBackupService.importChanges.bind(
        sharedGitLabBackupService,
    ),
    getStatus: sharedGitLabBackupService.getStatus.bind(
        sharedGitLabBackupService,
    ),
    getActivities: sharedGitLabBackupService.getActivities.bind(
        sharedGitLabBackupService,
    ),
    addStatusListener: sharedGitLabBackupService.addStatusListener.bind(
        sharedGitLabBackupService,
    ),
    addActivityListener: sharedGitLabBackupService.addActivityListener.bind(
        sharedGitLabBackupService,
    ),
    clearActivity: sharedGitLabBackupService.clearActivity.bind(
        sharedGitLabBackupService,
    ),
    clearAllActivities: sharedGitLabBackupService.clearAllActivities.bind(
        sharedGitLabBackupService,
    ),
};