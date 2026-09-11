// src/components/history/GitHistorySections.tsx
import type React from 'react';
import { useMemo, useState } from 'react';

import { t } from '@/i18n';
import type {
	GitChange,
	GitComparisonFile,
	GitHistoryEntry,
	GitProjectState,
} from '../../services/GitService';
import { formatDate } from '../../utils/dateUtils';
import ResizablePanel, { ResizablePanelGroup } from '../common/ResizablePanel';
import {
	ChevronDownIcon,
	ChevronRightIcon,
	GitBranchIcon,
	PlusIcon,
	RefreshIcon,
	TrashIcon,
	UndoIcon,
} from '../common/Icons';
import type { PendingGitAction } from './GitHistoryActionModal';

export const GIT_HISTORY_MIN_SECTION_SIZE = 12;

export const shortGitOid = (oid: string | null): string =>
	oid ? oid.slice(0, 7) : '—';

const changeLabel = (change: GitChange | GitComparisonFile): string => {
	if (change.type === 'added') return 'A';
	if (change.type === 'deleted') return 'D';
	return 'M';
};

const CompareGlyph = () => <span className='git-history-action-glyph'>↔</span>;
const RestoreGlyph = () => <span className='git-history-action-glyph'>↶</span>;
const SwitchGlyph = () => <span className='git-history-action-glyph'>→</span>;
const MergeGlyph = () => <span className='git-history-action-glyph'>⇣</span>;

type GraphRow = {
	lane: number;
	hasIncoming: boolean;
	before: string[];
	after: string[];
	parentLanes: number[];
};

export function buildGitGraphRows(history: GitHistoryEntry[]): {
	rows: GraphRow[];
	maxLanes: number;
} {
	const lanes: string[] = [];
	const rows: GraphRow[] = [];
	let maxLanes = 1;

	const allocateLane = (oid: string): number => {
		const existing = lanes.indexOf(oid);
		if (existing >= 0) return existing;
		const empty = lanes.findIndex((value) => !value);
		if (empty >= 0) {
			lanes[empty] = oid;
			return empty;
		}
		lanes.push(oid);
		return lanes.length - 1;
	};

	for (const entry of history) {
		const existingLane = lanes.indexOf(entry.oid);
		const hasIncoming = existingLane >= 0;
		const lane = hasIncoming ? existingLane : allocateLane(entry.oid);
		const before = [...lanes];
		const parentLanes: number[] = [];
		const [firstParent, ...otherParents] = entry.parents;

		if (firstParent) {
			const existing = lanes.indexOf(firstParent);
			if (existing >= 0 && existing !== lane) {
				lanes[lane] = '';
				parentLanes.push(existing);
			} else {
				lanes[lane] = firstParent;
				parentLanes.push(lane);
			}
		} else {
			lanes[lane] = '';
		}

		for (const parent of otherParents) {
			parentLanes.push(allocateLane(parent));
		}

		const after = [...lanes];
		maxLanes = Math.max(maxLanes, before.length, after.length);
		rows.push({ lane, hasIncoming, before, after, parentLanes });
		while (lanes.length > 0 && !lanes[lanes.length - 1]) lanes.pop();
	}

	return { rows, maxLanes };
}

interface GitGraphProps {
	row: GraphRow;
	width: number;
	isHead: boolean;
	isWorktree: boolean;
}

const GitGraph: React.FC<GitGraphProps> = ({
	row,
	width,
	isHead,
	isWorktree,
}) => {
	const laneGap = 12;
	const x = (lane: number) => 7 + lane * laneGap;
	const centerY = 16;

	return (
		<div
			className='git-history-graph-wrap'
			style={{ width }}
			aria-hidden='true'
		>
			<svg
				className='git-history-graph'
				width={width}
				height='32'
				viewBox={`0 0 ${width} 32`}
			>
				<title>{t('Git history graph')}</title>
				{row.before.map((oid, lane) =>
					oid && lane !== row.lane ? (
						<line
							key={`lane-${lane}`}
							x1={x(lane)}
							y1='0'
							x2={x(lane)}
							y2='32'
							className={`git-history-graph-line lane-${lane % 4}`}
						/>
					) : null,
				)}
				{row.hasIncoming && (
					<line
						x1={x(row.lane)}
						y1='0'
						x2={x(row.lane)}
						y2={centerY}
						className={`git-history-graph-line lane-${row.lane % 4}`}
					/>
				)}
				{row.parentLanes.map((parentLane, index) => (
					<line
						key={`parent-${index}-${parentLane}`}
						x1={x(row.lane)}
						y1={centerY}
						x2={x(parentLane)}
						y2='32'
						className={`git-history-graph-line lane-${parentLane % 4}`}
					/>
				))}
				<circle
					cx={x(row.lane)}
					cy={centerY}
					r={isHead ? 4.25 : isWorktree ? 3.9 : 3.25}
					className={`git-history-graph-node lane-${row.lane % 4}${isHead ? ' head' : ''}${isWorktree ? ' worktree' : ''}`}
				/>
			</svg>
		</div>
	);
};

