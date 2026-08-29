// src/settings/registerLanguageFeatureSettings.ts
import { useEffect, useRef } from 'react';

import { t } from '@/i18n';
import {
	LANGUAGE_FEATURE_SETTING_IDS,
	defaultEditorSettings,
} from '../contexts/EditorContext';
import { useSettings } from '../hooks/useSettings';
import type { HighlightTheme, LanguageFeatureSettings } from '../types/editor';

const HIGHLIGHT_THEME_OPTIONS: Array<{ label: string; value: HighlightTheme }> =
	[
		{ label: t('Auto (follows app theme)'), value: 'auto' },
		{ label: t('Light'), value: 'light' },
		{ label: t('Dark (One Dark)'), value: 'dark' },
		{ label: 'Abcdef', value: 'abcdef' },
		{ label: 'Abyss', value: 'abyss' },
		{ label: 'Android Studio', value: 'androidstudio' },
		{ label: 'Andromeda', value: 'andromeda' },
		{ label: 'Atom One', value: 'atomone' },
		{ label: 'Aura', value: 'aura' },
		{ label: 'Basic Light', value: 'basicLight' },
		{ label: 'Basic Dark', value: 'basicDark' },
		{ label: 'BBEdit', value: 'bbedit' },
		{ label: 'Bespin', value: 'bespin' },
		{ label: 'Copilot', value: 'copilot' },
		{ label: 'Darcula', value: 'darcula' },
		{ label: 'Dracula', value: 'dracula' },
		{ label: 'Duotone Dark', value: 'duotoneDark' },
		{ label: 'Duotone Light', value: 'duotoneLight' },
		{ label: 'Eclipse', value: 'eclipse' },
		{ label: 'GitHub Light', value: 'githubLight' },
		{ label: 'GitHub Dark', value: 'githubDark' },
		{ label: 'Gruvbox Dark', value: 'gruvboxDark' },
		{ label: 'Kimbie', value: 'kimbie' },
		{ label: 'Material Dark', value: 'materialDark' },
		{ label: 'Material Light', value: 'materialLight' },
		{ label: 'Monokai', value: 'monokai' },
		{ label: 'Monokai Dimmed', value: 'monokaiDimmed' },
		{ label: 'Noctis Lilac', value: 'noctisLilac' },
		{ label: 'Nord', value: 'nord' },
		{ label: 'Okaidia', value: 'okaidia' },
		{ label: 'Quiet Light', value: 'quietlight' },
		{ label: 'Red', value: 'red' },
		{ label: 'Solarized Light', value: 'solarizedLight' },
		{ label: 'Solarized Dark', value: 'solarizedDark' },
		{ label: 'Sublime', value: 'sublime' },
		{ label: 'Tokyo Night', value: 'tokyoNight' },
		{ label: 'Tokyo Night Storm', value: 'tokyoNightStorm' },
		{ label: 'Tokyo Night Day', value: 'tokyoNightDay' },
		{ label: 'Tomorrow Night Blue', value: 'tomorrowNightBlue' },
		{ label: 'VS Code Dark', value: 'vscodeDark' },
		{ label: 'VS Code Light', value: 'vscodeLight' },
		{ label: 'White Light', value: 'whiteLight' },
		{ label: 'White Dark', value: 'whiteDark' },
		{ label: 'XCode Dark', value: 'xcodeDark' },
		{ label: 'XCode Light', value: 'xcodeLight' },
	];

interface LanguageFeatureDescriptor {
	key: keyof LanguageFeatureSettings;
	label: string;
	description: string;
	requiresSyntaxHighlighting?: boolean;
}

