import { t } from '@/i18n';
import { useEffect, useRef } from 'react';
import { useSettings } from '../hooks/useSettings';

export function useRegisterFileSystemBackupSettings() {
    const { registerSetting, getSetting } = useSettings();
    const registered = useRef(false);

    useEffect(() => {
        if (registered.current) return;
        registered.current = true;

        const initialBackupEnabled =
            getSetting('file-system-backup-enable')?.value as boolean ?? false;
        const initialAutoBackup =
            getSetting('file-system-backup-auto-backup')?.value as boolean ?? false;
        const initialAutoSync =
            getSetting('file-system-backup-auto-sync')?.value as boolean ?? false;

        registerSetting({
            id: 'file-system-backup-enable',
            category: t('Backup'),
            subcategory: t('File System'),
            type: 'checkbox',
            label: t('Enable file system backup'),
            description: t('Sync your data to a local folder for backup and sharing via cloud storage'),

            defaultValue: initialBackupEnabled
        });

        registerSetting({
            id: 'file-system-backup-auto-backup',
            category: t('Backup'),
            subcategory: t('File System'),
            type: 'checkbox',
            label: t('Auto-backup connection on startup'),
            description: t('Automatically start connection to file system when the application loads (requires folder authorization)'),

            defaultValue: initialAutoBackup
        });

        registerSetting({
            id: 'file-system-backup-auto-sync',
            category: t('Backup'),
            subcategory: t('File System'),
            type: 'checkbox',
            label: t('Auto-sync on change'),
            description: t('Automatically synchronize when project files change'),
            defaultValue: initialAutoSync
        });
    }, [registerSetting, getSetting]);
}