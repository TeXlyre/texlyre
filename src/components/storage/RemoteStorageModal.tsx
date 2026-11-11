// src/components/storage/RemoteStorageModal.tsx
import type React from 'react';
import { useState } from 'react';

import { t } from '@/i18n';
import type {
	ProjectStorageBinding,
	StorageProjectStatus,
} from '../../types/storage';
import { formatDate } from '../../utils/dateUtils';
import {
	DisconnectIcon,
	RefreshIcon,
	SettingsIcon,
	StorageIcon,
	SyncIcon,
	TrashIcon,
} from '../common/Icons';
import IconButton from '../common/IconButton';
import Modal from '../common/Modal';
import SettingsModal from '../settings/SettingsModal';

interface RemoteStorageModalProps {
	isOpen: boolean;
	onClose: () => void;
	binding: ProjectStorageBinding;
	providerName: string;
	status: StorageProjectStatus;
	statusLabel: string;
	error: string | null;
	canSync: boolean;
	canDeleteRemote: boolean;
	onSync: () => Promise<void>;
	onRefresh: () => Promise<void>;
	onDetach: () => Promise<void>;
	onDeleteRemote: () => Promise<void>;
}

const RemoteStorageModal: React.FC<RemoteStorageModalProps> = ({
	isOpen,
	onClose,
	binding,
	providerName,
	status,
	statusLabel,
	error,
	canSync,
	canDeleteRemote,
	onSync,
	onRefresh,
	onDetach,
	onDeleteRemote,
}) => {
	const [showSettings, setShowSettings] = useState(false);
	const [busy, setBusy] = useState(false);
	const [actionError, setActionError] = useState<string | null>(null);

	const close = () => {
		if (busy) return;
		setActionError(null);
		onClose();
	};

	const runAction = async (action: () => Promise<void>) => {
		if (busy) return;
		setBusy(true);
		setActionError(null);
		try {
			await action();
			onClose();
		} catch (error) {
			setActionError(error instanceof Error ? error.message : String(error));
		} finally {
			setBusy(false);
		}
	};

	return (
		<>
			<Modal
				isOpen={isOpen}
				onClose={close}
				title={t('Remote Storage')}
				icon={StorageIcon}
				size='medium'
				headerActions={
					<button
						type='button'
						className='ui-icon-button'
						data-variant='subtle'
						title={t('Settings')}
						onClick={() => setShowSettings(true)}
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
								<strong>{t('Storage provider')}:</strong> {providerName}
							</div>
							<div className='ui-meta' data-layout='row'>
								<strong>{t('Status')}:</strong> {statusLabel}
							</div>
							{binding.lastSync && (
								<div className='ui-meta'>
									{t('Last Sync: {date}', {
										date: formatDate(binding.lastSync),
									})}
								</div>
							)}
						</div>
						{error && (
							<div className='ui-message' data-tone='error'>
								{error}
							</div>
						)}
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
									className='button secondary'
									onClick={() => void onSync()}
									disabled={!canSync || status === 'syncing' || busy}
								>
									<SyncIcon /> {t('Sync project with remote storage')}
								</button>
								<button
									type='button'
									className='button secondary icon-only'
									onClick={() => void onRefresh()}
									disabled={!canSync || status === 'checking' || busy}
									title={t('Refresh')}
								>
									<RefreshIcon />
								</button>
							</div>
							<div className='ui-toolbar-actions' data-gap='sm'>
								<IconButton
									icon={<DisconnectIcon />}
									label={t('Disconnect from remote storage')}
									variant='warn'
									disabled={busy || status === 'syncing'}
									confirm={{
										warning: t(
											'Detach from remote storage? Local project data and Git history will remain. Nothing on the remote server will be deleted.',
										),
										confirmLabel: t('Disconnect'),
									}}
									onClick={() => void runAction(onDetach)}
								/>
								{canDeleteRemote && (
									<IconButton
										icon={<TrashIcon />}
										label={t('Delete from remote storage')}
										variant='danger'
										disabled={busy || status === 'syncing'}
										confirm={{
											message: t(
												'Permanently delete {count} project(s) from remote storage?',
												{ count: 1 },
											),
											warning: t(
												'All remote objects and revision history will be deleted and the project ID permanently blocked on this server. Local copies are kept. Garage garbage collection and external backups may retain data temporarily.',
											),
											confirmLabel: t('Delete from remote storage'),
										}}
										onClick={() => void runAction(onDeleteRemote)}
									/>
								)}
							</div>
						</div>
					</section>
					{actionError && (
						<div className='ui-message' data-tone='error'>
							{actionError}
						</div>
					)}
				</div>
			</Modal>
			<SettingsModal
				isOpen={showSettings}
				onClose={() => setShowSettings(false)}
				initialCategory={t('External Tools')}
				initialSubcategory={t('Remote Storage')}
			/>
		</>
	);
};

export default RemoteStorageModal;
