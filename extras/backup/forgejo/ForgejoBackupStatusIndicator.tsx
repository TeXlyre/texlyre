// extras/backup/forgejo/ForgejoBackupStatusIndicator.tsx
import { t } from '@/i18n';
import React, { useState } from 'react';
import ForgejoBackupModal from './ForgejoBackupModal';
import { forgejoBackupService } from './ForgejoBackupService';

interface ForgejoBackupStatusIndicatorProps {
	className?: string;
	currentProjectId?: string | null;
	isInEditor?: boolean;
}

const ForgejoBackupStatusIndicator: React.FC<
	ForgejoBackupStatusIndicatorProps
> = ({ className = '', currentProjectId, isInEditor = false }) => {
	const [status, setStatus] = useState(forgejoBackupService.getStatus());
	const [activities, setActivities] = useState(
		forgejoBackupService.getActivities(),
	);
	const [showModal, setShowModal] = useState(false);

	React.useEffect(() => {
		const unsubscribeStatus = forgejoBackupService.addStatusListener(setStatus);
		const unsubscribeActivities =
			forgejoBackupService.addActivityListener(setActivities);

		return () => {
			unsubscribeStatus();
			unsubscribeActivities();
		};
	}, []);

	const getStatusText = () => {
		if (!status.isConnected) return t('Forgejo not connected');
		if (status.status === 'error') return t('Forgejo error');
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
				<span className='ui-status-label'>{t('Forgejo')}</span>
				{hasUnreadActivities && (
					<div
						className='ui-status-dot'
						data-tone='danger'
						data-placement='corner'
					/>
				)}
			</button>

			<ForgejoBackupModal
				isOpen={showModal}
				onClose={() => setShowModal(false)}
				currentProjectId={currentProjectId}
				isInEditor={isInEditor}
			/>
		</>
	);
};

export default ForgejoBackupStatusIndicator;
