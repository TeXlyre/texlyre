// src/components/collab/CollabStatusIndicator.tsx
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { t } from '@/i18n';
import { createNamedLogger } from '@/logging';
import { SharedToolsProvider } from '../../contexts/SharedToolsContext';
import { useCollab } from '../../hooks/useCollab';
import { useFileSync } from '../../hooks/useFileSync';
import { useOffline } from '../../hooks/useOffline';
import { useSharedTools } from '../../hooks/useSharedTools';
import { collabService } from '../../services/CollabService';
import {
	ChevronDownIcon,
	FileIcon,
	OfflineIcon,
	ShareIcon,
	SyncIcon,
	UsersIcon,
} from '../common/Icons';
import PositionedDropdown from '../common/PositionedDropdown';
import CollabModal from './CollabModal';
import FileSyncModal from './FileSyncModal';
import SharedToolsModal from './SharedToolsModal';

const moduleLog = createNamedLogger('CollabStatusIndicator');

interface CollabStatusIndicatorProps {
	className?: string;
	docUrl: string;
}

const CollabStatusIndicatorContent: React.FC<CollabStatusIndicatorProps> = ({
	className = '',
	docUrl,
}) => {
	const { isConnected: isCollabConnected } = useCollab();
	const { isOfflineMode, isCollabOfflineMode } = useOffline();
	const { isEnabled: isFileSyncEnabled, isSyncing: isFileSyncing } =
		useFileSync();
	const sharedTools = useSharedTools();
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const [showCollabModal, setShowCollabModal] = useState(false);
	const [showFileSyncModal, setShowFileSyncModal] = useState(false);
	const [showSharedToolsModal, setShowSharedToolsModal] = useState(false);
	const [isSyncing, setIsSyncing] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	const showOffline = isCollabOfflineMode || !isCollabConnected;

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node;

			if (dropdownRef.current && !dropdownRef.current.contains(target)) {
				const portaledDropdown = document.querySelector('.collab-dropdown');
				if (portaledDropdown && portaledDropdown.contains(target)) return;
				setIsDropdownOpen(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, []);

	const mainStatus = {
		connected: isCollabConnected && !isCollabOfflineMode,
		syncing: isFileSyncing || isSyncing,
	};

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
			moduleLog.error('Error syncing documents:', error);
		} finally {
			setIsSyncing(false);
		}
	};

	const handleMainButtonClick = () => {
		if (showOffline || !isFileSyncEnabled) {
			setShowCollabModal(true);
		} else {
			setIsDropdownOpen(!isDropdownOpen);
		}
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
						onClick={(event) => {
							event.stopPropagation();
							setIsDropdownOpen(!isDropdownOpen);
						}}
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
					<div
						className='collab-dropdown-item'
						onClick={() => {
							setShowCollabModal(true);
							setIsDropdownOpen(false);
						}}
					>
						<span className='service-indicator'>
							{getServiceStatusIndicator('collab')}
						</span>
						<SyncIcon />
						{t('Real-time')}
					</div>

					<div
						className='collab-dropdown-item'
						onClick={() => {
							if (isCollabConnected && !isCollabOfflineMode) {
								setShowFileSyncModal(true);
							}
							setIsDropdownOpen(false);
						}}
						aria-disabled={!isCollabConnected || isCollabOfflineMode}
					>
						<span className='service-indicator'>
							{getServiceStatusIndicator('filesync')}
						</span>
						<FileIcon />
						{t('Files')}
					</div>

					<div
						className='collab-dropdown-item'
						onClick={() => {
							setShowSharedToolsModal(true);
							setIsDropdownOpen(false);
						}}
					>
						<span className='service-indicator' />
						<ShareIcon />
						{t('Tools')}
						{sharedTools.pendingCount > 0 && (
							<span className='coming-soon'>
								{sharedTools.pendingCount} {t('new')}
							</span>
						)}
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

			<SharedToolsModal
				isOpen={showSharedToolsModal}
				onClose={() => setShowSharedToolsModal(false)}
				offers={sharedTools.offers}
				sharedByMe={sharedTools.sharedByMe}
				projectShareEnabled={sharedTools.projectShareEnabled}
				onProjectShareChange={sharedTools.setProjectShareEnabled}
				onAccept={sharedTools.accept}
				onIgnore={sharedTools.ignore}
			/>
		</>
	);
};

const CollabStatusIndicator: React.FC<CollabStatusIndicatorProps> = (props) => (
	<SharedToolsProvider docUrl={props.docUrl}>
		<CollabStatusIndicatorContent {...props} />
	</SharedToolsProvider>
);

export default CollabStatusIndicator;
