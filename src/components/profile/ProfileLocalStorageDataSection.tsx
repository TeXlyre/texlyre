// src/components/profile/LocalStorageDataSection.tsx
import type React from 'react';
import { useState } from 'react';

import { t } from '@/i18n';
import {
	type UserDataType,
	downloadUserData,
	clearUserData,
	importFromFile,
} from '../../utils/userDataUtils';
import type { User } from '../../types/auth';
import Modal from '../common/Modal';
import { TrashIcon, DownloadIcon, ImportIcon } from '../common/Icons';

type ClearType = 'settings' | 'properties' | 'secrets' | 'records' | 'all';

interface LocalStorageDataSectionProps {
	user: User;
	isSubmitting: boolean;
	setIsSubmitting: (value: boolean) => void;
	onError: (message: string) => void;
	onSuccess: (message: string) => void;
}

const LocalStorageDataSection: React.FC<LocalStorageDataSectionProps> = ({
	user,
	isSubmitting,
	setIsSubmitting,
	onError,
	onSuccess,
}) => {
	const [showDeleteModal, setShowDeleteModal] = useState(false);
	const [deleteType, setDeleteType] = useState<ClearType | null>(null);
	const [fileInputRef, setFileInputRef] = useState<HTMLInputElement | null>(
		null,
	);

	const handleDownloadData = async (type: UserDataType) => {
		try {
			await downloadUserData(user.id, type);
			onSuccess(
				type === 'all'
					? t('Downloaded all data')
					: t('Downloaded {type}', { type }),
			);
		} catch (error) {
			onError(
				error instanceof Error ? error.message : t('Failed to download data'),
			);
		}
	};

	const handleOpenDeleteModal = (type: ClearType) => {
		setDeleteType(type);
		setShowDeleteModal(true);
	};

	const handleCloseDeleteModal = () => {
		setShowDeleteModal(false);
		setDeleteType(null);
	};

	const handleConfirmDelete = async () => {
		if (!deleteType) return;

		try {
			setIsSubmitting(true);
			await clearUserData(user.id, deleteType);
			onSuccess(
				deleteType === 'all'
					? t('Successfully cleared all data')
					: t('Successfully cleared {type}', { type: deleteType }),
			);
			handleCloseDeleteModal();
			setTimeout(() => {
				window.location.reload();
			}, 1500);
		} catch (error) {
			onError(
				error instanceof Error ? error.message : t('Failed to clear data'),
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
		if (!e.target.files?.[0]) return;

		const file = e.target.files[0];
		if (!file.name.endsWith('.json')) {
			onError(t('Please select a valid JSON file'));
			return;
		}

		try {
			setIsSubmitting(true);
			await importFromFile(user.id, file);
			onSuccess(t('Successfully imported user data'));
			setTimeout(() => {
				window.location.reload();
			}, 1500);
		} catch (error) {
			onError(
				error instanceof Error ? error.message : t('Failed to import data'),
			);
		} finally {
			setIsSubmitting(false);
			e.target.value = '';
		}
	};

	const getDeleteModalContent = () => {
		if (!deleteType) return { title: '', message: '', items: [] };

		const content = {
			settings: {
				title: t('Clear Settings'),
				message: t(
					'Are you sure you want to clear all your settings? This will reset all preferences to defaults.',
				),
				items: [
					t('All application preferences'),
					t('Editor configurations (font, saving interval, etc.)'),
					t('UI customizations and theme preferences (layout, variant, etc.)'),
					t(
						'endpoints and server settings (links, connection configuration, etc.)',
					),
				],
			},
			properties: {
				title: t('Clear Properties'),
				message: t(
					'Are you sure you want to clear all your properties? This will remove all stored property values.',
				),
				items: [
					t('All stored property values'),
					t(
						'Application state data (last opened file, current line in editor, etc.)',
					),
					t('User-specific configurations (panel width, collapse, etc.)'),
				],
			},
			secrets: {
				title: t('Clear Encrypted Secrets'),
				message: t(
					'Are you sure you want to clear all your encrypted secrets? This will permanently delete all saved API keys and credentials.',
				),
				items: [
					t('All API keys'),
					t('Encrypted credentials'),
					t('Authentication tokens (GitHub API key)'),
				],
			},
			records: {
				title: t('Clear Records and Logs'),
				message: t(
					'Are you sure you want to clear all your records and logs? This will remove action log history, notifications, and record data.',
				),
				items: [t('Git action history'), t('Other logs and notifications')],
			},
			all: {
				title: t('Clear All Local Storage'),
				message: t(
					'Are you sure you want to clear ALL local storage data? This will remove settings, properties, secrets, records, and logs permanently.',
				),
				items: [
					t('All application settings'),
					t('All stored properties'),
					t('All encrypted secrets'),
					t('All records and logs'),
					t('All cached data'),
				],
			},
		};

		return content[deleteType];
	};

	const modalContent = getDeleteModalContent();

	return (
		<>
			<h3 style={{ paddingTop: '1rem' }}>{t('Local Storage Data')}</h3>

			<div className='warning-message'>
				<h3>{t('\u26A0\uFE0F Warning: This action cannot be undone')}</h3>
				<p>
					{t(
						'Clearing or uploading local storage data is permanent and cannot be undone. Make sure to export your data before clearing if you want to keep it.',
					)}
				</p>
				<p>
					{t('This does NOT delete your projects, files, and account data.')}
				</p>
			</div>

			<div className='local-storage-actions'>
				<div className='storage-action-group'>
					<div className='storage-action-info'>
						<strong>{t('Settings')}</strong>
						<p>{t('All your application settings and preferences')}</p>
					</div>
					<div className='storage-action-buttons'>
						<button
							type='button'
							className='button secondary smaller icon-only'
							onClick={() => handleDownloadData('settings')}
							disabled={isSubmitting}
							title={t('Download settings data')}
						>
							<DownloadIcon />
						</button>
						<button
							type='button'
							className='button danger smaller icon-only'
							onClick={() => handleOpenDeleteModal('settings')}
							disabled={isSubmitting}
							title={t('Clear settings')}
						>
							<TrashIcon />
						</button>
					</div>
				</div>

				<div className='storage-action-group'>
					<div className='storage-action-info'>
						<strong>{t('Properties')}</strong>
						<p>{t('All stored property values')}</p>
					</div>
					<div className='storage-action-buttons'>
						<button
							type='button'
							className='button secondary smaller icon-only'
							onClick={() => handleDownloadData('properties')}
							disabled={isSubmitting}
							title={t('Download properties data')}
						>
							<DownloadIcon />
						</button>
						<button
							type='button'
							className='button danger smaller icon-only'
							onClick={() => handleOpenDeleteModal('properties')}
							disabled={isSubmitting}
							title={t('Clear properties')}
						>
							<TrashIcon />
						</button>
					</div>
				</div>

				<div className='storage-action-group'>
					<div className='storage-action-info'>
						<strong>{t('Encrypted Secrets')}</strong>
						<p>{t('All saved API keys and encrypted credentials')}</p>
					</div>
					<div className='storage-action-buttons'>
						<button
							type='button'
							className='button secondary smaller icon-only'
							onClick={() => handleDownloadData('secrets')}
							disabled={isSubmitting}
							title={t('Download secrets data')}
						>
							<DownloadIcon />
						</button>
						<button
							type='button'
							className='button danger smaller icon-only'
							onClick={() => handleOpenDeleteModal('secrets')}
							disabled={isSubmitting}
							title={t('Clear secrets')}
						>
							<TrashIcon />
						</button>
					</div>
				</div>

				<div className='storage-action-group'>
					<div className='storage-action-info'>
						<strong>{t('Records and Logs')}</strong>
						<p>{t('All records, logs, and notifications')}</p>
					</div>
					<div className='storage-action-buttons'>
						<button
							type='button'
							className='button secondary smaller icon-only'
							onClick={() => handleDownloadData('records')}
							disabled={isSubmitting}
							title={t('Download records data')}
						>
							<DownloadIcon />
						</button>
						<button
							type='button'
							className='button danger smaller icon-only'
							onClick={() => handleOpenDeleteModal('records')}
							disabled={isSubmitting}
							title={t('Clear records')}
						>
							<TrashIcon />
						</button>
					</div>
				</div>

				<div className='storage-action-group danger-zone'>
					<div className='storage-action-info'>
						<strong>{t('All Local Storage Data')}</strong>
						<p>
							{t(
								'All settings, properties, secrets, records, and logs at once',
							)}
						</p>
					</div>
					<div className='storage-action-buttons'>
						<button
							type='button'
							className='button primary smaller icon-only'
							onClick={() => fileInputRef?.click()}
							disabled={isSubmitting}
							title={t('Import all data')}
						>
							<ImportIcon />
						</button>
						<input
							ref={setFileInputRef}
							type='file'
							accept='.json'
							onChange={handleImportData}
							style={{ display: 'none' }}
							disabled={isSubmitting}
						/>

						<button
							type='button'
							className='button secondary smaller icon-only'
							onClick={() => handleDownloadData('all')}
							disabled={isSubmitting}
							title={t('Download all data')}
						>
							<DownloadIcon />
						</button>
						<button
							type='button'
							className='button danger icon-only'
							onClick={() => handleOpenDeleteModal('all')}
							disabled={isSubmitting}
							title={t('Clear all data')}
						>
							<TrashIcon />
						</button>
					</div>
				</div>
			</div>

			<Modal
				isOpen={showDeleteModal}
				onClose={handleCloseDeleteModal}
				title={modalContent.title}
				icon={TrashIcon}
				size='medium'
			>
				<div className='clear-storage-modal'>
					<div className='items-to-clear'>
						<h4>{t('The following will be permanently removed:')}</h4>
						<ul>
							{modalContent.items.map((item, index) => (
								<li key={index}>{item}</li>
							))}
						</ul>
					</div>
					<div className='warning-message'>
						<p>{t('This action cannot be undone.')}</p>
						<p>{modalContent.message}</p>
					</div>

					<div className='modal-actions'>
						<button
							type='button'
							className='button secondary'
							onClick={handleCloseDeleteModal}
							disabled={isSubmitting}
						>
							{t('Cancel')}
						</button>
						<button
							type='button'
							className='button danger'
							onClick={handleConfirmDelete}
							disabled={isSubmitting}
						>
							{isSubmitting
								? t('Clearing...')
								: t('Clear {data}', {
										data: deleteType === 'all' ? t('All Data') : t(deleteType),
									})}
						</button>
					</div>
				</div>
			</Modal>
		</>
	);
};

export default LocalStorageDataSection;
