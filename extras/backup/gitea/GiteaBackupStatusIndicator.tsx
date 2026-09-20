// extras/backup/gitea/GiteaBackupStatusIndicator.tsx
import { t } from '@/i18n';
import React, { useState } from 'react';
import GiteaBackupModal from './GiteaBackupModal';
import { giteaBackupService } from './GiteaBackupService';

interface GiteaBackupStatusIndicatorProps {
	className?: string;
	currentProjectId?: string | null;
	isInEditor?: boolean;
}

const GiteaBackupStatusIndicator: React.FC<GiteaBackupStatusIndicatorProps> = ({
	className = '',
	currentProjectId,
	isInEditor = false,
}) => {
	const [status, setStatus] = useState(giteaBackupService.getStatus());
	const [activities, setActivities] = useState(
		giteaBackupService.getActivities(),
	);
	const [showModal, setShowModal] = useState(false);

	React.useEffect(() => {
		const unsubscribeStatus = giteaBackupService.addStatusListener(setStatus);
		const unsubscribeActivities =
			giteaBackupService.addActivityListener(setActivities);

		return () => {
			unsubscribeStatus();
			unsubscribeActivities();
		};
	}, []);

	const getStatusText = () => {
		if (!status.isConnected) return t('Gitea not connected');
		if (status.status === 'error') return t('Gitea error');
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
				<span className='ui-status-label'>{t('Gitea')}</span>
				{hasUnreadActivities && (
					<div
						className='ui-status-dot'
						data-tone='danger'
						data-placement='corner'
					/>
				)}
			</button>

			<GiteaBackupModal
				isOpen={showModal}
				onClose={() => setShowModal(false)}
				currentProjectId={currentProjectId}
				isInEditor={isInEditor}
			/>
		</>
	);
};

export default GiteaBackupStatusIndicator;
