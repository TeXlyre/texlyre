// src/components/workspace/WorkspaceModal.tsx
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

import { t } from '@/i18n';
import {
	type WorkspaceActivity,
	workspaceActivityService,
} from '../../services/WorkspaceActivityService';
import {
	type WorkspaceStatus,
	workspaceService,
} from '../../services/WorkspaceService';
import { formatDate } from '../../utils/dateUtils';
import { DisconnectIcon, FolderIcon, FolderOpenIcon } from '../common/Icons';
import Modal from '../common/Modal';

interface WorkspaceModalProps {
	isOpen: boolean;
	onClose: () => void;
	status: WorkspaceStatus;
}

const getActivityIcon = (type: string): string => {
	if (type === 'permission-lost' || type === 'conflict') return '❌';
	if (type === 'annotations-dropped') return '⚠';
	return '✓';
};

const WorkspaceModal: React.FC<WorkspaceModalProps> = ({
	isOpen,
	onClose,
	status,
}) => {
	const [activity, setActivity] = useState<WorkspaceActivity[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [isBusy, setIsBusy] = useState(false);

	const loadActivity = useCallback(async () => {
		if (!status.projectId) return;
		setActivity(await workspaceActivityService.list(status.projectId));
	}, [status.projectId]);

	useEffect(() => {
		if (!isOpen) return;
		void loadActivity();
		return workspaceActivityService.addListener(() => {
			void loadActivity();
		});
	}, [isOpen, loadActivity]);

	const run = async (action: () => Promise<unknown>) => {
		setError(null);
		setIsBusy(true);
		try {
			await action();
		} catch (actionError) {
			if ((actionError as Error)?.name === 'AbortError') return;
			setError(
				actionError instanceof Error
					? actionError.message
					: t('Folder action failed'),
			);
		} finally {
			setIsBusy(false);
		}
	};

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title={t('Folder Sync')}
			icon={FolderOpenIcon}
			size='medium'
		>
			<div className='workspace-modal file-sync-modal'>
				<div className='sync-status'>
					<div className='sync-controls'>
						<div className='sync-toolbar'>
							<div className='primary-actions'>
								{status.needsPermission ? (
									<button
										type='button'
										className='button primary'
										disabled={isBusy}
										onClick={() => run(() => workspaceService.reconnect())}
									>
										<FolderOpenIcon />
										{t('Grant Access')}
									</button>
								) : null}
							</div>
							<div className='secondary-actions'>
								<button
									type='button'
									className='button secondary icon-only'
									disabled={isBusy}
									onClick={() => run(() => workspaceService.changeFolder())}
									title={t('Change Folder')}
								>
									<FolderIcon />
								</button>
								<button
									type='button'
									className='button secondary icon-only'
									disabled={isBusy || !status.projectId}
									onClick={() => run(() => workspaceService.disconnect())}
									title={t('Disconnect')}
								>
									<DisconnectIcon />
								</button>
							</div>
						</div>
					</div>

					<div className='status-info'>
						<div className='status-item workspace-folder-name'>
							<strong>{status.directoryName ?? t('No folder linked')}</strong>
						</div>
						<div className='status-item'>
							<span>
								{status.needsPermission
									? t(
											'This project mirrors a folder, but access has not been granted in this session.',
										)
									: t(
											'{count} files are mirrored between this project and the folder.',
											{ count: status.fileCount },
										)}
							</span>
						</div>
						{status.lastSyncedAt ? (
							<div className='status-item workspace-modal-meta'>
								{t('Last synced {date}', {
									date: formatDate(status.lastSyncedAt),
								})}
							</div>
						) : null}
						{error ? <div className='error-message'>{error}</div> : null}
					</div>
				</div>

				<div className='workspace-activities'>
					<div className='activities-header'>
						<h3>{t('Recent Activity')}</h3>
					</div>
					{activity.length === 0 ? (
						<p className='workspace-modal-meta'>
							{t('No activity recorded yet')}
						</p>
					) : (
						<div className='activities-list'>
							{activity
								.slice(-10)
								.reverse()
								.map((entry) => (
									<div key={entry.id} className='activity-item'>
										<div className='activity-content'>
											<div className='activity-header'>
												<span className='activity-icon'>
													{getActivityIcon(entry.type)}
												</span>
												<span className='activity-message'>
													{entry.message}
												</span>
											</div>
											<div className='activity-time'>
												{formatDate(entry.timestamp)}
											</div>
										</div>
									</div>
								))}
						</div>
					)}
				</div>
			</div>
		</Modal>
	);
};

export default WorkspaceModal;
