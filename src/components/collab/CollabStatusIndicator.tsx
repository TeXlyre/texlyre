// src/components/collab/CollabStatusIndicator.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { useCollab } from '../../hooks/useCollab';
import { useFileSync } from '../../hooks/useFileSync';
import { useOffline } from '../../hooks/useOffline';
import { collabService } from '../../services/CollabService';
import PositionedDropdown from '../common/PositionedDropdown';
import CollabModal from './CollabModal';
import FileSyncModal from './FileSyncModal';
import {
  ChevronDownIcon,
  FileIcon,
  SyncIcon,
  UsersIcon,
  OfflineIcon
} from
  '../common/Icons';

interface CollabStatusIndicatorProps {
  className?: string;
  docUrl: string;
}

const CollabStatusIndicator: React.FC<CollabStatusIndicatorProps> = ({
  className = '',
  docUrl
}) => {
  const { isConnected: isCollabConnected } = useCollab();
  const { isOfflineMode } = useOffline();
  const { isEnabled: isFileSyncEnabled, isSyncing: isFileSyncing } =
    useFileSync();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showCollabModal, setShowCollabModal] = useState(false);
  const [showFileSyncModal, setShowFileSyncModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Show offline mode if either network is offline OR collab connection failed
  const showOffline = isOfflineMode || !isCollabConnected;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        const portaledDropdown = document.querySelector('.collab-dropdown');
        if (portaledDropdown && portaledDropdown.contains(target)) {
          return;
        }
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const getMainStatus = () => {
    const hasConnectedService = isCollabConnected && !isOfflineMode;
    const isSyncingAny = isFileSyncing || isSyncing;

    return { connected: hasConnectedService, syncing: isSyncingAny };
  };

  const mainStatus = getMainStatus();

  const getStatusColor = () => {
    if (showOffline) return '#666';
    if (mainStatus.syncing) return '#ffc107';
    return '#28a745';
  };

  const getStatusText = () => {
    if (showOffline) return 'Working offline - collaboration disabled';
    if (mainStatus.syncing) return 'Syncing...';
    return 'Collaboration active';
  };

  const handleSyncAll = async () => {
    if (isSyncing) return;

    setIsSyncing(true);
    try {
      const projectId = docUrl.startsWith('yjs:') ? docUrl.slice(4) : docUrl;
      await collabService.syncAllDocuments(projectId, (_current, _total) => {

        // Progress updates could be shown in modal if needed
      });
    } catch (error) {
      console.error('Error syncing documents:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleMainButtonClick = () => {
    if (showOffline) {
      // Show collab modal to explain offline status
      setShowCollabModal(true);
    } else if (!isFileSyncEnabled) {
      // Only collab enabled, open collab directly
      setShowCollabModal(true);
    } else {
      // Both enabled, show dropdown
      setIsDropdownOpen(!isDropdownOpen);
    }
  };

  const toggleDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDropdownOpen(!isDropdownOpen);
  };

  const handleCollabClick = () => {
    setShowCollabModal(true);
    setIsDropdownOpen(false);
  };

  const handleFileSyncClick = () => {
    if (isCollabConnected && !isOfflineMode) {
      setShowFileSyncModal(true);
    }
    setIsDropdownOpen(false);
  };

  const getServiceStatusIndicator = (serviceType: string) => {
    if (serviceType === 'collab') {
      return isCollabConnected && !isOfflineMode ? '🟢' : '';
    }
    if (serviceType === 'filesync') {
      return isFileSyncEnabled ? '🟢' : '';
    }
    return '';
  };

  return (
    <>
      <div className="collab-status-dropdown-container" ref={dropdownRef}>
        <div className="collab-button-group">
          <div
            className={`collab-status-indicator main-button ${className} ${showOffline ? 'offline' : mainStatus.connected ? 'connected' : 'disconnected'}`
            }
            onClick={handleMainButtonClick}
            title={
              isFileSyncEnabled && isCollabConnected && !isOfflineMode ?
                t('Collaboration Options') :
                getStatusText()
            }>

            <div
              className="status-dot"
              style={{
                backgroundColor: getStatusColor(),
                animation: mainStatus.syncing ? 'pulse 1.5s infinite' : 'none'
              }} />

            {showOffline ? <OfflineIcon /> : <UsersIcon />}
            <span className="collab-label">
              {showOffline ? t('Offline') : t('Collab')}
            </span>
          </div>

          <button
            className={`collab-dropdown-toggle ${showOffline ? 'offline' : mainStatus.connected ? 'connected' : 'disconnected'}`
            }
            onClick={toggleDropdown}
            title={t('Collaboration Options')}
            disabled={showOffline}>

            <ChevronDownIcon />
          </button>
        </div>

        <PositionedDropdown
          isOpen={isDropdownOpen && !showOffline}
          triggerElement={dropdownRef.current?.querySelector('.collab-button-group') as HTMLElement}
          className="collab-dropdown">
          <div className="collab-dropdown-item" onClick={handleCollabClick}>
            <span className="service-indicator">
              {getServiceStatusIndicator('collab')}
            </span>
            <SyncIcon />{t('Real-time')}
          </div>

          <div
            className="collab-dropdown-item"
            onClick={handleFileSyncClick}
            aria-disabled={!isCollabConnected || isOfflineMode}>

            <span className="service-indicator">
              {getServiceStatusIndicator('filesync')}
            </span>
            <FileIcon />{t('Files')}
          </div>
        </PositionedDropdown>
      </div>

      <CollabModal
        isOpen={showCollabModal}
        onClose={() => setShowCollabModal(false)}
        isConnected={isCollabConnected && !isOfflineMode}
        isSyncing={isSyncing}
        onSyncAll={handleSyncAll}
        docUrl={docUrl} />


      <FileSyncModal
        isOpen={showFileSyncModal}
        onClose={() => setShowFileSyncModal(false)} />

    </>);

};

export default CollabStatusIndicator;