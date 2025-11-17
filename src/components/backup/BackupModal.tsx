// src/components/backup/BackupModal.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useState } from 'react';

import { useAuth } from '../../hooks/useAuth';
import { notificationService } from '../../services/NotificationService';
import { formatDate } from '../../utils/dateUtils';
import {
  DisconnectIcon,
  ExportIcon,
  FileSystemIcon,
  FolderIcon,
  ImportIcon,
  SettingsIcon,
  TrashIcon
} from
  '../common/Icons';
import Modal from '../common/Modal';
import SettingsModal from '../settings/SettingsModal';

interface BackupStatus {
  isConnected: boolean;
  isEnabled: boolean;
  lastSync: number | null;
  status: 'idle' | 'syncing' | 'error';
  error?: string;
}

interface BackupActivity {
  id: string;
  type:
  'backup_start' |
  'backup_complete' |
  'backup_error' |
  'import_start' |
  'import_complete' |
  'import_error';
  message: string;
  timestamp: number;
  data?: any;
}

interface BackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: BackupStatus;
  activities: BackupActivity[];
  onRequestAccess: (isAutoStart?: boolean) => Promise<boolean>;
  onSynchronize: (projectId?: string) => Promise<void>;
  onExportToFileSystem: (projectId?: string) => Promise<void>;
  onImportChanges: (projectId?: string) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onClearActivity: (id: string) => void;
  onClearAllActivities: () => void;
  onChangeDirectory: () => Promise<boolean>;
  currentProjectId?: string | null;
  isInEditor?: boolean;
}

