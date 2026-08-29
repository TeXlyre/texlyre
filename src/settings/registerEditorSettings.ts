// src/settings/registorEditorSettings.ts
import { useEffect, useRef } from 'react';

import { t } from '@/i18n';
import {
	MAX_FONT_SIZE,
	MIN_FONT_SIZE,
	defaultEditorSettings,
	resolveFontFamily,
	resolveFontSize,
} from '../contexts/EditorContext';
import { useSettings } from '../hooks/useSettings';
import type { EditorKeymapMode, FontFamily } from '../types/editor';

export function useRegisterEditorSettings() {
	const { batchGetSettings, registerSetting } = useSettings();
	const settingsRegisteredOnce = useRef(false);

	useEffect(() => {
		if (settingsRegisteredOnce.current) return;
		settingsRegisteredOnce.current = true;

		const batchedSettings = batchGetSettings([
			'editor-font-family',
			'editor-font-size',
			'editor-show-line-numbers',
			'editor-auto-save-enable',
			'editor-auto-save-delay',
			'editor-keymap-mode',
			'editor-spell-check',
			'editor-mathlive-enable',
			'editor-mathlive-preview-mode',
			'language',
		]);

		const initialFontFamily =
			(batchedSettings['editor-font-family'] as FontFamily) ??
			defaultEditorSettings.fontFamily;
		const initialFontSize = resolveFontSize(
			batchedSettings['editor-font-size'],
		);
		const initialShowLineNumbers =
			(batchedSettings['editor-show-line-numbers'] as boolean) ??
			defaultEditorSettings.showLineNumbers;
		const initialTextDirection =
			(batchedSettings['editor-text-direction'] as 'auto' | 'ltr' | 'rtl') ??
			defaultEditorSettings.textDirection;
		const initialAutoSaveEnabled =
			(batchedSettings['editor-auto-save-enable'] as boolean) ??
			defaultEditorSettings.autoSaveEnabled;
		const initialAutoSaveDelay =
			(batchedSettings['editor-auto-save-delay'] as number) ??
			defaultEditorSettings.autoSaveDelay;
		const initialKeymapMode =
			(batchedSettings['editor-keymap-mode'] as EditorKeymapMode) ??
			defaultEditorSettings.keymapMode;
		const initialSpellCheck =
			(batchedSettings['editor-spell-check'] as boolean) ??
			defaultEditorSettings.spellCheck;
		const initialMathLiveEnabled =
			(batchedSettings['editor-mathlive-enable'] as boolean) ??
			defaultEditorSettings.mathLiveEnabled;
		const initialMathLivePreviewMode =
			(batchedSettings['editor-mathlive-preview-mode'] as string) ??
			defaultEditorSettings.mathLivePreviewMode;

		document.documentElement.style.setProperty(
			'--editor-font-family',
			resolveFontFamily(initialFontFamily),
		);

		document.documentElement.style.setProperty(
			'--editor-font-size',
			`${initialFontSize}px`,
		);

		registerSetting({
			id: 'editor-font-family',
			category: t('Appearance'),
			subcategory: t('Text Editor'),
			type: 'select',
			label: t('Font family'),
			description: t('Select the font family for the editor'),
			defaultValue: initialFontFamily,
			options: [
				{ label: t('Monospace (System)'), value: 'monospace' },
				{ label: t('Fira Code'), value: 'fira-code' },
				{ label: t('DejaVu Sans Mono'), value: 'dejavu-mono' },
				{ label: t('Libertinus Mono'), value: 'libertinus-mono' },
				{ label: t('New Computer Modern'), value: 'new-computer-modern' },
				{ label: t('IBM Plex Serif'), value: 'ibm-plex-serif' },
				{ label: t('IBM Plex Sans'), value: 'ibm-plex-sans' },
				{ label: t('Literata'), value: 'literata' },
				{ label: t('Serif (System)'), value: 'serif' },
				{ label: t('Sans Serif (System)'), value: 'sans-serif' },
			],
			onChange: (value) => {
				document.documentElement.style.setProperty(
					'--editor-font-family',
					resolveFontFamily(value),
				);
			},
		});

		registerSetting({
			id: 'editor-font-size',
			category: t('Appearance'),
			subcategory: t('Text Editor'),
			type: 'number',
			label: t('Font size (pixels)'),
			description: t('Set the font size for the editor'),
			defaultValue: initialFontSize,
			min: MIN_FONT_SIZE,
			max: MAX_FONT_SIZE,
			onChange: (value) => {
				document.documentElement.style.setProperty(
					'--editor-font-size',
					`${resolveFontSize(value)}px`,
				);
			},
		});

		registerSetting({
			id: 'editor-show-line-numbers',
			category: t('Appearance'),
			subcategory: t('Text Editor'),
			type: 'checkbox',
			label: t('Show line numbers'),
			description: t('Show line numbers in the editor'),
			defaultValue: initialShowLineNumbers,
		});

		registerSetting({
			id: 'editor-text-direction',
			category: t('Appearance'),
			subcategory: t('Text Editor'),
			type: 'select',
			label: t('Editor text direction'),
			description: t('Control text direction within the editor'),
			defaultValue: initialTextDirection,
			options: [
				{ label: t('Auto (follows app language)'), value: 'auto' },
				{ label: t('Left-to-Right (LTR)'), value: 'ltr' },
				{ label: t('Right-to-Left (RTL)'), value: 'rtl' },
			],
		});

		registerSetting({
			id: 'editor-auto-save-enable',
			category: t('Viewers'),
			subcategory: t('Text Editor'),
			type: 'checkbox',
			label: t('Auto-save on changes'),
			description: t('Automatically save file changes while editing'),
			defaultValue: initialAutoSaveEnabled,
		});

		registerSetting({
			id: 'editor-auto-save-delay',
			category: t('Viewers'),
			subcategory: t('Text Editor'),
			type: 'number',
			label: t('Auto-save delay (milliseconds)'),
			description: t('Delay in milliseconds before saving changes'),
			defaultValue: initialAutoSaveDelay,
			dependsOn: { id: 'editor-auto-save-enable', value: true, nest: true },
			disabledReason: t('Requires: Auto-save on changes'),
			min: 50,
			max: 10000,
		});

		registerSetting({
			id: 'editor-keymap-mode',
			category: t('Viewers'),
			subcategory: t('Text Editor'),
			type: 'select',
			label: t('Editor keybindings'),
			description: t(
				'Choose the editor keybinding mode (Vim, Helix, and Emacs)',
			),
			defaultValue: initialKeymapMode,
			options: [
				{ label: t('Default'), value: null },
				{ label: t('Vim'), value: 'vim' },
				{ label: t('Helix'), value: 'helix' },
				{ label: t('Emacs'), value: 'emacs' },
			],
		});

		registerSetting({
			id: 'editor-spell-check',
			category: t('Viewers'),
			subcategory: t('Text Editor'),
			type: 'checkbox',
			label: t('Enable spell checking'),
			description: t(
				'Enable browser spell checking in the editor (note: not compatible with typesetter syntax)',
			),
			defaultValue: initialSpellCheck,
		});

		registerSetting({
			id: 'editor-mathlive-enable',
			category: t('Viewers'),
			subcategory: t('Text Editor'),
			type: 'checkbox',
			label: t('Enable MathLive'),
			description: t('Enable interactive math editing with MathLive'),
			defaultValue: initialMathLiveEnabled,
		});

		registerSetting({
			id: 'editor-mathlive-preview-mode',
			category: t('Viewers'),
			subcategory: t('Text Editor'),
			type: 'select',
			label: t('MathLive preview mode'),
			description: t('When to show rendered math equations'),
			defaultValue: initialMathLivePreviewMode,
			dependsOn: { id: 'editor-mathlive-enable', value: true, nest: true },
			disabledReason: t('Requires: Enable MathLive'),
			options: [
				{ label: t('On hover and cursor'), value: 'hover-cursor' },
				{ label: t('On hover'), value: 'hover' },
				{ label: t('On cursor'), value: 'cursor' },
			],
		});
	}, [registerSetting, batchGetSettings]);
}
