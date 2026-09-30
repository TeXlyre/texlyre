const mockStat = jest.fn();
const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();
const mockUnlink = jest.fn();
const mockFlush = jest.fn();
const mockInit = jest.fn();
const mockCurrentBranch = jest.fn();
const mockStatusMatrix = jest.fn();
const mockAdd = jest.fn();
const mockRemove = jest.fn();
const mockCommit = jest.fn();
const mockLog = jest.fn();
const mockCheckout = jest.fn();
const mockBranch = jest.fn();
const mockDeleteBranch = jest.fn();
const mockMerge = jest.fn();
const mockFindMergeBase = jest.fn();
const mockResolveRef = jest.fn();
const mockWriteRef = jest.fn();
const mockListBranches = jest.fn();
const mockReadCommit = jest.fn();
const mockReadTree = jest.fn();
const mockReadBlob = jest.fn();
const mockWithoutMirroring = jest.fn(async (action: () => Promise<unknown>) => action());
const mockMirrorFiles = jest.fn();
const mockRemoveFromDisk = jest.fn();
const mockGetAllFiles = jest.fn();

jest.mock('@src/services/GitFileSystemService', () => ({
	gitFileSystemService: {
		get: jest.fn(() => ({
			fs: {
				promises: {
					stat: mockStat,
					readFile: mockReadFile,
					writeFile: mockWriteFile,
					unlink: mockUnlink,
				},
			},
			flush: mockFlush,
		})),
	},
}));

jest.mock('@src/services/FileHandlerService', () => ({
	fileHandlerService: {
		withoutMirroring: mockWithoutMirroring,
		mirrorFiles: mockMirrorFiles,
		removeFromDisk: mockRemoveFromDisk,
	},
}));

jest.mock('@src/services/FileStoreService', () => ({
	fileStoreService: {
		getCurrentProjectId: jest.fn(() => 'project-1'),
		initialize: jest.fn(),
		getAllFiles: mockGetAllFiles,
	},
}));

jest.mock('@src/utils/fileUtils', () => ({
	isBinaryFile: (path: string) => path.endsWith('.png'),
}));

jest.mock('isomorphic-git', () => ({
	init: mockInit,
	currentBranch: mockCurrentBranch,
	statusMatrix: mockStatusMatrix,
	add: mockAdd,
	remove: mockRemove,
	commit: mockCommit,
	log: mockLog,
	checkout: mockCheckout,
	branch: mockBranch,
	deleteBranch: mockDeleteBranch,
	merge: mockMerge,
	findMergeBase: mockFindMergeBase,
	resolveRef: mockResolveRef,
	writeRef: mockWriteRef,
	listBranches: mockListBranches,
	readCommit: mockReadCommit,
	readTree: mockReadTree,
	readBlob: mockReadBlob,
}));

import { gitService } from '@src/services/GitService';

const user = {
	id: 'user-1',
	username: 'fares',
	name: 'Fares',
	passwordHash: 'hash',
	email: 'fares@example.com',
	createdAt: 1,
};

const resolveDefaults = (ref: string): string => {
	if (ref === 'HEAD') return 'head-commit';
	if (ref === 'refs/heads/main') return 'head-commit';
	if (ref === 'refs/texlyre/worktree-base') return 'head-commit';
	throw Object.assign(new Error(`missing ${ref}`), { code: 'NotFoundError' });
};