const BackupModal: React.FC<BackupModalProps> = ({
  isOpen,
  onClose,
  status,
  activities = [],
  onRequestAccess,
  onSynchronize,
  onExportToFileSystem,
  onImportChanges,
  onDisconnect,
  onClearActivity,
  onClearAllActivities,
  onChangeDirectory,
  currentProjectId,
  isInEditor = false
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [syncScope, setSyncScope] = useState<'current' | 'all'>('current');
  const [isOperating, setIsOperating] = useState(false);
  const { getProjectById } = useAuth();
  const [currentProjectName, setCurrentProjectName] = useState<string>('');

  useEffect(() => {
    const loadProjectName = async () => {
      if (currentProjectId) {
        try {
          const project = await getProjectById(currentProjectId);
          setCurrentProjectName(project?.name || 'Current project only');
        } catch (_error) {
          setCurrentProjectName('Current project only');
        }
      }
    };

    if (isInEditor && currentProjectId) {
      loadProjectName();
    }
  }, [currentProjectId, getProjectById, isInEditor]);

  const getStatusText = () => {
    if (!status.isConnected) return t('No backup folder');
    if (status.status === 'error') return t('Backup error');
    if (status.status === 'syncing') return t('Syncing...');
    if (status.lastSync) {
      return t('Last Sync: {date}', { date: formatDate(status.lastSync) });
    }
    return t('Ready to sync');
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'backup_error':
      case 'import_error':
        return '❌';
      case 'backup_complete':
      case 'import_complete':
        return '✅';
      case 'backup_start':
        return '📤';
      case 'import_start':
        return '📥';
      default:
        return 'ℹ️';
    }
  };

  const getActivityColor = (type: string) => {
    switch (type) {
      case 'backup_error':
      case 'import_error':
        return '#dc3545';
      case 'backup_complete':
      case 'import_complete':
        return '#28a745';
      case 'backup_start':
        return '#007bff';
      case 'import_start':
        return '#6f42c1';
      default:
        return '#6c757d';
    }
  };

  const handleExport = async () => {
    if (isOperating) return;

    setIsOperating(true);
    const projectId =
      isInEditor && syncScope === 'current' ? currentProjectId : undefined;
    const operationId = `backup-export-${Date.now()}`;

    try {
      const loadingMessage = projectId ?
        t('Exporting {projectName}...', { projectName: currentProjectName }) :
        t('Exporting all projects...');
      notificationService.showLoading(loadingMessage, operationId);

      await onExportToFileSystem(projectId || undefined);

      const successMessage = projectId ?
        t('{projectName} exported successfully', { projectName: currentProjectName }) :
        t('All projects exported successfully');
      notificationService.showSuccess(successMessage, { operationId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('Unknown error');
      notificationService.showError(
        t('Backup export failed: {error}', { error: errorMessage }),
        { operationId }
      );
    } finally {
      setIsOperating(false);
    }
  };

  const handleImport = async () => {
    if (isOperating) return;

    setIsOperating(true);
    const projectId =
      isInEditor && syncScope === 'current' ? currentProjectId : undefined;
    const operationId = `backup-import-${Date.now()}`;

    try {
      const loadingMessage = projectId ?
        t('Importing changes for {projectName}...', { projectName: currentProjectName }) :
        t('Importing all changes...');
      notificationService.showLoading(loadingMessage, operationId);

      await onImportChanges(projectId || undefined);

      const successMessage = projectId ?
        t('Changes imported for {projectName}', { projectName: currentProjectName }) :
        t('All changes imported successfully');
      notificationService.showSuccess(successMessage, { operationId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('Unknown error');
      notificationService.showError(
        t('Backup import failed: {error}', { error: errorMessage }),
        { operationId }
      );
    } finally {
      setIsOperating(false);
    }
  };

  const handleRequestAccess = async () => {
    if (isOperating) return;

    setIsOperating(true);
    const operationId = `backup-connect-${Date.now()}`;

    try {
      notificationService.showLoading(
        t('Connecting to backup folder...'),
        operationId
      );
      await onRequestAccess();
      notificationService.showSuccess(t('Backup folder connected successfully'), {
        operationId
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('Unknown error');
      notificationService.showError(
        t('Failed to connect backup folder: {error}', { error: errorMessage }),
        { operationId }
      );
    } finally {
      setIsOperating(false);
    }
  };

  const handleChangeDirectory = async () => {
    if (isOperating) return;

    setIsOperating(true);
    const operationId = `backup-change-dir-${Date.now()}`;

    try {
      notificationService.showLoading(
        t('Changing backup directory...'),
        operationId
      );
      await onChangeDirectory();
      notificationService.showSuccess(t('Backup directory changed successfully'), {
        operationId
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('Unknown error');
      notificationService.showError(
        t('Failed to change backup directory: {error}', { error: errorMessage }),
        { operationId }
      );
    } finally {
      setIsOperating(false);
    }
  };

  const handleDisconnect = async () => {
    if (isOperating) return;

    setIsOperating(true);
    const operationId = `backup-disconnect-${Date.now()}`;

    try {
      notificationService.showLoading(t('Disconnecting backup...'), operationId);
      await onDisconnect();
      notificationService.showSuccess(t('Backup disconnected successfully'), {
        operationId
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : t('Unknown error');
      notificationService.showError(
        t('Failed to disconnect backup: {error}', { error: errorMessage }),
        { operationId }
      );
    } finally {
      setIsOperating(false);
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={t('File System Backup')}
        icon={FileSystemIcon}
        size="medium"
        headerActions={
          <button
            className="modal-close-button"
            onClick={() => setShowSettings(true)}
            title={t('File System Settings')}>

            <SettingsIcon />
          </button>
        }>

        <div className="backup-modal">
          <div className="backup-status">
            <div className="status-header">
              <div className="backup-controls">
                {!status.isConnected ?
                  <>
                    <button
                      className="button primary"
                      onClick={handleRequestAccess}
                      disabled={isOperating}>

                      <FolderIcon />
                      {isOperating ? t('Connecting...') : t('Connect Folder')}
                    </button>
                  </> :

                  <>
                    {isInEditor &&
                      <div
                        className="sync-scope-selector"
                        style={{ marginBottom: '1rem' }}>

                        <label
                          style={{
                            display: 'block',
                            marginBottom: '0.5rem',
                            fontWeight: 'bold'
                          }}>{t('Backup Scope:')}


                        </label>
                        <div style={{ display: 'flex', gap: '1rem' }}>
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem'
                            }}>

                            <input
                              type="radio"
                              name="syncScope"
                              value="current"
                              checked={syncScope === 'current'}
                              onChange={(e) =>
                                setSyncScope(
                                  e.target.value as 'current' | 'all'
                                )
                              }
                              disabled={isOperating} />

                            <span>{t('Current project (')}{currentProjectName})</span>
                          </label>
                          <label
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.5rem'
                            }}>

                            <input
                              type="radio"
                              name="syncScope"
                              value="all"
                              checked={syncScope === 'all'}
                              onChange={(e) =>
                                setSyncScope(
                                  e.target.value as 'current' | 'all'
                                )
                              }
                              disabled={isOperating} />

                            <span>{t('All projects')}</span>
                          </label>
                        </div>
                      </div>
                    }
                    <div className="backup-toolbar">
                      <div className="primary-actions">
                        <button
                          className="button secondary"
                          onClick={handleExport}
                          disabled={status.status === 'syncing' || isOperating}>

                          <ExportIcon />{t('Export To PC')}

                        </button>
                        <button
                          className="button secondary"
                          onClick={handleImport}
                          disabled={status.status === 'syncing' || isOperating}>

                          <ImportIcon />{t('Import From PC')}

                        </button>
                      </div>
                      <div className="secondary-actions">
                        <button
                          className="button secondary icon-only"
                          onClick={handleChangeDirectory}
                          disabled={isOperating}
                          title={t('Change backup folder')}>

                          <FolderIcon />
                        </button>
                        <button
                          className="button secondary icon-only"
                          onClick={handleDisconnect}
                          disabled={isOperating}
                          title={t('Disconnect')}>

                          <DisconnectIcon />
                        </button>
                      </div>
                    </div>
                  </>
                }
              </div>
            </div>

            <div className="status-info">
              <div className="status-item">
                <strong>{t('File System Backup:')}</strong>{' '}
                {status.isConnected ? t('Connected') : t('Disconnected')}
              </div>
              {status.isConnected &&
                <div className="status-item">
                  <strong>{t('Status: ')}</strong> {getStatusText()}
                </div>
              }
              {status.error &&
                <div className="error-message">{status.error}</div>
              }
            </div>
          </div>

          {activities.length > 0 &&
            <div className="backup-activities">
              <div className="activities-header">
                <h3>{t('Recent Activity')}</h3>
                <button
                  className="button small secondary"
                  onClick={onClearAllActivities}
                  title={t('Clear all activities')}
                  disabled={isOperating}>

                  <TrashIcon />{t('Clear All')}

                </button>
              </div>

              <div className="activities-list">
                {activities.
                  slice(-10).
                  reverse().
                  map((activity) =>
                    <div
                      key={activity.id}
                      className="activity-item"
                      style={{
                        borderLeft: `3px solid ${getActivityColor(activity.type)}`
                      }}>

                      <div className="activity-content">
                        <div className="activity-header">
                          <span className="activity-icon">
                            {getActivityIcon(activity.type)}
                          </span>
                          <span className="activity-message">
                            {activity.message}
                          </span>
                          <button
                            className="activity-close"
                            onClick={() => onClearActivity(activity.id)}
                            title={t('Dismiss')}
                            disabled={isOperating}>

                            ×
                          </button>
                        </div>
                        <div className="activity-time">
                          {formatDate(activity.timestamp)}
                        </div>
                      </div>
                    </div>
                  )}
              </div>
            </div>
          }

          <div className="backup-info">
            <h3>{t('How File System Backup Works')}</h3>
            <div className="info-content">
              <p>{t('File system backup creates a copy of your local TeXlyre data on your PC that you can sync with cloud storage:')}


              </p>
              <ul>
                <li>
                  <strong>{t('Export: ')}</strong>&nbsp;{t('Forces all local data to be written to the file system')}

                </li>
                <li>
                  <strong>{t('Import: ')}</strong>&nbsp;{t('Loads changes from the file system into your local workspace')}

                </li>
                <li>{t('Sync the backup folder with cloud services like Dropbox, Google Drive, or OneDrive for cross-device access')}


                </li>
                <li>{t('All project data is organized in a structured folder hierarchy with documents and files')}


                </li>
              </ul>
            </div>
          </div>
        </div>
      </Modal>

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        initialCategory={t("Backup")}
        initialSubcategory={t("File System")} />

    </>);

};

export default BackupModal;