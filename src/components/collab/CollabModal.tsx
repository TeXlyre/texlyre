// src/components/collab/CollabModal.tsx
import type React from 'react';
import { useState } from 'react';

import { t } from '@/i18n';
import { SettingsIcon, SyncIcon } from '../common/Icons';
import Modal from '../common/Modal';
import SettingsModal from '../settings/SettingsModal';

interface CollabModalProps {
	isOpen: boolean;
	onClose: () => void;
	isConnected: boolean;
	isSyncing: boolean;
	onSyncAll: () => Promise<void>;
	docUrl: string;
}

const CollabModal: React.FC<CollabModalProps> = ({
	isOpen,
	onClose,
	isConnected,
	isSyncing,
	onSyncAll,
	docUrl,
}) => {
	const [showSettings, setShowSettings] = useState(false);

	return (
		<>
			<Modal
				isOpen={isOpen}
				onClose={onClose}
				title={t('Real-time Document Synchronization')}
				icon={SyncIcon}
				size='medium'
				headerActions={
					<button
						type='button'
						className='ui-icon-button'
						data-role='modal-close'
						data-variant='subtle'
						onClick={() => setShowSettings(true)}
						title={t('Real-time Document Synchronization Settings')}
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
						<div className='ui-list' data-gap='sm'>
							<div className='ui-meta' data-layout='row'>
								<strong>{t('Sync Status:')}</strong>{' '}
								{isConnected ? t('Connected') : t('Disconnected')}
							</div>
							<div className='ui-meta' data-layout='row'>
								<strong>{t('Project ID:')}</strong>{' '}
								{docUrl.startsWith('yjs:') ? docUrl.slice(4) : docUrl}
							</div>
						</div>

						<div className='ui-stack' data-gap='sm'>
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
										onClick={onSyncAll}
										disabled={!isConnected || isSyncing}
									>
										<SyncIcon />
										{isSyncing ? t('Syncing All...') : t('Sync All Documents')}
									</button>
								</div>
							</div>
						</div>
					</section>

					<div className='ui-message' data-tone='info'>
						<h3>{t('How Document Collaboration Works')}</h3>
						<div>
							<p>
								{t(
									'Real-time document collaboration allows multiple users to edit documents simultaneously:',
								)}
							</p>
							<ul>
								<li>
									{t(
										'Changes are synchronized in real-time across all connected users',
									)}
								</li>
								<li>
									{t(
										"Each user's cursor position and selections are visible to others",
									)}
								</li>
								<li>
									{t(
										'Conflict resolution is handled automatically using CRDT (Yjs)',
									)}
								</li>
								<li>
									{t(
										'Comments and responses are shared across all collaborators',
									)}
								</li>
								<li>
									{t(
										'Chat messages are synchronized for communication with all collaborators',
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
				initialSubcategory={t('Real-time Synchronization')}
			/>
		</>
	);
};

export default CollabModal;
