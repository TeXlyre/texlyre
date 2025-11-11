// src/components/fileSync/FileSyncModal.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useState } from 'react';

import { useFileSync } from '../../hooks/useFileSync';
import { formatDate } from '../../utils/dateUtils';
import {
  DisconnectIcon,
  FileIcon,
  SettingsIcon,
  SyncIcon,
  TrashIcon
} from
  '../common/Icons.tsx';
import Modal from '../common/Modal.tsx';
import SettingsModal from '../settings/SettingsModal.tsx';

interface FileSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FileSyncModal: React.FC<FileSyncModalProps> = ({ isOpen, onClose }) => {
  const {
    isEnabled,
    isSyncing,
    lastSync,
    notifications,
    enableSync,
    disableSync,
    requestSync,
    clearNotification,
    clearAllNotifications
  } = useFileSync();

  const [showSettings, setShowSettings] = useState(false);

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'sync_error':
        return '❌';
      case 'sync_complete':
        return '✅';
      case 'sync_request':
        return '📤';
      case 'sync_response':
        return '📥';
      case 'sync_progress':
        return '⏳';
      default:
        return 'ℹ️';
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'sync_error':
        return '#dc3545';
      case 'sync_complete':
        return '#28a745';
      case 'sync_request':
        return '#007bff';
      case 'sync_response':
        return '#6f42c1';
      case 'sync_progress':
        return '#ffc107';
      default:
        return '#6c757d';
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={t('File Synchronization')}
        icon={FileIcon}
        size="medium"
        headerActions={
          <button
            className="modal-close-button"
            onClick={() => setShowSettings(true)}
            title={t('File Synchronization Settings')}>

            <SettingsIcon />
          </button>
        }>

        <div className="file-sync-modal">
          <div className="sync-status">
            <div className="status-header">
              <div className="sync-controls">
                {!isEnabled ?
                  <div className="sync-toolbar">
                    <div className="primary-actions">
                      <button
                        className="button primary"
                        onClick={enableSync}
                        disabled={isSyncing}>

                        <SyncIcon />{t('Enable Sync')}

                      </button>
                    </div>
                  </div> :

                  <div className="sync-toolbar">
                    <div className="primary-actions">
                      <button
                        className="button primary"
                        onClick={() => requestSync()}
                        disabled={isSyncing}>

                        <SyncIcon />
                        {isSyncing ? t('Syncing...') : t('Sync Now')}
                      </button>
                    </div>
                    <div className="secondary-actions">
                      <button
                        className="button secondary icon-only"
                        onClick={disableSync}
                        disabled={isSyncing}
                        title={t('Disable Sync')}>

                        <DisconnectIcon />
                      </button>
                    </div>
                  </div>
                }
              </div>
            </div>

            <div className="status-info">
              <div className="status-item">
                <strong>{t('File Sync:')}</strong> {isEnabled ? t('Enabled') : t('Disabled')}
              </div>
              {isEnabled &&
                <>
                  <div className="status-item">
                    <strong>{t('Status:')}</strong>{' '}
                    {isSyncing ? t('Syncing...') : t('Ready')}
                  </div>
                  {lastSync &&
                    <div className="status-item">
                      <strong>{t('Last Sync:')}</strong> {formatDate(lastSync)}
                    </div>
                  }
                </>
              }
            </div>
          </div>

          {notifications.length > 0 &&
            <div className="sync-notifications">
              <div className="notifications-header">
                <h3>{t('Recent Activity')}</h3>
                <button
                  className="button small secondary"
                  onClick={clearAllNotifications}
                  title={t('Clear all notifications')}>

                  <TrashIcon />{t('Clear All')}

                </button>
              </div>

              <div className="notifications-list">
                {notifications.
                  slice(-10).
                  reverse().
                  map((notification) =>
                    <div
                      key={notification.id}
                      className="notification-item"
                      style={{
                        borderLeft: `3px solid ${getNotificationColor(notification.type)}`
                      }}>

                      <div className="notification-content">
                        <div className="notification-header">
                          <span className="notification-icon">
                            {getNotificationIcon(notification.type)}
                          </span>
                          <span className="notification-message">
                            {notification.message}
                          </span>
                          <button
                            className="notification-close"
                            onClick={() => clearNotification(notification.id)}
                            title={t('Dismiss')}>

                            ×
                          </button>
                        </div>
                        <div className="notification-time">
                          {formatDate(notification.timestamp)}
                        </div>
                      </div>
                    </div>
                  )}
              </div>
            </div>
          }

          <div className="sync-info">
            <h3>{t('How File Sync Works')}</h3>
            <div className="info-content">
              <p>{t('File synchronization automatically keeps non-linked files in sync between all collaborators:')}


              </p>
              <ul>
                <li>{t('Files are compared based on modification time and content checksums')}


                </li>
                <li>{t('When differences are detected, files are shared via secure peer-to-peer transfer')}


                </li>
                <li>{t('Only non-linked files (files not connected to documents) are synchronized')}


                </li>
                <li>{t('System files and temporary files are excluded from synchronization')}


                </li>
              </ul>
            </div>
          </div>
        </div>
      </Modal>

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        initialCategory="Collaboration"
        initialSubcategory="File Synchronization" />

    </>);

};

export default FileSyncModal;