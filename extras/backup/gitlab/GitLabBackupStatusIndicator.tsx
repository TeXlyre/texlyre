// extras/backup/gitlab/GitLabBackupStatusIndicator.tsx
import { t } from '@/i18n';
import React, { useState } from 'react';
import GitLabBackupModal from './GitLabBackupModal';
import { gitLabBackupService } from './GitLabBackupService';

interface GitLabBackupStatusIndicatorProps {
	className?: string;
	currentProjectId?: string | null;
	isInEditor?: boolean;
}

const GitLabBackupStatusIndicator: React.FC<
	GitLabBackupStatusIndicatorProps
> = ({ className = '', currentProjectId, isInEditor = false }) => {
	const [status, setStatus] = useState(gitLabBackupService.getStatus());
	const [activities, setActivities] = useState(
		gitLabBackupService.getActivities(),
	);
	const [showModal, setShowModal] = useState(false);

	React.useEffect(() => {
		const unsubscribeStatus = gitLabBackupService.addStatusListener(setStatus);
		const unsubscribeActivities =
			gitLabBackupService.addActivityListener(setActivities);

		return () => {
			unsubscribeStatus();
			unsubscribeActivities();
		};
	}, []);

	const getStatusText = () => {
		if (!status.isConnected) return t('GitLab not connected');
		if (status.status === 'error') return t('GitLab error');
		if (status.status === 'syncing') return t('Syncing...');
		if (status.lastSync) {
			const lastSync = new Date(status.lastSync);
			return t('Last Sync: {time}', { time: lastSync.toLocaleTimeString() });
		}
		return t('Connected to {project}', { project: status.project });
	};

	const hasUnreadActivities = activities.length > 0;

	return (
		<>
			<button
				type='button'
				className={`button ui-status ${className}`}
				data-tone={status.isConnected ? 'success' : 'muted'}
				onClick={() => setShowModal(true)}
				title={getStatusText()}
			>
				<div
					className='ui-status-dot'
					data-tone={
						!status.isConnected
							? 'muted'
							: status.status === 'error'
								? 'danger'
								: status.status === 'syncing'
									? 'warning'
									: 'success'
					}
				/>
				<span className='ui-status-label'>{t('GitLab')}</span>
				{hasUnreadActivities && (
					<div
						className='ui-status-dot'
						data-tone='danger'
						data-placement='corner'
					/>
				)}
			</button>

			<GitLabBackupModal
				isOpen={showModal}
				onClose={() => setShowModal(false)}
				currentProjectId={currentProjectId}
				isInEditor={isInEditor}
			/>
		</>
	);
};

export default GitLabBackupStatusIndicator;
