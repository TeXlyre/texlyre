import { createHash } from 'crypto';

const mockGetGitRemoteProviders = jest.fn();

const mockFileSystem = {
	fs: {},
	flush: jest.fn(async () => undefined),
};

const localCommits = new Map<string, any>();
const localTrees = new Map<string, any[]>();
const localBlobs = new Map<string, Uint8Array>();
const importedCommits = new Set<string>();

const mockGit = {
	readCommit: jest.fn(async ({ oid }: { oid: string }) => {
		const commit = localCommits.get(oid);
		if (!commit && !importedCommits.has(oid)) throw new Error('not found');
		if (commit) return { oid, commit };
		throw new Error(`missing mock commit ${oid}`);
	}),
	readTree: jest.fn(async ({ oid }: { oid: string }) => ({
		oid,
		tree: localTrees.get(oid) ?? [],
	})),
	readBlob: jest.fn(async ({ oid }: { oid: string }) => ({
		oid,
		blob: localBlobs.get(oid) ?? new Uint8Array(),
	})),
	readObject: jest.fn(async ({ oid }: { oid: string }) => {
		const blob = localBlobs.get(oid);
		if (!blob) throw new Error('not found');
		return { oid, type: 'blob', format: 'content', object: blob };
	}),
	writeBlob: jest.fn(async () => 'remote-blob'),
	writeTree: jest.fn(async () => 'remote-tree'),
	writeCommit: jest.fn(async () => 'remote-head'),
	writeObject: jest.fn(async () => 'remote-head'),
	listBranches: jest.fn(async () => [] as string[]),
	branch: jest.fn(async () => undefined),
	deleteBranch: jest.fn(async () => undefined),
	writeRef: jest.fn(async () => undefined),
	checkout: jest.fn(async () => undefined),
};

const mockGitService = {
	isInitialized: jest.fn(async () => true),
	initialize: jest.fn(async () => undefined),
	getCurrentBranch: jest.fn(async () => 'main'),
	getHeadOid: jest.fn(async () => 'local-head'),
	getWorktreeBaseOid: jest.fn(async () => 'local-head'),
	getChanges: jest.fn(async () => []),
};

jest.mock('isomorphic-git', () => mockGit);
jest.mock('../../src/plugins/PluginRegistry', () => ({
	pluginRegistry: {
		getGitRemoteProviders: mockGetGitRemoteProviders,
	},
}));
jest.mock('../../src/services/GitFileSystemService', () => ({
	gitFileSystemService: { get: () => mockFileSystem },
}));
jest.mock('../../src/services/GitService', () => ({ gitService: mockGitService }));
jest.mock('../../src/services/FileHandlerService', () => ({
	fileHandlerService: {
		hasWorkspace: () => false,
		mirrorFiles: jest.fn(async () => undefined),
	},
}));
jest.mock('../../src/services/FileStoreService', () => ({
	fileStoreService: { getAllFiles: jest.fn(async () => []) },
}));

import { gitSyncService } from '../../src/services/GitSyncService';

const remoteCommit = {
	oid: 'remote-head',
	message: 'Remote commit',
	parents: ['remote-base'],
	author: {
		name: 'Author',
		email: 'author@example.com',
		date: '2026-09-09T10:00:00+00:00',
	},
	committer: {
		name: 'Author',
		email: 'author@example.com',
		date: '2026-09-09T10:00:00+00:00',
	},
	treeOid: 'remote-tree',
};

const transport = {
	preservesCommitOids: true,
	supportsMergeCommits: false,
	getHead: jest.fn(async () => 'remote-base' as string | null),
	getCommit: jest.fn(async (_token: string, _repo: string, oid: string) => ({
		...remoteCommit,
		oid,
		parents: oid === 'remote-base' ? [] : ['remote-base'],
	})),
	getTree: jest.fn(async (_token: string, _repo: string, commit: any) =>
		commit.oid === 'remote-base'
			? []
			: [{ path: 'main.tex', mode: '100644', type: 'blob', oid: 'remote-blob' }],
	),
	getBlob: jest.fn(async () => new TextEncoder().encode('remote')),
	createCommit: jest.fn(async () => remoteCommit),
};

const provider = {
	id: 'github',
	displayName: 'GitHub',
	historyPluginId: 'texlyre-github-history',
	historyTokenSecretKey: 'github-history-token',
	backupPluginId: 'texlyre-github-backup',
	backupTokenSecretKey: 'github-token',
	testConnection: jest.fn(),
	listRepositories: jest.fn(),
	listBranches: jest.fn(),
	getApiConfiguration: () => ({
		endpoint: 'https://api.github.com',
		requestTimeout: 30,
	}),
	applyApiConfiguration: jest.fn(),
	historyTransport: transport,
};

