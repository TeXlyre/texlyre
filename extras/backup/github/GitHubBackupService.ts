// extras/backup/github/GitHubBackupService.ts
import { t } from '@/i18n';
import {
	GitBackupService,
	type GitBackupAdapter,
	type GitBackupChange,
	type GitTreeItem,
} from '@/services/GitBackupService';
import { gitHubAPIService } from './GitHubAPIService';

interface GitHubTarget {
	owner: string;
	repo: string;
	fullName: string;
}

function parseGitHubRepository(repoName: string): GitHubTarget {
	if (!repoName?.includes('/')) {
		throw new Error(t('Invalid repository format. Use owner/repo'));
	}

	const [owner, repo] = repoName.split('/');

	return {
		owner,
		repo,
		fullName: repoName,
	};
}

function mapGitHubChanges(changes: GitBackupChange[]) {
	const filesToCommit: {
		path: string;
		content: string | Uint8Array | ArrayBuffer;
	}[] = [];

	const filesToDelete: { path: string }[] = [];

	for (const change of changes) {
		if (change.type === 'delete') {
			filesToDelete.push({ path: change.path });
		} else {
			filesToCommit.push({
				path: change.path,
				content: change.content,
			});
		}
	}

	return {
		filesToCommit,
		filesToDelete,
	};
}

const gitHubBackupAdapter: GitBackupAdapter<GitHubTarget> = {
	displayName: 'GitHub',
	pluginId: 'texlyre-github-backup',
	tokenSecretKey: 'github-token',
	targetSecretKey: 'selected-repository',
	statusTargetKey: 'repository',
	tokenType: 'github-personal-access-token',
	importIdPrefix: 'github-import',

	setBaseUrl: (url) => gitHubAPIService.setBaseUrl(url),
	setRequestTimeout: (timeout) => gitHubAPIService.setRequestTimeout(timeout),

	testConnection: (token) => gitHubAPIService.testConnection(token),

	listTargets: (token) => gitHubAPIService.getRepositories(token),

	parseTarget: (repoName: string) => parseGitHubRepository(repoName),

	targetFromStoredValue: (value, metadata) => {
		const fullName = metadata?.fullName || value;
		return parseGitHubRepository(fullName);
	},

	getTargetLabel: (target) => target.fullName,

	getTargetSecretValue: (target) => target.fullName,

	getTargetMetadata: (target) => ({
		owner: target.owner,
		repo: target.repo,
		fullName: target.fullName,
	}),

	getRecursiveTree: (token, target, branch) =>
		gitHubAPIService.getRecursiveTree(token, target.owner, target.repo, branch),

	getFileRefForPath: (item: GitTreeItem) => item.sha || item.path || '',

	getLatestCommitSha: (token, target, branch) =>
		gitHubAPIService.getBranchHeadSha(token, target.owner, target.repo, branch),

	readFileAtRef: (token, target, path, ref) =>
		gitHubAPIService.getFileContentAtRef(
			token,
			target.owner,
			target.repo,
			path,
			ref,
		),

	readFile: (token, target, ref) =>
		gitHubAPIService.getBlobContent(token, target.owner, target.repo, ref),

	commitChanges: async (token, target, branch, message, changes) => {
		const { filesToCommit, filesToDelete } = mapGitHubChanges(changes);

		await gitHubAPIService.createCommitFromFiles(
			token,
			target.owner,
			target.repo,
			message,
			filesToCommit,
			branch,
			filesToDelete,
		);
	},
};

const sharedGitHubBackupService = new GitBackupService(gitHubBackupAdapter);

export const gitHubBackupService = {
	setSettings: sharedGitHubBackupService.setSettings.bind(
		sharedGitHubBackupService,
	),

	setSecretsContext: sharedGitHubBackupService.setSecretsContext.bind(
		sharedGitHubBackupService,
	),

	requestAccess: sharedGitHubBackupService.requestAccess.bind(
		sharedGitHubBackupService,
	),

	connectWithToken: async (token: string) => {
		const result = await sharedGitHubBackupService.connectWithToken(token);

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
		const target = gitHubBackupAdapter.parseTarget(repoName);

		return sharedGitHubBackupService.connectToTarget(
			token,
			target,
			projectId,
			branch,
		);
	},

	disconnect: sharedGitHubBackupService.disconnect.bind(
		sharedGitHubBackupService,
	),
	getStoredRepository: sharedGitHubBackupService.getStoredTarget.bind(
		sharedGitHubBackupService,
	),
	getStoredBranch: sharedGitHubBackupService.getStoredBranch.bind(
		sharedGitHubBackupService,
	),
	getStoredCredentials: sharedGitHubBackupService.getStoredCredentials.bind(
		sharedGitHubBackupService,
	),
	hasStoredCredentials: sharedGitHubBackupService.hasStoredCredentials.bind(
		sharedGitHubBackupService,
	),
	synchronize: sharedGitHubBackupService.synchronize.bind(
		sharedGitHubBackupService,
	),
	exportData: sharedGitHubBackupService.exportData.bind(
		sharedGitHubBackupService,
	),
	importChanges: sharedGitHubBackupService.importChanges.bind(
		sharedGitHubBackupService,
	),
	getStatus: sharedGitHubBackupService.getStatus.bind(
		sharedGitHubBackupService,
	),
	getActivities: sharedGitHubBackupService.getActivities.bind(
		sharedGitHubBackupService,
	),
	addStatusListener: sharedGitHubBackupService.addStatusListener.bind(
		sharedGitHubBackupService,
	),
	addActivityListener: sharedGitHubBackupService.addActivityListener.bind(
		sharedGitHubBackupService,
	),
	clearActivity: sharedGitHubBackupService.clearActivity.bind(
		sharedGitHubBackupService,
	),
	clearAllActivities: sharedGitHubBackupService.clearAllActivities.bind(
		sharedGitHubBackupService,
	),
};
