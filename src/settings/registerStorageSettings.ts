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