const config = {
	providerId: 'github',
	providerName: 'GitHub',
	apiConfiguration: {
		endpoint: 'https://api.github.com',
		requestTimeout: 30,
	},
	repositoryId: 'owner/repo',
	repositoryLabel: 'owner/repo',
	branch: 'main',
	credentialSource: 'history' as const,
	credentialRef: {
		pluginId: 'texlyre-github-history',
		secretKey: 'github-history-token',
		scope: 'project' as const,
	},
};

const secrets = {
	getSecret: jest.fn(async () => ({
		value: 'secret-token',
		lastModified: 1,
	})),
} as never;

const signature = {
	name: 'Author',
	email: 'author@example.com',
	timestamp: 1788948000,
	timezoneOffset: 0,
};

const resetLocalHistory = () => {
	localCommits.clear();
	localTrees.clear();
	localBlobs.clear();
	importedCommits.clear();
	localCommits.set('remote-base', {
		tree: 'base-tree',
		parent: [],
		message: 'Base',
		author: signature,
		committer: signature,
	});
	localCommits.set('local-head', {
		tree: 'local-tree',
		parent: ['remote-base'],
		message: 'Local commit',
		author: signature,
		committer: signature,
	});
	localTrees.set('base-tree', [
		{
			path: 'main.tex',
			type: 'blob',
			mode: '100644',
			oid: 'base-blob',
		},
	]);
	localTrees.set('local-tree', [
		{
			path: 'main.tex',
			type: 'blob',
			mode: '100644',
			oid: 'local-blob',
		},
	]);
	localBlobs.set('base-blob', new TextEncoder().encode('base'));
	localBlobs.set('local-blob', new TextEncoder().encode('local'));
};

describe('GitSyncService configuration and credentials', () => {
	const makeSecrets = () => ({
		hasSecret: jest.fn(() => false),
		getSecret: jest.fn(async () => null),
		setSecret: jest.fn(async () => undefined),
		removeSecret: jest.fn(async () => undefined),
	});

	beforeEach(() => {
		localStorage.clear();
		jest.clearAllMocks();
		provider.id = 'github';
		provider.displayName = 'GitHub';
		mockGetGitRemoteProviders.mockReturnValue([provider]);
		provider.testConnection.mockResolvedValue(true);
	});

	it('stores a connected remote and its new History credential together', async () => {
		const credentialSecrets = makeSecrets();

		await gitSyncService.connect(
			'project-1',
			{
				providerId: 'github',
				repositoryId: 'owner/repo',
				repositoryLabel: 'owner/repo',
				branch: 'main',
			},
			{ source: 'new', token: 'history-token' },
			credentialSecrets as never,
		);

		expect(credentialSecrets.setSecret).toHaveBeenCalledWith(
			'texlyre-github-history',
			'github-history-token',
			'history-token',
			expect.objectContaining({ scope: 'project', projectId: 'project-1' }),
		);
		expect(gitSyncService.getConfig('project-1')).toEqual(
			expect.objectContaining({
				providerName: 'GitHub',
				repositoryLabel: 'owner/repo',
				branch: 'main',
				apiConfiguration: {
					endpoint: 'https://api.github.com',
					requestTimeout: 30,
				},
			}),
		);
	});

	it('reuses Backup credentials without copying them into History', async () => {
		const credentialSecrets = makeSecrets();
		credentialSecrets.hasSecret.mockImplementation(
			(pluginId: string, _key: string, options?: { scope?: string }) =>
				pluginId === provider.historyPluginId || options?.scope === 'global',
		);
		credentialSecrets.getSecret.mockResolvedValue({
			value: 'backup-token',
			lastModified: 1,
		});

		await expect(
			gitSyncService.getCredentialOptions(
				'github',
				'project-1',
				credentialSecrets as never,
			),
		).resolves.toEqual([
			{ id: 'new', label: 'New credential' },
			{ id: 'history', label: 'Git History credential' },
			{ id: 'backup-global', label: 'Backup credential (global)' },
		]);
		expect(credentialSecrets.getSecret).not.toHaveBeenCalled();

		await gitSyncService.connect(
			'project-1',
			{
				providerId: 'github',
				repositoryId: 'owner/repo',
				repositoryLabel: 'owner/repo',
				branch: 'main',
			},
			{ source: 'backup-project', token: '' },
			credentialSecrets as never,
		);

		expect(credentialSecrets.setSecret).not.toHaveBeenCalled();
		expect(gitSyncService.getConfig('project-1')?.credentialSource).toBe(
			'backup-project',
		);
	});

	it('fills provider metadata missing from an existing remote config', async () => {
		localStorage.setItem(
			'texlyre-git-remote:project-1',
			JSON.stringify({
				providerId: 'github',
				repositoryId: 'owner/repo',
				repositoryLabel: 'owner/repo',
				branch: 'main',
				credentialSource: 'history',
			}),
		);

		await expect(
			gitSyncService.prepareConfiguredRemote('project-1', () => undefined),
		).resolves.toEqual(
			expect.objectContaining({
				providerName: 'GitHub',
				apiConfiguration: {
					endpoint: 'https://api.github.com',
					requestTimeout: 30,
				},
				credentialRef: {
					pluginId: 'texlyre-github-history',
					secretKey: 'github-history-token',
					scope: 'project',
				},
			}),
		);
	});
});

