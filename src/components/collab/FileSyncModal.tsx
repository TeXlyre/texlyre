// src/components/fileSync/FileSyncModal.tsx
import type React from 'react';
import { useState } from 'react';

import { t } from '@/i18n';
import { usePeerFileSync } from '../../hooks/usePeerFileSync';
import { formatDate } from '../../utils/dateUtils';
import {
	DisconnectIcon,
	FileIcon,
	SettingsIcon,
	SyncIcon,
	TrashIcon,
} from '../common/Icons.tsx';
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
		clearAllNotifications,
	} = usePeerFileSync();

	const [showSettings, setShowSettings] = useState(false);

	const getNotificationIcon = (type: string) => {
		switch (type) {
			case 'sync_error':
				return '❌';
			case 'sync_complete':
				return '✓';
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

	const getNotificationTone = (type: string) => {
		switch (type) {
			case 'sync_error':
				return 'error' as const;
			case 'sync_complete':
				return 'success' as const;
			case 'sync_progress':
				return 'warning' as const;
			default:
				return 'info' as const;
		}
	};

	return (
		<>
			<Modal
				isOpen={isOpen}
				onClose={onClose}
				title={t('File Synchronization')}
				icon={FileIcon}
				size='medium'
				headerActions={
					<button
						type='button'
						className='ui-icon-button'
						data-role='modal-close'
						data-variant='subtle'
						onClick={() => setShowSettings(true)}
						title={t('File Synchronization Settings')}
					>
						<SettingsIcon />
					</button>
				}
			>
				<div className='ui-stack' data-gap='lg'>
					<section
						className='ui-card ui-stack'
						data-gap='md'
						data-padding='md'
						data-surface='secondary'
					>
						<div className='ui-stack' data-gap='md'>
							<div className='ui-stack' data-gap='sm'>
								{!isEnabled ? (
									<div
										className='ui-toolbar'
										data-width='full'
										data-justify='between'
										data-gap='md'
									>
										<div
											className='ui-toolbar-actions'
											data-role='primary'
											data-gap='sm'
										>
											<button
												type='button'
												className='button primary'
												onClick={enableSync}
												disabled={isSyncing}
											>
												<SyncIcon />
												{t('Enable Sync')}
											</button>
										</div>
									</div>
								) : (
									<div
										className='ui-toolbar'
										data-width='full'
										data-justify='between'
										data-gap='md'
									>
										<div
											className='ui-toolbar-actions'
											data-role='primary'
											data-gap='sm'
										>
											<button
												type='button'
												className='button primary'
												onClick={() => requestSync()}
												disabled={isSyncing}
											>
												<SyncIcon />
												{isSyncing ? t('Syncing...') : t('Sync Now')}
											</button>
										</div>
										<div
											className='ui-toolbar-actions'
											data-role='secondary'
											data-gap='xs'
										>
											<button
												type='button'
												className='button secondary icon-only'
												onClick={disableSync}
												disabled={isSyncing}
												title={t('Disable Sync')}
											>
												<DisconnectIcon />
											</button>
										</div>
									</div>
								)}
							</div>
						</div>

						<div className='ui-list' data-gap='sm'>
							<div className='ui-meta' data-layout='row'>
								<strong>{t('File Sync:')}</strong>{' '}
								{isEnabled ? t('Enabled') : t('Disabled')}
							</div>
							{isEnabled && (
								<>
									<div className='ui-meta' data-layout='row'>
										<strong>{t('Sync Status:')}</strong>{' '}
										{isSyncing ? t('Syncing...') : t('Ready')}
									</div>
									{lastSync && (
										<div className='ui-meta' data-layout='row'>
											<strong>{t('Last Sync:')}</strong> {formatDate(lastSync)}
										</div>
									)}
								</>
							)}
						</div>
					</section>

					{notifications.length > 0 && (
						<div className='ui-list' data-gap='md'>
							<div className='ui-toolbar' data-justify='between' data-gap='sm'>
								<h3 className='ui-panel-title'>{t('Recent Activity')}</h3>
								<button
									type='button'
									className='button secondary'
									onClick={clearAllNotifications}
									title={t('Clear all notifications')}
								>
									<TrashIcon />
									{t('Clear All')}
								</button>
							</div>

							<div className='ui-list' data-gap='sm' data-scroll='medium'>
								{notifications
									.slice(-10)
									.reverse()
									.map((notification) => (
										<div
											key={notification.id}
											className='ui-message ui-stack'
											data-tone={getNotificationTone(notification.type)}
											data-density='compact'
											data-gap='xs'
										>
											<div className='ui-list-content'>
												<div className='ui-actions'>
													<span className='ui-icon'>
														{getNotificationIcon(notification.type)}
													</span>
													<span className='ui-list-content' data-grow='true'>
														{notification.message}
													</span>
													<button
														type='button'
														aria-label={t('Dismiss notification')}
														className='ui-icon-button'
														data-variant='subtle'
														data-size='xs'
														onClick={() => clearNotification(notification.id)}
														title={t('Dismiss notification')}
													>
														<span aria-hidden='true'>×</span>
													</button>
												</div>
												<div className='ui-meta'>
													{formatDate(notification.timestamp)}
												</div>
											</div>
										</div>
									))}
							</div>
						</div>
					)}

					<div className='ui-message' data-tone='info'>
						<h3>{t('How File Sync Works')}</h3>
						<div>
							<p>
								{t(
									'File synchronization automatically keeps non-linked files in sync between all collaborators:',
								)}
							</p>
							<ul>
								<li>
									{t(
										'Files are compared based on modification time and content checksums',
									)}
								</li>
								<li>
									{t(
										'When differences are detected, files are shared via secure peer-to-peer transfer',
									)}
								</li>
								<li>
									{t(
										'Only non-linked files (files not connected to documents) are synchronized',
									)}
								</li>
								<li>
									{t(
										'System files and temporary files are excluded from synchronization',
									)}
								</li>
							</ul>
						</div>
					</div>
				</div>
			</Modal>

			<SettingsModal
				isOpen={showSettings}
				onClose={() => setShowSettings(false)}
				initialCategory={t('Connectivity')}
				initialSubcategory={t('File Synchronization')}
			/>
		</>
	);
};

export default FileSyncModal;