describe('GitService', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockStat.mockResolvedValue({});
		mockReadFile.mockResolvedValue(new TextEncoder().encode('working'));
		mockWriteFile.mockResolvedValue(undefined);
		mockUnlink.mockResolvedValue(undefined);
		mockWithoutMirroring.mockImplementation(async (action) => action());
		mockMirrorFiles.mockResolvedValue(undefined);
		mockRemoveFromDisk.mockResolvedValue(undefined);
		mockGetAllFiles.mockResolvedValue([]);
		mockFlush.mockResolvedValue(undefined);
		mockInit.mockResolvedValue(undefined);
		mockAdd.mockResolvedValue(undefined);
		mockRemove.mockResolvedValue(undefined);
		mockCommit.mockResolvedValue('commit-1');
		mockCheckout.mockResolvedValue(undefined);
		mockBranch.mockResolvedValue(undefined);
		mockDeleteBranch.mockResolvedValue(undefined);
		mockMerge.mockResolvedValue({ oid: 'merge-commit', mergeCommit: true });
		mockFindMergeBase.mockResolvedValue(['base-commit']);
		mockLog.mockResolvedValue([]);
		mockCurrentBranch.mockResolvedValue('main');
		mockStatusMatrix.mockResolvedValue([]);
		mockResolveRef.mockImplementation(({ ref }: { ref: string }) =>
			Promise.resolve(resolveDefaults(ref)),
		);
		mockWriteRef.mockResolvedValue(undefined);
		mockListBranches.mockResolvedValue(['main']);
		mockReadCommit.mockResolvedValue({ commit: { tree: 'tree-1' } });
		mockReadTree.mockResolvedValue({ tree: [] });
		mockReadBlob.mockResolvedValue({ blob: new TextEncoder().encode('committed') });
	});

	it('initializes a private main-branch repository when needed', async () => {
		mockStat.mockRejectedValueOnce(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

		await gitService.initialize('project-1');

		expect(mockInit).toHaveBeenCalledWith(
			expect.objectContaining({
				dir: '/',
				gitdir: '/.git',
				defaultBranch: 'main',
			}),
		);
		expect(mockFlush).toHaveBeenCalled();
	});

	it('stages the complete working snapshot and advances the worktree base after committing', async () => {
		mockStatusMatrix.mockResolvedValue([
			['new.tex', 0, 2, 0],
			['changed.tex', 1, 2, 1],
			['deleted.tex', 1, 0, 1],
		]);

		await expect(gitService.commit('project-1', 'Save draft', user)).resolves.toBe(
			'commit-1',
		);

		expect(mockAdd).toHaveBeenCalledWith(
			expect.objectContaining({ filepath: 'new.tex' }),
		);
		expect(mockAdd).toHaveBeenCalledWith(
			expect.objectContaining({ filepath: 'changed.tex' }),
		);
		expect(mockRemove).toHaveBeenCalledWith(
			expect.objectContaining({ filepath: 'deleted.tex' }),
		);
		expect(mockCommit).toHaveBeenCalledWith(
			expect.objectContaining({
				message: 'Save draft',
				author: { name: 'Fares', email: 'fares@example.com' },
			}),
		);
		expect(mockWriteRef).toHaveBeenCalledWith(
			expect.objectContaining({
				ref: 'refs/texlyre/worktree-base',
				value: 'commit-1',
				force: true,
			}),
		);
	});

	it('shows HEAD, worktree base, parents, and branch tips in the UI-facing state', async () => {
		mockListBranches.mockResolvedValue(['main', 'feature']);
		mockResolveRef.mockImplementation(({ ref }: { ref: string }) => {
			const refs: Record<string, string> = {
				HEAD: 'head-commit',
				'refs/heads/main': 'head-commit',
				'refs/heads/feature': 'feature-commit',
				'refs/texlyre/worktree-base': 'head-commit',
			};
			return refs[ref]
				? Promise.resolve(refs[ref])
				: Promise.reject(Object.assign(new Error('missing'), { code: 'NotFoundError' }));
		});
		mockLog.mockImplementation(({ ref }: { ref: string }) => {
			if (ref === 'feature') {
				return Promise.resolve([
					{
						oid: 'feature-commit',
						commit: {
							message: 'Feature',
							author: { name: 'Fares', email: 'f@example.com', timestamp: 110 },
							parent: ['base-commit'],
							changes: [['f2', 'f1', 'feature.tex']],
						},
					},
				]);
			}
			return Promise.resolve([
				{
					oid: 'head-commit',
					commit: {
						message: 'Main',
						author: { name: 'Fares', email: 'f@example.com', timestamp: 120 },
						parent: ['base-commit'],
						changes: [['m2', 'm1', 'main.tex']],
					},
				},
			]);
		});

		const state = await gitService.getState('project-1');

		expect(state.headOid).toBe('head-commit');
		expect(state.worktreeBaseOid).toBe('head-commit');
		expect(state.branches).toEqual([
			{ name: 'main', oid: 'head-commit' },
			{ name: 'feature', oid: 'feature-commit' },
		]);
		expect(state.history).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					oid: 'head-commit',
					parents: ['base-commit'],
					branches: ['main'],
					fileChanges: [{ path: 'main.tex', type: 'modified' }],
				}),
				expect.objectContaining({
					oid: 'feature-commit',
					parents: ['base-commit'],
					branches: ['feature'],
					fileChanges: [{ path: 'feature.tex', type: 'modified' }],
				}),
			]),
		);
	});

	it('keeps normal Git changes relative to HEAD separate from restore-safety changes', async () => {
		mockResolveRef.mockImplementation(({ ref }: { ref: string }) => {
			if (ref === 'HEAD') return Promise.resolve('head-commit');
			if (ref === 'refs/texlyre/worktree-base') return Promise.resolve('restored-b');
			if (ref === 'refs/heads/main') return Promise.resolve('head-commit');
			return Promise.reject(
				Object.assign(new Error('missing'), { code: 'NotFoundError' }),
			);
		});
		mockStatusMatrix.mockImplementation(({ ref }: { ref?: string }) => {
			if (ref === 'head-commit') {
				return Promise.resolve([['main.tex', 1, 2, 2]]);
			}
			if (ref === 'restored-b') {
				return Promise.resolve([['main.tex', 1, 1, 1]]);
			}
			return Promise.resolve([]);
		});

		await expect(gitService.getChanges('project-1')).resolves.toEqual([
			{ path: 'main.tex', type: 'modified' },
		]);
		await expect(gitService.getWorktreeChanges('project-1')).resolves.toEqual([]);
	});

	it('does not create a safety snapshot when moving between restored commits without edits', async () => {
		mockResolveRef.mockImplementation(({ ref }: { ref: string }) => {
			if (ref === 'HEAD') return Promise.resolve('head-commit');
			if (ref === 'refs/texlyre/worktree-base') return Promise.resolve('restored-b');
			if (ref === 'refs/heads/main') return Promise.resolve('head-commit');
			return Promise.reject(Object.assign(new Error('missing'), { code: 'NotFoundError' }));
		});
		mockStatusMatrix.mockImplementation(({ ref }: { ref?: string }) => {
			if (ref === 'head-commit') return Promise.resolve([['main.tex', 1, 2, 2]]);
			if (ref === 'restored-b') return Promise.resolve([['main.tex', 1, 1, 1]]);
			return Promise.resolve([]);
		});

		const result = await gitService.restore('project-1', 'restored-c', user);

		expect(mockCommit).not.toHaveBeenCalled();
		expect(result.safetyCommitOid).toBeNull();
		expect(mockCheckout).toHaveBeenCalledWith(
			expect.objectContaining({
				ref: 'restored-c',
				noUpdateHead: true,
				force: true,
				nonBlocking: true,
			}),
		);
		expect(mockWriteRef).toHaveBeenCalledWith(
			expect.objectContaining({
				ref: 'refs/texlyre/worktree-base',
				value: 'restored-c',
			}),
		);
	});

	it('aborts if collaborative changes arrive while a restore is being prepared', async () => {
		mockResolveRef.mockImplementation(({ ref }: { ref: string }) => {
			if (ref === 'HEAD') return Promise.resolve('head-commit');
			if (ref === 'refs/texlyre/worktree-base') return Promise.resolve('head-commit');
			if (ref === 'refs/heads/main') return Promise.resolve('head-commit');
			return Promise.reject(Object.assign(new Error('missing'), { code: 'NotFoundError' }));
		});
		mockStatusMatrix
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([['main.tex', 1, 2, 1]]);

		await expect(gitService.restore('project-1', 'older-commit', user)).rejects.toThrow(
			'Project files changed while preparing the restore. Please try again.',
		);
		expect(mockCheckout).not.toHaveBeenCalled();
	});

	it('creates one clearly named safety snapshot when there are edits since the restored base', async () => {
		let worktreeBase = 'restored-b';
		mockResolveRef.mockImplementation(({ ref }: { ref: string }) => {
			if (ref === 'HEAD') return Promise.resolve('head-commit');
			if (ref === 'refs/texlyre/worktree-base') return Promise.resolve(worktreeBase);
			if (ref === 'refs/heads/main') return Promise.resolve('head-commit');
			return Promise.reject(Object.assign(new Error('missing'), { code: 'NotFoundError' }));
		});
		mockWriteRef.mockImplementation(({ ref, value }: { ref: string; value: string }) => {
			if (ref === 'refs/texlyre/worktree-base') worktreeBase = value;
			return Promise.resolve();
		});
		mockStatusMatrix.mockImplementation(({ ref }: { ref?: string }) => {
			if (ref === 'head-commit') return Promise.resolve([['main.tex', 1, 2, 2]]);
			if (ref === 'restored-b') return Promise.resolve([['main.tex', 1, 2, 1]]);
			if (ref === 'safety-commit') return Promise.resolve([]);
			return Promise.resolve([['main.tex', 1, 2, 1]]);
		});
		mockCommit.mockResolvedValue('safety-commit');

		const result = await gitService.restore('project-1', 'restored-c-long', user);

		expect(mockCommit).toHaveBeenCalledWith(
			expect.objectContaining({
				message: 'Save edits before restore to restore',
			}),
		);
		expect(result.safetyCommitOid).toBe('safety-commit');
		expect(result.safetyCommitMessage).toBe(
			'Save edits before restore to restore',
		);
	});

	it('switches only to an existing branch when the HEAD working tree is clean', async () => {
		mockListBranches.mockResolvedValue(['main', 'topic']);
		mockStatusMatrix.mockResolvedValue([]);

		await gitService.checkout('project-1', 'topic');

		expect(mockCheckout).toHaveBeenCalledWith(
			expect.objectContaining({ ref: 'topic', nonBlocking: true }),
		);
	});

	it('blocks branch switching when the working tree differs from HEAD', async () => {
		mockStatusMatrix.mockResolvedValue([['main.tex', 1, 2, 1]]);

		await expect(gitService.checkout('project-1', 'topic')).rejects.toThrow(
			'Commit or restore the current changes before switching branches',
		);
		expect(mockCheckout).not.toHaveBeenCalled();
	});

	it('aborts a branch switch if a collaborative edit arrives during preparation', async () => {
		mockListBranches.mockResolvedValue(['main', 'topic']);
		mockStatusMatrix
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([['main.tex', 1, 2, 1]]);

		await expect(gitService.checkout('project-1', 'topic')).rejects.toThrow(
			'Project files changed while preparing the branch switch. Please try again.',
		);
		expect(mockCheckout).not.toHaveBeenCalled();
	});

	it('creates a new branch without switching the working tree', async () => {
		mockListBranches.mockResolvedValue(['main']);

		await gitService.createBranch('project-1', 'topic');

		expect(mockBranch).toHaveBeenCalledWith(
			expect.objectContaining({ ref: 'topic', checkout: false }),
		);
		expect(mockCheckout).not.toHaveBeenCalled();
	});

	it('deletes only non-current branches', async () => {
		mockListBranches.mockResolvedValue(['main', 'topic']);

		await gitService.deleteBranch('project-1', 'topic');
		expect(mockDeleteBranch).toHaveBeenCalledWith(
			expect.objectContaining({ ref: 'topic' }),
		);

		await expect(gitService.deleteBranch('project-1', 'main')).rejects.toThrow(
			'Switch to another branch before deleting the current branch',
		);
	});

	it('blocks merging while the shared working tree is dirty', async () => {
		mockStatusMatrix.mockResolvedValue([['main.tex', 1, 2, 1]]);

		await expect(gitService.mergeBranch('project-1', 'topic', user)).rejects.toThrow(
			'Commit or restore the current changes before merging branches',
		);
		expect(mockMerge).not.toHaveBeenCalled();
	});

	it('dry-runs then performs a clean branch merge', async () => {
		mockListBranches.mockResolvedValue(['main', 'topic']);
		mockResolveRef.mockImplementation(({ ref }: { ref: string }) => {
			if (ref === 'HEAD' || ref === 'refs/heads/main') return Promise.resolve('head-commit');
			if (ref === 'refs/heads/topic') return Promise.resolve('topic-commit');
			if (ref === 'refs/texlyre/worktree-base') return Promise.resolve('head-commit');
			return Promise.reject(Object.assign(new Error('missing'), { code: 'NotFoundError' }));
		});
		mockStatusMatrix.mockResolvedValue([]);
		mockMerge
			.mockResolvedValueOnce({ mergeCommit: true })
			.mockResolvedValueOnce({ oid: 'merge-commit', mergeCommit: true });

		const result = await gitService.mergeBranch('project-1', 'topic', user);

		expect(result).toEqual(
			expect.objectContaining({ status: 'merged', oid: 'merge-commit', mergeCommit: true }),
		);
		expect(mockMerge).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ theirs: 'topic', dryRun: true, abortOnConflict: true }),
		);
		expect(mockMerge).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ theirs: 'topic', abortOnConflict: true }),
		);
	});

	it('builds commit-to-working-tree comparison files for the merge viewer', async () => {
		mockStatusMatrix.mockResolvedValue([
			['main.tex', 1, 2, 1],
			['new.tex', 0, 2, 0],
			['same.tex', 1, 1, 1],
		]);
		mockReadBlob.mockImplementation(({ filepath }: { filepath: string }) =>
			Promise.resolve({
				blob: new TextEncoder().encode(filepath === 'main.tex' ? 'old main' : ''),
			}),
		);
		mockReadFile.mockImplementation((path: string) =>
			Promise.resolve(
				new TextEncoder().encode(path.endsWith('main.tex') ? 'new main' : 'new file'),
			),
		);

		const comparison = await gitService.compare('project-1', 'old-commit', null);

		expect(comparison.files).toEqual([
			{
				path: 'main.tex',
				type: 'modified',
				isBinary: false,
				leftContent: 'old main',
				rightContent: 'new main',
			},
			{
				path: 'new.tex',
				type: 'added',
				isBinary: false,
				leftContent: '',
				rightContent: 'new file',
			},
		]);
	});

	it('resets modified and added files to HEAD through one mirrored worktree mutation', async () => {
		mockStatusMatrix.mockResolvedValue([
			['main.tex', 1, 2, 1],
			['scratch.tex', 0, 2, 0],
		]);
		mockReadBlob.mockImplementation(({ filepath }: { filepath: string }) => {
			if (filepath === 'scratch.tex') {
				return Promise.reject(
					Object.assign(new Error('missing'), { code: 'TreeOrBlobNotFoundError' }),
				);
			}
			return Promise.resolve({ blob: new TextEncoder().encode('head body') });
		});
		mockGetAllFiles
			.mockResolvedValueOnce([
				{ id: 'main', path: '/main.tex', type: 'file' },
				{ id: 'scratch', path: '/scratch.tex', type: 'file' },
			])
			.mockResolvedValueOnce([{ id: 'main', path: '/main.tex', type: 'file' }]);

		await gitService.resetAll('project-1');

		expect(mockWithoutMirroring).toHaveBeenCalledTimes(1);
		const mainWrite = mockWriteFile.mock.calls.find(([path]) => path === '/main.tex');
		expect(mainWrite).toBeDefined();
		expect(Array.from(mainWrite?.[1] ?? [])).toEqual(
			Array.from(new TextEncoder().encode('head body')),
		);
		expect(mockUnlink).toHaveBeenCalledWith('/scratch.tex');
		expect(mockMirrorFiles).toHaveBeenCalledTimes(1);
	});

	it('suppresses incremental folder mirroring while restoring then mirrors the final tree once', async () => {
		mockStatusMatrix.mockResolvedValue([]);
		mockListBranches.mockResolvedValue(['main']);
		mockGetAllFiles
			.mockResolvedValueOnce([{ id: 'main', path: '/main.tex', type: 'file' }])
			.mockResolvedValueOnce([{ id: 'main', path: '/main.tex', type: 'file' }]);

		await gitService.restore('project-1', 'older-commit', user);

		expect(mockWithoutMirroring).toHaveBeenCalledTimes(1);
		expect(mockCheckout).toHaveBeenCalledWith(
			expect.objectContaining({ ref: 'older-commit', noUpdateHead: true, force: true }),
		);
		expect(mockMirrorFiles).toHaveBeenCalledTimes(1);
	});
});
