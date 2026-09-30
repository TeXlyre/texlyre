// src/components/history/GitHistoryPanel.tsx
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { t } from '@/i18n';
import { createNamedLogger } from '@/logging';
import type { SecretsContextType } from '../../contexts/SecretsContext';
import { useAuth } from '../../hooks/useAuth';
import { useProperties } from '../../hooks/useProperties';
import { useSecrets } from '../../hooks/useSecrets';
import {
	gitService,
	type GitBranch,
	type GitBranchMergeResult,
	type GitChange,
	type GitComparisonFile,
	type GitHistoryEntry,
	type GitMergePlan,
	type GitProjectState,
} from '../../services/GitService';
import { gitSyncService } from '../../services/GitSyncService';
import {
	mergeResolutionService,
	type ConflictResolution,
	type FileConflict,
} from '../../services/MergeResolutionService';
import type { GitRemoteConfig } from '../../types/gitRemote';
import { stripAnnotationTagsWithSpans } from '../../utils/annotationTagUtils';
import { GitRemoteIcon } from '../common/Icons';
import GitHistoryActionModal, {
	type PendingGitAction,
} from './GitHistoryActionModal';
import GitRemoteModal from './GitRemoteModal';
import type { GitDiffView } from './GitDiffViewer';
import GitHistorySections, {
	GIT_HISTORY_MIN_SECTION_SIZE,
	shortGitOid,
} from './GitHistorySections';

export { buildGitGraphRows, shortGitOid } from './GitHistorySections';

const moduleLog = createNamedLogger('GitHistoryPanel');
const DEFAULT_SECTION_SIZES = { branches: 34, changes: 26, history: 40 };

const emptyState: GitProjectState = {
	initialized: false,
	branch: null,
	headOid: null,
	worktreeBaseOid: null,
	changes: [],
	worktreeChanges: [],
	history: [],
	branches: [],
};

interface GitRemoteSyncControlsProps {
	remote: GitRemoteConfig;
	isWorking: boolean;
	hasHead: boolean;
	onPull: (secrets: SecretsContextType) => Promise<void>;
	onPush: (secrets: SecretsContextType) => Promise<void>;
}

const GitRemoteSyncControls: React.FC<GitRemoteSyncControlsProps> = ({
	remote,
	isWorking,
	hasHead,
	onPull,
	onPush,
}) => {
	const secrets = useSecrets();
	return (
		<div className='git-history-compare-mode git-history-compare-top'>
			<span>
				<strong>{remote.repositoryLabel}</strong> · {remote.branch}
			</span>
			<div className='ui-actions'>
				<button
					type='button'
					className='button secondary '
					onClick={() => void onPull(secrets)}
					disabled={isWorking}
				>
					{t('Pull')}
				</button>
				<button
					type='button'
					className='button secondary '
					onClick={() => void onPush(secrets)}
					disabled={isWorking || !hasHead}
				>
					{t('Push')}
				</button>
			</div>
		</div>
	);
};

interface GitHistoryPanelProps {
	projectId: string | null;
	onOpenDiff: (view: GitDiffView) => void;
	onClearDiff: () => void;
}

