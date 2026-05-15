// extras/backup/forgejo/ForgejoBackupService.ts
import { t } from '@/i18n';
import {
	GitBackupService,
	type GitBackupAdapter,
	type GitBackupChange,
} from '@/services/GitBackupService';
import { encodeContentToBase64 } from '@/utils/fileUtils.ts';
import { forgejoAPIService } from './ForgejoAPIService';

interface ForgejoTarget {
	owner: string;
	repo: string;
	fullName: string;
}

type ForgejoCommitAction =
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

function parseForgejoRepository(repoName: string): ForgejoTarget {
	if (!repoName || !repoName.includes('/')) {
		throw new Error(t('Invalid repository format. Use owner/repo'));
	}

	const [owner, repo] = repoName.split('/');

	return { owner, repo, fullName: repoName };
}

function mapForgejoChanges(changes: GitBackupChange[]): ForgejoCommitAction[] {
	return changes.map((change): ForgejoCommitAction => {
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
			content: encodeContentToBase64(change.content),
			encoding: 'base64',
			sha: change.previousRef,
		};
	});
}

const forgejoBackupAdapter: GitBackupAdapter<ForgejoTarget> = {
	displayName: 'Forgejo',
	pluginId: 'texlyre-forgejo-backup',
	tokenSecretKey: 'forgejo-token',
	targetSecretKey: 'selected-repository',
	statusTargetKey: 'repository',
	tokenType: 'forgejo-access-token',
	importIdPrefix: 'forgejo-import',

	setBaseUrl: (url) => forgejoAPIService.setBaseUrl(url),
	setRequestTimeout: (timeout) => forgejoAPIService.setRequestTimeout(timeout),

	testConnection: (token) => forgejoAPIService.testConnection(token),
	listTargets: (token) => forgejoAPIService.getRepositories(token),

	parseTarget: (repoName: string) => parseForgejoRepository(repoName),

	targetFromStoredValue: (value, metadata) => {
		const fullName = metadata?.fullName || value;
		return parseForgejoRepository(fullName);
	},

	getTargetLabel: (target) => target.fullName,
	getTargetSecretValue: (target) => target.fullName,

	getTargetMetadata: (target) => ({
		owner: target.owner,
		repo: target.repo,
		fullName: target.fullName,
	}),

	getRecursiveTree: (token, target, branch) =>
		forgejoAPIService.getRecursiveTree(
			token,
			target.owner,
			target.repo,
			branch,
		),

	getFileRefForPath: (_item, path) => path,

	getLatestCommitSha: (token, target, branch) =>
		forgejoAPIService.getBranchHeadSha(
			token,
			target.owner,
			target.repo,
			branch,
		),

	readFileAtRef: (token, target, path, ref) =>
		forgejoAPIService.getFileContentAtRef(
			token,
			target.owner,
			target.repo,
			path,
			ref,
		),

	readFile: (token, target, path, branch) =>
		forgejoAPIService.getFileContent(
			token,
			target.owner,
			target.repo,
			path,
			branch,
		),

	commitChanges: async (token, target, branch, message, changes) => {
		await forgejoAPIService.createOrUpdateFiles(
			token,
			target.owner,
			target.repo,
			branch,
			message,
			mapForgejoChanges(changes),
		);
	},
};

const sharedForgejoBackupService = new GitBackupService(forgejoBackupAdapter);

export const forgejoBackupService = {
	setSettings: sharedForgejoBackupService.setSettings.bind(
		sharedForgejoBackupService,
	),
	setSecretsContext: sharedForgejoBackupService.setSecretsContext.bind(
		sharedForgejoBackupService,
	),
	requestAccess: sharedForgejoBackupService.requestAccess.bind(
		sharedForgejoBackupService,
	),

	connectWithToken: async (token: string) => {
		const result = await sharedForgejoBackupService.connectWithToken(token);

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
		const target = forgejoBackupAdapter.parseTarget(repoName);

		return sharedForgejoBackupService.connectToTarget(
			token,
			target,
			projectId,
			branch,
		);
	},

	disconnect: sharedForgejoBackupService.disconnect.bind(
		sharedForgejoBackupService,
	),
	getStoredRepository: sharedForgejoBackupService.getStoredTarget.bind(
		sharedForgejoBackupService,
	),
	getStoredBranch: sharedForgejoBackupService.getStoredBranch.bind(
		sharedForgejoBackupService,
	),
	getStoredCredentials: sharedForgejoBackupService.getStoredCredentials.bind(
		sharedForgejoBackupService,
	),
	hasStoredCredentials: sharedForgejoBackupService.hasStoredCredentials.bind(
		sharedForgejoBackupService,
	),
	synchronize: sharedForgejoBackupService.synchronize.bind(
		sharedForgejoBackupService,
	),
	exportData: sharedForgejoBackupService.exportData.bind(
		sharedForgejoBackupService,
	),
	importChanges: sharedForgejoBackupService.importChanges.bind(
		sharedForgejoBackupService,
	),
	getStatus: sharedForgejoBackupService.getStatus.bind(
		sharedForgejoBackupService,
	),
	getActivities: sharedForgejoBackupService.getActivities.bind(
		sharedForgejoBackupService,
	),
	addStatusListener: sharedForgejoBackupService.addStatusListener.bind(
		sharedForgejoBackupService,
	),
	addActivityListener: sharedForgejoBackupService.addActivityListener.bind(
		sharedForgejoBackupService,
	),
	clearActivity: sharedForgejoBackupService.clearActivity.bind(
		sharedForgejoBackupService,
	),
	clearAllActivities: sharedForgejoBackupService.clearAllActivities.bind(
		sharedForgejoBackupService,
	),
};
