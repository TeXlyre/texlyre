// src/components/collab/CollabModal.tsx
import { t } from "@/i18n";
import type React from 'react';
import { useState } from 'react';

import { DisconnectIcon, SettingsIcon, SyncIcon } from '../common/Icons';
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
	docUrl
}) => {
	const [showSettings, setShowSettings] = useState(false);

	return (
		<>
			<Modal
				isOpen={isOpen}
				onClose={onClose}
				title={t('Real-time Document Synchronization')}
				icon={SyncIcon}
				size="medium"
				headerActions={
					<button
						className="modal-close-button"
						onClick={() => setShowSettings(true)}
						title={t('Real-time Document Synchronization Settings')}>

						<SettingsIcon />
					</button>
				}>

				<div className="collab-modal">
					<div className="collab-status">
						<div className="status-info">
							<div className="status-item">
								<strong>{t('Status:')}</strong>{' '}
								{isConnected ? t('Connected') : t('Disconnected')}
							</div>
							<div className="status-item">
								<strong>{t('Project:')}</strong>{' '}
								{docUrl.startsWith('yjs:') ? docUrl.slice(4) : docUrl}
							</div>
						</div>

						<div className="collab-controls">
							<div className="sync-toolbar">
								<div className="primary-actions">
									<button
										className="button primary"
										onClick={onSyncAll}
										disabled={!isConnected || isSyncing}>

										<SyncIcon />
										{isSyncing ? t('Syncing All...') : t('Sync All Documents')}
									</button>
								</div>
							</div>
						</div>
					</div>

					<div className="collab-info">
						<h3>{t('How Document Collaboration Works')}</h3>
						<div className="info-content">
							<p>{t('Real-time document collaboration allows multiple users to edit documents simultaneously:')}


							</p>
							<ul>
								<li>{t('Changes are synchronized in real-time across all connected users')}


								</li>
								<li>{t('Each user\'s cursor position and selections are visible to others')}


								</li>
								<li>{t('Conflict resolution is handled automatically using CRDT (Yjs)')}

								</li>
								<li>{t('Comments and responses are shared across all collaborators')}

								</li>
								<li>{t('Chat messages are synchronized for communication with all collaborators')}


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
				initialSubcategory="Real-time Synchronization" />

		</>);

};

export default CollabModal;