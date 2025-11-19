// extras/backup/gitlab/GitLabBackupStatusIndicator.tsx
import { t } from '@/i18n';
import React, { useState } from 'react';
import GitLabBackupModal from './GitLabBackupModal';
import { gitLabBackupService } from './GitLabBackupService';
import './styles.css';

interface GitLabBackupStatusIndicatorProps {
    className?: string;
    currentProjectId?: string | null;
    isInEditor?: boolean;
}

const GitLabBackupStatusIndicator: React.FC<GitLabBackupStatusIndicatorProps> = ({
    className = '',
    currentProjectId,
    isInEditor = false,
}) => {
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

    const getStatusColor = () => {
        if (!status.isConnected) return '#666';
        if (status.status === 'error') return '#dc3545';
        if (status.status === 'syncing') return '#ffc107';
        return '#28a745';
    };

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
            <div
                className={`backup-status-indicator main-button single-service ${className} ${status.isConnected ? t('connected') : t('disconnected')}`}
                onClick={() => setShowModal(true)}
                title={getStatusText()}
            >
                <div
                    className="status-dot"
                    style={{ backgroundColor: getStatusColor() }}
                />
                <span className="backup-label">{t('GitLab')}</span>
                {hasUnreadActivities && <div className="activity-notification" />}
            </div>

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