interface GitSectionHeaderProps {
	title: string;
	count: number;
	collapsed: boolean;
	onToggle: () => void;
	actions?: React.ReactNode;
}

const GitSectionHeader: React.FC<GitSectionHeaderProps> = ({
	title,
	count,
	collapsed,
	onToggle,
	actions,
}) => (
	<div className='git-history-outline-heading ui-section-header ui-explorer-heading'>
		<button
			type='button'
			className='ui-icon-button'
			data-variant='subtle'
			data-size='xs'
			onClick={onToggle}
			title={
				collapsed
					? t('Expand {section}', { section: title })
					: t('Collapse {section}', { section: title })
			}
			aria-label={
				collapsed
					? t('Expand {section}', { section: title })
					: t('Collapse {section}', { section: title })
			}
		>
			{collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
		</button>
		<span className='outline-header-title ui-panel-title ui-section-title'>
			{title}
		</span>
		<span className='ui-badge' data-variant='label'>
			{count}
		</span>
		{actions && (
			<div className='git-history-heading-actions ui-toolbar-actions ui-section-actions'>
				{actions}
			</div>
		)}
	</div>
);

type SectionSizes = {
	branches: number;
	changes: number;
	history: number;
};

type CompareSource = {
	oid: string;
	label: string;
} | null;

interface GitHistorySectionsProps {
	state: GitProjectState;
	sectionSizes: SectionSizes;
	branchesCollapsed: boolean;
	changesCollapsed: boolean;
	historyCollapsed: boolean;
	isLoading: boolean;
	isWorking: boolean;
	compareSource: CompareSource;
	showNewBranch: boolean;
	newBranchName: string;
	onSizesChangeEnd: (sizes: Record<string, number>) => void;
	onToggleBranches: () => void;
	onToggleChanges: () => void;
	onToggleHistory: () => void;
	onToggleNewBranch: () => void;
	onNewBranchNameChange: (name: string) => void;
	onCancelNewBranch: () => void;
	onCreateBranch: () => void;
	onRefresh: () => void;
	onRequestAction: (action: PendingGitAction) => void;
	onCompareBranch: (branchName: string, oid: string) => void;
	onOpenCurrentChange: (change: GitChange) => void;
	onCompareCommit: (entry: GitHistoryEntry) => void;
	onOpenCommitFile: (entry: GitHistoryEntry, path: string) => void;
}

const GitHistorySections: React.FC<GitHistorySectionsProps> = ({
	state,
	sectionSizes,
	branchesCollapsed,
	changesCollapsed,
	historyCollapsed,
	isLoading,
	isWorking,
	compareSource,
	showNewBranch,
	newBranchName,
	onSizesChangeEnd,
	onToggleBranches,
	onToggleChanges,
	onToggleHistory,
	onToggleNewBranch,
	onNewBranchNameChange,
	onCancelNewBranch,
	onCreateBranch,
	onRefresh,
	onRequestAction,
	onCompareBranch,
	onOpenCurrentChange,
	onCompareCommit,
	onOpenCommitFile,
}) => {
	const graph = useMemo(
		() => buildGitGraphRows(state.history),
		[state.history],
	);
	const graphWidth = Math.max(26, graph.maxLanes * 12 + 10);
	const sortedBranches = useMemo(
		() =>
			[...state.branches].sort((a, b) => {
				if (a.name === state.branch) return -1;
				if (b.name === state.branch) return 1;
				return a.name.localeCompare(b.name);
			}),
		[state.branches, state.branch],
	);
	const historyByOid = useMemo(
		() => new Map(state.history.map((entry) => [entry.oid, entry])),
		[state.history],
	);
	const [expandedCommitOid, setExpandedCommitOid] = useState<string | null>(
		null,
	);

	return (
		<ResizablePanelGroup
			direction='vertical'
			className='git-history-panel-stack'
			defaultSizes={sectionSizes}
			onSizesChangeEnd={onSizesChangeEnd}
		>
			<ResizablePanel
				direction='vertical'
				alignment='start'
				className='git-history-stack-panel changes'
				collapsible={false}
				collapsed={changesCollapsed}
				stackId='changes'
				stackDefaultSize={sectionSizes.changes}
				stackMinSize={GIT_HISTORY_MIN_SECTION_SIZE}
			>
				<section className='git-history-outline-section changes'>
					<GitSectionHeader
						title={t('Changes')}
						count={state.changes.length}
						collapsed={changesCollapsed}
						onToggle={onToggleChanges}
						actions={
							state.changes.length > 0 ? (
								<button
									type='button'
									className='ui-icon-button git-history-action-btn'
									data-variant='subtle'
									aria-label={t('Reset all changes')}
									title={t('Reset all changes')}
									disabled={isWorking}
									onClick={() => onRequestAction({ kind: 'reset-all' })}
								>
									<UndoIcon />
								</button>
							) : undefined
						}
					/>
					{!changesCollapsed && (
						<div className='git-history-section-body'>
							{state.changes.length === 0 ? (
								<div className='git-history-empty-row ui-note'>
									{t('No changes')}
								</div>
							) : (
								<div className='git-history-file-list ui-list'>
									{state.changes.map((change) => (
										<div
											key={`${change.type}-${change.path}`}
											className='git-history-file-row-wrap'
										>
											<button
												type='button'
												className='git-history-file-row'
												onClick={() => void onOpenCurrentChange(change)}
												title={change.path}
											>
												<code className={`git-change-status ${change.type}`}>
													{changeLabel(change)}
												</code>
												<span>{change.path}</span>
											</button>
											<button
												type='button'
												className='ui-icon-button git-history-action-btn'
												data-variant='subtle'
												aria-label={t('Reset {path}', { path: change.path })}
												title={t('Reset {path}', { path: change.path })}
												disabled={isWorking}
												onClick={() =>
													onRequestAction({ kind: 'reset-file', change })
												}
											>
												<UndoIcon />
											</button>
										</div>
									))}
								</div>
							)}
						</div>
					)}
				</section>
			</ResizablePanel>

			<ResizablePanel
				direction='vertical'
				alignment='start'
				className='git-history-stack-panel branches'
				collapsible={false}
				collapsed={branchesCollapsed}
				stackId='branches'
				stackDefaultSize={sectionSizes.branches}
				stackMinSize={GIT_HISTORY_MIN_SECTION_SIZE}
			>
				<section className='git-history-outline-section branches'>
					<GitSectionHeader
						title={t('Branches')}
						count={state.branches.length}
						collapsed={branchesCollapsed}
						onToggle={onToggleBranches}
						actions={
							<>
								<button
									type='button'
									className='ui-icon-button git-history-add-branch'
									data-variant='subtle'
									title={t('New branch')}
									aria-label={t('New branch')}
									onClick={onToggleNewBranch}
									disabled={isWorking || !state.headOid}
								>
									<PlusIcon />
								</button>
								<button
									type='button'
									className='ui-icon-button'
									data-variant='subtle'
									title={t('Refresh')}
									aria-label={t('Refresh')}
									onClick={onRefresh}
									disabled={isLoading || isWorking}
								>
									<RefreshIcon />
								</button>
							</>
						}
					/>

					{!branchesCollapsed && (
						<div className='git-history-section-body'>
							{showNewBranch && (
								<div className='git-history-new-branch'>
									<div className='ui-field-with-action'>
										<input
											type='text'
											value={newBranchName}
											onChange={(event) =>
												onNewBranchNameChange(event.target.value)
											}
											onKeyDown={(event) => {
												if (event.key === 'Enter') onCreateBranch();
												if (event.key === 'Escape') {
													onCancelNewBranch();
												}
											}}
											placeholder={t('Branch name')}
											disabled={isWorking}
											className='ui-field-control'
										/>
										<button
											type='button'
											aria-label={t('Cancel new branch')}
											className='ui-field-clear'
											onMouseDown={(event) => {
												event.preventDefault();
												onCancelNewBranch();
											}}
											title={t('Cancel new branch')}
										>
											<span aria-hidden='true'>×</span>
										</button>
									</div>
									<button
										type='button'
										className='button primary '
										onClick={onCreateBranch}
										disabled={!newBranchName.trim() || isWorking}
									>
										{t('Create')}
									</button>
								</div>
							)}

							<div className='ui-list'>
								{sortedBranches.map((branch) => {
									const isCurrent = branch.name === state.branch;
									const worktreeBlocked = state.changes.length > 0;
									const tipEntry = historyByOid.get(branch.oid);
									return (
										<div
											key={branch.name}
											className={`git-history-branch-row${isCurrent ? ' current' : ''}`}
										>
											<span
												className='git-history-branch-icon'
												aria-hidden='true'
											>
												<GitBranchIcon />
											</span>
											<div className='git-history-branch-copy ui-list-content'>
												<div className='git-history-primary-line'>
													<strong>{branch.name}</strong>
													{isCurrent && (
														<span className='git-ref-chip strong'>HEAD</span>
													)}
												</div>
												<span className='git-history-item-meta'>
													<code>{shortGitOid(branch.oid)}</code>
													{tipEntry && (
														<>
															<span aria-hidden='true'>·</span>
															<span>{formatDate(tipEntry.timestamp)}</span>
														</>
													)}
												</span>
											</div>
											<div className='git-history-branch-actions ui-list-actions'>
												{!isCurrent && (
													<button
														type='button'
														className='ui-icon-button git-history-action-btn'
														data-variant='subtle'
														aria-label={t('Switch to {branch}', {
															branch: branch.name,
														})}
														title={
															worktreeBlocked
																? t('Commit or restore current changes first')
																: t('Switch to {branch}', {
																		branch: branch.name,
																	})
														}
														disabled={isWorking || worktreeBlocked}
														onClick={() =>
															onRequestAction({
																kind: 'switch-branch',
																branchName: branch.name,
															})
														}
													>
														<SwitchGlyph />
													</button>
												)}
												<button
													type='button'
													className='ui-icon-button git-history-action-btn'
													data-variant='subtle'
													aria-label={
														compareSource
															? t('Compare with {branch}', {
																	branch: branch.name,
																})
															: t('Compare from {branch}', {
																	branch: branch.name,
																})
													}
													title={
														compareSource
															? t('Compare with {branch}', {
																	branch: branch.name,
																})
															: t('Compare from {branch}', {
																	branch: branch.name,
																})
													}
													disabled={
														isWorking || compareSource?.oid === branch.oid
													}
													onClick={() =>
														onCompareBranch(branch.name, branch.oid)
													}
												>
													<CompareGlyph />
												</button>
												{!isCurrent && (
													<>
														<button
															type='button'
															className='ui-icon-button git-history-action-btn'
															data-variant='subtle'
															aria-label={t('Merge {branch} into {current}', {
																branch: branch.name,
																current: state.branch ?? 'HEAD',
															})}
															title={t('Merge {branch} into {current}', {
																branch: branch.name,
																current: state.branch ?? 'HEAD',
															})}
															disabled={isWorking || worktreeBlocked}
															onClick={() =>
																onRequestAction({
																	kind: 'merge-branch',
																	branch,
																})
															}
														>
															<MergeGlyph />
														</button>
														<button
															type='button'
															className='ui-icon-button git-history-action-btn'
															data-variant='subtle'
															aria-label={t('Delete branch {branch}', {
																branch: branch.name,
															})}
															title={t('Delete branch {branch}', {
																branch: branch.name,
															})}
															disabled={isWorking}
															onClick={() =>
																onRequestAction({
																	kind: 'delete-branch',
																	branchName: branch.name,
																})
															}
														>
															<TrashIcon />
														</button>
													</>
												)}
											</div>
										</div>
									);
								})}
							</div>
							{state.changes.length > 0 && (
								<div className='git-history-branch-note ui-note'>
									{t(
										'Switching and merging are disabled until current changes are committed or restored.',
									)}
								</div>
							)}
						</div>
					)}
				</section>
			</ResizablePanel>

			<ResizablePanel
				direction='vertical'
				alignment='start'
				className='git-history-stack-panel history'
				collapsible={false}
				collapsed={historyCollapsed}
				stackId='history'
				stackDefaultSize={sectionSizes.history}
				stackMinSize={GIT_HISTORY_MIN_SECTION_SIZE}
			>
				<section className='git-history-outline-section history'>
					<GitSectionHeader
						title={t('Graph')}
						count={state.history.length}
						collapsed={historyCollapsed}
						onToggle={onToggleHistory}
					/>
					{!historyCollapsed && (
						<div className='git-history-section-body history-body'>
							<div className='git-history-timeline-scroll'>
								{state.history.length === 0 ? (
									<div className='git-history-empty-row ui-note'>
										{t('No versions yet')}
									</div>
								) : (
									<div className='ui-list'>
										{state.history.map((entry, index) => {
											const isHead = entry.oid === state.headOid;
											const isWorktreeBase =
												entry.oid === state.worktreeBaseOid;
											const isWorktreeExact =
												isWorktreeBase && state.worktreeChanges.length === 0;
											const expanded = entry.oid === expandedCommitOid;
											return (
												<div
													key={entry.oid}
													className={`git-history-commit-group${expanded ? ' expanded' : ''}`}
													style={
														{
															'--git-graph-width': `${graphWidth}px`,
														} as React.CSSProperties
													}
												>
													<GitGraph
														row={graph.rows[index]}
														width={graphWidth}
														isHead={isHead}
														isWorktree={isWorktreeBase && !isHead}
													/>
													<div className='git-history-commit-row'>
														<button
															type='button'
															className='git-history-commit-main'
															onClick={() =>
																setExpandedCommitOid((current) =>
																	current === entry.oid ? null : entry.oid,
																)
															}
															aria-expanded={expanded}
															aria-controls={`git-history-files-${entry.oid}`}
															title={`${entry.message || t('(no message)')}\n${shortGitOid(entry.oid)} · ${formatDate(entry.timestamp)}`}
														>
															<span
																className='git-history-commit-expander'
																aria-hidden='true'
															>
																{expanded ? (
																	<ChevronDownIcon />
																) : (
																	<ChevronRightIcon />
																)}
															</span>
															<span className='git-history-commit-copy ui-list-content'>
																<span className='git-history-primary-line'>
																	<span className='git-history-commit-title'>
																		{entry.message || t('(no message)')}
																	</span>
																	<span className='git-history-inline-refs'>
																		{isHead && (
																			<span className='git-ref-chip strong'>
																				HEAD
																			</span>
																		)}
																		{isWorktreeBase && !isHead && (
																			<span className='git-ref-chip worktree'>
																				{isWorktreeExact ? 'WORKTREE' : 'BASE'}
																			</span>
																		)}
																		{entry.branches.map((branch) => (
																			<span
																				key={branch}
																				className='git-ref-chip'
																			>
																				{branch}
																			</span>
																		))}
																	</span>
																</span>
																<span className='git-history-item-meta'>
																	<code>{shortGitOid(entry.oid)}</code>
																	<span aria-hidden='true'>·</span>
																	<span>{formatDate(entry.timestamp)}</span>
																</span>
															</span>
														</button>
														<div className='git-history-commit-inline-actions ui-list-actions'>
															<button
																type='button'
																className='ui-icon-button git-history-action-btn'
																data-variant='subtle'
																aria-label={
																	compareSource
																		? t('Compare with {hash}', {
																				hash: shortGitOid(entry.oid),
																			})
																		: t('Compare from {hash}', {
																				hash: shortGitOid(entry.oid),
																			})
																}
																title={
																	compareSource
																		? t('Compare with {hash}', {
																				hash: shortGitOid(entry.oid),
																			})
																		: t('Compare from {hash}', {
																				hash: shortGitOid(entry.oid),
																			})
																}
																disabled={
																	isWorking || compareSource?.oid === entry.oid
																}
																onClick={() => onCompareCommit(entry)}
															>
																<CompareGlyph />
															</button>
															<button
																type='button'
																className='ui-icon-button git-history-action-btn'
																data-variant='subtle'
																aria-label={
																	isWorktreeExact
																		? t('Current version')
																		: t('Restore {hash}', {
																				hash: shortGitOid(entry.oid),
																			})
																}
																title={
																	isWorktreeExact
																		? t('Current version')
																		: t('Restore {hash}', {
																				hash: shortGitOid(entry.oid),
																			})
																}
																disabled={isWorking || isWorktreeExact}
																onClick={() =>
																	onRequestAction({ kind: 'restore', entry })
																}
															>
																<RestoreGlyph />
															</button>
														</div>
													</div>
													{expanded && (
														<div
															id={`git-history-files-${entry.oid}`}
															className='git-history-commit-files'
														>
															{entry.fileChanges.length === 0 ? (
																<div className='git-history-empty-row ui-note'>
																	{t('No file changes')}
																</div>
															) : (
																<div className='git-history-file-list commit-files ui-list'>
																	{entry.fileChanges.map((change) => (
																		<button
																			type='button'
																			key={`${change.type}-${change.path}`}
																			className='git-history-file-row'
																			onClick={() =>
																				void onOpenCommitFile(
																					entry,
																					change.path,
																				)
																			}
																			title={change.path}
																		>
																			<code
																				className={`git-change-status ${change.type}`}
																			>
																				{changeLabel(change)}
																			</code>
																			<span>{change.path}</span>
																		</button>
																	))}
																</div>
															)}
														</div>
													)}
												</div>
											);
										})}
									</div>
								)}
							</div>
						</div>
					)}
				</section>
			</ResizablePanel>
		</ResizablePanelGroup>
	);
};

export default GitHistorySections;
