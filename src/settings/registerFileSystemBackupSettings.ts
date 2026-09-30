// src/settings/registerFileSystemBackupSettings.ts
import { useEffect, useRef } from 'react';

import { t } from '@/i18n';
import { useSettings } from '../hooks/useSettings';

export function useRegisterFileSystemBackupSettings() {
	const { registerSetting, getSetting } = useSettings();
	const registered = useRef(false);

	useEffect(() => {
		if (registered.current) return;
		registered.current = true;

		const initialBackupEnabled =
			(getSetting('file-sys-backup-enable')?.value as boolean) ?? false;
		const initialAutoBackup =
			(getSetting('file-sys-backup-auto-backup')?.value as boolean) ?? false;
		const initialAutoScan =
			(getSetting('file-sys-backup-auto-scan')?.value as boolean) ?? true;
		// const initialAutoSync =
		// 	(getSetting('file-sys-backup-auto-sync')?.value as boolean) ?? false;

		registerSetting({
			id: 'file-sys-backup-enable',
			category: t('Backup'),
			subcategory: t('File System'),
			type: 'checkbox',
			label: t('Enable file system backup'),
			description: t(
				'Sync your data to a local folder for backup and sharing via cloud storage',
			),

			defaultValue: initialBackupEnabled,
		});

		registerSetting({
			id: 'file-sys-backup-auto-backup',
			category: t('Backup'),
			subcategory: t('File System'),
			type: 'checkbox',
			label: t('Auto-backup connection on startup'),
			description: t(
				'Automatically reconnect the authorized backup folder when the application loads',
			),

			defaultValue: initialAutoBackup,
			dependsOn: { id: 'file-sys-backup-enable', value: true, nest: true },
			disabledReason: t('Requires: File system backup'),
		});

		registerSetting({
			id: 'file-sys-backup-auto-scan',
			category: t('Backup'),
			subcategory: t('File System'),
			type: 'checkbox',
			label: t('Auto-scan missing projects on startup'),
			description: t(
				'Scan the connected backup folder on startup for projects missing from this device',
			),
			defaultValue: initialAutoScan,
			dependsOn: { id: 'file-sys-backup-auto-backup', value: true, nest: true },
			disabledReason: t('Requires: Auto-backup connection on startup'),
		});

		// registerSetting({
		// 	id: 'file-sys-backup-auto-sync',
		// 	category: t('Backup'),
		// 	subcategory: t('File System'),
		// 	type: 'checkbox',
		// 	label: t('Auto-sync on change'),
		// 	description: t('Automatically synchronize when project files change'),
		// 	defaultValue: initialAutoSync,
		// });
	}, [registerSetting, getSetting]);
}
