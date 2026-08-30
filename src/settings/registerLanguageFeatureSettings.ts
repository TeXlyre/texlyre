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
		{ label: 'Auto (follows app theme)', value: 'auto' },
		{ label: 'Light', value: 'light' },
		{ label: 'Dark (One Dark)', value: 'dark' },
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
		label: 'Built-in hover tooltips',
		description:
			'Show hover information from the bundled LaTeX, Typst, and BibTeX language support',
		requiresSyntaxHighlighting: true,
	},
	{
		key: 'builtinDiagnostics',
		label: 'Built-in diagnostics',
		description:
			'Report syntax problems detected by the bundled language support',
		requiresSyntaxHighlighting: true,
	},
	{
		key: 'builtinCompletion',
		label: 'Built-in completions',
		description:
			'Suggest commands, references, file paths, and bibliography keys from the bundled language support',
	},
	{
		key: 'builtinOutline',
		label: 'Built-in outline',
		description:
			'Build the outline panel from the bundled LaTeX, Typst, and TextMate parsers',
	},
];

const LSP_FEATURES: LanguageFeatureDescriptor[] = [
	{
		key: 'lspTooltips',
		label: 'Language server tooltips',
		description:
			'Show hover information and signature help from language servers',
	},
	{
		key: 'lspDiagnostics',
		label: 'Language server diagnostics',
		description:
			'Report problems published by language servers and offer their code actions',
	},
	{
		key: 'lspCompletion',
		label: 'Language server completions',
		description: 'Suggest completions requested from language servers',
	},
	{
		key: 'lspHighlighting',
		label: 'Language server syntax highlighting',
		description:
			'Color the document using semantic tokens from language servers',
	},
	{
		key: 'lspOutline',
		label: 'Language server outline',
		description:
			'Build the outline panel from document symbols reported by language servers',
	},
	{
		key: 'lspSymbolHighlights',
		label: 'Language server symbol highlights',
		description: 'Highlight other occurrences of the symbol under the cursor',
	},
	{
		key: 'lspNavigation',
		label: 'Language server navigation',
		description:
			'Enable go to definition, declaration, type definition, and implementation',
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
			options: HIGHLIGHT_THEME_OPTIONS.map((option) => ({
				...option,
				label: t(option.label),
			})),
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
				label: t(feature.label),
				description: t(feature.description),
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
