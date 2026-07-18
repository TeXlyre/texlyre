// src/settings/registerTypstSettings.ts
import { useEffect, useRef } from 'react';

import { t } from '@/i18n';
import { useSettings } from '../hooks/useSettings';
import type { TypstOutputFormat } from '../types/typst';
import { typstService } from '../services/TypstService';

export function useRegisterTypstSettings() {
	const { registerSetting, getSetting } = useSettings();
	const settingsRegistered = useRef(false);

	useEffect(() => {
		if (settingsRegistered.current) return;
		settingsRegistered.current = true;

		const initialAutoCompile =
			(getSetting('typst-auto-compile-on-open')?.value as boolean) ?? false;
		const initialDefaultFormat =
			(getSetting('typst-default-format')?.value as TypstOutputFormat) ?? 'pdf';
		const initialSourceMap =
			(getSetting('typst-sourcemap-enable')?.value as boolean) ?? true;
		const initialAutoNavigate =
			(getSetting('typst-auto-navigate-to-main')?.value as string) ??
			'conditional';
		const initialAllowRemoteContent =
			(getSetting('typst-allow-remote-content')?.value as boolean) ?? true;

		registerSetting({
			id: 'typst-sourcemap-enable',
			category: t('Compilation'),
			subcategory: t('Typst'),
			type: 'checkbox',
			label: t('Enable source map (SVG only)'),
			description: t('Enable source mapping between editor and SVG output'),
			defaultValue: initialSourceMap,
		});

		registerSetting({
			id: 'typst-auto-compile-on-open',
			category: t('Compilation'),
			subcategory: t('Typst'),
			type: 'checkbox',
			label: t('Auto-compile on project open'),
			description: t(
				'Automatically compile {typesetter} when opening a project',
				{ typesetter: t('Typst') },
			),
			defaultValue: initialAutoCompile,
		});

		registerSetting({
			id: 'typst-auto-navigate-to-main',
			category: t('Compilation'),
			subcategory: t('Typst'),
			type: 'select',
			label: t('Auto-navigate to main file on compile'),
			description: t(
				'Control when to automatically navigate to the main {typesetter} file during compilation',
				{
					typesetter: t('Typst'),
				},
			),
			defaultValue: initialAutoNavigate,
			options: [
				{
					label: t('Only when no {typesetter} file is open', {
						typesetter: t('Typst'),
					}),
					value: 'conditional',
				},
				{ label: t('Always navigate to main file'), value: 'always' },
				{ label: t('Never navigate to main file'), value: 'never' },
			],
		});

		registerSetting({
			id: 'typst-default-format',
			category: t('Compilation'),
			subcategory: t('Typst'),
			type: 'select',
			label: t('Default output format'),
			description: t('Default format for {typesetter} compilation', {
				typesetter: t('Typst'),
			}),
			defaultValue: initialDefaultFormat,
			options: [
				{ label: t('PDF'), value: 'pdf' },
				{ label: t('Canvas (PDF)'), value: 'canvas-pdf' },
				{ label: t('Canvas (SVG)'), value: 'canvas' },
			],
		});

		registerSetting({
			id: 'typst-allow-remote-content',
			category: t('Compilation'),
			subcategory: t('Typst'),
			type: 'checkbox',
			label: t('Allow remote content in Typst output'),
			description: t(
				'Allow Typst SVG output to keep references to remote images, media, and other external resources. Air-gap mode may still block remote content in TeXlyre previews.',
			),
			defaultValue: initialAllowRemoteContent,
		});

		registerSetting({
			id: 'typst-notifications',
			category: t('Compilation'),
			subcategory: t('Typst'),
			type: 'checkbox',
			label: t('Show compilation notifications'),
			description: t(
				'Display notifications for {typesetter} compilation activities (PDF only)',
				{
					typesetter: t('Typst'),
				},
			),
			defaultValue: true,
		});

		typstService.setDefaultFormat(initialDefaultFormat);
	}, [registerSetting, getSetting]);
}
