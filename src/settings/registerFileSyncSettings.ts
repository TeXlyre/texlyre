import { t } from '@/i18n';
import { useEffect, useRef } from 'react';
import { useSettings } from '../hooks/useSettings';

export function useRegisterFileSyncSettings() {
    const { registerSetting, getSetting } = useSettings();
    const registered = useRef(false);

    useEffect(() => {
        if (registered.current) return;
        registered.current = true;

        const initialEnable =
            getSetting('file-sync-enable')?.value as boolean ?? false;
        const initialAutoInterval =
            getSetting('file-sync-auto-interval')?.value as number ?? 10;
        const initialHoldTimeout =
            getSetting('file-sync-hold-timeout')?.value as number ?? 30;
        const initialRequestTimeout =
            getSetting('file-sync-request-timeout')?.value as number ?? 60;
        const initialConflictResolution =
            getSetting('file-sync-conflict-resolution')?.value as string ??
            'prefer-latest';
        const initialServerUrl =
            getSetting('file-sync-server-url')?.value as string ??
            'http://filepizza.localhost:8082';
        const initialNotifications =
            getSetting('file-sync-notifications')?.value as boolean ?? true;

        registerSetting({
            id: 'file-sync-enable',
            category: t('Collaboration'),
            subcategory: t('File Synchronization'),
            type: 'checkbox',
            label: t('Enable file synchronization with peers'),
            defaultValue: initialEnable
        });

        registerSetting({
            id: 'file-sync-auto-interval',
            category: t('Collaboration'),
            subcategory: t('File Synchronization'),
            type: 'number',
            label: t('Auto-sync interval (seconds)'),
            description: t('How often to check for file changes and sync'),
            defaultValue: initialAutoInterval,
            min: 5,
            max: 300
        });

        registerSetting({
            id: 'file-sync-hold-timeout',
            category: t('Collaboration'),
            subcategory: t('File Synchronization'),
            type: 'number',
            label: t('Hold signal timeout (seconds)'),
            description: t('How long to hold a peer before timeout'),
            defaultValue: initialHoldTimeout,
            min: 10,
            max: 120
        });

        registerSetting({
            id: 'file-sync-request-timeout',
            category: t('Collaboration'),
            subcategory: t('File Synchronization'),
            type: 'number',
            label: t('Request timeout (seconds)'),
            description: t('How long to wait for file transfer completion'),
            defaultValue: initialRequestTimeout,
            min: 30,
            max: 300
        });

        registerSetting({
            id: 'file-sync-conflict-resolution',
            category: t('Collaboration'),
            subcategory: t('File Synchronization'),
            type: 'select',
            label: t('Conflict resolution strategy'),
            description: t('How to handle file conflicts when both local and remote files have changed'),

            defaultValue: initialConflictResolution,
            options: [
                { label: t('Prefer Latest (Default)'), value: 'prefer-latest' },
                { label: t('Prefer Local (Do nothing)'), value: 'prefer-local' },
                { label: t('Notify of Conflicts'), value: 'notify' }]
        });

        registerSetting({
            id: 'file-sync-server-url',
            category: t('Collaboration'),
            subcategory: t('File Synchronization'),
            type: 'text',
            label: t('FilePizza server URL'),
            description: t('Server URL for peer-to-peer file transfers'),
            defaultValue: initialServerUrl
        });

        registerSetting({
            id: 'file-sync-notifications',
            category: t('Collaboration'),
            subcategory: t('File Synchronization'),
            type: 'checkbox',
            label: t('Show sync notifications'),
            description: t('Display notifications for file sync activities'),
            defaultValue: initialNotifications
        });
    }, [registerSetting, getSetting]);
}