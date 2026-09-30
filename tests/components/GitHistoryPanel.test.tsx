import { fireEvent, render, screen, waitFor } from '@testing-library/react';

jest.mock('@/i18n', () => ({
	t: (key: string, vars?: Record<string, unknown>) => {
		if (!vars) return key;
		return Object.entries(vars).reduce(
			(value, [name, replacement]) =>
				value.replace(`{${name}}`, String(replacement)),
			key,
		);
	},
}));

jest.mock('@/logging', () => ({
	createNamedLogger: () => ({ error: jest.fn(), warn: jest.fn() }),
}));

jest.mock('@src/hooks/useAuth', () => ({
	useAuth: () => ({ user: null }),
}));

jest.mock('@src/hooks/useProperties', () => ({
	useProperties: () => ({
		getProperty: jest.fn(() => undefined),
		setProperty: jest.fn(),
		registerProperty: jest.fn(),
	}),
}));

jest.mock('@src/services/GitService', () => ({
	gitService: {
		getState: jest.fn(),
		getHeadOid: jest.fn(),
		getChanges: jest.fn(),
		getWorktreeChanges: jest.fn(),
		compareFile: jest.fn(),
		compare: jest.fn(),
		initialize: jest.fn(),
		commit: jest.fn(),
		restore: jest.fn(),
		checkout: jest.fn(),
		createBranch: jest.fn(),
		deleteBranch: jest.fn(),
		mergeBranch: jest.fn(),
		completeBranchMerge: jest.fn(),
		resetFile: jest.fn(),
		resetAll: jest.fn(),
		writeWorktreeFile: jest.fn(),
	},
}));

const mockGitSyncService = {
	getConfig: jest.fn(),
	addListener: jest.fn(() => () => undefined),
	fetchForMerge: jest.fn(),
	adoptFetched: jest.fn(),
	markFetchedSynced: jest.fn(),
	discardFetched: jest.fn(async () => undefined),
	push: jest.fn(),
};

jest.mock('@src/services/GitSyncService', () => ({
	gitSyncService: mockGitSyncService,
}));

jest.mock('@src/hooks/useSecrets', () => ({
	useSecrets: () => ({ getSecret: jest.fn() }),
}));

jest.mock('@src/services/MergeResolutionService', () => ({
	mergeResolutionService: {
		compareFiles: jest.fn(),
		editFiles: jest.fn(),
		resolveConflicts: jest.fn(),
		restoreEditedContent: jest.fn((_conflict, content) => content),
	},
}));

jest.mock('@src/utils/annotationTagUtils', () => ({
	stripAnnotationTagsWithSpans: (content: string) => ({ content, spans: [] }),
}));

jest.mock('@src/utils/dateUtils', () => ({
	formatDate: (timestamp: number) => `date-${timestamp}`,
}));

jest.mock('@src/components/common/Icons', () => ({
	ChevronDownIcon: () => <span>down</span>,
	ChevronRightIcon: () => <span>right</span>,
	CloseIcon: () => <span>close</span>,
	RefreshIcon: () => null,
	GitBranchIcon: () => <span>branch</span>,
	GitRemoteIcon: () => <span>remote</span>,
	HistoryIcon: () => <span>history</span>,
	RepositoryIcon: () => <span>repository</span>,
	PlusIcon: () => <span>plus</span>,
	TrashIcon: () => <span>trash</span>,
	UndoIcon: () => <span>undo</span>,
}));

jest.mock('@src/components/history/GitRemoteModal', () => ({
	__esModule: true,
	default: ({ isOpen }: { isOpen: boolean }) =>
		isOpen ? <div role='dialog' aria-label='Git Remote' /> : null,
}));

import GitHistoryPanel, {
	buildGitGraphRows,
	shortGitOid,
} from '@src/components/history/GitHistoryPanel';
import {
	gitService,
	type GitHistoryEntry,
	type GitProjectState,
} from '@src/services/GitService';

const mockedGitService = gitService as jest.Mocked<typeof gitService>;

const entry = (
	oid: string,
	parents: string[],
	timestamp: number,
	message = oid,
	fileChanges: GitHistoryEntry['fileChanges'] = [],
): GitHistoryEntry => ({
	oid,
	message,
	authorName: 'Test',
	authorEmail: 'test@example.com',
	timestamp,
	fileChanges,
	parents,
	branches: [],
});

const initializedState = (
	overrides: Partial<GitProjectState> = {},
): GitProjectState => ({
	initialized: true,
	branch: 'main',
	headOid: 'dddddddddddddddddddddddddddddddddddddddd',
	worktreeBaseOid: 'dddddddddddddddddddddddddddddddddddddddd',
	changes: [],
	worktreeChanges: [],
	history: [],
	branches: [],
	...overrides,
});

