// src/contexts/EditorContext.tsx
import type React from 'react';
import {
	type ReactNode,
	createContext,
	useCallback,
	useLayoutEffect,
	useMemo,
} from 'react';

import { pluginRegistry } from '../plugins/PluginRegistry';
import { setEditorLanguageFeature } from '../extensions/codemirror/EditorLanguageFeatures';
import { useSettings } from '../hooks/useSettings';
import type {
	EditorSettings,
	FontFamily,
	HighlightTheme,
	EditorKeymapMode,
} from '../types/editor';
import type { CollabConnectOptions, CollabProviderType } from '../types/collab';

const LEGACY_FONT_SIZES: Record<string, number> = {
	xs: 10,
	sm: 12,
	base: 14,
	lg: 16,
	xl: 18,
	'2xl': 20,
	'3xl': 24,
};

export const MIN_FONT_SIZE = 8;
export const MAX_FONT_SIZE = 72;

export const fontFamilyMap: Record<FontFamily, string> = {
	monospace:
		"ui-monospace, 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', 'Noto Sans Mono', 'Droid Sans Mono', 'Consolas', monospace",
	serif: "ui-serif, 'Times New Roman', 'Times', serif",
	'sans-serif':
		"ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif",
	'fira-code': "'Fira Code', ui-monospace, monospace",
	'dejavu-mono': "'DejaVu Sans Mono', ui-monospace, monospace",
	'libertinus-mono': "'Libertinus Mono', ui-monospace, monospace",
	'new-computer-modern': "'New Computer Modern', ui-serif, serif",
	'ibm-plex-serif': "'IBM Plex Serif', ui-serif, serif",
	'ibm-plex-sans': "'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif",
	literata: "'Literata', ui-serif, serif",
};

export const resolveFontSize = (value: unknown): number => {
	const size =
		typeof value === 'number'
			? value
			: (LEGACY_FONT_SIZES[String(value)] ?? defaultEditorSettings.fontSize);

	return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size));
};

export const resolveFontFamily = (value: unknown): string =>
	fontFamilyMap[value as FontFamily] ??
	fontFamilyMap[defaultEditorSettings.fontFamily];

export const defaultEditorSettings: EditorSettings = {
	fontSize: 16,
	fontFamily: 'monospace',
	showLineNumbers: true,
	syntaxHighlighting: true,
	languageTooltips: true,
	languageDiagnostics: true,
	languageSymbolHighlights: true,
	autoSaveEnabled: false,
	autoSaveDelay: 150,
	highlightTheme: 'auto' as HighlightTheme,
	keymapMode: null as EditorKeymapMode,
	spellCheck: true,
	mathLiveEnabled: true,
	mathLivePreviewMode: 'cursor',
	language: 'en',
	textDirection: 'auto',
};

interface EditorContextType {
	editorSettings: EditorSettings;
	updateEditorSetting: <K extends keyof EditorSettings>(
		key: K,
		value: EditorSettings[K],
	) => void;
	getLineNumbersEnabled: () => boolean;
	getSyntaxHighlightingEnabled: () => boolean;
	getEditorTextDirection: () => 'auto' | 'ltr' | 'rtl';
	getAutoSaveEnabled: () => boolean;
	getAutoSaveDelay: () => number;
	getKeymapMode: () => EditorKeymapMode;
	getSpellCheckEnabled: () => boolean;
	getCollabOptions: () => CollabConnectOptions | null;
	getEnabledLSPPlugins: () => string[];
	editorSettingsVersion: number;
}

export const EditorContext = createContext<EditorContextType>({
	editorSettings: defaultEditorSettings,
	updateEditorSetting: () => {},
	getLineNumbersEnabled: () => true,
	getSyntaxHighlightingEnabled: () => true,
	getEditorTextDirection: () => 'auto',
	getAutoSaveEnabled: () => false,
	getAutoSaveDelay: () => 2000,
	getKeymapMode: () => null,
	getSpellCheckEnabled: () => true,
	getCollabOptions: () => null,
	getEnabledLSPPlugins: () =>
		pluginRegistry.getLSPPlugins().map((plugin) => plugin.id),
	editorSettingsVersion: 0,
});