const BUILTIN_FEATURES: LanguageFeatureDescriptor[] = [
	{
		key: 'builtinTooltips',
		label: t('Built-in hover tooltips'),
		description: t(
			'Show hover information from the bundled LaTeX, Typst, and BibTeX language support',
		),
		requiresSyntaxHighlighting: true,
	},
	{
		key: 'builtinDiagnostics',
		label: t('Built-in diagnostics'),
		description: t(
			'Report syntax problems detected by the bundled language support',
		),
		requiresSyntaxHighlighting: true,
	},
	{
		key: 'builtinCompletion',
		label: t('Built-in completions'),
		description: t(
			'Suggest commands, references, file paths, and bibliography keys from the bundled language support',
		),
	},
	{
		key: 'builtinOutline',
		label: t('Built-in outline'),
		description: t(
			'Build the outline panel from the bundled LaTeX, Typst, and TextMate parsers',
		),
	},
];

const LSP_FEATURES: LanguageFeatureDescriptor[] = [
	{
		key: 'lspTooltips',
		label: t('Language server tooltips'),
		description: t(
			'Show hover information and signature help from language servers',
		),
	},
	{
		key: 'lspDiagnostics',
		label: t('Language server diagnostics'),
		description: t(
			'Report problems published by language servers and offer their code actions',
		),
	},
	{
		key: 'lspCompletion',
		label: t('Language server completions'),
		description: t('Suggest completions requested from language servers'),
	},
	{
		key: 'lspHighlighting',
		label: t('Language server syntax highlighting'),
		description: t(
			'Color the document using semantic tokens from language servers',
		),
	},
	{
		key: 'lspOutline',
		label: t('Language server outline'),
		description: t(
			'Build the outline panel from document symbols reported by language servers',
		),
	},
	{
		key: 'lspSymbolHighlights',
		label: t('Language server symbol highlights'),
		description: t(
			'Highlight other occurrences of the symbol under the cursor',
		),
	},
	{
		key: 'lspNavigation',
		label: t('Language server navigation'),
		description: t(
			'Enable go to definition, declaration, type definition, and implementation',
		),
	},
];

export function useRegisterLanguageFeatureSettings() {
	const { batchGetSettings, registerSetting } = useSettings();
	const settingsRegisteredOnce = useRef(false);

	useEffect(() => {
		if (settingsRegisteredOnce.current) return;
		settingsRegisteredOnce.current = true;

		const featureIds = Object.values(LANGUAGE_FEATURE_SETTING_IDS);
		const batchedSettings = batchGetSettings([
			'editor-syntax-highlighting',
			'editor-theme-highlights',
			...featureIds,
		]);

		const category = t('Appearance');
		const subcategory = t('Syntax & Hints');

		registerSetting({
			id: 'editor-theme-highlights',
			category,
			subcategory,
			type: 'select',
			label: t('Syntax highlighting theme'),
			description: t(
				'Choose the color theme used by built-in and language server highlighting',
			),
			defaultValue:
				(batchedSettings['editor-theme-highlights'] as HighlightTheme) ??
				defaultEditorSettings.highlightTheme,
			options: HIGHLIGHT_THEME_OPTIONS,
		});

		registerSetting({
			id: 'editor-syntax-highlighting',
			category,
			subcategory,
			type: 'checkbox',
			label: t('Built-in syntax highlighting'),
			description: t(
				'Parse and color the document with the bundled language support (LaTeX, Typst, BibTeX, and markdown)',
			),
			defaultValue:
				(batchedSettings['editor-syntax-highlighting'] as boolean) ??
				defaultEditorSettings.syntaxHighlighting,
		});

		for (const feature of [...BUILTIN_FEATURES, ...LSP_FEATURES]) {
			const id = LANGUAGE_FEATURE_SETTING_IDS[feature.key];

			registerSetting({
				id,
				category,
				subcategory,
				type: 'checkbox',
				label: feature.label,
				description: feature.description,
				defaultValue:
					(batchedSettings[id] as boolean) ??
					defaultEditorSettings.languageFeatures[feature.key],
				...(feature.requiresSyntaxHighlighting
					? {
							dependsOn: {
								id: 'editor-syntax-highlighting',
								value: true,
								nest: true,
							},
							disabledReason: t('Requires: Built-in syntax highlighting'),
						}
					: {}),
			});
		}
	}, [registerSetting, batchGetSettings]);
}
