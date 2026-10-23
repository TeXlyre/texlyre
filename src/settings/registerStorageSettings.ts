// src/settings/registerStorageSettings.ts
import { useEffect, useRef } from 'react';

import { t } from '@/i18n';
import { useSettings } from '../hooks/useSettings';

export function useRegisterStorageSettings() {
	const { registerSetting, batchGetSettings } = useSettings();
	const registered = useRef(false);

	useEffect(() => {
		if (registered.current) return;
		registered.current = true;

		const batchedSettings = batchGetSettings([
			'storage-warning-threshold',
			'storage-minimum-free',
			'storage-hide-banner',
			'storage-sync-before-open',
			'storage-check-for-updates',
			'storage-check-interval',
			'storage-notifications',
		]);

		registerSetting({
			id: 'storage-warning-threshold',
			category: t('Storage'),
			subcategory: t('Browser Storage'),
			type: 'number',
			label: t('Storage warning threshold'),
			description: t(
				'Warn when this percentage of the storage the browser grants TeXlyre is in use',
			),
			defaultValue:
				(batchedSettings['storage-warning-threshold'] as number) ?? 85,
			min: 50,
			max: 99,
		});

		registerSetting({
			id: 'storage-minimum-free',
			category: t('Storage'),
			subcategory: t('Browser Storage'),
			type: 'number',
			label: t('Minimum free storage (MB)'),
			description: t(
				'Warn when less than this amount of storage is left, regardless of the percentage in use',
			),
			defaultValue: (batchedSettings['storage-minimum-free'] as number) ?? 200,
			min: 50,
			max: 5000,
		});

		registerSetting({
			id: 'storage-sync-before-open',
			category: t('Storage'),
			subcategory: t('Remote Storage'),
			type: 'checkbox',
			label: t('Sync stored projects before opening'),
			description: t(
				'Check remote storage and reconcile changes before opening a stored project',
			),
			defaultValue:
				(batchedSettings['storage-sync-before-open'] as boolean) ?? true,
		});

		registerSetting({
			id: 'storage-check-for-updates',
			category: t('Storage'),
			subcategory: t('Remote Storage'),
			type: 'checkbox',
			label: t('Check for remote storage updates periodically'),
			description: t(
				'Check for incoming revisions without changing local files',
			),
			defaultValue:
				(batchedSettings['storage-check-for-updates'] as boolean) ?? false,
		});

		registerSetting({
			id: 'storage-check-interval',
			category: t('Storage'),
			subcategory: t('Remote Storage'),
			type: 'number',
			label: t('Remote update check interval (seconds)'),
			description: t('How often to check for incoming remote storage changes'),
			defaultValue: (batchedSettings['storage-check-interval'] as number) ?? 60,
			min: 10,
			max: 3600,
			dependsOn: { id: 'storage-check-for-updates', value: true, nest: true },
			disabledReason: t('Requires: Periodic remote storage checks'),
		});

		registerSetting({
			id: 'storage-notifications',
			category: t('Storage'),
			subcategory: t('Remote Storage'),
			type: 'select',
			label: t('Sync notifications'),
			description: t('Choose which remote storage notifications to show'),
			defaultValue:
				(batchedSettings['storage-notifications'] as string) ?? 'all',
			options: [
				{ label: t('All notifications'), value: 'all' },
				{ label: t('Errors only'), value: 'errors' },
				{ label: t('Off'), value: 'off' },
			],
		});

		registerSetting({
			id: 'storage-hide-banner',
			category: t('Storage'),
			subcategory: t('Browser Storage'),
			type: 'checkbox',
			label: t('Hide storage banner'),
			description: t(
				'Hide the low storage warning banner while keeping storage checks enabled',
			),
			defaultValue:
				(batchedSettings['storage-hide-banner'] as boolean) ?? false,
		});
	}, [registerSetting, batchGetSettings]);
}
