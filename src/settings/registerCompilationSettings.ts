// src/settings/registerCompilationSettings.ts
import { useEffect, useRef } from 'react';

import { t } from '@/i18n';
import { useSettings } from '../hooks/useSettings';

export function useRegisterCompilationSettings() {
	const { registerSetting, getSetting } = useSettings();
	const settingsRegistered = useRef(false);

	useEffect(() => {
		if (settingsRegistered.current) return;
		settingsRegistered.current = true;

		const initialAutoExpand =
			(getSetting('compilation-auto-expand-output')?.value as boolean) ?? true;
		const initialExternalAutoCompile =
			(getSetting('external-typesetter-auto-compile-on-open')
				?.value as boolean) ?? false;
		const initialExternalAutoNavigate =
			(getSetting('external-typesetter-auto-navigate-to-main')
				?.value as string) ?? 'conditional';

		registerSetting({
			id: 'compilation-auto-expand-output',
			category: t('Compilation'),
			subcategory: t('General'),
			type: 'checkbox',
			label: t('Auto-expand output panel on compile'),
			description: t(
				'Automatically expand a collapsed output panel when compilation starts',
			),
			defaultValue: initialAutoExpand,
		});

		registerSetting({
			id: 'external-typesetter-auto-compile-on-open',
			category: t('Compilation'),
			subcategory: t('Generic Typesetter'),
			type: 'checkbox',
			label: t('Auto-compile on project open'),
			description: t(
				'Automatically compile {typesetter} when opening a project',
				{ typesetter: t('Generic Typesetter') },
			),
			defaultValue: initialExternalAutoCompile,
		});

		registerSetting({
			id: 'external-typesetter-auto-navigate-to-main',
			category: t('Compilation'),
			subcategory: t('Generic Typesetter'),
			type: 'select',
			label: t('Auto-navigate to main file on compile'),
			description: t(
				'Control when to automatically navigate to the main {typesetter} file during compilation',
				{ typesetter: t('Generic Typesetter') },
			),
			defaultValue: initialExternalAutoNavigate,
			options: [
				{
					label: t('Only when no {typesetter} file is open', {
						typesetter: t('Generic Typesetter'),
					}),
					value: 'conditional',
				},
				{ label: t('Always navigate to main file'), value: 'always' },
				{ label: t('Never navigate to main file'), value: 'never' },
			],
		});
	}, [registerSetting, getSetting]);
}
