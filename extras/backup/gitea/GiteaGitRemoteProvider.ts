import type {
	GitRemoteApiConfiguration,
	GitRemoteBranch,
	GitRemoteCommitObject,
	GitRemoteProvider,
	GitRemoteRepository,
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
import { giteaAPIService } from './GiteaAPIService';

interface GiteaRepository {
	full_name: string;
	private: boolean;
	default_branch: string;
}

interface GiteaApiService {
	getBaseUrl(): string;
	setBaseUrl(url: string): void;
	setRequestTimeout(timeoutSeconds: number): void;
	testConnection(token: string): Promise<boolean>;
	getRepositories(token: string): Promise<GiteaRepository[]>;
	getBranches(
		token: string,
		owner: string,
		repo: string,
	): Promise<GitRemoteBranch[]>;
	getBranchHeadSha(
		token: string,
		owner: string,
		repo: string,
		branch: string,
	): Promise<string>;
}

interface GiteaCommitIdentity {
	name?: string;
	email?: string;
	date?: string;
}

interface GiteaCommitShape {
	sha?: string;
	message?: string;
	author?: GiteaCommitIdentity;
	committer?: GiteaCommitIdentity;
	tree?: { sha?: string };
	parents?: Array<{ sha?: string }>;
	verification?: { signature?: string | null; payload?: string | null };
	commit?: {
		message?: string;
		author?: GiteaCommitIdentity;
		committer?: GiteaCommitIdentity;
		tree?: { sha?: string };
	};
}

interface GiteaCompatibleGitRemoteProviderOptions {
	id: string;
	apiName: string;
	displayName: string;
	defaultEndpoint: string;
	apiService: GiteaApiService;
	historyPluginId: string;
	historyTokenSecretKey: string;
	backupPluginId: string;
	backupTokenSecretKey: string;
	endpointSettingId: string;
	timeoutSettingId: string;
}

const isMissingBranchError = (error: unknown): boolean =>
	(error as { status?: number }).status === 404 ||
	/not found|(?:repository|git).*empty|empty.*repository/i.test(String(error));

function normalizeGiteaCommit(
	apiName: string,
	data: GiteaCommitShape,
): GitRemoteCommitObject {
	const details = data.commit ?? data;
	const authorData = details.author ?? {};
	const committerData = details.committer ?? authorData;
	const fallbackDate =
		committerData.date || authorData.date || new Date(0).toISOString();
	if (!data.sha)
		throw new Error(`${apiName} commit response did not include a SHA`);
	const author: GitRemoteSignature = {
		name: authorData.name || 'Unknown',
		email: authorData.email || 'unknown@local',
		date: authorData.date || fallbackDate,
	};
	const committer: GitRemoteSignature = {
		name: committerData.name || author.name,
		email: committerData.email || author.email,
		date: committerData.date || fallbackDate,
	};
	return {
		oid: data.sha,
		message: details.message ?? '',
		parents: (data.parents ?? []).flatMap((parent) =>
			parent.sha ? [parent.sha] : [],
		),
		author,
		committer,
		treeOid: details.tree?.sha,
		...(data.verification?.signature
			? { gpgsig: data.verification.signature }
			: {}),
		...(data.verification?.payload
			? { unsignedPayload: data.verification.payload }
			: {}),
	};
}

export function createGiteaCompatibleGitRemoteProvider({
	id,
	apiName,
	displayName,
	defaultEndpoint,
	apiService,
	historyPluginId,
	historyTokenSecretKey,
	backupPluginId,
	backupTokenSecretKey,
	endpointSettingId,
	timeoutSettingId,
}: GiteaCompatibleGitRemoteProviderOptions): GitRemoteProvider {
	let apiConfiguration: GitRemoteApiConfiguration = {
		endpoint: defaultEndpoint,
		requestTimeout: 30,
	};
	const applyApiConfiguration = (configuration: GitRemoteApiConfiguration) => {
		apiConfiguration = { ...configuration };
		apiService.setBaseUrl(configuration.endpoint);
		apiService.setRequestTimeout(configuration.requestTimeout);
	};
	const repositoryParts = (repositoryId: string) =>
		gitRepositoryParts(repositoryId, apiName);
	const request = <T>(
		token: string,
		endpoint: string,
		options: RequestInit = {},
	) =>
		gitRemoteApiRequest<T>({
			providerName: apiName,
			baseUrl: apiService.getBaseUrl(),
			token,
			endpoint,
			requestTimeout: apiConfiguration.requestTimeout,
			authHeaders: (credential) => ({ Authorization: `token ${credential}` }),
			options,
		});

	const historyTransport: GitRemoteProvider['historyTransport'] = {
		preservesCommitOids: false,
		supportsMergeCommits: false,
		getHead: async (token, repositoryId, branch) => {
			const [owner, repo] = repositoryParts(repositoryId);
			try {
				return await apiService.getBranchHeadSha(token, owner, repo, branch);
			} catch (error) {
				if (isMissingBranchError(error)) return null;
				throw error;
			}
		},
		getCommit: async (token, repositoryId, oid) => {
			const [owner, repo] = repositoryParts(repositoryId);
			const data = await request<GiteaCommitShape>(
				token,
				`repos/${owner}/${repo}/git/commits/${encodeURIComponent(oid)}?stat=false&verification=true&files=false`,
			);
			return normalizeGiteaCommit(apiName, data);
		},
		getTree: async (token, repositoryId, commit) => {
			const [owner, repo] = repositoryParts(repositoryId);
			const entries: GitRemoteTreeEntry[] = [];
			for (let page = 1; ; page += 1) {
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
					`repos/${owner}/${repo}/git/trees/${encodeURIComponent(commit.oid)}?recursive=true&page=${page}&per_page=1000`,
				);
				entries.push(
					...data.tree.map((entry) => ({
						path: entry.path,
						mode: entry.mode,
						type: entry.type,
						oid: entry.sha,
					})),
				);
				if (!data.truncated) break;
				if (data.tree.length === 0)
					throw new Error(
						`${apiName} returned an incomplete paginated Git tree`,
					);
			}
			return entries;
		},
		getBlob: async (token, repositoryId, oid) => {
			const [owner, repo] = repositoryParts(repositoryId);
			const data = await request<{ content: string; encoding?: string }>(
				token,
				`repos/${owner}/${repo}/git/blobs/${encodeURIComponent(oid)}`,
			);
			if (data.encoding && data.encoding !== 'base64') {
				throw new Error(
					`Unsupported ${apiName} blob encoding: ${data.encoding}`,
				);
			}
			return base64ToBytes(data.content);
		},
		createCommit: async (token, repositoryId, input) => {
			if (input.parents.length > 1) {
				throw new Error(
					`${apiName} API transport cannot create multi-parent Git commits`,
				);
			}
			const [owner, repo] = repositoryParts(repositoryId);
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
			for (const change of input.changes) {
				if (change.type !== 'delete' && change.mode !== '100644') {
					throw new Error(
						`${apiName} API transport cannot safely create Git mode ${change.mode ?? 'unknown'} (${change.path})`,
					);
				}
			}
			const files = input.changes.map((change) => ({
				operation: change.type,
				path: change.path,
				...(change.previousOid ? { sha: change.previousOid } : {}),
				...(change.type === 'delete'
					? {}
					: {
							content: toBase64(change.content ?? new Uint8Array()),
							encoding: 'base64' as const,
						}),
			}));
			const data = await request<{ commit: GiteaCommitShape }>(
				token,
				`repos/${owner}/${repo}/contents`,
				{
					method: 'POST',
					body: JSON.stringify({
						branch: input.branch,
						message: input.message,
						author: { name: input.author.name, email: input.author.email },
						committer: {
							name: input.committer.name,
							email: input.committer.email,
						},
						dates: {
							author: input.author.date,
							committer: input.committer.date,
						},
						force_push: false,
						signoff: false,
						files,
					}),
				},
			);
			return normalizeGiteaCommit(apiName, data.commit);
		},
	};

	return {
		id,
		displayName,
		historyPluginId,
		historyTokenSecretKey,
		backupPluginId,
		backupTokenSecretKey,
		configure: (getSetting) => {
			applyApiConfiguration({
				endpoint:
					(getSetting(endpointSettingId)?.value as string) || defaultEndpoint,
				requestTimeout: (getSetting(timeoutSettingId)?.value as number) || 30,
			});
		},
		getApiConfiguration: () => ({ ...apiConfiguration }),
		applyApiConfiguration,
		testConnection: (token) => apiService.testConnection(token),
		listRepositories: async (token): Promise<GitRemoteRepository[]> =>
			(await apiService.getRepositories(token)).map((repository) => ({
				id: repository.full_name,
				label: repository.full_name,
				private: repository.private,
				defaultBranch: repository.default_branch,
			})),
		listBranches: async (token, repositoryId) => {
			const [owner, repo] = repositoryParts(repositoryId);
			try {
				return await apiService.getBranches(token, owner, repo);
			} catch (error) {
				if (isMissingBranchError(error)) return [];
				throw error;
			}
		},
		createBranch: async (token, repositoryId, branch, sourceRef) => {
			const [owner, repo] = repositoryParts(repositoryId);
			await request(token, `repos/${owner}/${repo}/branches`, {
				method: 'POST',
				body: JSON.stringify({
					new_branch_name: branch,
					old_ref_name: sourceRef,
				}),
			});
		},
		normalizeRepositoryInput: normalizeGitRepositoryInput,
		historyTransport,
	};
}

export const giteaGitRemoteProvider = createGiteaCompatibleGitRemoteProvider({
	id: 'gitea',
	apiName: 'Gitea',
	displayName: 'Gitea',
	defaultEndpoint: 'https://gitea.com/api/v1',
	apiService: giteaAPIService,
	historyPluginId: 'texlyre-gitea-history',
	historyTokenSecretKey: 'gitea-history-token',
	backupPluginId: 'texlyre-gitea-backup',
	backupTokenSecretKey: 'gitea-token',
	endpointSettingId: 'gitea-backup-api-endpoint',
	timeoutSettingId: 'gitea-backup-request-timeout',
});
