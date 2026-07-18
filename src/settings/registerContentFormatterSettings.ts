// src/settings/registerContentFormatterSettings.ts
import { useEffect, useRef } from 'react';

import { t } from '@/i18n';
import { useSettings } from '../hooks/useSettings';

export function useRegisterContentFormatterSettings() {
	const { registerSetting, getSetting } = useSettings();
	const registered = useRef(false);

	useEffect(() => {
		if (registered.current) return;
		registered.current = true;

		const initialLatexNotifications =
			(getSetting('formatter-latex-notifications')?.value as boolean) ?? true;
		const initialTypstNotifications =
			(getSetting('formatter-typst-notifications')?.value as boolean) ?? true;

		registerSetting({
			id: 'formatter-latex-notifications',
			category: t('Viewers'),
			subcategory: t('Text Editor'),
			type: 'checkbox',
			label: t('{typesetter} formatting notifications', {
				typesetter: t('LaTeX'),
			}),
			description: t(
				'Display notifications for {typesetter} content formatting activities',
				{
					typesetter: t('LaTeX'),
				},
			),
			defaultValue: initialLatexNotifications,
		});

		registerSetting({
			id: 'formatter-typst-notifications',
			category: t('Viewers'),
			subcategory: t('Text Editor'),
			type: 'checkbox',
			label: t('{typesetter} formatting notifications', {
				typesetter: t('Typst'),
			}),
			description: t(
				'Display notifications for {typesetter} content formatting activities',
				{
					typesetter: t('Typst'),
				},
			),
			defaultValue: initialTypstNotifications,
		});
	}, [registerSetting, getSetting]);
}
