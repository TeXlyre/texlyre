// src/components/history/GitHistoryActionModal.tsx
import type React from 'react';

import { t } from '@/i18n';
import type {
	GitBranch,
	GitChange,
	GitHistoryEntry,
} from '../../services/GitService';
import Modal from '../common/Modal';

export type PendingGitAction =
	| { kind: 'switch-branch'; branchName: string }
	| { kind: 'merge-branch'; branch: GitBranch }
	| { kind: 'delete-branch'; branchName: string }
	| { kind: 'reset-file'; change: GitChange }
	| { kind: 'reset-all' }
	| { kind: 'restore'; entry: GitHistoryEntry };

type Confirmation = {
	title: string;
	message: string;
	warning: string;
	confirmLabel: string;
	danger: boolean;
};

interface GitHistoryActionModalProps {
	action: PendingGitAction | null;
	currentBranch: string | null;
	worktreeChangeCount: number;
	isWorking: boolean;
	onClose: () => void;
	onConfirm: (action: PendingGitAction) => void | Promise<void>;
}

const shortOid = (oid: string): string => oid.slice(0, 7);

const getConfirmation = (
	action: PendingGitAction,
	currentBranch: string | null,
	worktreeChangeCount: number,
): Confirmation => {
	switch (action.kind) {
		case 'switch-branch':
			return {
				title: t('Switch branch'),
				message: t('Switch from {current} to {branch}?', {
					current: currentBranch ?? 'HEAD',
					branch: action.branchName,
				}),
				warning: t(
					'Project files will change and may be visible to collaborators.',
				),
				confirmLabel: t('Switch'),
				danger: false,
			};
		case 'merge-branch':
			return {
				title: t('Merge branch'),
				message: t('Merge {branch} into {current}?', {
					branch: action.branch.name,
					current: currentBranch ?? 'HEAD',
				}),
				warning: t(
					'A merge can rewrite project files and may be visible to collaborators.',
				),
				confirmLabel: t('Merge'),
				danger: false,
			};
		case 'delete-branch':
			return {
				title: t('Delete branch {branch}?', { branch: action.branchName }),
				message: t('This removes the private branch reference only.'),
				warning: t(
					'Commits reachable only from this branch may no longer appear in History.',
				),
				confirmLabel: t('Delete'),
				danger: true,
			};
		case 'reset-file':
			return {
				title: t('Reset file?'),
				message: action.change.path,
				warning: t('Uncommitted changes in this file will be discarded.'),
				confirmLabel: t('Reset'),
				danger: true,
			};
		case 'reset-all':
			return {
				title: t('Reset all changes?'),
				message: t('Restore every changed file to HEAD.'),
				warning: t('Uncommitted changes will be discarded.'),
				confirmLabel: t('Reset all'),
				danger: true,
			};
		case 'restore':
			return {
				title: t('Restore {hash}?', { hash: shortOid(action.entry.oid) }),
				message:
					worktreeChangeCount > 0
						? t(
								'Current edits will be committed first, then this version will be loaded without moving the new HEAD.',
							)
						: t(
								'This version will be loaded into the working tree without moving HEAD.',
							),
				warning: t('Restored project files may be visible to collaborators.'),
				confirmLabel: t('Restore'),
				danger: true,
			};
	}
};

const GitHistoryActionModal: React.FC<GitHistoryActionModalProps> = ({
	action,
	currentBranch,
	worktreeChangeCount,
	isWorking,
	onClose,
	onConfirm,
}) => {
	if (!action) return null;
	const confirmation = getConfirmation(
		action,
		currentBranch,
		worktreeChangeCount,
	);

	return (
		<Modal
			isOpen
			onClose={() => {
				if (!isWorking) onClose();
			}}
			title={confirmation.title}
			size='small'
		>
			<div className='git-history-confirmation'>
				<p>{confirmation.message}</p>
				<div className='ui-message' data-tone='warning'>
					{confirmation.warning}
				</div>
				<div
					className='ui-actions'
					data-variant='modal'
					data-align='end'
					data-cross='stretch'
				>
					<button
						type='button'
						className='button secondary'
						onClick={onClose}
						disabled={isWorking}
					>
						{t('Cancel')}
					</button>
					<button
						type='button'
						className={`button ${confirmation.danger ? 'danger' : 'primary'}`}
						onClick={() => void onConfirm(action)}
						disabled={isWorking}
					>
						{confirmation.confirmLabel}
					</button>
				</div>
			</div>
		</Modal>
	);
};

export default GitHistoryActionModal;
