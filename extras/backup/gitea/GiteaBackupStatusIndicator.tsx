// extras/backup/gitea/GiteaBackupStatusIndicator.tsx
import { t } from '@/i18n';
import React, { useState } from 'react';
import GiteaBackupModal from './GiteaBackupModal';
import { giteaBackupService } from './GiteaBackupService';
import './styles.css';

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

    const getStatusColor = () => {
        if (!status.isConnected) return '#666';
        if (status.status === 'error') return '#dc3545';
        if (status.status === 'syncing') return '#ffc107';
        return '#28a745';
    };

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
            <div
                className={`backup-status-indicator main-button single-service ${className} ${status.isConnected ? t('connected') : t('disconnected')}`}
                onClick={() => setShowModal(true)}
                title={getStatusText()}
            >
                <div
                    className="status-dot"
                    style={{ backgroundColor: getStatusColor() }}
                />
                <span className="backup-label">{t('Gitea')}</span>
                {hasUnreadActivities && <div className="activity-notification" />}
            </div>

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