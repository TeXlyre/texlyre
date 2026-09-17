import type {
	GitRemoteProvider,
	GitRemoteSignature,
	GitRemoteTreeEntry,
} from '@/types/gitRemote';
import { toBase64 } from '@/utils/fileUtils';
import {
	base64ToBytes,
	gitRemoteApiRequest,
	gitRepositoryParts,
	normalizeGitRepositoryInput,
} from '@/utils/gitUtils';
import { gitHubAPIService } from './GitHubAPIService';

const repositoryParts = (repositoryId: string): [string, string] =>
	gitRepositoryParts(repositoryId, 'GitHub');

let apiConfiguration = {
	endpoint: 'https://api.github.com',
	requestTimeout: 30,
};

const request = <T>(
	token: string,
	endpoint: string,
	options: RequestInit = {},
): Promise<T> =>
	gitRemoteApiRequest<T>({
		providerName: 'GitHub',
		baseUrl: gitHubAPIService.getBaseUrl(),
		token,
		endpoint,
		requestTimeout: apiConfiguration.requestTimeout,
		authHeaders: (credential) => ({
			Authorization: `token ${credential}`,
			Accept: 'application/vnd.github.v3+json',
		}),
		options,
	});

const normalizeSignature = (signature: {
	name?: string;
	email?: string;
	date?: string;
}): GitRemoteSignature => ({
	name: signature.name || 'Unknown',
	email: signature.email || 'unknown@local',
	date: signature.date || new Date(0).toISOString(),
});

const applyApiConfiguration = (
	configuration: typeof apiConfiguration,
): void => {
	apiConfiguration = { ...configuration };
	gitHubAPIService.setBaseUrl(configuration.endpoint);
	gitHubAPIService.setRequestTimeout(configuration.requestTimeout);
};

const bootstrapEmptyRepository = async (
	token: string,
	owner: string,
	repo: string,
	branch: string,
): Promise<string | null> => {
	try {
		await request(token, `repos/${owner}/${repo}/git/matching-refs/heads`);
		return null;
	} catch (error) {
		if ((error as { status?: number }).status !== 409) throw error;
	}

	const repository = await request<{ default_branch: string }>(
		token,
		`repos/${owner}/${repo}`,
	);
	if (branch !== repository.default_branch) {
		throw new Error(
			`GitHub requires the first push to an empty repository to initialize its default branch (${repository.default_branch}).`,
		);
	}
	const initialized = await request<{ commit: { sha: string } }>(
		token,
		`repos/${owner}/${repo}/contents/.texlyre-init`,
		{
			method: 'PUT',
			body: JSON.stringify({
				message: 'Initialize Git repository',
				content: 'Cg==',
			}),
		},
	);
	return initialized.commit.sha;
};

