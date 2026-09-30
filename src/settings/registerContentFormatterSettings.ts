// src/settings/registerContentFormatterSettings.ts
import { useEffect, useRef } from 'react';

import { t } from '@/i18n';
import { useSettings } from '../hooks/useSettings';

export function useRegisterContentFormatterSettings() {
	const { registerSetting } = useSettings();
	const registered = useRef(false);

	useEffect(() => {
		if (registered.current) return;
		registered.current = true;

		registerSetting({
			id: 'formatter-latex-notifications',
			category: t('Viewers'),
			subcategory: t('Text Editor'),
			type: 'select',
			label: t('{typesetter} formatting notifications', {
				typesetter: t('LaTeX'),
			}),
			description: t(
				'Choose which {typesetter} formatting notifications to show',
				{
					typesetter: t('LaTeX'),
				},
			),
			defaultValue: 'all',
			options: [
				{ label: t('All notifications'), value: 'all' },
				{ label: t('Errors only'), value: 'errors' },
				{ label: t('Off'), value: 'off' },
			],
		});

		registerSetting({
			id: 'formatter-typst-notifications',
			category: t('Viewers'),
			subcategory: t('Text Editor'),
			type: 'select',
			label: t('{typesetter} formatting notifications', {
				typesetter: t('Typst'),
			}),
			description: t(
				'Choose which {typesetter} formatting notifications to show',
				{
					typesetter: t('Typst'),
				},
			),
			defaultValue: 'all',
			options: [
				{ label: t('All notifications'), value: 'all' },
				{ label: t('Errors only'), value: 'errors' },
				{ label: t('Off'), value: 'off' },
			],
		});
	}, [registerSetting]);
}
