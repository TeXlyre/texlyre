const mockFs = {
	promises: {
		stat: jest.fn(async () => ({})),
	},
};
const mockFileSystem = {
	fs: mockFs,
	flush: jest.fn(async () => undefined),
};

const mockGit = {
	statusMatrix: jest.fn(async () => []),
	currentBranch: jest.fn(async () => 'main'),
	resolveRef: jest.fn(async ({ ref }: { ref: string }) =>
		ref === 'refs/heads/origin/main' ? 'remote-head' : 'local-head',
	),
	listBranches: jest.fn(async () => ['main', 'origin/main']),
	merge: jest.fn(async ({ dryRun }: { dryRun?: boolean }) =>
		dryRun
			? { mergeCommit: true }
			: {
					oid: 'merge-head',
					alreadyMerged: false,
					fastForward: false,
					mergeCommit: true,
				},
	),
	writeRef: jest.fn(async () => undefined),
};

jest.mock('isomorphic-git', () => mockGit);
jest.mock('../../src/services/GitFileSystemService', () => ({
	gitFileSystemService: { get: () => mockFileSystem },
}));
jest.mock('../../src/services/FileStoreService', () => ({
	fileStoreService: {
		getCurrentProjectId: jest.fn(() => 'project-1'),
		getAllFiles: jest.fn(() => []),
		initialize: jest.fn(async () => undefined),
	},
}));
jest.mock('../../src/services/FileHandlerService', () => ({
	fileHandlerService: {
		withoutMirroring: jest.fn(async (action: () => Promise<unknown>) => action()),
		removeFromDisk: jest.fn(async () => undefined),
		mirrorFiles: jest.fn(async () => undefined),
	},
}));

import { gitService } from '../../src/services/GitService';

describe('GitService remote merge options', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockGit.statusMatrix.mockResolvedValue([]);
		mockGit.currentBranch.mockResolvedValue('main');
		mockGit.resolveRef.mockImplementation(async ({ ref }: { ref: string }) =>
			ref === 'refs/heads/origin/main' ? 'remote-head' : 'local-head',
		);
		mockGit.listBranches.mockResolvedValue(['main', 'origin/main']);
		mockGit.merge.mockImplementation(async ({ dryRun }: { dryRun?: boolean }) =>
			dryRun
				? { mergeCommit: true }
				: {
						oid: 'merge-head',
						alreadyMerged: false,
						fastForward: false,
						mergeCommit: true,
					},
		);
	});

	it('allows unrelated histories only when the caller explicitly requests it', async () => {
		await gitService.mergeBranch('project-1', 'origin/main', null, {
			allowUnrelatedHistories: true,
		});

		expect(mockGit.merge).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				dryRun: true,
				allowUnrelatedHistories: true,
			}),
		);
		expect(mockGit.merge).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				allowUnrelatedHistories: true,
			}),
		);
	});

	it('keeps ordinary local branch merges strict by default', async () => {
		await gitService.mergeBranch('project-1', 'origin/main', null);

		expect(mockGit.merge).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ allowUnrelatedHistories: false }),
		);
	});
});