const historyTransport: GitRemoteProvider['historyTransport'] = {
	preservesCommitOids: true,
	supportsMergeCommits: true,
	getHead: async (token, repositoryId, branch) => {
		const [owner, repo] = repositoryParts(repositoryId);
		try {
			return await gitHubAPIService.getBranchHeadSha(
				token,
				owner,
				repo,
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
		const [owner, repo] = repositoryParts(repositoryId);
		const data = await request<{
			sha: string;
			message: string;
			tree: { sha: string };
			parents: Array<{ sha: string }>;
			author: { name?: string; email?: string; date?: string };
			committer: { name?: string; email?: string; date?: string };
			verification?: { signature?: string | null; payload?: string | null };
		}>(token, `repos/${owner}/${repo}/git/commits/${encodeURIComponent(oid)}`);
		return {
			oid: data.sha,
			message: data.message,
			parents: data.parents.map((parent) => parent.sha),
			author: normalizeSignature(data.author),
			committer: normalizeSignature(data.committer),
			treeOid: data.tree.sha,
			...(data.verification?.signature
				? { gpgsig: data.verification.signature }
				: {}),
			...(data.verification?.payload
				? { unsignedPayload: data.verification.payload }
				: {}),
		};
	},
	getTree: async (token, repositoryId, commit) => {
		const [owner, repo] = repositoryParts(repositoryId);
		if (!commit.treeOid)
			throw new Error('GitHub commit did not include a tree');
		const entries: GitRemoteTreeEntry[] = [];

		const walk = async (treeOid: string, prefix = ''): Promise<void> => {
			const data = await request<{
				tree: Array<{
					path: string;
					mode: string;
					type: 'blob' | 'tree' | 'commit';
					sha: string;
				}>;
				truncated?: boolean;
			}>(
				token,
				`repos/${owner}/${repo}/git/trees/${encodeURIComponent(treeOid)}`,
			);
			if (data.truncated) {
				throw new Error(
					'GitHub returned a truncated Git tree; History sync cannot reproduce this commit exactly.',
				);
			}
			for (const entry of data.tree) {
				const path = prefix ? `${prefix}/${entry.path}` : entry.path;
				if (entry.type === 'tree') {
					await walk(entry.sha, path);
					continue;
				}
				entries.push({
					path,
					mode: entry.mode,
					type: entry.type,
					oid: entry.sha,
				});
			}
		};

		await walk(commit.treeOid);
		return entries;
	},
	getBlob: async (token, repositoryId, oid) => {
		const [owner, repo] = repositoryParts(repositoryId);
		const data = await request<{ content: string; encoding: string }>(
			token,
			`repos/${owner}/${repo}/git/blobs/${encodeURIComponent(oid)}`,
		);
		if (data.encoding !== 'base64') {
			throw new Error(`Unsupported GitHub blob encoding: ${data.encoding}`);
		}
		return base64ToBytes(data.content);
	},
	createCommit: async (token, repositoryId, input) => {
		const [owner, repo] = repositoryParts(repositoryId);
		const bootstrapHead =
			input.parents.length === 0
				? await bootstrapEmptyRepository(token, owner, repo, input.branch)
				: null;
		const baseCommit = input.parents[0]
			? await historyTransport.getCommit(token, repositoryId, input.parents[0])
			: null;
		if (baseCommit && !baseCommit.treeOid) {
			throw new Error('GitHub parent commit did not include a tree');
		}
		const tree = await Promise.all(
			input.changes.map(async (change) => {
				if (change.type === 'delete') {
					return {
						path: change.path,
						mode: change.mode ?? '100644',
						type: change.mode === '160000' ? 'commit' : 'blob',
						sha: null,
					};
				}
				const blob = await request<{ sha: string }>(
					token,
					`repos/${owner}/${repo}/git/blobs`,
					{
						method: 'POST',
						body: JSON.stringify({
							content: toBase64(change.content ?? new Uint8Array()),
							encoding: 'base64',
						}),
					},
				);
				return {
					path: change.path,
					mode: change.mode ?? '100644',
					type: change.mode === '160000' ? 'commit' : 'blob',
					sha: blob.sha,
				};
			}),
		);
		const remoteTree = await request<{ sha: string }>(
			token,
			`repos/${owner}/${repo}/git/trees`,
			{
				method: 'POST',
				body: JSON.stringify({
					...(baseCommit?.treeOid ? { base_tree: baseCommit.treeOid } : {}),
					tree,
				}),
			},
		);
		const created = await request<{ sha: string }>(
			token,
			`repos/${owner}/${repo}/git/commits`,
			{
				method: 'POST',
				body: JSON.stringify({
					message: input.message,
					tree: remoteTree.sha,
					parents: input.parents,
					author: input.author,
					committer: input.committer,
				}),
			},
		);
		if (input.updateBranch) {
			const currentHead = await historyTransport.getHead(
				token,
				repositoryId,
				input.branch,
			);
			const isBootstrapHead = Boolean(
				bootstrapHead &&
					currentHead === bootstrapHead &&
					!input.expectedBranchHead,
			);
			if (!isBootstrapHead && currentHead !== input.expectedBranchHead) {
				throw new Error(
					'Remote branch changed while preparing the push. Pull first.',
				);
			}
			if (currentHead) {
				await request(
					token,
					`repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(input.branch)}`,
					{
						method: 'PATCH',
						body: JSON.stringify({
							sha: created.sha,
							force: isBootstrapHead,
						}),
					},
				);
			} else {
				await request(token, `repos/${owner}/${repo}/git/refs`, {
					method: 'POST',
					body: JSON.stringify({
						ref: `refs/heads/${input.branch}`,
						sha: created.sha,
					}),
				});
			}
		}
		return historyTransport.getCommit(token, repositoryId, created.sha);
	},
};

export const gitHubGitRemoteProvider: GitRemoteProvider = {
	id: 'github',
	displayName: 'GitHub',
	historyPluginId: 'texlyre-github-history',
	historyTokenSecretKey: 'github-history-token',
	backupPluginId: 'texlyre-github-backup',
	backupTokenSecretKey: 'github-token',
	configure: (getSetting) => {
		applyApiConfiguration({
			endpoint:
				(getSetting('github-backup-api-endpoint')?.value as string) ||
				'https://api.github.com',
			requestTimeout:
				(getSetting('github-backup-request-timeout')?.value as number) || 30,
		});
	},
	getApiConfiguration: () => ({ ...apiConfiguration }),
	applyApiConfiguration,
	testConnection: (token) => gitHubAPIService.testConnection(token),
	listRepositories: async (token) =>
		(await gitHubAPIService.getRepositories(token)).map((repository) => ({
			id: repository.full_name,
			label: repository.full_name,
			private: repository.private,
			defaultBranch: repository.default_branch,
		})),
	listBranches: async (token, repositoryId) => {
		const [owner, repo] = repositoryParts(repositoryId);
		try {
			return await gitHubAPIService.getBranches(token, owner, repo);
		} catch (error) {
			if (/(?:repository|git).*empty|empty.*repository/i.test(String(error)))
				return [];
			throw error;
		}
	},
	createBranch: async (token, repositoryId, branch, sourceRef) => {
		const [owner, repo] = repositoryParts(repositoryId);
		const sourceOid = await historyTransport.getHead(
			token,
			repositoryId,
			sourceRef,
		);
		if (!sourceOid)
			throw new Error(`Source branch ${sourceRef} does not exist`);
		await request(token, `repos/${owner}/${repo}/git/refs`, {
			method: 'POST',
			body: JSON.stringify({
				ref: `refs/heads/${branch}`,
				sha: sourceOid,
			}),
		});
	},
	normalizeRepositoryInput: normalizeGitRepositoryInput,
	historyTransport,
};
