import type {
	GitRemoteCommitObject,
	GitRemoteProvider,
	GitRemoteSignature,
	GitRemoteTreeEntry,
} from '@/types/gitRemote';
import { toBase64 } from '@/utils/fileUtils';
import {
	base64ToBytes,
	gitRemoteApiRequest,
	normalizeGitRepositoryInput,
} from '@/utils/gitUtils';
import { gitLabAPIService } from './GitLabAPIService';

let apiConfiguration = {
	endpoint: 'https://gitlab.com/api/v4',
	requestTimeout: 30,
};

const request = <T>(
	token: string,
	endpoint: string,
	options: RequestInit = {},
): Promise<T> =>
	gitRemoteApiRequest<T>({
		providerName: 'GitLab',
		baseUrl: gitLabAPIService.getBaseUrl(),
		token,
		endpoint,
		requestTimeout: apiConfiguration.requestTimeout,
		authHeaders: (credential) => ({ 'PRIVATE-TOKEN': credential }),
		options,
	});

const normalizeCommit = (data: {
	id: string;
	message: string;
	parent_ids?: string[];
	author_name?: string;
	author_email?: string;
	authored_date?: string;
	committer_name?: string;
	committer_email?: string;
	committed_date?: string;
}): GitRemoteCommitObject => {
	const fallbackDate =
		data.committed_date || data.authored_date || new Date(0).toISOString();
	const author: GitRemoteSignature = {
		name: data.author_name || 'Unknown',
		email: data.author_email || 'unknown@local',
		date: data.authored_date || fallbackDate,
	};
	const committer: GitRemoteSignature = {
		name: data.committer_name || author.name,
		email: data.committer_email || author.email,
		date: data.committed_date || fallbackDate,
	};
	return {
		oid: data.id,
		message: data.message,
		parents: data.parent_ids ?? [],
		author,
		committer,
	};
};

const applyApiConfiguration = (
	configuration: typeof apiConfiguration,
): void => {
	apiConfiguration = { ...configuration };
	gitLabAPIService.setBaseUrl(configuration.endpoint);
	gitLabAPIService.setRequestTimeout(configuration.requestTimeout);
};

const historyTransport: GitRemoteProvider['historyTransport'] = {
	preservesCommitOids: false,
	supportsMergeCommits: false,
	getHead: async (token, repositoryId, branch) => {
		try {
			return await gitLabAPIService.getBranchHeadSha(
				token,
				repositoryId,
				branch,
			);
		} catch (error) {
			if (
				(error as { status?: number }).status === 404 ||
				/not found/i.test(String(error))
			)
				return null;
			throw error;
		}
	},
	getCommit: async (token, repositoryId, oid) => {
		const data = await request<Parameters<typeof normalizeCommit>[0]>(
			token,
			`projects/${encodeURIComponent(repositoryId)}/repository/commits/${encodeURIComponent(oid)}`,
		);
		return normalizeCommit(data);
	},
	getTree: async (token, repositoryId, commit) =>
		(
			await gitLabAPIService.getRecursiveTree(token, repositoryId, commit.oid)
		).map<GitRemoteTreeEntry>((entry) => ({
			path: entry.path,
			mode: entry.mode,
			type: entry.type,
			oid: entry.id,
		})),
	getBlob: async (token, repositoryId, oid) => {
		const data = await request<{ content: string; encoding: string }>(
			token,
			`projects/${encodeURIComponent(repositoryId)}/repository/blobs/${encodeURIComponent(oid)}`,
		);
		if (data.encoding !== 'base64') {
			throw new Error(`Unsupported GitLab blob encoding: ${data.encoding}`);
		}
		return base64ToBytes(data.content);
	},
	createCommit: async (token, repositoryId, input) => {
		if (input.parents.length > 1) {
			throw new Error(
				'GitLab API transport cannot create multi-parent Git commits',
			);
		}
		const currentHead = await historyTransport.getHead(
			token,
			repositoryId,
			input.branch,
		);
		if (currentHead !== input.expectedBranchHead) {
			throw new Error(
				'Remote branch changed while preparing the push. Pull first.',
			);
		}
		const actions = input.changes.flatMap((change) => {
			if (change.type === 'delete') {
				return [{ action: 'delete', file_path: change.path }];
			}
			if (change.mode !== '100644' && change.mode !== '100755') {
				throw new Error(
					`GitLab API transport cannot create Git mode ${change.mode ?? 'unknown'} (${change.path})`,
				);
			}
			const actions: Array<Record<string, unknown>> = [
				{
					action: change.type,
					file_path: change.path,
					content: toBase64(change.content ?? new Uint8Array()),
					encoding: 'base64',
				},
			];
			if (change.previousMode !== change.mode && change.mode === '100755') {
				actions.push({
					action: 'chmod',
					file_path: change.path,
					execute_filemode: true,
				});
			} else if (change.previousMode === '100755' && change.mode === '100644') {
				actions.push({
					action: 'chmod',
					file_path: change.path,
					execute_filemode: false,
				});
			}
			return actions;
		});
		const data = await request<Parameters<typeof normalizeCommit>[0]>(
			token,
			`projects/${encodeURIComponent(repositoryId)}/repository/commits`,
			{
				method: 'POST',
				body: JSON.stringify({
					branch: input.branch,
					commit_message: input.message,
					author_name: input.author.name,
					author_email: input.author.email,
					actions,
				}),
			},
		);
		return normalizeCommit(data);
	},
};

export const gitLabGitRemoteProvider: GitRemoteProvider = {
	id: 'gitlab',
	displayName: 'GitLab',
	historyPluginId: 'texlyre-gitlab-history',
	historyTokenSecretKey: 'gitlab-history-token',
	backupPluginId: 'texlyre-gitlab-backup',
	backupTokenSecretKey: 'gitlab-token',
	configure: (getSetting) => {
		applyApiConfiguration({
			endpoint:
				(getSetting('gitlab-backup-api-endpoint')?.value as string) ||
				'https://gitlab.com/api/v4',
			requestTimeout:
				(getSetting('gitlab-backup-request-timeout')?.value as number) || 30,
		});
	},
	getApiConfiguration: () => ({ ...apiConfiguration }),
	applyApiConfiguration,
	testConnection: (token) => gitLabAPIService.testConnection(token),
	listRepositories: async (token) =>
		(await gitLabAPIService.getProjects(token)).map((project) => ({
			id: String(project.id),
			label: project.path_with_namespace,
			private: project.visibility !== 'public',
			defaultBranch: project.default_branch,
		})),
	listBranches: async (token, repositoryId) => {
		try {
			return await gitLabAPIService.getBranches(token, repositoryId);
		} catch (error) {
			if (/not found|empty/i.test(String(error))) return [];
			throw error;
		}
	},
	createBranch: async (token, repositoryId, branch, sourceRef) => {
		await request(
			token,
			`projects/${encodeURIComponent(repositoryId)}/repository/branches`,
			{
				method: 'POST',
				body: JSON.stringify({ branch, ref: sourceRef }),
			},
		);
	},
	normalizeRepositoryInput: normalizeGitRepositoryInput,
	historyTransport,
};
