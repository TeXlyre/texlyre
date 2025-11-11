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
  GitHubBackupStatusIndicatorProps> =
  ({ className = '', currentProjectId, isInEditor = false }) => {
    const [status, setStatus] = useState(gitHubBackupService.getStatus());
    const [activities, setActivities] = useState(
      gitHubBackupService.getActivities()
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

    const getStatusColor = () => {
      if (!status.isConnected) return '#666';
      if (status.status === 'error') return '#dc3545';
      if (status.status === 'syncing') return '#ffc107';
      return '#28a745';
    };

    const getStatusText = () => {
      if (!status.isConnected) return t('GitHub not connected');
      if (status.status === 'error') return t('GitHub error');
      if (status.status === 'syncing') return t('Syncing...');
      if (status.lastSync) {
        const lastSync = new Date(status.lastSync);
        return t('Last sync: {time}', { time: lastSync.toLocaleTimeString() });
      }
      return t('Connected to {repository}', { repository: status.repository });
    };

    const hasUnreadActivities = activities.length > 0;

    return (
      <>
        <div
          className={`backup-status-indicator main-button single-service ${className} ${status.isConnected ? t('connected') : t('disconnected')}`
          }
          onClick={() => setShowModal(true)}
          title={getStatusText()}>

          <div
            className="status-dot"
            style={{ backgroundColor: getStatusColor() }} />

          <span className="backup-label">{t('GitHub')}</span>

          {hasUnreadActivities && <div className="activity-notification" />}
        </div>

        <GitHubBackupModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          currentProjectId={currentProjectId}
          isInEditor={isInEditor} />

      </>);

  };

export default GitHubBackupStatusIndicator;