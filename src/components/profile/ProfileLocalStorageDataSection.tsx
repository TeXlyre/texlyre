// src/components/profile/ProfileLocalStorageDataSection.tsx
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
import IconButton, {
	type IconButtonConfirm,
} from '../common/IconButton';
import { TrashIcon, DownloadIcon, ImportIcon } from '../common/Icons';

type ClearType = 'settings' | 'properties' | 'secrets' | 'records' | 'all';

interface LocalStorageDataSectionProps {
	user: User;
	isSubmitting: boolean;
	setIsSubmitting: (value: boolean) => void;
	onError: (message: string) => void;
	onSuccess: (message: string) => void;
}

const CLEAR_CONFIRMATIONS: Record<ClearType, IconButtonConfirm> = {
	settings: {
		title: t('Clear Settings'),
		message: t(
			'Are you sure you want to clear all your settings? This will reset all preferences to defaults.',
		),
		items: [
			t('All application preferences'),
			t('Editor configurations (font, saving interval, etc.)'),
			t('UI customizations and theme preferences (layout, variant, etc.)'),
			t('endpoints and server settings (links, connection configuration, etc.)'),
		],
		confirmLabel: t('Clear'),
	},
	properties: {
		title: t('Clear Properties'),
		message: t(
			'Are you sure you want to clear all your properties? This will remove all stored property values.',
		),
		items: [
			t('All stored property values'),
			t('Application state data (last opened file, current line in editor, etc.)'),
			t('User-specific configurations (panel width, collapse, etc.)'),
		],
		confirmLabel: t('Clear'),
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
		confirmLabel: t('Clear'),
	},
	records: {
		title: t('Clear Records and Logs'),
		message: t(
			'Are you sure you want to clear all your records and logs? This will remove action log history, notifications, and record data.',
		),
		items: [t('Git action history'), t('Other logs and notifications')],
		confirmLabel: t('Clear'),
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
		confirmLabel: t('Clear all'),
	},
};

const STORES: Array<{
	type: Exclude<ClearType, 'all'>;
	title: string;
	description: string;
}> = [
	{
		type: 'settings',
		title: t('Settings'),
		description: t('All your application settings and preferences'),
	},
	{
		type: 'properties',
		title: t('Properties'),
		description: t('All stored property values'),
	},
	{
		type: 'secrets',
		title: t('Encrypted Secrets'),
		description: t('All saved API keys and encrypted credentials'),
	},
	{
		type: 'records',
		title: t('Records and Logs'),
		description: t('All records, logs, and notifications'),
	},
];

const LocalStorageDataSection: React.FC<LocalStorageDataSectionProps> = ({
	user,
	isSubmitting,
	setIsSubmitting,
	onError,
	onSuccess,
}) => {
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

	const handleClearData = async (type: ClearType) => {
		try {
			setIsSubmitting(true);
			await clearUserData(user.id, type);
			onSuccess(
				type === 'all'
					? t('Successfully cleared all data')
					: t('Successfully cleared {type}', { type }),
			);
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
				{STORES.map(({ type, title, description }) => (
					<div className='storage-action-group' key={type}>
						<div className='storage-action-info'>
							<strong>{title}</strong>
							<p>{description}</p>
						</div>
						<div className='storage-action-buttons'>
							<IconButton
								icon={<DownloadIcon />}
								label={t('Download {type} data', { type })}
								disabled={isSubmitting}
								onClick={() => void handleDownloadData(type)}
							/>
							<IconButton
								icon={<TrashIcon />}
								label={t('Clear {type}', { type })}
								variant='danger'
								disabled={isSubmitting}
								confirm={CLEAR_CONFIRMATIONS[type]}
								onClick={() => void handleClearData(type)}
							/>
						</div>
					</div>
				))}

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
						<IconButton
							icon={<ImportIcon />}
							label={t('Import all data')}
							variant='primary'
							disabled={isSubmitting}
							onClick={() => fileInputRef?.click()}
						/>
						<input
							ref={setFileInputRef}
							type='file'
							accept='.json'
							onChange={handleImportData}
							style={{ display: 'none' }}
							disabled={isSubmitting}
						/>
						<IconButton
							icon={<DownloadIcon />}
							label={t('Download all data')}
							disabled={isSubmitting}
							onClick={() => void handleDownloadData('all')}
						/>
						<IconButton
							icon={<TrashIcon />}
							label={t('Clear all data')}
							variant='danger'
							disabled={isSubmitting}
							confirm={CLEAR_CONFIRMATIONS.all}
							onClick={() => void handleClearData('all')}
						/>
					</div>
				</div>
			</div>
		</>
	);
};

export default LocalStorageDataSection;