const GitHistoryPanel: React.FC<GitHistoryPanelProps> = ({
	projectId,
	onOpenDiff,
	onClearDiff,
}) => {
	const { user } = useAuth();
	const { getProperty, setProperty, registerProperty } = useProperties();
	const propertiesRegistered = useRef(false);
	const loadGenerationRef = useRef(0);
	const statusRefreshTimerRef = useRef<number | null>(null);

	const [propertiesLoaded, setPropertiesLoaded] = useState(false);
	const [branchesCollapsed, setBranchesCollapsed] = useState(false);
	const [changesCollapsed, setChangesCollapsed] = useState(false);
	const [historyCollapsed, setHistoryCollapsed] = useState(false);
	const [sectionSizes, setSectionSizes] = useState(DEFAULT_SECTION_SIZES);
	const [state, setState] = useState<GitProjectState>(emptyState);
	const [message, setMessage] = useState('');
	const [compareSource, setCompareSource] = useState<{
		oid: string;
		label: string;
	} | null>(null);
	const [showNewBranch, setShowNewBranch] = useState(false);
	const [newBranchName, setNewBranchName] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [isWorking, setIsWorking] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [remoteConfig, setRemoteConfig] = useState<GitRemoteConfig | undefined>(
		projectId ? gitSyncService.getConfig(projectId) : undefined,
	);
	const [pendingAction, setPendingAction] = useState<PendingGitAction | null>(
		null,
	);
	const [showRemoteModal, setShowRemoteModal] = useState(false);

	useEffect(() => {
		if (propertiesRegistered.current) return;
		propertiesRegistered.current = true;
		for (const [id, defaultValue] of [
			['git-history-branches-collapsed', false],
			['git-history-changes-collapsed', false],
			['git-history-timeline-collapsed', false],
			['git-history-branches-percent', DEFAULT_SECTION_SIZES.branches],
			['git-history-changes-percent', DEFAULT_SECTION_SIZES.changes],
			['git-history-timeline-percent', DEFAULT_SECTION_SIZES.history],
		] as const) {
			registerProperty({
				id: id as string,
				category: 'UI',
				subcategory: 'Layout',
				defaultValue,
			});
		}
	}, [registerProperty]);

	useEffect(() => {
		if (propertiesLoaded) return;
		const storedBranchesCollapsed = getProperty(
			'git-history-branches-collapsed',
		);
		const storedChangesCollapsed = getProperty('git-history-changes-collapsed');
		const storedHistoryCollapsed = getProperty(
			'git-history-timeline-collapsed',
		);
		if (storedBranchesCollapsed !== undefined) {
			setBranchesCollapsed(Boolean(storedBranchesCollapsed));
		}
		if (storedChangesCollapsed !== undefined) {
			setChangesCollapsed(Boolean(storedChangesCollapsed));
		}
		if (storedHistoryCollapsed !== undefined) {
			setHistoryCollapsed(Boolean(storedHistoryCollapsed));
		}

		const nextSizes = { ...DEFAULT_SECTION_SIZES };
		for (const [key, propertyId] of [
			['branches', 'git-history-branches-percent'],
			['changes', 'git-history-changes-percent'],
			['history', 'git-history-timeline-percent'],
		] as const) {
			const stored = Number(getProperty(propertyId));
			if (Number.isFinite(stored) && stored >= GIT_HISTORY_MIN_SECTION_SIZE) {
				nextSizes[key] = stored;
			}
		}
		setSectionSizes(nextSizes);
		setPropertiesLoaded(true);
	}, [getProperty, propertiesLoaded]);

	useEffect(() => {
		if (!projectId) {
			setRemoteConfig(undefined);
			return;
		}
		setRemoteConfig(gitSyncService.getConfig(projectId));
		return gitSyncService.addListener(projectId, (next) => {
			setRemoteConfig(next);
		});
	}, [projectId]);

	const toggleBranches = () => {
		const next = !branchesCollapsed;
		setBranchesCollapsed(next);
		setProperty('git-history-branches-collapsed', next);
	};

	const toggleChanges = () => {
		const next = !changesCollapsed;
		setChangesCollapsed(next);
		setProperty('git-history-changes-collapsed', next);
	};

	const toggleHistory = () => {
		const next = !historyCollapsed;
		setHistoryCollapsed(next);
		setProperty('git-history-timeline-collapsed', next);
	};

	const persistSectionSizes = useCallback(
		(sizes: Record<string, number>) => {
			if (sizes.branches !== undefined) {
				setProperty('git-history-branches-percent', sizes.branches);
			}
			if (sizes.changes !== undefined) {
				setProperty('git-history-changes-percent', sizes.changes);
			}
			if (sizes.history !== undefined) {
				setProperty('git-history-timeline-percent', sizes.history);
			}
		},
		[setProperty],
	);

	const load = useCallback(async () => {
		const generation = ++loadGenerationRef.current;
		if (!projectId) {
			setState(emptyState);
			return;
		}
		setIsLoading(true);
		setError(null);
		try {
			const nextState = await gitService.getState(projectId);
			if (generation === loadGenerationRef.current) setState(nextState);
		} catch (loadError) {
			moduleLog.error('Failed to load Git history:', loadError);
			if (generation === loadGenerationRef.current) {
				setError(t('Failed to load Git history'));
			}
		} finally {
			if (generation === loadGenerationRef.current) setIsLoading(false);
		}
	}, [projectId]);

	useEffect(() => {
		void load();
	}, [load]);

	useEffect(() => {
		const refreshStatus = () => {
			if (!projectId || !state.initialized) return;
			if (statusRefreshTimerRef.current !== null) {
				window.clearTimeout(statusRefreshTimerRef.current);
			}
			statusRefreshTimerRef.current = window.setTimeout(() => {
				statusRefreshTimerRef.current = null;
				void Promise.all([
					gitService.getChanges(projectId),
					gitService.getWorktreeChanges(projectId),
				])
					.then(([changes, worktreeChanges]) => {
						setState((current) =>
							current.initialized
								? { ...current, changes, worktreeChanges }
								: current,
						);
					})
					.catch((refreshError) => {
						moduleLog.warn('Failed to refresh Git status:', refreshError);
					});
			}, 250);
		};

		document.addEventListener('refresh-file-tree', refreshStatus);
		document.addEventListener('file-content-changed', refreshStatus);
		return () => {
			document.removeEventListener('refresh-file-tree', refreshStatus);
			document.removeEventListener('file-content-changed', refreshStatus);
			if (statusRefreshTimerRef.current !== null) {
				window.clearTimeout(statusRefreshTimerRef.current);
			}
		};
	}, [projectId, state.initialized]);

	const initialize = async () => {
		if (!projectId || isWorking) return;
		setIsWorking(true);
		setError(null);
		try {
			await gitService.initialize(projectId);
			await load();
		} catch (initError) {
			moduleLog.error('Failed to initialize Git history:', initError);
			setError(t('Failed to initialize Git history'));
		} finally {
			setIsWorking(false);
		}
	};

	const saveVersion = async () => {
		if (!projectId || !message.trim() || isWorking) return;
		setIsWorking(true);
		setError(null);
		setNotice(null);
		try {
			const oid = await gitService.commit(projectId, message, user);
			setMessage('');
			setNotice(t('Saved version {hash}.', { hash: shortGitOid(oid) }));
			onClearDiff();
			await load();
		} catch (saveError) {
			moduleLog.error('Failed to save Git version:', saveError);
			setError(
				saveError instanceof Error
					? saveError.message
					: t('Failed to save Git version'),
			);
		} finally {
			setIsWorking(false);
		}
	};

	const restoreEntry = async (entry: GitHistoryEntry) => {
		if (!projectId || isWorking) return;
		setIsWorking(true);
		setError(null);
		setNotice(null);
		try {
			const result = await gitService.restore(projectId, entry.oid, user);
			const restored = t('Restored working tree from {hash}.', {
				hash: shortGitOid(result.restoredOid),
			});
			const head = result.headOid
				? ` ${t('HEAD remains at {hash}.', { hash: shortGitOid(result.headOid) })}`
				: '';
			const safety = result.safetyCommitOid
				? `${t('Saved current edits first as commit {hash}.', {
						hash: shortGitOid(result.safetyCommitOid),
					})} `
				: '';
			setNotice(`${safety}${restored}${head}`);
			onClearDiff();
			await load();
		} catch (restoreError) {
			moduleLog.error('Failed to restore Git version:', restoreError);
			setError(
				restoreError instanceof Error
					? restoreError.message
					: t('Failed to restore Git version'),
			);
		} finally {
			setIsWorking(false);
		}
	};

	const openCurrentChange = async (change: GitChange) => {
		if (!projectId || isWorking) return;
		setError(null);
		try {
			const source = state.headOid
				? ({ kind: 'commit', oid: state.headOid } as const)
				: ({ kind: 'empty' } as const);
			const comparison = await gitService.compareFile(
				projectId,
				change.path,
				source,
				{ kind: 'worktree' },
			);
			if (!comparison) return;
			const file: GitComparisonFile = {
				...comparison,
				leftContent: comparison.rightContent,
				rightContent: comparison.leftContent,
			};
			const localView = file.isBinary
				? null
				: stripAnnotationTagsWithSpans(file.leftContent as string);
			const remoteView = file.isBinary
				? null
				: stripAnnotationTagsWithSpans(file.rightContent as string);
			const editableConflict: FileConflict = {
				path: file.path,
				isBinary: file.isBinary,
				localContent: file.leftContent,
				remoteContent: file.rightContent,
				localViewContent: localView?.content,
				remoteViewContent: remoteView?.content,
				localAnnotationSpans: localView?.spans,
				annotationSpans: remoteView?.spans,
				changeType: file.type,
			};
			onOpenDiff({
				file,
				leftLabel: t('Working tree'),
				rightLabel: state.headOid ? shortGitOid(state.headOid) : t('Empty'),
				key: `head-worktree-${state.headOid ?? 'empty'}-${change.path}`,
				editable: !file.isBinary,
				onSave: async (content) => {
					await gitService.writeWorktreeFile(
						projectId,
						change.path,
						mergeResolutionService.restoreEditedContent(
							editableConflict,
							content,
						),
					);
					const [changes, worktreeChanges] = await Promise.all([
						gitService.getChanges(projectId),
						gitService.getWorktreeChanges(projectId),
					]);
					setState((current) => ({ ...current, changes, worktreeChanges }));
				},
			});
		} catch (diffError) {
			moduleLog.error('Failed to open Git file diff:', diffError);
			setError(t('Failed to compare Git versions'));
		}
	};

	const openCommitFile = async (entry: GitHistoryEntry, path: string) => {
		if (!projectId || isWorking) return;
		setError(null);
		try {
			const parentOid = entry.parents[0] ?? null;
			const file = await gitService.compareFile(
				projectId,
				path,
				parentOid ? { kind: 'commit', oid: parentOid } : { kind: 'empty' },
				{ kind: 'commit', oid: entry.oid },
			);
			if (!file) return;
			onOpenDiff({
				file,
				leftLabel: parentOid ? shortGitOid(parentOid) : t('Empty'),
				rightLabel: shortGitOid(entry.oid),
				key: `commit-${parentOid ?? 'empty'}-${entry.oid}-${path}`,
			});
		} catch (diffError) {
			moduleLog.error('Failed to open Git commit diff:', diffError);
			setError(t('Failed to compare Git versions'));
		}
	};

	const openComparisonPair = async (
		leftOid: string,
		leftLabel: string,
		rightOid: string | null,
		rightLabel: string,
	) => {
		if (!projectId || isWorking || rightOid === leftOid) return;
		setIsWorking(true);
		setError(null);
		setNotice(null);
		try {
			const comparison = await gitService.compare(projectId, leftOid, rightOid);
			if (comparison.files.length === 0) {
				setNotice(t('The selected versions have no file differences.'));
				setCompareSource(null);
				return;
			}

			const editingWorktree = rightOid === null;
			const conflicts: FileConflict[] = comparison.files.map((file) => {
				const localContent = editingWorktree
					? file.rightContent
					: file.leftContent;
				const remoteContent = editingWorktree
					? file.leftContent
					: file.rightContent;
				if (file.isBinary) {
					return {
						path: file.path,
						isBinary: true,
						localContent,
						remoteContent,
						changeType: file.type,
					};
				}
				const local = stripAnnotationTagsWithSpans(localContent as string);
				const remote = stripAnnotationTagsWithSpans(remoteContent as string);
				return {
					path: file.path,
					isBinary: false,
					localContent,
					remoteContent,
					localViewContent: local.content,
					remoteViewContent: remote.content,
					localAnnotationSpans: local.spans,
					annotationSpans: remote.spans,
					changeType: file.type,
				};
			});
			setCompareSource(null);
			if (editingWorktree) {
				await mergeResolutionService.editFiles(
					conflicts,
					{ local: t('Working tree'), remote: leftLabel },
					t('Edit Working Tree from {source}', { source: leftLabel }),
					async (path, content) => {
						await gitService.writeWorktreeFile(projectId, path, content);
					},
				);
				await load();
			} else {
				await mergeResolutionService.compareFiles(
					conflicts,
					{ local: leftLabel, remote: rightLabel },
					t('Compare {left} ↔ {right}', { left: leftLabel, right: rightLabel }),
				);
			}
		} catch (compareError) {
			moduleLog.error('Failed to compare Git versions:', compareError);
			setError(
				compareError instanceof Error
					? compareError.message
					: t('Failed to compare Git versions'),
			);
		} finally {
			setIsWorking(false);
		}
	};

	const resetChange = async (change: GitChange) => {
		if (!projectId || isWorking) return;
		setIsWorking(true);
		setError(null);
		setNotice(null);
		try {
			await gitService.resetFile(projectId, change.path);
			onClearDiff();
			setNotice(t('Reset {path} to HEAD.', { path: change.path }));
			await load();
		} catch (resetError) {
			moduleLog.error('Failed to reset Git file:', resetError);
			setError(
				resetError instanceof Error
					? resetError.message
					: t('Failed to reset file'),
			);
		} finally {
			setIsWorking(false);
		}
	};

	const resetAllChanges = async () => {
		if (!projectId || isWorking || state.changes.length === 0) return;
		setIsWorking(true);
		setError(null);
		setNotice(null);
		try {
			await gitService.resetAll(projectId);
			onClearDiff();
			setNotice(t('Reset all working tree changes to HEAD.'));
			await load();
		} catch (resetError) {
			moduleLog.error('Failed to reset Git changes:', resetError);
			setError(
				resetError instanceof Error
					? resetError.message
					: t('Failed to reset changes'),
			);
		} finally {
			setIsWorking(false);
		}
	};

	const compareCommit = (entry: GitHistoryEntry) => {
		const targetLabel = shortGitOid(entry.oid);
		if (compareSource) {
			void openComparisonPair(
				compareSource.oid,
				compareSource.label,
				entry.oid,
				targetLabel,
			);
			return;
		}
		setCompareSource({ oid: entry.oid, label: targetLabel });
	};

	const compareBranch = (branchName: string, oid: string) => {
		if (compareSource) {
			void openComparisonPair(
				compareSource.oid,
				compareSource.label,
				oid,
				branchName,
			);
			return;
		}
		setCompareSource({ oid, label: branchName });
	};

	const switchBranch = async (branchName: string) => {
		if (!projectId || isWorking) return;
		setIsWorking(true);
		setError(null);
		setNotice(null);
		try {
			await gitService.checkout(projectId, branchName);
			setNotice(t('Switched to branch {branch}.', { branch: branchName }));
			setCompareSource(null);
			onClearDiff();
			await load();
		} catch (switchError) {
			moduleLog.error('Failed to switch Git branch:', switchError);
			setError(
				switchError instanceof Error
					? switchError.message
					: t('Failed to switch branch'),
			);
		} finally {
			setIsWorking(false);
		}
	};

	const createBranch = async () => {
		if (!projectId || !newBranchName.trim() || isWorking) return;
		setIsWorking(true);
		setError(null);
		setNotice(null);
		try {
			const name = newBranchName.trim();
			await gitService.createBranch(projectId, name);
			setNewBranchName('');
			setShowNewBranch(false);
			setNotice(t('Created branch {branch}.', { branch: name }));
			await load();
		} catch (branchError) {
			moduleLog.error('Failed to create Git branch:', branchError);
			setError(
				branchError instanceof Error
					? branchError.message
					: t('Failed to create branch'),
			);
		} finally {
			setIsWorking(false);
		}
	};

	const deleteBranch = async (branchName: string) => {
		if (!projectId || isWorking) return;
		setIsWorking(true);
		setError(null);
		setNotice(null);
		try {
			await gitService.deleteBranch(projectId, branchName);
			setNotice(t('Deleted branch {branch}.', { branch: branchName }));
			if (compareSource?.label === branchName) setCompareSource(null);
			await load();
		} catch (deleteError) {
			moduleLog.error('Failed to delete Git branch:', deleteError);
			setError(
				deleteError instanceof Error
					? deleteError.message
					: t('Failed to delete branch'),
			);
		} finally {
			setIsWorking(false);
		}
	};

	const mergeNotice = (branchName: string, result: GitBranchMergeResult) => {
		if (result.status !== 'merged') return;
		if (result.alreadyMerged) {
			setNotice(
				t('Branch {branch} is already merged.', { branch: branchName }),
			);
		} else if (result.fastForward) {
			setNotice(
				t('Fast-forwarded {branch} into {current}.', {
					branch: branchName,
					current: state.branch ?? 'HEAD',
				}),
			);
		} else {
			setNotice(
				t('Merged {branch} into {current}.', {
					branch: branchName,
					current: state.branch ?? 'HEAD',
				}),
			);
		}
	};

	const resolutionText = (
		plan: GitMergePlan,
		resolutions: Map<string, ConflictResolution>,
	): Map<string, string> => {
		const text = new Map<string, string>();
		for (const conflict of plan.conflicts) {
			const resolution = resolutions.get(conflict.path);
			if (!resolution) continue;
			const content =
				resolution.action === 'keep-local'
					? conflict.localContent
					: resolution.action === 'keep-remote'
						? conflict.remoteContent
						: resolution.content;
			if (typeof content !== 'string') {
				throw new Error(
					'Binary merge conflicts cannot be resolved in the text merge editor',
				);
			}
			text.set(conflict.path, content);
		}
		return text;
	};

	const resolveBranchConflicts = async (
		plan: GitMergePlan,
		remoteLabel = plan.theirsBranch,
	) => {
		const unsupported = plan.conflicts.find(
			(conflict) =>
				conflict.isBinary || !conflict.localExists || !conflict.remoteExists,
		);
		if (unsupported) {
			throw new Error(
				t(
					'Merge conflict in {path} involves a binary file or deletion and cannot be resolved safely in the text editor.',
					{
						path: unsupported.path,
					},
				),
			);
		}

		const conflicts: FileConflict[] = plan.conflicts.map((conflict) => {
			const local = stripAnnotationTagsWithSpans(
				conflict.localContent as string,
			);
			const remote = stripAnnotationTagsWithSpans(
				conflict.remoteContent as string,
			);
			return {
				path: conflict.path,
				isBinary: false,
				baseContent: conflict.baseContent as string,
				localContent: conflict.localContent,
				remoteContent: conflict.remoteContent,
				localViewContent: local.content,
				remoteViewContent: remote.content,
				localAnnotationSpans: local.spans,
				annotationSpans: remote.spans,
			};
		});

		const resolutions = await mergeResolutionService.resolveConflicts(
			conflicts,
			{
				keepLocal: t('Keep {branch}', { branch: plan.oursBranch }),
				keepRemote: t('Keep {branch}', { branch: remoteLabel }),
			},
		);
		if (!resolutions) return null;
		return resolutionText(plan, resolutions);
	};

	const mergeBranch = async (branch: GitBranch) => {
		if (!projectId || isWorking) return;
		setIsWorking(true);
		setError(null);
		setNotice(null);
		try {
			let result = await gitService.mergeBranch(projectId, branch.name, user);
			if (result.status === 'conflicts') {
				const resolved = await resolveBranchConflicts(result.plan);
				if (!resolved) {
					setNotice(t('Merge cancelled.'));
					return;
				}
				result = await gitService.completeBranchMerge(
					projectId,
					result.plan,
					resolved,
					user,
				);
			}
			mergeNotice(branch.name, result);
			setCompareSource(null);
			onClearDiff();
			await load();
		} catch (mergeError) {
			moduleLog.error('Failed to merge Git branch:', mergeError);
			setError(
				mergeError instanceof Error
					? mergeError.message
					: t('Failed to merge branch'),
			);
		} finally {
			setIsWorking(false);
		}
	};

	const pullRemote = async (secrets: SecretsContextType) => {
		if (!projectId || !remoteConfig || isWorking) return;
		setIsWorking(true);
		setError(null);
		setNotice(null);
		let temporaryBranch: string | null = null;
		let shouldReload = false;
		try {
			const fetched = await gitSyncService.fetchForMerge(projectId, secrets);
			if (!fetched) {
				setNotice(t('The remote branch is empty. Push to initialize it.'));
				return;
			}
			temporaryBranch = fetched.temporaryBranch;
			const remoteLabel = `${fetched.repositoryLabel} · ${fetched.remoteBranch}`;

			if (!(await gitService.getHeadOid(projectId))) {
				await gitSyncService.adoptFetched(projectId, fetched);
				setNotice(
					t('Pulled {remote}.', {
						remote: remoteLabel,
					}),
				);
			} else {
				let result = await gitService.mergeBranch(
					projectId,
					fetched.temporaryBranch,
					user,
					{ allowUnrelatedHistories: true },
				);
				if (result.status === 'conflicts') {
					const resolved = await resolveBranchConflicts(
						result.plan,
						remoteLabel,
					);
					if (!resolved) {
						setNotice(t('Pull cancelled.'));
						return;
					}
					result = await gitService.completeBranchMerge(
						projectId,
						result.plan,
						resolved,
						user,
					);
				}
				if (result.status === 'merged') {
					if (result.alreadyMerged) {
						setNotice(
							t('Already up to date with {remote}.', { remote: remoteLabel }),
						);
					} else if (result.fastForward) {
						setNotice(
							t('Pulled {remote} (fast-forward).', { remote: remoteLabel }),
						);
					} else {
						setNotice(
							t('Pulled and merged {remote}.', { remote: remoteLabel }),
						);
					}
				}
			}
			await gitService.resetAll(projectId);
			gitSyncService.markFetchedSynced(projectId, fetched);
			setCompareSource(null);
			onClearDiff();
			shouldReload = true;
		} catch (pullError) {
			moduleLog.error('Failed to pull Git remote:', pullError);
			setError(
				pullError instanceof Error
					? pullError.message
					: t('Failed to pull remote'),
			);
		} finally {
			if (temporaryBranch) {
				await gitSyncService
					.discardFetched(projectId, temporaryBranch)
					.catch((cleanupError) => {
						moduleLog.warn(
							'Failed to remove temporary remote branch:',
							cleanupError,
						);
					});
			}
			setIsWorking(false);
			if (shouldReload) await load();
		}
	};

	const pushRemote = async (secrets: SecretsContextType) => {
		if (!projectId || !remoteConfig || isWorking) return;
		setIsWorking(true);
		setError(null);
		setNotice(null);
		try {
			const result = await gitSyncService.push(projectId, secrets);
			setNotice(
				t('Pushed {local} to {remote}.', {
					local: result.localBranch,
					remote: `${result.repositoryLabel} · ${result.remoteBranch}`,
				}),
			);
			await load();
		} catch (pushError) {
			moduleLog.error('Failed to push Git remote:', pushError);
			setError(
				pushError instanceof Error
					? pushError.message
					: t('Failed to push remote'),
			);
		} finally {
			setIsWorking(false);
		}
	};

	const confirmPendingAction = async (action: PendingGitAction) => {
		if (isWorking) return;
		setPendingAction(null);

		switch (action.kind) {
			case 'switch-branch':
				await switchBranch(action.branchName);
				break;
			case 'merge-branch':
				await mergeBranch(action.branch);
				break;
			case 'delete-branch':
				await deleteBranch(action.branchName);
				break;
			case 'reset-file':
				await resetChange(action.change);
				break;
			case 'reset-all':
				await resetAllChanges();
				break;
			case 'restore':
				await restoreEntry(action.entry);
				break;
		}
	};

	const renderPanelHeader = () => (
		<div className='ui-panel-header' data-role='explorer' data-position='top'>
			<h3 className='ui-panel-title' data-size='body' data-shrink='true'>
				{t('History')}
			</h3>
			<div className='ui-toolbar-actions scroll-x' data-gap='sm'>
				<button
					type='button'
					className='ui-icon-button'
					data-variant='subtle'
					title={t('Git Remote')}
					aria-label={t('Git Remote')}
					onClick={() => setShowRemoteModal(true)}
					disabled={!projectId}
				>
					<GitRemoteIcon />
				</button>
			</div>
		</div>
	);

	const renderRemoteModal = () =>
		projectId && showRemoteModal ? (
			<GitRemoteModal
				isOpen={showRemoteModal}
				onClose={() => setShowRemoteModal(false)}
				projectId={projectId}
			/>
		) : null;

	if (!projectId) {
		return (
			<div className='git-history-panel ui-panel'>
				{renderPanelHeader()}
				<div className='ui-empty-state'>{t('No project selected')}</div>
			</div>
		);
	}

	if (isLoading && !state.initialized) {
		return (
			<div className='git-history-panel ui-panel'>
				{renderPanelHeader()}
				<div className='git-history-loading'>{t('Loading...')}</div>
				{renderRemoteModal()}
			</div>
		);
	}

	if (!state.initialized) {
		return (
			<div className='git-history-panel ui-panel'>
				{renderPanelHeader()}
				<div className='git-history-initialize'>
					<p>
						{t(
							'Git history is stored only in this browser and is not shared with collaborators.',
						)}
					</p>
					<button
						type='button'
						className='button primary'
						onClick={() => void initialize()}
						disabled={isWorking}
					>
						{isWorking ? t('Initializing...') : t('Initialize Git History')}
					</button>
				</div>
				{renderRemoteModal()}
			</div>
		);
	}

	return (
		<div className='git-history-panel ui-panel'>
			{renderPanelHeader()}
			<div className='git-history-commit-box git-history-commit-top ui-panel-controls'>
				<input
					type='text'
					value={message}
					onChange={(event) => setMessage(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'Enter') void saveVersion();
					}}
					placeholder={t('Version message')}
					disabled={isWorking}
					className='ui-field-control'
				/>
				<button
					type='button'
					className='button primary '
					onClick={() => void saveVersion()}
					disabled={!message.trim() || state.changes.length === 0 || isWorking}
				>
					{t('Commit')}
				</button>
			</div>

			{remoteConfig && (
				<GitRemoteSyncControls
					remote={remoteConfig}
					isWorking={isWorking}
					hasHead={Boolean(state.headOid)}
					onPull={pullRemote}
					onPush={pushRemote}
				/>
			)}

			{error && (
				<div className='git-history-message ui-message' data-tone='error'>
					{error}
				</div>
			)}
			{notice && (
				<div className='git-history-message ui-message' data-tone='info'>
					{notice}
				</div>
			)}
			{compareSource && (
				<div className='git-history-compare-mode git-history-compare-top'>
					<span>
						{t('Compare')} <strong>{compareSource.label}</strong> →
					</span>
					<button
						type='button'
						className='git-history-inline-action'
						onClick={() =>
							void openComparisonPair(
								compareSource.oid,
								compareSource.label,
								null,
								t('Working tree'),
							)
						}
					>
						{t('Working tree')}
					</button>
					<button
						type='button'
						className='git-history-compare-cancel'
						onClick={() => setCompareSource(null)}
						aria-label={t('Cancel comparison')}
						title={t('Cancel comparison')}
					>
						×
					</button>
				</div>
			)}

			{propertiesLoaded && (
				<GitHistorySections
					state={state}
					sectionSizes={sectionSizes}
					branchesCollapsed={branchesCollapsed}
					changesCollapsed={changesCollapsed}
					historyCollapsed={historyCollapsed}
					isLoading={isLoading}
					isWorking={isWorking}
					compareSource={compareSource}
					showNewBranch={showNewBranch}
					newBranchName={newBranchName}
					onSizesChangeEnd={persistSectionSizes}
					onToggleBranches={toggleBranches}
					onToggleChanges={toggleChanges}
					onToggleHistory={toggleHistory}
					onToggleNewBranch={() => setShowNewBranch((value) => !value)}
					onNewBranchNameChange={setNewBranchName}
					onCancelNewBranch={() => {
						setShowNewBranch(false);
						setNewBranchName('');
					}}
					onCreateBranch={() => void createBranch()}
					onRefresh={() => void load()}
					onRequestAction={setPendingAction}
					onCompareBranch={compareBranch}
					onOpenCurrentChange={(change) => void openCurrentChange(change)}
					onCompareCommit={compareCommit}
					onOpenCommitFile={(entry, path) => void openCommitFile(entry, path)}
				/>
			)}

			<GitHistoryActionModal
				action={pendingAction}
				currentBranch={state.branch}
				worktreeChangeCount={state.worktreeChanges.length}
				isWorking={isWorking}
				onClose={() => setPendingAction(null)}
				onConfirm={confirmPendingAction}
			/>
			{renderRemoteModal()}
		</div>
	);
};

export default GitHistoryPanel;
