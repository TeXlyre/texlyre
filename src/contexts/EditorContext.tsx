// src/contexts/EditorContext.tsx
import type React from "react";
import {
	type ReactNode,
	createContext,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

import { pluginRegistry } from "../plugins/PluginRegistry";
import { useSettings } from "../hooks/useSettings";
import type {
	EditorSettings,
	FontFamily,
	FontSize,
} from "../types/editorSettings";
import {
	defaultEditorSettings,
	fontFamilyMap,
	fontSizeMap,
} from "../types/editorSettings";
import type { CollabConnectOptions } from "../types/collab"
import { LatexSuitePluginSettingsRaw, SETTINGS_EXPLANATIONS as LATEX_SUITE_SETTINGS_EXPLANATIONS, getSettingsSnippets, DEFAULT_SETTINGS, getSettingsSnippetVariables, parseSnippets, parseSnippetVariables } from "latex-suite";
import { defaultLatexSuiteSettings } from "../types/latexSuiteSettings";
import { Setting, SettingCodeMirrorOptions, SettingType } from "./SettingsContext";

interface EditorContextType {
	editorSettings: EditorSettings;
	updateEditorSetting: <K extends keyof EditorSettings>(
		key: K,
		value: EditorSettings[K],
	) => void;
	getFontSize: () => string;
	getFontFamily: () => string;
	getLineNumbersEnabled: () => boolean;
	getSyntaxHighlightingEnabled: () => boolean;
	getAutoSaveEnabled: () => boolean;
	getAutoSaveDelay: () => number;
	getVimModeEnabled: () => boolean;
	getCollabOptions: () => CollabConnectOptions;
	getEnabledLSPPlugins: () => string[];
	editorSettingsVersion: number;
}

export const EditorContext = createContext<EditorContextType>({
	editorSettings: defaultEditorSettings,
	updateEditorSetting: () => {},
	getFontSize: () => "14px",
	getFontFamily: () => fontFamilyMap.monospace,
	getLineNumbersEnabled: () => true,
	getSyntaxHighlightingEnabled: () => true,
	getAutoSaveEnabled: () => false,
	getAutoSaveDelay: () => 2000,
	getVimModeEnabled: () => false,
	getCollabOptions: () => ({}),
	getEnabledLSPPlugins: () =>
		pluginRegistry.getLSPPlugins().map((plugin) => plugin.id),
	editorSettingsVersion: 0,
});

interface LatexSuiteContextType extends LatexSuitePluginSettingsRaw {
	updateLatexSuiteSetting: <K extends keyof LatexSuitePluginSettingsRaw>(
		key: K,
		value: LatexSuitePluginSettingsRaw[K],
	) => void;
}

export const LatexSuiteContext = createContext<LatexSuitePluginSettingsRaw>({
	...defaultLatexSuiteSettings,
});


interface EditorProviderProps {
	children: ReactNode;
}

export const EditorProvider: React.FC<EditorProviderProps> = ({ children }) => {
	const { getSetting, registerSetting } = useSettings();
	const [editorSettings, setEditorSettings] = useState<EditorSettings>(
		defaultEditorSettings,
	);
	const [editorSettingsVersion, setEditorSettingsVersion] = useState(0);
	const settingsRegisteredOnce = useRef(false);

	const updateEditorSetting = useCallback(
		<K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => {
			setEditorSettings((prev) => ({ ...prev, [key]: value }));
			setEditorSettingsVersion((prev) => prev + 1);
		},
		[],
	);
	const [latexSuiteSettings, setLatexSuiteSettings] = useState<LatexSuitePluginSettingsRaw>(
		defaultLatexSuiteSettings,
	);
	const updateLatexSuiteSetting = useCallback(
		(key: keyof LatexSuitePluginSettingsRaw, value: LatexSuitePluginSettingsRaw[keyof LatexSuitePluginSettingsRaw]) => {
			setLatexSuiteSettings((prev) => {
				return { ...prev, [key]: value };
			});
		},
		[],
	);

	const applyCSSProperties = useCallback((settings: EditorSettings) => {
		document.documentElement.style.setProperty(
			"--editor-font-size",
			fontSizeMap[settings.fontSize],
		);
		document.documentElement.style.setProperty(
			"--editor-font-family",
			fontFamilyMap[settings.fontFamily],
		);
	}, []);

	useEffect(() => {
		if (settingsRegisteredOnce.current) return;
		settingsRegisteredOnce.current = true;

		const initialFontSize =
			(getSetting("editor-font-size")?.value as FontSize) ??
			defaultEditorSettings.fontSize;
		const initialFontFamily =
			(getSetting("editor-font-family")?.value as FontFamily) ??
			defaultEditorSettings.fontFamily;
		const initialShowLineNumbers =
			(getSetting("editor-show-line-numbers")?.value as boolean) ??
			defaultEditorSettings.showLineNumbers;
		const initialSyntaxHighlighting =
			(getSetting("editor-syntax-highlighting")?.value as boolean) ??
			defaultEditorSettings.syntaxHighlighting;
		const initialAutoSaveEnabled =
			(getSetting("editor-auto-save-enable")?.value as boolean) ??
			defaultEditorSettings.autoSaveEnabled;
		const initialAutoSaveDelay =
			(getSetting("editor-auto-save-delay")?.value as number) ??
			defaultEditorSettings.autoSaveDelay;
		const initialHighlightTheme =
			(getSetting("editor-theme-highlights")?.value as
				| "auto"
				| "light"
				| "dark") ?? defaultEditorSettings.highlightTheme;
		const initialVimMode =
			(getSetting("editor-vim-mode")?.value as boolean) ??
			defaultEditorSettings.vimMode;

		const loadedSettings = {
			fontSize: initialFontSize,
			fontFamily: initialFontFamily,
			showLineNumbers: initialShowLineNumbers,
			syntaxHighlighting: initialSyntaxHighlighting,
			autoSaveEnabled: initialAutoSaveEnabled,
			autoSaveDelay: initialAutoSaveDelay,
			highlightTheme: initialHighlightTheme,
			vimMode: initialVimMode,
		};

		setEditorSettings(loadedSettings);
		setEditorSettingsVersion((prev) => prev + 1);
		applyCSSProperties(loadedSettings);

		registerSetting({
			id: "editor-font-size",
			category: "Appearance",
			subcategory: "Text Editor",
			type: "select",
			label: "Font size",
			description: "Select the font size for the editor",
			defaultValue: defaultEditorSettings.fontSize,
			options: [
				{ label: "Extra Small (10px)", value: "xs" },
				{ label: "Small (12px)", value: "sm" },
				{ label: "Base (14px)", value: "base" },
				{ label: "Large (16px)", value: "lg" },
				{ label: "Extra Large (18px)", value: "xl" },
				{ label: "2X Large (20px)", value: "2xl" },
				{ label: "3X Large (24px)", value: "3xl" },
			],
			onChange: (value) => {
				const fontSize = value as FontSize;
				updateEditorSetting("fontSize", fontSize);
				document.documentElement.style.setProperty(
					"--editor-font-size",
					fontSizeMap[fontSize],
				);
			},
		});

		registerSetting({
			id: "editor-font-family",
			category: "Appearance",
			subcategory: "Text Editor",
			type: "select",
			label: "Font family",
			description: "Select the font family for the editor",
			defaultValue: defaultEditorSettings.fontFamily,
			options: [
				{ label: "Monospace (System)", value: "monospace" },
				{ label: "JetBrains Mono", value: "jetbrains-mono" },
				{ label: "Fira Code", value: "fira-code" },
				{ label: "Source Code Pro", value: "source-code-pro" },
				{ label: "Inconsolata", value: "inconsolata" },
				{ label: "Serif", value: "serif" },
				{ label: "Sans Serif", value: "sans-serif" },
			],
			onChange: (value) => {
				const fontFamily = value as FontFamily;
				updateEditorSetting("fontFamily", fontFamily);
				document.documentElement.style.setProperty(
					"--editor-font-family",
					fontFamilyMap[fontFamily],
				);
			},
		});

		registerSetting({
			id: "editor-show-line-numbers",
			category: "Appearance",
			subcategory: "Text Editor",
			type: "checkbox",
			label: "Show line numbers",
			description: "Show line numbers in the editor",
			defaultValue: defaultEditorSettings.showLineNumbers,
			onChange: (value) => {
				updateEditorSetting("showLineNumbers", value as boolean);
			},
		});

		registerSetting({
			id: "editor-syntax-highlighting",
			category: "Appearance",
			subcategory: "Text Editor",
			type: "checkbox",
			label: "Show syntax highlighting",
			description:
				"Show syntax highlighting in the editor including tooltip and linting (LaTeX, BibTeX, and markdown)",
			defaultValue: defaultEditorSettings.syntaxHighlighting,
			onChange: (value) => {
				updateEditorSetting("syntaxHighlighting", value as boolean);
			},
		});

		registerSetting({
			id: "editor-theme-highlights",
			category: "Appearance",
			subcategory: "Text Editor",
			type: "select",
			label: "Syntax highlighting theme",
			description: "Choose the color theme for syntax highlighting",
			defaultValue: defaultEditorSettings.highlightTheme,
			options: [
				{ label: "Auto (follows app theme)", value: "auto" },
				{ label: "Light theme", value: "light" },
				{ label: "Dark theme (OneDark)", value: "dark" },
			],
			onChange: (value) => {
				updateEditorSetting(
					"highlightTheme",
					value as "auto" | "light" | "dark",
				);
			},
		});

		registerSetting({
			id: "editor-auto-save-enable",
			category: "Viewers",
			subcategory: "Text Editor",
			type: "checkbox",
			label: "Auto-save on changes",
			description: "Automatically save file changes while editing",
			defaultValue: defaultEditorSettings.autoSaveEnabled,
			onChange: (value) => {
				updateEditorSetting("autoSaveEnabled", value as boolean);
			},
		});

		registerSetting({
			id: "editor-auto-save-delay",
			category: "Viewers",
			subcategory: "Text Editor",
			type: "number",
			label: "Auto-save delay (milliseconds)",
			description: "Delay in milliseconds before saving changes",
			defaultValue: defaultEditorSettings.autoSaveDelay,
			min: 500,
			max: 10000,
			onChange: (value) => {
				updateEditorSetting("autoSaveDelay", value as number);
			},
		});

		registerSetting({
			id: "editor-vim-mode",
			category: "Viewers",
			subcategory: "Text Editor",
			type: "checkbox",
			label: "Enable Vim keybindings",
			description: "Enable Vim-style keybindings in the editor",
			defaultValue: defaultEditorSettings.vimMode,
			onChange: (value) => {
				updateEditorSetting("vimMode", value as boolean);
			},
		});
		
		for (const [settingId, settingInfo] of Object.entries(LATEX_SUITE_SETTINGS_EXPLANATIONS)) {
			let type: SettingType;
			let options = undefined;
			let codeMirrorOptions: SettingCodeMirrorOptions | undefined = undefined;
			let strictDefaultValue: boolean = false
			let onChange = (value: unknown) => {
				updateLatexSuiteSetting(settingId as keyof LatexSuitePluginSettingsRaw, value as LatexSuitePluginSettingsRaw[keyof LatexSuitePluginSettingsRaw]);
			};
			if (settingId === "snippets" || settingId === "snippetVariables") {
				type = "codemirror";
				codeMirrorOptions = {
					language: "javascript",
					height: 15,
					lineNumbers: true,
					resizable: true,
					theme: "auto",
				}
				onChange = async (value) => {
					try {
						if (settingId === "snippets") {
							await parseSnippets(value as string, DEFAULT_SETTINGS.snippetVariables);
						} else if (settingId === "snippetVariables") {
							await parseSnippetVariables(value as string);
						}
					} catch {
						return;
					}
					updateLatexSuiteSetting(settingId as keyof LatexSuitePluginSettingsRaw, value as LatexSuitePluginSettingsRaw[keyof LatexSuitePluginSettingsRaw]);
				}
				strictDefaultValue = true;
			}
			else if (settingInfo.type === "array") {
				type = "text";
			} else if (settingInfo.type === "boolean") {
				type = "checkbox";
			} else if (settingInfo.type === "string") {
				type = "text";
			} else if (Array.isArray(settingInfo.type)) {
				type = "select";
				options = [...settingInfo.type.map((val) => ({ label: val, value: val }))];
			}
			const setting: Setting = {
				id: `latex-suite-${settingId}`,
				category: "Plugins",
				subcategory: "LaTeX Suite",
				defaultValue: latexSuiteSettings[settingId as keyof LatexSuitePluginSettingsRaw],
				type,
				label: settingInfo.title,
				description: settingInfo.description,
				options: options,
				codeMirrorOptions,
				strictDefaultValue,
				onChange,
			};
			registerSetting(setting);
		}
	}, [registerSetting, getSetting, updateEditorSetting, applyCSSProperties]);

	const getFontSize = useCallback(() => {
		return fontSizeMap[editorSettings.fontSize];
	}, [editorSettings.fontSize]);

	const getFontFamily = useCallback(() => {
		return fontFamilyMap[editorSettings.fontFamily];
	}, [editorSettings.fontFamily]);

	const getLineNumbersEnabled = useCallback(
		() => editorSettings.showLineNumbers,
		[editorSettings.showLineNumbers],
	);

	const getSyntaxHighlightingEnabled = useCallback(
		() => editorSettings.syntaxHighlighting,
		[editorSettings.syntaxHighlighting],
	);

	const getAutoSaveEnabled = useCallback(
		() => editorSettings.autoSaveEnabled,
		[editorSettings.autoSaveEnabled],
	);

	const getAutoSaveDelay = useCallback(
		() => editorSettings.autoSaveDelay,
		[editorSettings.autoSaveDelay],
	);

	const getVimModeEnabled = useCallback(
		() => editorSettings.vimMode,
		[editorSettings.vimMode],
	);

	const getCollabOptions = useCallback((): CollabConnectOptions | null => {
		const signalingServersSetting = getSetting("collab-signaling-servers");
		const awarenessTimeoutSetting = getSetting("collab-awareness-timeout");
		const autoReconnectSetting = getSetting("collab-auto-reconnect");

		// Return null if settings are not yet available
		if (!signalingServersSetting || !awarenessTimeoutSetting || !autoReconnectSetting) {
			return null;
		}

		const signalingServers = signalingServersSetting.value as string;
		const awarenessTimeout = awarenessTimeoutSetting.value as number;
		const autoReconnect = autoReconnectSetting.value as boolean;

		const serversToUse = signalingServers.split(",").map((s) => s.trim());

		return {
			signalingServers: serversToUse,
			autoReconnect,
			awarenessTimeout: awarenessTimeout * 1000,
		};
	}, [getSetting]);

	const getEnabledLSPPlugins = useCallback((): string[] => {
		const allLSPPlugins = pluginRegistry.getAllLSPPlugins();
		return allLSPPlugins.filter(plugin => {
			const enabledSetting = getSetting(`${plugin.id}-enabled`);
			return (enabledSetting?.value as boolean) ?? false;
		}).map(plugin => plugin.id);
	}, [getSetting]);

	const contextValue = {
		editorSettings,
		updateEditorSetting,
		getFontSize,
		getFontFamily,
		getLineNumbersEnabled,
		getSyntaxHighlightingEnabled,
		getAutoSaveEnabled,
		getAutoSaveDelay,
		getVimModeEnabled,
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