describe('Git history graph', () => {
	it('keeps linear history on one lane', () => {
		const graph = buildGitGraphRows([
			entry('c', ['b'], 3),
			entry('b', ['a'], 2),
			entry('a', [], 1),
		]);

		expect(graph.maxLanes).toBe(1);
		expect(graph.rows.map((row) => row.lane)).toEqual([0, 0, 0]);
		expect(graph.rows[0].parentLanes).toEqual([0]);
		expect(graph.rows[0].hasIncoming).toBe(false);
		expect(graph.rows[1].hasIncoming).toBe(true);
	});

	it('allocates safe lanes for merge parents', () => {
		const graph = buildGitGraphRows([
			entry('merge', ['main-parent', 'topic-parent'], 5),
			entry('main-parent', ['base'], 4),
			entry('topic-parent', ['base'], 3),
			entry('base', [], 1),
		]);

		expect(graph.maxLanes).toBeGreaterThanOrEqual(2);
		expect(graph.rows[0].parentLanes).toHaveLength(2);
		expect(new Set(graph.rows[0].parentLanes).size).toBe(2);
	});

	it('starts interleaved branch tips at their node', () => {
		const graph = buildGitGraphRows([
			entry('main-tip', ['main-parent'], 5),
			entry('main-parent', ['base'], 4),
			entry('topic-tip', ['topic-parent'], 3),
			entry('topic-parent', ['base'], 2),
			entry('base', [], 1),
		]);

		expect(graph.rows[2].hasIncoming).toBe(false);
		expect(graph.rows[3].hasIncoming).toBe(true);
	});

	it('uses seven-character hashes', () => {
		expect(shortGitOid('1234567890abcdef')).toBe('1234567');
		expect(shortGitOid(null)).toBe('—');
	});
});