describe('GitSyncService API transport', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		(global.crypto.subtle.digest as jest.Mock).mockImplementation(
			async (_algorithm: AlgorithmIdentifier, data: BufferSource) => {
				const bytes =
					data instanceof ArrayBuffer
						? new Uint8Array(data)
						: new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
				const hash = createHash('sha1').update(bytes).digest();
				return hash.buffer.slice(
					hash.byteOffset,
					hash.byteOffset + hash.byteLength,
				);
			},
		);
		resetLocalHistory();
		provider.id = 'github';
		provider.displayName = 'GitHub';
		mockGetGitRemoteProviders.mockReturnValue([provider]);
		localStorage.clear();
		localStorage.setItem('texlyre-git-remote:project-1', JSON.stringify(config));
		mockGitService.isInitialized.mockResolvedValue(true);
		mockGitService.getCurrentBranch.mockResolvedValue('main');
		mockGitService.getHeadOid.mockResolvedValue('local-head');
		mockGitService.getWorktreeBaseOid.mockResolvedValue('local-head');
		mockGitService.getChanges.mockResolvedValue([]);
		transport.preservesCommitOids = true;
		transport.supportsMergeCommits = false;
		transport.getHead.mockResolvedValue('remote-base');
		transport.getCommit.mockImplementation(async (_token, _repo, oid) => ({
			...remoteCommit,
			oid,
			parents: oid === 'remote-base' ? [] : ['remote-base'],
		}));
		transport.getTree.mockImplementation(async (_token, _repo, commit: any) =>
			commit.oid === 'remote-base'
				? []
				: [
						{
							path: 'main.tex',
							mode: '100644',
							type: 'blob',
							oid: 'remote-blob',
						},
					],
		);
		transport.getBlob.mockResolvedValue(new TextEncoder().encode('remote'));
		transport.createCommit.mockResolvedValue(remoteCommit);
		mockGit.writeBlob.mockResolvedValue('remote-blob');
		mockGit.writeTree.mockResolvedValue('remote-tree');
		mockGit.writeObject.mockResolvedValue('remote-head');
		mockGit.writeCommit.mockImplementation(async ({ commit }: { commit: any }) => {
			importedCommits.add('remote-head');
			localCommits.set('remote-head', commit);
			return 'remote-head';
		});
	});

	it('uses the provider API configuration and saved credential', async () => {
		mockGitService.getHeadOid.mockResolvedValue('remote-base');
		transport.getHead.mockResolvedValue('remote-base');

		await gitSyncService.push('project-1', secrets);

		expect(provider.applyApiConfiguration).toHaveBeenCalledWith(
			config.apiConfiguration,
		);
		expect((secrets as any).getSecret).toHaveBeenCalledWith(
			'texlyre-github-history',
			'github-history-token',
			{ scope: 'project', projectId: 'project-1' },
		);
	});

	it('does not pull over local uncommitted changes', async () => {
		mockGitService.getChanges.mockResolvedValue([
			{ path: 'main.tex', type: 'modified' },
		]);

		await expect(
			gitSyncService.fetchForMerge('project-1', secrets),
		).rejects.toThrow('Commit or restore the current changes');
		expect(transport.getHead).toHaveBeenCalled();
	});

	it('allows an uncommitted initialized project to adopt remote history', async () => {
		mockGitService.getHeadOid.mockResolvedValue(null);
		mockGitService.getChanges.mockResolvedValue([
			{ path: 'main.tex', type: 'modified' },
		]);
		transport.getHead.mockResolvedValue('remote-head');

		const fetched = await gitSyncService.fetchForMerge('project-1', secrets);

		expect(fetched?.remoteOid).toBe('remote-head');
		expect(mockGitService.getChanges).not.toHaveBeenCalled();
		await expect(
			gitSyncService.adoptFetched('project-1', fetched!),
		).resolves.toBeUndefined();
		expect(mockGit.checkout).toHaveBeenCalledWith(
			expect.objectContaining({ ref: 'main', force: true }),
		);
	});

	it('imports the remote API commit through a temporary local branch', async () => {
		transport.getHead.mockResolvedValue('remote-head');
		transport.getCommit.mockImplementation(async (_token, _repo, oid) =>
			oid === 'remote-base'
				? {
						...remoteCommit,
						oid: 'remote-base',
						parents: [],
						treeOid: 'base-tree',
					}
				: remoteCommit,
		);

		const result = await gitSyncService.fetchForMerge('project-1', secrets);

		expect(transport.getCommit).toHaveBeenCalledWith(
			'secret-token',
			'owner/repo',
			'remote-head',
		);
		expect(mockGit.branch).toHaveBeenCalledWith(
			expect.objectContaining({
				ref: 'origin/main',
				object: 'remote-head',
				checkout: false,
			}),
		);
		expect(result?.remoteOid).toBe('remote-head');
	});

	it('keeps remote and local sync identities separate for normalized providers', async () => {
		transport.preservesCommitOids = false;
		transport.getHead.mockResolvedValue('gitlab-remote-head');
		transport.getCommit.mockResolvedValue({
			...remoteCommit,
			oid: 'gitlab-remote-head',
			parents: [],
			treeOid: 'remote-tree',
		});
		transport.getTree.mockResolvedValue([
			{
				path: 'main.tex',
				mode: '100644',
				type: 'blob',
				oid: 'remote-blob',
			},
		]);
		mockGit.writeCommit.mockImplementation(async ({ commit }: { commit: any }) => {
			localCommits.set('gitlab-local-head', commit);
			return 'gitlab-local-head';
		});

		const result = await gitSyncService.fetchForMerge('project-1', secrets);

		expect(result).toEqual(
			expect.objectContaining({
				remoteOid: 'gitlab-remote-head',
				localOid: 'gitlab-local-head',
			}),
		);
		expect(mockGit.branch).toHaveBeenCalledWith(
			expect.objectContaining({
				ref: 'origin/main',
				object: 'gitlab-local-head',
			}),
		);
		expect(mockGit.writeObject).not.toHaveBeenCalled();

		gitSyncService.markFetchedSynced('project-1', result!);
		expect(gitSyncService.getConfig('project-1')?.syncBase).toEqual({
			localOid: 'gitlab-local-head',
			remoteOid: 'gitlab-remote-head',
		});
	});

	it('accepts a different remote tree OID for normalized providers', async () => {
		transport.preservesCommitOids = false;
		transport.getHead.mockResolvedValue('forgejo-remote-head');
		transport.getCommit.mockResolvedValue({
			...remoteCommit,
			oid: 'forgejo-remote-head',
			parents: [],
			treeOid: 'forgejo-tree',
		});
		transport.getTree.mockResolvedValue([
			{
				path: 'main.tex',
				mode: '100644',
				type: 'blob',
				oid: 'remote-blob',
			},
		]);
		mockGit.writeTree.mockResolvedValue('local-tree');
		mockGit.writeCommit.mockImplementation(async ({ commit }: { commit: any }) => {
			localCommits.set('forgejo-local-head', commit);
			return 'forgejo-local-head';
		});

		const result = await gitSyncService.fetchForMerge('project-1', secrets);

		expect(result).toEqual(
			expect.objectContaining({
				remoteOid: 'forgejo-remote-head',
				localOid: 'forgejo-local-head',
			}),
		);
		expect(mockGit.writeObject).not.toHaveBeenCalled();
	});

	it('adopts a server-created SHA as the canonical local branch after push', async () => {
		const canonicalRemote = { ...remoteCommit, treeOid: 'local-tree' };
		transport.getHead
			.mockResolvedValueOnce('remote-base')
			.mockResolvedValueOnce('remote-head');
		transport.createCommit.mockResolvedValue(canonicalRemote);
		transport.getCommit.mockImplementation(async (_token, _repo, oid) =>
			oid === 'remote-base'
				? {
						...remoteCommit,
						oid: 'remote-base',
						parents: [],
						treeOid: 'base-tree',
					}
				: canonicalRemote,
		);
		transport.getTree.mockImplementation(async (_token, _repo, commit: any) =>
			commit.oid === 'remote-base'
				? [
						{
							path: 'main.tex',
							mode: '100644',
							type: 'blob',
							oid: 'base-blob',
						},
					]
				: [
						{
							path: 'main.tex',
							mode: '100644',
							type: 'blob',
							oid: 'local-blob',
						},
					],
		);
		transport.getBlob.mockImplementation(async (_token, _repo, oid) =>
			oid === 'local-blob'
				? new TextEncoder().encode('local')
				: new TextEncoder().encode('base'),
		);
		mockGit.writeBlob.mockResolvedValue('local-blob');
		mockGit.writeTree.mockResolvedValue('local-tree');

		const result = await gitSyncService.push('project-1', secrets);

		expect(transport.createCommit).toHaveBeenCalledWith(
			'secret-token',
			'owner/repo',
			expect.objectContaining({
				branch: 'main',
				parents: ['remote-base'],
				message: 'Local commit',
			}),
		);
		expect(mockGit.writeRef).toHaveBeenCalledWith(
			expect.objectContaining({
				ref: 'refs/heads/main',
				value: 'remote-head',
				force: true,
			}),
		);
		expect(mockGit.writeRef).toHaveBeenCalledWith(
			expect.objectContaining({
				ref: 'refs/texlyre/worktree-base',
				value: 'remote-head',
			}),
		);
		expect(result).toEqual(
			expect.objectContaining({
				previousLocalOid: 'local-head',
				canonicalOid: 'remote-head',
				pushedCommits: 1,
			}),
		);
	});

	it('pushes from a normalized sync base without requiring the remote OID locally', async () => {
		transport.preservesCommitOids = false;
		localStorage.setItem(
			'texlyre-git-remote:project-1',
			JSON.stringify({
				...config,
				syncBase: {
					localOid: 'local-base',
					remoteOid: 'remote-base',
				},
			}),
		);
		localCommits.delete('remote-base');
		localCommits.set('local-base', {
			tree: 'base-tree',
			parent: [],
			message: 'Base',
			author: signature,
			committer: signature,
		});
		localCommits.set('local-head', {
			tree: 'local-tree',
			parent: ['local-base'],
			message: 'Local commit',
			author: signature,
			committer: signature,
		});
		const created = {
			...remoteCommit,
			oid: 'remote-head',
			treeOid: 'local-tree',
		};
		transport.getHead
			.mockResolvedValueOnce('remote-base')
			.mockResolvedValueOnce('remote-head');
		transport.createCommit.mockResolvedValue(created);
		transport.getCommit.mockResolvedValue(created);
		transport.getTree.mockResolvedValue([
			{
				path: 'main.tex',
				mode: '100644',
				type: 'blob',
				oid: 'local-blob',
			},
		]);
		mockGit.writeBlob.mockResolvedValue('local-blob');
		mockGit.writeTree.mockResolvedValue('local-tree');
		mockGit.writeCommit.mockImplementation(async ({ commit }: { commit: any }) => {
			localCommits.set('canonical-local-head', commit);
			return 'canonical-local-head';
		});

		const result = await gitSyncService.push('project-1', secrets);

		expect(transport.createCommit).toHaveBeenCalledWith(
			'secret-token',
			'owner/repo',
			expect.objectContaining({ parents: ['remote-base'] }),
		);
		expect(result.canonicalOid).toBe('canonical-local-head');
		expect(gitSyncService.getConfig('project-1')?.syncBase).toEqual({
			localOid: 'canonical-local-head',
			remoteOid: 'remote-head',
		});
	});

	it('keeps the original remote tip as the ref race guard while creating a DAG', async () => {
		transport.supportsMergeCommits = true;
		localCommits.set('local-one', {
			tree: 'tree-one',
			parent: ['remote-base'],
			message: 'One',
			author: signature,
			committer: signature,
		});
		localCommits.set('local-head', {
			tree: 'local-tree',
			parent: ['local-one'],
			message: 'Two',
			author: signature,
			committer: signature,
		});
		localTrees.set('tree-one', [
			{
				path: 'main.tex',
				type: 'blob',
				mode: '100644',
				oid: 'one-blob',
			},
		]);
		localBlobs.set('one-blob', new TextEncoder().encode('one'));

		const remoteOne = {
			...remoteCommit,
			oid: 'remote-one',
			message: 'One',
			parents: ['remote-base'],
			treeOid: 'tree-one',
		};
		const remoteTwo = {
			...remoteCommit,
			message: 'Two',
			parents: ['remote-one'],
			treeOid: 'local-tree',
		};
		transport.getHead
			.mockResolvedValueOnce('remote-base')
			.mockResolvedValueOnce('remote-head');
		transport.createCommit
			.mockResolvedValueOnce(remoteOne)
			.mockResolvedValueOnce(remoteTwo);
		transport.getCommit.mockImplementation(async (_token, _repo, oid) =>
			oid === 'remote-one'
				? remoteOne
				: oid === 'remote-head'
					? remoteTwo
					: remoteCommit,
		);
		transport.getTree.mockImplementation(async (_token, _repo, commit: any) =>
			commit.oid === 'remote-one'
				? [
						{
							path: 'main.tex',
							mode: '100644',
							type: 'blob',
							oid: 'one-blob',
						},
					]
				: [
						{
							path: 'main.tex',
							mode: '100644',
							type: 'blob',
							oid: 'local-blob',
						},
					],
		);
		mockGit.writeTree
			.mockResolvedValueOnce('tree-one')
			.mockResolvedValueOnce('local-tree');
		mockGit.writeCommit.mockImplementation(async ({ commit }: { commit: any }) => {
			const oid = commit.message === 'One' ? 'remote-one' : 'remote-head';
			localCommits.set(oid, commit);
			return oid;
		});

		await gitSyncService.push('project-1', secrets);

		expect(transport.createCommit).toHaveBeenNthCalledWith(
			1,
			'secret-token',
			'owner/repo',
			expect.objectContaining({
				parents: ['remote-base'],
				expectedBranchHead: 'remote-base',
				updateBranch: false,
			}),
		);
		expect(transport.createCommit).toHaveBeenNthCalledWith(
			2,
			'secret-token',
			'owner/repo',
			expect.objectContaining({
				parents: ['remote-one'],
				expectedBranchHead: 'remote-base',
				updateBranch: true,
			}),
		);
	});

	it('advances an empty remote branch while pushing multiple commits', async () => {
		transport.supportsMergeCommits = true;
		localCommits.set('local-one', {
			tree: 'tree-one',
			parent: [],
			message: 'One',
			author: signature,
			committer: signature,
		});
		localCommits.set('local-head', {
			tree: 'local-tree',
			parent: ['local-one'],
			message: 'Two',
			author: signature,
			committer: signature,
		});
		localTrees.set('tree-one', [
			{
				path: 'main.tex',
				type: 'blob',
				mode: '100644',
				oid: 'one-blob',
			},
		]);
		localBlobs.set('one-blob', new TextEncoder().encode('one'));
		transport.getHead
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce('local-head');
		transport.createCommit
			.mockResolvedValueOnce({
				...remoteCommit,
				oid: 'local-one',
				message: 'One',
				parents: [],
				treeOid: 'tree-one',
			})
			.mockResolvedValueOnce({
				...remoteCommit,
				oid: 'local-head',
				message: 'Two',
				parents: ['local-one'],
				treeOid: 'local-tree',
			});

		await gitSyncService.push('project-1', secrets);

		expect(transport.createCommit).toHaveBeenNthCalledWith(
			1,
			'secret-token',
			'owner/repo',
			expect.objectContaining({
				parents: [],
				expectedBranchHead: null,
				updateBranch: true,
			}),
		);
		expect(transport.createCommit).toHaveBeenNthCalledWith(
			2,
			'secret-token',
			'owner/repo',
			expect.objectContaining({
				parents: ['local-one'],
				expectedBranchHead: 'local-one',
				updateBranch: true,
			}),
		);
	});

	it('pushes a root commit to an empty remote and adopts the server-created root', async () => {
		localCommits.set('local-head', {
			tree: 'local-tree',
			parent: [],
			message: 'Initial commit',
			author: signature,
			committer: signature,
		});
		const createdRoot = {
			...remoteCommit,
			parents: [],
			treeOid: 'local-tree',
		};
		transport.getHead
			.mockResolvedValueOnce(null)
			.mockResolvedValueOnce('remote-head');
		transport.createCommit.mockResolvedValue(createdRoot);
		transport.getCommit.mockResolvedValue(createdRoot);
		transport.getTree.mockResolvedValue([
			{
				path: 'main.tex',
				mode: '100644',
				type: 'blob',
				oid: 'local-blob',
			},
		]);
		mockGit.writeTree.mockResolvedValue('local-tree');

		const result = await gitSyncService.push('project-1', secrets);

		expect(transport.createCommit).toHaveBeenCalledWith(
			'secret-token',
			'owner/repo',
			expect.objectContaining({
				parents: [],
				changes: [
					expect.objectContaining({
						path: 'main.tex',
						type: 'create',
					}),
				],
			}),
		);
		expect(result.canonicalOid).toBe('remote-head');
	});

	it('does not rewrite local history when the provider changes the parent', async () => {
		transport.getHead.mockResolvedValueOnce('remote-base');
		transport.createCommit.mockResolvedValue({
			...remoteCommit,
			parents: ['other-remote-head'],
			treeOid: 'local-tree',
		});

		await expect(gitSyncService.push('project-1', secrets)).rejects.toThrow(
			'Remote branch changed while the push was being created',
		);
		expect(mockGit.writeRef).not.toHaveBeenCalledWith(
			expect.objectContaining({ ref: 'refs/heads/main' }),
		);
	});

	it('does not adopt a server commit when the provider changed the file snapshot', async () => {
		const changedSnapshot = {
			...remoteCommit,
			treeOid: 'different-tree',
		};
		transport.getHead.mockResolvedValueOnce('remote-base');
		transport.createCommit.mockResolvedValue(changedSnapshot);
		transport.getCommit.mockImplementation(async (_token, _repo, oid) =>
			oid === 'remote-base'
				? {
						...remoteCommit,
						oid: 'remote-base',
						parents: [],
						treeOid: 'base-tree',
					}
				: changedSnapshot,
		);
		transport.getTree.mockResolvedValue([
			{
				path: 'main.tex',
				mode: '100644',
				type: 'blob',
				oid: 'different-blob',
			},
		]);
		transport.getBlob.mockResolvedValue(
			new TextEncoder().encode('different'),
		);
		mockGit.writeBlob.mockResolvedValue('different-blob');
		mockGit.writeTree.mockResolvedValue('different-tree');

		await expect(gitSyncService.push('project-1', secrets)).rejects.toThrow(
			'The provider changed the pushed file tree',
		);
	});

	it('linearizes a synchronized pull merge for a normalized provider', async () => {
		transport.preservesCommitOids = false;
		localStorage.setItem(
			'texlyre-git-remote:project-1',
			JSON.stringify({
				...config,
				syncBase: {
					localOid: 'pulled-local',
					remoteOid: 'remote-pulled',
				},
			}),
		);
		mockGitService.getHeadOid.mockResolvedValue('merge-head');
		mockGitService.getWorktreeBaseOid.mockResolvedValue('merge-head');
		localCommits.set('pulled-local', {
			tree: 'pulled-tree',
			parent: [],
			message: 'Pulled remote',
			author: signature,
			committer: signature,
		});
		localCommits.set('local-side', {
			tree: 'local-side-tree',
			parent: [],
			message: 'Local work',
			author: signature,
			committer: signature,
		});
		localCommits.set('merge-head', {
			tree: 'merge-tree',
			parent: ['local-side', 'pulled-local'],
			message: 'Merge remote changes',
			author: signature,
			committer: signature,
		});
		localTrees.set('pulled-tree', [
			{
				path: 'main.tex',
				type: 'blob',
				mode: '100644',
				oid: 'pulled-blob',
			},
		]);
		localTrees.set('merge-tree', [
			{
				path: 'main.tex',
				type: 'blob',
				mode: '100644',
				oid: 'merged-blob',
			},
		]);
		localBlobs.set('pulled-blob', new TextEncoder().encode('remote'));
		localBlobs.set('merged-blob', new TextEncoder().encode('resolved'));

		const created = {
			...remoteCommit,
			oid: 'remote-merged',
			parents: ['remote-pulled'],
			treeOid: 'server-tree',
			message: 'Merge remote changes',
		};
		transport.getHead
			.mockResolvedValueOnce('remote-pulled')
			.mockResolvedValueOnce('remote-merged');
		transport.createCommit.mockResolvedValue(created);
		transport.getCommit.mockResolvedValue(created);
		transport.getTree.mockResolvedValue([
			{
				path: 'main.tex',
				mode: '100644',
				type: 'blob',
				oid: 'merged-blob',
			},
		]);
		transport.getBlob.mockResolvedValue(new TextEncoder().encode('resolved'));
		mockGit.writeBlob.mockResolvedValue('merged-blob');
		mockGit.writeTree.mockResolvedValue('merge-tree');
		mockGit.writeCommit.mockImplementation(async ({ commit }: { commit: any }) => {
			localCommits.set('canonical-merge', commit);
			return 'canonical-merge';
		});

		const result = await gitSyncService.push('project-1', secrets);

		expect(transport.createCommit).toHaveBeenCalledWith(
			'secret-token',
			'owner/repo',
			expect.objectContaining({
				parents: ['remote-pulled'],
				message: 'Merge remote changes',
				changes: [
					expect.objectContaining({
						path: 'main.tex',
						type: 'update',
						previousOid: 'pulled-blob',
						content: new TextEncoder().encode('resolved'),
					}),
				],
			}),
		);
		expect(mockGit.writeRef).not.toHaveBeenCalledWith(
			expect.objectContaining({ ref: 'refs/heads/main' }),
		);
		expect(gitSyncService.getConfig('project-1')?.syncBase).toEqual({
			localOid: 'merge-head',
			remoteOid: 'remote-merged',
		});
		expect(result).toEqual(
			expect.objectContaining({
				previousLocalOid: 'merge-head',
				canonicalOid: 'merge-head',
				pushedCommits: 1,
			}),
		);
	});

	it('still refuses to flatten an unrelated local merge for a normalized provider', async () => {
		transport.preservesCommitOids = false;
		localCommits.set('local-one', {
			tree: 'local-one-tree',
			parent: ['remote-base'],
			message: 'Local work',
			author: signature,
			committer: signature,
		});
		localCommits.set('topic-head', {
			tree: 'topic-tree',
			parent: ['remote-base'],
			message: 'Topic',
			author: signature,
			committer: signature,
		});
		localCommits.set('local-head', {
			tree: 'local-tree',
			parent: ['local-one', 'topic-head'],
			message: 'Merge topic',
			author: signature,
			committer: signature,
		});

		await expect(gitSyncService.push('project-1', secrets)).rejects.toThrow(
			'cannot create a multi-parent Git commit without flattening history',
		);
		expect(transport.createCommit).not.toHaveBeenCalled();
	});

	it('treats an empty remote branch as a pull no-op even with local edits', async () => {
		transport.getHead.mockResolvedValue(null);
		mockGitService.getChanges.mockResolvedValue([
			{ path: 'main.tex', type: 'modified' },
		]);

		await expect(
			gitSyncService.fetchForMerge('project-1', secrets),
		).resolves.toBeNull();
		expect(mockGitService.getChanges).not.toHaveBeenCalled();
		expect(transport.getCommit).not.toHaveBeenCalled();
	});

	it('recovers a timezone normalized by GitHub and preserves the exact remote commit ID', async () => {
		const oid = '197644c7f862efb3a139b442d9d82a8e8a1b7680';
		const parent = '12f8fbf9af49f74a3604dae93b672294fd05ad98';
		const treeOid = 'cce291a2604f0970c281d7b68a0f02c433b45dc8';
		localCommits.set(parent, {
			tree: 'parent-tree',
			parent: [],
			message: 'Parent',
			author: signature,
			committer: signature,
		});
		transport.getHead.mockResolvedValue(oid);
		transport.getCommit.mockResolvedValue({
			oid,
			message: 'Added support for changing PRF while the user is logged in',
			parents: [parent],
			author: {
				name: 'abawi',
				email: 'fares.abawi@uni-hamburg.de',
				date: '2026-07-21T08:40:09Z',
			},
			committer: {
				name: 'abawi',
				email: 'fares.abawi@uni-hamburg.de',
				date: '2026-07-21T08:40:09Z',
			},
			treeOid,
		});
		transport.getTree.mockResolvedValue([]);
		mockGit.writeTree.mockResolvedValue(treeOid);
		mockGit.writeCommit.mockResolvedValue('different-local-oid');
		mockGit.writeObject.mockImplementation(
			async ({ object }: { object: Uint8Array }) => {
				const raw = new TextDecoder().decode(object);
				expect(raw).toContain(
					'author abawi <fares.abawi@uni-hamburg.de> 1784623209 +0200',
				);
				expect(raw).toContain(
					'committer abawi <fares.abawi@uni-hamburg.de> 1784623209 +0200',
				);
				expect(
					raw.endsWith(
						'Added support for changing PRF while the user is logged in\n',
					),
				).toBe(true);
				return oid;
			},
		);

		const result = await gitSyncService.fetchForMerge('project-1', secrets);

		expect(result?.remoteOid).toBe(oid);
		expect(mockGit.writeObject).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'commit', format: 'content' }),
		);
	});

	it('writes a signed provider payload as the exact raw Git commit object', async () => {
		const oid = '676716ed46f8bc755f0e7f99d885e130b75f9f87';
		const parent = '2222222222222222222222222222222222222222';
		const treeOid = '1111111111111111111111111111111111111111';
		const payload =
			`tree ${treeOid}\n` +
			`parent ${parent}\n` +
			'author A <a@example.com> 1788974336 +0000\n' +
			'committer GitHub <noreply@github.com> 1788974336 +0000\n\n' +
			'Web commit';
		const gpgsig =
			'-----BEGIN PGP SIGNATURE-----\n\nabc\n=xyz\n-----END PGP SIGNATURE-----\n';
		localCommits.set(parent, {
			tree: 'parent-tree',
			parent: [],
			message: 'Parent',
			author: signature,
			committer: signature,
		});
		transport.getHead.mockResolvedValue(oid);
		transport.getCommit.mockResolvedValue({
			oid,
			message: 'Web commit',
			parents: [parent],
			author: {
				name: 'A',
				email: 'a@example.com',
				date: '2026-09-09T17:18:56Z',
			},
			committer: {
				name: 'GitHub',
				email: 'noreply@github.com',
				date: '2026-09-09T17:18:56Z',
			},
			treeOid,
			gpgsig,
			unsignedPayload: payload,
		});
		transport.getTree.mockResolvedValue([]);
		mockGit.writeTree.mockResolvedValue(treeOid);
		mockGit.writeObject.mockImplementation(
			async ({ object }: { object: Uint8Array }) => {
				const raw = new TextDecoder().decode(object);
				expect(raw).toContain(
					'gpgsig -----BEGIN PGP SIGNATURE-----\n \n abc',
				);
				expect(raw.endsWith('\n \n\nWeb commit')).toBe(true);
				return oid;
			},
		);

		const result = await gitSyncService.fetchForMerge('project-1', secrets);

		expect(result?.remoteOid).toBe(oid);
		expect(mockGit.writeCommit).not.toHaveBeenCalled();
		expect(mockGit.writeObject).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'commit', format: 'content' }),
		);
	});

	it('never aliases a remote SHA when required reconstruction metadata is missing', async () => {
		transport.getHead.mockResolvedValue('remote-head');
		mockGit.writeCommit.mockResolvedValue('different-local-oid');

		await expect(
			gitSyncService.fetchForMerge('project-1', secrets),
		).rejects.toThrow(
			'cannot be reconstructed exactly from the provider API',
		);
	});
});
