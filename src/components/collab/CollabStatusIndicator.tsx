// src/components/collab/CollabStatusIndicator.tsx
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { t } from '@/i18n';
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
	OfflineIcon,
} from '../common/Icons';

interface CollabStatusIndicatorProps {
	className?: string;
	docUrl: string;
}

const CollabStatusIndicator: React.FC<CollabStatusIndicatorProps> = ({
	className = '',
	docUrl,
}) => {
	const { isConnected: isCollabConnected } = useCollab();
	const { isOfflineMode, isCollabOfflineMode } = useOffline();
	const { isEnabled: isFileSyncEnabled, isSyncing: isFileSyncing } =
		useFileSync();
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const [showCollabModal, setShowCollabModal] = useState(false);
	const [showFileSyncModal, setShowFileSyncModal] = useState(false);
	const [isSyncing, setIsSyncing] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	// Show offline mode if either network is offline OR collab connection failed
	const showOffline = isCollabOfflineMode || !isCollabConnected;

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
		const hasConnectedService = isCollabConnected && !isCollabOfflineMode;
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
		if (isOfflineMode) return t('Working offline - collaboration disabled');
		if (isCollabOfflineMode) return t('Collaboration offline');
		if (mainStatus.syncing) return t('Syncing...');
		return t('Collaboration active');
	};

	const handleSyncAll = async () => {
		if (isSyncing) return;

		setIsSyncing(true);
		try {
			const projectId = docUrl.startsWith('yjs:') ? docUrl.slice(4) : docUrl;
			await collabService.syncAllDocuments(projectId, (_current, _total) => {});
		} catch (error) {
			console.error('Error syncing documents:', error);
		} finally {
			setIsSyncing(false);
		}
	};

	const handleMainButtonClick = () => {
		if (showOffline) {
			setShowCollabModal(true);
		} else if (!isFileSyncEnabled) {
			setShowCollabModal(true);
		} else {
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
		if (isCollabConnected && !isCollabOfflineMode) {
			setShowFileSyncModal(true);
		}
		setIsDropdownOpen(false);
	};

	const getServiceStatusIndicator = (serviceType: string) => {
		if (serviceType === 'collab') {
			return isCollabConnected && !isCollabOfflineMode ? '🟢' : '⚫';
		}

		if (serviceType === 'filesync') {
			return isFileSyncEnabled && !isCollabOfflineMode ? '🟢' : '⚫';
		}

		return '';
	};

	return (
		<>
			<div className='collab-status-dropdown-container' ref={dropdownRef}>
				<div className='collab-button-group'>
					<div
						className={`collab-status-indicator main-button ${className} ${showOffline ? 'offline' : mainStatus.connected ? 'connected' : 'disconnected'}`}
						onClick={handleMainButtonClick}
						title={
							isFileSyncEnabled && isCollabConnected && !isCollabOfflineMode
								? t('Collaboration Options')
								: getStatusText()
						}
					>
						<div
							className='status-dot'
							style={{
								backgroundColor: getStatusColor(),
								animation: mainStatus.syncing ? 'pulse 1.5s infinite' : 'none',
							}}
						/>

						{showOffline ? <OfflineIcon /> : <UsersIcon />}
						<span className='collab-label'>
							{showOffline ? t('Offline') : t('Collab')}
						</span>
					</div>

					<button
						className={`collab-dropdown-toggle ${showOffline ? 'offline' : mainStatus.connected ? 'connected' : 'disconnected'}`}
						onClick={toggleDropdown}
						title={t('Collaboration Options')}
						disabled={showOffline}
					>
						<ChevronDownIcon />
					</button>
				</div>

				<PositionedDropdown
					isOpen={isDropdownOpen && !showOffline}
					triggerElement={
						dropdownRef.current?.querySelector(
							'.collab-button-group',
						) as HTMLElement
					}
					className='collab-dropdown'
				>
					<div className='collab-dropdown-item' onClick={handleCollabClick}>
						<span className='service-indicator'>
							{getServiceStatusIndicator('collab')}
						</span>
						<SyncIcon />
						{t('Real-time')}
					</div>

					<div
						className='collab-dropdown-item'
						onClick={handleFileSyncClick}
						aria-disabled={!isCollabConnected || isCollabOfflineMode}
					>
						<span className='service-indicator'>
							{getServiceStatusIndicator('filesync')}
						</span>
						<FileIcon />
						{t('Files')}
					</div>
				</PositionedDropdown>
			</div>

			<CollabModal
				isOpen={showCollabModal}
				onClose={() => setShowCollabModal(false)}
				isConnected={isCollabConnected && !isCollabOfflineMode}
				isSyncing={isSyncing}
				onSyncAll={handleSyncAll}
				docUrl={docUrl}
			/>

			<FileSyncModal
				isOpen={showFileSyncModal}
				onClose={() => setShowFileSyncModal(false)}
			/>
		</>
	);
};

export default CollabStatusIndicator;