describe('Git history panel layout', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockGitSyncService.getConfig.mockReturnValue(undefined);
		mockGitSyncService.addListener.mockReturnValue(() => undefined);
		mockGitSyncService.discardFetched.mockResolvedValue(undefined);
		mockedGitService.checkout.mockResolvedValue(undefined);
		mockedGitService.createBranch.mockResolvedValue(undefined);
		mockedGitService.deleteBranch.mockResolvedValue(undefined);
		mockedGitService.mergeBranch.mockResolvedValue({
			status: 'merged',
			oid: 'merge-oid',
			alreadyMerged: false,
			fastForward: false,
			mergeCommit: true,
		});
	});

	it('reconciles the worktree to the pulled HEAD before marking the remote synced', async () => {
		mockGitSyncService.getConfig.mockReturnValue({
			providerId: 'github',
			repositoryId: 'owner/repo',
			repositoryLabel: 'owner/repo',
			branch: 'main',
			credentialSource: 'history',
		});
		mockedGitService.getState.mockResolvedValue(initializedState());
		mockedGitService.getHeadOid.mockResolvedValue('local-head');
		mockGitSyncService.fetchForMerge.mockResolvedValue({
			providerName: 'GitHub',
			repositoryLabel: 'owner/repo',
			remoteBranch: 'main',
			remoteOid: 'remote-head',
			localOid: 'remote-head',
			temporaryBranch: 'origin/main',
		});
		mockedGitService.resetAll.mockResolvedValue(undefined);

		render(
			<GitHistoryPanel projectId='project-1' onOpenDiff={jest.fn()} onClearDiff={jest.fn()} />,
		);

		fireEvent.click(await screen.findByRole('button', { name: 'Pull' }));
		await waitFor(() => expect(mockedGitService.resetAll).toHaveBeenCalledWith('project-1'));
		expect(mockGitSyncService.markFetchedSynced).toHaveBeenCalled();
		expect(mockedGitService.resetAll.mock.invocationCallOrder[0]).toBeLessThan(
			mockGitSyncService.markFetchedSynced.mock.invocationCallOrder[0],
		);
	});

	it('uses the same two-line metadata layout for branches and commits', async () => {
		const oid = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
		const historyEntry = entry(oid, [], 1, 'Older');
		historyEntry.branches = ['topic'];
		mockedGitService.getState.mockResolvedValue(
			initializedState({
				branch: 'topic',
				headOid: oid,
				worktreeBaseOid: oid,
				history: [historyEntry],
				branches: [{ name: 'topic', oid }],
			}),
		);

		const { container } = render(
			<GitHistoryPanel projectId='project-1' onOpenDiff={jest.fn()} onClearDiff={jest.fn()} />,
		);
		await waitFor(() => expect(screen.getByText('Older')).toBeInTheDocument());

		const branchCopy = container.querySelector('.git-history-branch-copy');
		expect(branchCopy?.querySelector('.git-history-primary-line')).toHaveTextContent(
			'topicHEAD',
		);
		expect(branchCopy?.querySelector('.git-history-item-meta')).toHaveTextContent(
			'bbbbbbb·date-1',
		);

		const commitCopy = container.querySelector('.git-history-commit-copy');
		expect(commitCopy?.querySelector('.git-history-primary-line')).toHaveTextContent(
			'OlderHEADtopic',
		);
		expect(commitCopy?.querySelector('.git-history-item-meta')).toHaveTextContent(
			'bbbbbbb·date-1',
		);
	});

	it('expands commit files inline and opens them in the diff viewer', async () => {
		const oid = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
		mockedGitService.getState.mockResolvedValue(
			initializedState({
				history: [
					entry(oid, [], 1, 'Older', [{ path: 'chapter.tex', type: 'modified' }]),
				],
			}),
		);
		mockedGitService.compareFile.mockResolvedValue({
			path: 'chapter.tex',
			type: 'modified',
			isBinary: false,
			leftContent: '',
			rightContent: 'changed',
		});
		const onOpenDiff = jest.fn();

		render(
			<GitHistoryPanel projectId='project-1' onOpenDiff={onOpenDiff} onClearDiff={jest.fn()} />,
		);
		await waitFor(() => expect(screen.getByText('Older')).toBeInTheDocument());
		const commitButton = screen.getByRole('button', { name: /Older/ });
		expect(commitButton).toHaveAttribute('aria-expanded', 'false');
		expect(screen.queryByText('chapter.tex')).not.toBeInTheDocument();

		fireEvent.click(commitButton);
		expect(commitButton).toHaveAttribute('aria-expanded', 'true');
		expect(screen.getByText('chapter.tex')).toBeInTheDocument();

		fireEvent.click(screen.getByTitle('chapter.tex'));
		await waitFor(() => expect(onOpenDiff).toHaveBeenCalled());
		expect(onOpenDiff.mock.calls[0][0]).toEqual(
			expect.objectContaining({
				leftLabel: 'Empty',
				rightLabel: 'bbbbbbb',
				file: expect.objectContaining({ path: 'chapter.tex' }),
			}),
		);

		fireEvent.click(commitButton);
		expect(commitButton).toHaveAttribute('aria-expanded', 'false');
		expect(screen.queryByText('chapter.tex')).not.toBeInTheDocument();
	});

	it('offers reset for all changes and for each changed file', async () => {
		mockedGitService.getState.mockResolvedValue(
			initializedState({ changes: [{ path: 'main.tex', type: 'modified' }] }),
		);

		render(
			<GitHistoryPanel projectId='project-1' onOpenDiff={jest.fn()} onClearDiff={jest.fn()} />,
		);
		await waitFor(() => expect(screen.getByText('main.tex')).toBeInTheDocument());

		fireEvent.click(screen.getByRole('button', { name: 'Reset main.tex' }));
		expect(mockedGitService.resetFile).not.toHaveBeenCalled();
		expect(screen.getByText('Reset file?')).toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
		await waitFor(() =>
			expect(mockedGitService.resetFile).toHaveBeenCalledWith('project-1', 'main.tex'),
		);

		fireEvent.click(screen.getByRole('button', { name: 'Reset all changes' }));
		expect(mockedGitService.resetAll).not.toHaveBeenCalled();
		expect(screen.getByText('Reset all changes?')).toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: 'Reset all' }));
		await waitFor(() => expect(mockedGitService.resetAll).toHaveBeenCalledWith('project-1'));
	});

	it('opens a working-tree file diff with the current file on the editable side', async () => {
		mockedGitService.getState.mockResolvedValue(
			initializedState({ changes: [{ path: 'main.tex', type: 'modified' }] }),
		);
		mockedGitService.compareFile.mockResolvedValue({
			path: 'main.tex',
			type: 'modified',
			isBinary: false,
			leftContent: 'old',
			rightContent: 'current',
		});
		const onOpenDiff = jest.fn();

		render(
			<GitHistoryPanel projectId='project-1' onOpenDiff={onOpenDiff} onClearDiff={jest.fn()} />,
		);
		await waitFor(() => expect(screen.getByText('main.tex')).toBeInTheDocument());
		fireEvent.click(screen.getByTitle('main.tex'));

		await waitFor(() => expect(onOpenDiff).toHaveBeenCalled());
		expect(onOpenDiff.mock.calls[0][0]).toEqual(
			expect.objectContaining({
				leftLabel: 'Working tree',
				rightLabel: 'ddddddd',
				editable: true,
				file: expect.objectContaining({ leftContent: 'current', rightContent: 'old' }),
			}),
		);
	});
});