interface EditorProviderProps {
	children: ReactNode;
}

export const EditorProvider: React.FC<EditorProviderProps> = ({ children }) => {
	const { getSetting, updateSetting } = useSettings();

	const editorSettings = useMemo<EditorSettings>(() => {
		return {
			fontFamily:
				(getSetting('editor-font-family')?.value as FontFamily) ??
				defaultEditorSettings.fontFamily,
			fontSize: resolveFontSize(getSetting('editor-font-size')?.value),
			showLineNumbers:
				(getSetting('editor-show-line-numbers')?.value as boolean) ??
				defaultEditorSettings.showLineNumbers,
			syntaxHighlighting:
				(getSetting('editor-syntax-highlighting')?.value as boolean) ??
				defaultEditorSettings.syntaxHighlighting,
			languageTooltips:
				(getSetting('editor-language-tooltips')?.value as boolean) ??
				defaultEditorSettings.languageTooltips,
			languageDiagnostics:
				(getSetting('editor-language-diagnostics')?.value as boolean) ??
				defaultEditorSettings.languageDiagnostics,
			languageSymbolHighlights:
				(getSetting('editor-language-symbol-highlights')?.value as boolean) ??
				defaultEditorSettings.languageSymbolHighlights,
			autoSaveEnabled:
				(getSetting('editor-auto-save-enable')?.value as boolean) ??
				defaultEditorSettings.autoSaveEnabled,
			autoSaveDelay:
				(getSetting('editor-auto-save-delay')?.value as number) ??
				defaultEditorSettings.autoSaveDelay,
			highlightTheme:
				(getSetting('editor-theme-highlights')?.value as HighlightTheme) ??
				defaultEditorSettings.highlightTheme,
			keymapMode:
				(getSetting('editor-keymap-mode')?.value as EditorKeymapMode) ??
				defaultEditorSettings.keymapMode,
			spellCheck:
				(getSetting('editor-spell-check')?.value as boolean) ??
				defaultEditorSettings.spellCheck,
			mathLiveEnabled:
				(getSetting('editor-mathlive-enable')?.value as boolean) ??
				defaultEditorSettings.mathLiveEnabled,
			mathLivePreviewMode:
				(getSetting('editor-mathlive-preview-mode')
					?.value as EditorSettings['mathLivePreviewMode']) ??
				defaultEditorSettings.mathLivePreviewMode,
			language:
				(getSetting('language')?.value as string) ??
				defaultEditorSettings.language,
			textDirection:
				(getSetting('editor-text-direction')
					?.value as EditorSettings['textDirection']) ??
				defaultEditorSettings.textDirection,
		};
	}, [getSetting]);

	useLayoutEffect(() => {
		setEditorLanguageFeature(
			'syntaxHighlighting',
			editorSettings.syntaxHighlighting,
		);
		setEditorLanguageFeature('tooltips', editorSettings.languageTooltips);
		setEditorLanguageFeature('diagnostics', editorSettings.languageDiagnostics);
		setEditorLanguageFeature(
			'symbolHighlights',
			editorSettings.languageSymbolHighlights,
		);
	}, [
		editorSettings.syntaxHighlighting,
		editorSettings.languageTooltips,
		editorSettings.languageDiagnostics,
		editorSettings.languageSymbolHighlights,
	]);

	const updateEditorSetting = useCallback(
		<K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => {
			const settingIdMap: Partial<Record<keyof EditorSettings, string>> = {
				fontFamily: 'editor-font-family',
				fontSize: 'editor-font-size',
				showLineNumbers: 'editor-show-line-numbers',
				syntaxHighlighting: 'editor-syntax-highlighting',
				languageTooltips: 'editor-language-tooltips',
				languageDiagnostics: 'editor-language-diagnostics',
				languageSymbolHighlights: 'editor-language-symbol-highlights',
				autoSaveEnabled: 'editor-auto-save-enable',
				autoSaveDelay: 'editor-auto-save-delay',
				highlightTheme: 'editor-theme-highlights',
				keymapMode: 'editor-keymap-mode',
				spellCheck: 'editor-spell-check',
				mathLiveEnabled: 'editor-mathlive-enable',
				mathLivePreviewMode: 'editor-mathlive-preview-mode',
				language: 'language',
				textDirection: 'editor-text-direction',
			};

			const settingId = settingIdMap[key];
			if (settingId) {
				updateSetting(settingId, value);
			}
		},
		[updateSetting],
	);

	const getLineNumbersEnabled = useCallback(
		() => editorSettings.showLineNumbers,
		[editorSettings.showLineNumbers],
	);

	// Keep language parsers active for folding, indentation, navigation, and tooling.
	// Visual syntax coloring is controlled independently by HighlightThemeExtension.
	const getSyntaxHighlightingEnabled = useCallback(() => true, []);

	const getEditorTextDirection = useCallback(
		() => editorSettings.textDirection,
		[editorSettings.textDirection],
	);

	const getAutoSaveEnabled = useCallback(
		() => editorSettings.autoSaveEnabled,
		[editorSettings.autoSaveEnabled],
	);

	const getAutoSaveDelay = useCallback(
		() => editorSettings.autoSaveDelay,
		[editorSettings.autoSaveDelay],
	);

	const getKeymapMode = useCallback(
		() => editorSettings.keymapMode,
		[editorSettings.keymapMode],
	);

	const getSpellCheckEnabled = useCallback(
		() => editorSettings.spellCheck,
		[editorSettings.spellCheck],
	);

	const getCollabOptions = useCallback((): CollabConnectOptions | null => {
		const providerTypeSetting = getSetting('collab-provider-type');
		const signalingServersSetting = getSetting('collab-signaling-servers');
		const websocketServerSetting = getSetting('collab-websocket-server');
		const awarenessTimeoutSetting = getSetting('collab-awareness-timeout');
		const autoReconnectSetting = getSetting('collab-auto-reconnect');

		if (!awarenessTimeoutSetting || !autoReconnectSetting) {
			return null;
		}

		const providerType =
			(providerTypeSetting?.value as CollabProviderType) ?? 'webrtc';
		const signalingServers = (signalingServersSetting?.value as string) ?? '';
		const websocketServer = (websocketServerSetting?.value as string) ?? '';
		const awarenessTimeout = awarenessTimeoutSetting.value as number;
		const autoReconnect = autoReconnectSetting.value as boolean;

		const serversToUse =
			signalingServers.length > 0
				? signalingServers.split(',').map((s) => s.trim())
				: undefined;

		return {
			providerType,
			signalingServers: serversToUse,
			websocketServer,
			autoReconnect,
			awarenessTimeout: awarenessTimeout * 1000,
		};
	}, [getSetting]);

	const getEnabledLSPPlugins = useCallback((): string[] => {
		const allLSPPlugins = pluginRegistry.getAllLSPPlugins();
		return allLSPPlugins
			.filter((plugin) => {
				const enabledSetting = getSetting(`${plugin.id}-enable`);
				return (enabledSetting?.value as boolean) ?? false;
			})
			.map((plugin) => plugin.id);
	}, [getSetting]);

	const editorSettingsSignature = JSON.stringify({
		editorSettings,
		theme: getSetting('theme-plugin')?.value,
		variant: getSetting('theme-variant')?.value,
		language: getSetting('language')?.value,
		textDirection: getSetting('text-direction')?.value,
	});

	const editorSettingsVersion = useMemo(() => {
		let hash = 0;

		for (let i = 0; i < editorSettingsSignature.length; i++) {
			hash = (hash * 31 + editorSettingsSignature.charCodeAt(i)) | 0;
		}

		return hash;
	}, [editorSettingsSignature]);

	const contextValue = {
		editorSettings,
		updateEditorSetting,
		getLineNumbersEnabled,
		getSyntaxHighlightingEnabled,
		getEditorTextDirection,
		getAutoSaveEnabled,
		getAutoSaveDelay,
		getKeymapMode,
		getSpellCheckEnabled,
		getCollabOptions,
		getEnabledLSPPlugins,
		editorSettingsVersion,
	};

	return (
		<EditorContext.Provider value={contextValue}>
			{children}
		</EditorContext.Provider>
	);
};
