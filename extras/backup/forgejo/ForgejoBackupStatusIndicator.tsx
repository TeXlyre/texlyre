// extras/backup/forgejo/ForgejoBackupStatusIndicator.tsx
import { t } from '@/i18n';
import React, { useState } from 'react';
import ForgejoBackupModal from './ForgejoBackupModal';
import { forgejoBackupService } from './ForgejoBackupService';
import './styles.css';

interface ForgejoBackupStatusIndicatorProps {
    className?: string;
    currentProjectId?: string | null;
    isInEditor?: boolean;
}

const ForgejoBackupStatusIndicator: React.FC<ForgejoBackupStatusIndicatorProps> = ({
    className = '',
    currentProjectId,
    isInEditor = false,
}) => {
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

    const getStatusColor = () => {
        if (!status.isConnected) return '#666';
        if (status.status === 'error') return '#dc3545';
        if (status.status === 'syncing') return '#ffc107';
        return '#28a745';
    };

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
            <div
                className={`backup-status-indicator main-button single-service ${className} ${status.isConnected ? t('connected') : t('disconnected')}`}
                onClick={() => setShowModal(true)}
                title={getStatusText()}
            >
                <div
                    className="status-dot"
                    style={{ backgroundColor: getStatusColor() }}
                />
                <span className="backup-label">{t('Forgejo')}</span>
                {hasUnreadActivities && <div className="activity-notification" />}
            </div>

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