describe('Git restore confirmation', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockedGitService.restore.mockResolvedValue({
			restoredOid: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
			headOid: 'dddddddddddddddddddddddddddddddddddddddd',
			safetyCommitOid: null,
			safetyCommitMessage: null,
		});
	});

	it('restores a version only after modal confirmation', async () => {
		const oid = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
		mockedGitService.getState.mockResolvedValue(
			initializedState({ history: [entry(oid, [], 1, 'Older')] }),
		);

		render(
			<GitHistoryPanel projectId='project-1' onOpenDiff={jest.fn()} onClearDiff={jest.fn()} />,
		);
		await waitFor(() => expect(screen.getByText('Older')).toBeInTheDocument());
		fireEvent.click(screen.getByRole('button', { name: 'Restore bbbbbbb' }));
		expect(mockedGitService.restore).not.toHaveBeenCalled();
		expect(screen.getByText('Restore bbbbbbb?')).toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
		await waitFor(() =>
			expect(mockedGitService.restore).toHaveBeenCalledWith('project-1', oid, null),
		);
	});
});

describe('Git branch controls', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockedGitService.checkout.mockResolvedValue(undefined);
		mockedGitService.createBranch.mockResolvedValue(undefined);
		mockedGitService.deleteBranch.mockResolvedValue(undefined);
		mockedGitService.mergeBranch.mockResolvedValue({
			status: 'merged',
			oid: 'merge-oid',
			alreadyMerged: false,
			fastForward: false,
			mergeCommit: true,
		});
	});

	const stateWithTopic = () =>
		initializedState({
			branches: [
				{ name: 'main', oid: 'dddddddddddddddddddddddddddddddddddddddd' },
				{ name: 'topic', oid: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' },
			],
		});

	it('shows switch, compare, merge, and delete for another branch', async () => {
		mockedGitService.getState.mockResolvedValue(stateWithTopic());

		render(
			<GitHistoryPanel projectId='project-1' onOpenDiff={jest.fn()} onClearDiff={jest.fn()} />,
		);
		await waitFor(() => expect(screen.getByText('topic')).toBeInTheDocument());

		expect(screen.getByRole('button', { name: 'Switch to topic' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Compare from topic' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Merge topic into main' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Delete branch topic' })).toBeInTheDocument();
	});

	it('switches a branch through the explicit branch action', async () => {
		mockedGitService.getState.mockResolvedValue(stateWithTopic());

		render(
			<GitHistoryPanel projectId='project-1' onOpenDiff={jest.fn()} onClearDiff={jest.fn()} />,
		);
		await waitFor(() => expect(screen.getByText('topic')).toBeInTheDocument());
		fireEvent.click(screen.getByRole('button', { name: 'Switch to topic' }));
		expect(mockedGitService.checkout).not.toHaveBeenCalled();
		expect(screen.getByText('Switch branch')).toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: 'Switch' }));
		await waitFor(() =>
			expect(mockedGitService.checkout).toHaveBeenCalledWith('project-1', 'topic'),
		);
	});

	it('deletes a branch only after modal confirmation', async () => {
		mockedGitService.getState.mockResolvedValue(stateWithTopic());

		render(
			<GitHistoryPanel projectId='project-1' onOpenDiff={jest.fn()} onClearDiff={jest.fn()} />,
		);
		await waitFor(() => expect(screen.getByText('topic')).toBeInTheDocument());
		fireEvent.click(screen.getByRole('button', { name: 'Delete branch topic' }));
		expect(mockedGitService.deleteBranch).not.toHaveBeenCalled();
		expect(screen.getByText('Delete branch topic?')).toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
		await waitFor(() =>
			expect(mockedGitService.deleteBranch).toHaveBeenCalledWith('project-1', 'topic'),
		);
	});

	it('creates a branch without requiring a clean working tree', async () => {
		mockedGitService.getState.mockResolvedValue(
			stateWithTopic(),
		);

		render(
			<GitHistoryPanel projectId='project-1' onOpenDiff={jest.fn()} onClearDiff={jest.fn()} />,
		);
		await waitFor(() => expect(screen.getByText('topic')).toBeInTheDocument());
		fireEvent.click(screen.getByRole('button', { name: 'New branch' }));
		fireEvent.change(screen.getByPlaceholderText('Branch name'), { target: { value: 'draft' } });
		fireEvent.click(screen.getByRole('button', { name: 'Create' }));
		await waitFor(() => expect(mockedGitService.createBranch).toHaveBeenCalledWith('project-1', 'draft'));
	});
});
