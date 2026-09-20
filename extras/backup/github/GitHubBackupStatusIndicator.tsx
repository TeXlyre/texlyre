// extras/backup/github/GitHubBackupStatusIndicator.tsx
import { t } from '@/i18n';
import React, { useState } from 'react';
import GitHubBackupModal from './GitHubBackupModal';
import { gitHubBackupService } from './GitHubBackupService';

interface GitHubBackupStatusIndicatorProps {
	className?: string;
	currentProjectId?: string | null;
	isInEditor?: boolean;
}

const GitHubBackupStatusIndicator: React.FC<
	GitHubBackupStatusIndicatorProps
> = ({ className = '', currentProjectId, isInEditor = false }) => {
	const [status, setStatus] = useState(gitHubBackupService.getStatus());
	const [activities, setActivities] = useState(
		gitHubBackupService.getActivities(),
	);
	const [showModal, setShowModal] = useState(false);

	React.useEffect(() => {
		const unsubscribeStatus = gitHubBackupService.addStatusListener(setStatus);
		const unsubscribeActivities =
			gitHubBackupService.addActivityListener(setActivities);

		return () => {
			unsubscribeStatus();
			unsubscribeActivities();
		};
	}, []);

	const getStatusText = () => {
		if (!status.isConnected) return t('GitHub not connected');
		if (status.status === 'error') return t('GitHub error');
		if (status.status === 'syncing') return t('Syncing...');
		if (status.lastSync) {
			const lastSync = new Date(status.lastSync);
			return t('Last Sync: {time}', { time: lastSync.toLocaleTimeString() });
		}
		return t('Connected to {repository}', { repository: status.repository });
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
				<span className='ui-status-label'>{t('GitHub')}</span>
				{hasUnreadActivities && (
					<div
						className='ui-status-dot'
						data-tone='danger'
						data-placement='corner'
					/>
				)}
			</button>

			<GitHubBackupModal
				isOpen={showModal}
				onClose={() => setShowModal(false)}
				currentProjectId={currentProjectId}
				isInEditor={isInEditor}
			/>
		</>
	);
};

export default GitHubBackupStatusIndicator;
