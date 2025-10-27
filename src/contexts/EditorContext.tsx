// src/contexts/EditorContext.tsx
import { t } from "@/i18n";
import type React from 'react';
import {
  type ReactNode,
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState } from
'react';

import { pluginRegistry } from '../plugins/PluginRegistry';
import { useSettings } from '../hooks/useSettings';
import type {
  EditorSettings,
  FontFamily,
  FontSize } from
'../types/editorSettings';
import {
  defaultEditorSettings,
  fontFamilyMap,
  fontSizeMap } from
'../types/editorSettings';
import type { CollabConnectOptions } from '../types/collab';

interface EditorContextType {
  editorSettings: EditorSettings;
  updateEditorSetting: <K extends keyof EditorSettings>(
  key: K,
  value: EditorSettings[K])
  => void;
  getFontSize: () => string;
  getFontFamily: () => string;
  getLineNumbersEnabled: () => boolean;
  getSyntaxHighlightingEnabled: () => boolean;
  getAutoSaveEnabled: () => boolean;
  getAutoSaveDelay: () => number;
  getVimModeEnabled: () => boolean;
  getSpellCheckEnabled: () => boolean;
  getCollabOptions: () => CollabConnectOptions;
  getEnabledLSPPlugins: () => string[];
  editorSettingsVersion: number;
}

export const EditorContext = createContext<EditorContextType>({
  editorSettings: defaultEditorSettings,
  updateEditorSetting: () => {},
  getFontSize: () => '14px',
  getFontFamily: () => fontFamilyMap.monospace,
  getLineNumbersEnabled: () => true,
  getSyntaxHighlightingEnabled: () => true,
  getAutoSaveEnabled: () => false,
  getAutoSaveDelay: () => 2000,
  getVimModeEnabled: () => false,
  getSpellCheckEnabled: () => true,
  getCollabOptions: () => ({}),
  getEnabledLSPPlugins: () =>
  pluginRegistry.getLSPPlugins().map((plugin) => plugin.id),
  editorSettingsVersion: 0
});

interface EditorProviderProps {
  children: ReactNode;
}

export const EditorProvider: React.FC<EditorProviderProps> = ({ children }) => {
  const { getSetting, registerSetting } = useSettings();
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(
    defaultEditorSettings
  );
  const [editorSettingsVersion, setEditorSettingsVersion] = useState(0);
  const settingsRegisteredOnce = useRef(false);

  const updateEditorSetting = useCallback(
    <K extends keyof EditorSettings,>(key: K, value: EditorSettings[K]) => {
      setEditorSettings((prev) => ({ ...prev, [key]: value }));
      setEditorSettingsVersion((prev) => prev + 1);
    },
    []
  );

  const applyCSSProperties = useCallback((settings: EditorSettings) => {
    document.documentElement.style.setProperty(
      '--editor-font-size',
      fontSizeMap[settings.fontSize]
    );
    document.documentElement.style.setProperty(
      '--editor-font-family',
      fontFamilyMap[settings.fontFamily]
    );
  }, []);

  useEffect(() => {
    if (settingsRegisteredOnce.current) return;
    settingsRegisteredOnce.current = true;

    const initialFontSize =
    getSetting('editor-font-size')?.value as FontSize ??
    defaultEditorSettings.fontSize;
    const initialFontFamily =
    getSetting('editor-font-family')?.value as FontFamily ??
    defaultEditorSettings.fontFamily;
    const initialShowLineNumbers =
    getSetting('editor-show-line-numbers')?.value as boolean ??
    defaultEditorSettings.showLineNumbers;
    const initialSyntaxHighlighting =
    getSetting('editor-syntax-highlighting')?.value as boolean ??
    defaultEditorSettings.syntaxHighlighting;
    const initialAutoSaveEnabled =
    getSetting('editor-auto-save-enable')?.value as boolean ??
    defaultEditorSettings.autoSaveEnabled;
    const initialAutoSaveDelay =
    getSetting('editor-auto-save-delay')?.value as number ??
    defaultEditorSettings.autoSaveDelay;
    const initialHighlightTheme =
    getSetting('editor-theme-highlights')?.value as
    'auto' |
    'light' |
    'dark' ?? defaultEditorSettings.highlightTheme;
    const initialVimMode =
    getSetting('editor-vim-mode')?.value as boolean ??
    defaultEditorSettings.vimMode;
    const initialSpellCheck =
    getSetting('editor-spell-check')?.value as boolean ??
    defaultEditorSettings.spellCheck;


    const loadedSettings = {
      fontSize: initialFontSize,
      fontFamily: initialFontFamily,
      showLineNumbers: initialShowLineNumbers,
      syntaxHighlighting: initialSyntaxHighlighting,
      autoSaveEnabled: initialAutoSaveEnabled,
      autoSaveDelay: initialAutoSaveDelay,
      highlightTheme: initialHighlightTheme,
      vimMode: initialVimMode,
      spellCheck: initialSpellCheck
    };

    setEditorSettings(loadedSettings);
    setEditorSettingsVersion((prev) => prev + 1);
    applyCSSProperties(loadedSettings);

    registerSetting({
      id: 'editor-font-size',
      category: t("Appearance"),
      subcategory: t("Text Editor"),
      type: 'select',
      label: t("Font size"),
      description: t("Select the font size for the editor"),
      defaultValue: defaultEditorSettings.fontSize,
      options: [
      { label: t("Extra Small (10px)"), value: 'xs' },
      { label: t("Small (12px)"), value: 'sm' },
      { label: t("Base (14px)"), value: 'base' },
      { label: t("Large (16px)"), value: 'lg' },
      { label: t("Extra Large (18px)"), value: 'xl' },
      { label: t("2X Large (20px)"), value: '2xl' },
      { label: t("3X Large (24px)"), value: '3xl' }],

      onChange: (value) => {
        const fontSize = value as FontSize;
        updateEditorSetting('fontSize', fontSize);
        document.documentElement.style.setProperty(
          '--editor-font-size',
          fontSizeMap[fontSize]
        );
      }
    });

    registerSetting({
      id: 'editor-font-family',
      category: t("Appearance"),
      subcategory: t("Text Editor"),
      type: 'select',
      label: t("Font family"),
      description: t("Select the font family for the editor"),
      defaultValue: defaultEditorSettings.fontFamily,
      options: [
      { label: t("Monospace (System)"), value: 'monospace' },
      { label: t("JetBrains Mono"), value: 'jetbrains-mono' },
      { label: t("Fira Code"), value: 'fira-code' },
      { label: t("Source Code Pro"), value: 'source-code-pro' },
      { label: t("Inconsolata"), value: 'inconsolata' },
      { label: t("Serif"), value: 'serif' },
      { label: t("Sans Serif"), value: 'sans-serif' }],

      onChange: (value) => {
        const fontFamily = value as FontFamily;
        updateEditorSetting('fontFamily', fontFamily);
        document.documentElement.style.setProperty(
          '--editor-font-family',
          fontFamilyMap[fontFamily]
        );
      }
    });

    registerSetting({
      id: 'editor-show-line-numbers',
      category: t("Appearance"),
      subcategory: t("Text Editor"),
      type: 'checkbox',
      label: t("Show line numbers"),
      description: t("Show line numbers in the editor"),
      defaultValue: defaultEditorSettings.showLineNumbers,
      onChange: (value) => {
        updateEditorSetting('showLineNumbers', value as boolean);
      }
    });

    registerSetting({
      id: 'editor-syntax-highlighting',
      category: t("Appearance"),
      subcategory: t("Text Editor"),
      type: 'checkbox',
      label: t("Show syntax highlighting"),
      description: t("Show syntax highlighting in the editor including tooltip and linting (LaTeX, Typst, BibTeX, and markdown)"),

      defaultValue: defaultEditorSettings.syntaxHighlighting,
      onChange: (value) => {
        updateEditorSetting('syntaxHighlighting', value as boolean);
      }
    });

    registerSetting({
      id: 'editor-theme-highlights',
      category: t("Appearance"),
      subcategory: t("Text Editor"),
      type: 'select',
      label: t("Syntax highlighting theme"),
      description: t("Choose the color theme for syntax highlighting"),
      defaultValue: defaultEditorSettings.highlightTheme,
      options: [
      { label: t("Auto (follows app theme)"), value: 'auto' },
      { label: t("Light theme"), value: 'light' },
      { label: t("Dark theme (OneDark)"), value: 'dark' }],

      onChange: (value) => {
        updateEditorSetting(
          'highlightTheme',
          value as 'auto' | 'light' | 'dark'
        );
      }
    });

    registerSetting({
      id: 'editor-auto-save-enable',
      category: t("Viewers"),
      subcategory: t("Text Editor"),
      type: 'checkbox',
      label: t("Auto-save on changes"),
      description: t("Automatically save file changes while editing"),
      defaultValue: defaultEditorSettings.autoSaveEnabled,
      onChange: (value) => {
        updateEditorSetting('autoSaveEnabled', value as boolean);
      }
    });

    registerSetting({
      id: 'editor-auto-save-delay',
      category: t("Viewers"),
      subcategory: t("Text Editor"),
      type: 'number',
      label: t("Auto-save delay (milliseconds)"),
      description: t("Delay in milliseconds before saving changes"),
      defaultValue: defaultEditorSettings.autoSaveDelay,
      min: 500,
      max: 10000,
      onChange: (value) => {
        updateEditorSetting('autoSaveDelay', value as number);
      }
    });

    registerSetting({
      id: 'editor-vim-mode',
      category: t("Viewers"),
      subcategory: t("Text Editor"),
      type: 'checkbox',
      label: t("Enable Vim keybindings"),
      description: t("Enable Vim-style keybindings in the editor"),
      defaultValue: defaultEditorSettings.vimMode,
      onChange: (value) => {
        updateEditorSetting('vimMode', value as boolean);
      }
    });

    registerSetting({
      id: 'editor-spell-check',
      category: t("Viewers"),
      subcategory: t("Text Editor"),
      type: 'checkbox',
      label: t("Enable spell checking"),
      description: t("Enable browser spell checking in the editor (note: not compatible with typesetter syntax)"),
      defaultValue: defaultEditorSettings.spellCheck,
      onChange: (value) => {
        updateEditorSetting('spellCheck', value as boolean);
      }
    });
  }, [registerSetting, getSetting, updateEditorSetting, applyCSSProperties]);

  const getFontSize = useCallback(() => {
    return fontSizeMap[editorSettings.fontSize];
  }, [editorSettings.fontSize]);

  const getFontFamily = useCallback(() => {
    return fontFamilyMap[editorSettings.fontFamily];
  }, [editorSettings.fontFamily]);

  const getLineNumbersEnabled = useCallback(
    () => editorSettings.showLineNumbers,
    [editorSettings.showLineNumbers]
  );

  const getSyntaxHighlightingEnabled = useCallback(
    () => editorSettings.syntaxHighlighting,
    [editorSettings.syntaxHighlighting]
  );

  const getAutoSaveEnabled = useCallback(
    () => editorSettings.autoSaveEnabled,
    [editorSettings.autoSaveEnabled]
  );

  const getAutoSaveDelay = useCallback(
    () => editorSettings.autoSaveDelay,
    [editorSettings.autoSaveDelay]
  );

  const getVimModeEnabled = useCallback(
    () => editorSettings.vimMode,
    [editorSettings.vimMode]
  );

  const getSpellCheckEnabled = useCallback(
    () => editorSettings.spellCheck,
    [editorSettings.spellCheck]
  );

  const getCollabOptions = useCallback((): CollabConnectOptions | null => {
    const signalingServersSetting = getSetting('collab-signaling-servers');
    const awarenessTimeoutSetting = getSetting('collab-awareness-timeout');
    const autoReconnectSetting = getSetting('collab-auto-reconnect');

    // Return null if settings are not yet available
    if (!signalingServersSetting || !awarenessTimeoutSetting || !autoReconnectSetting) {
      return null;
    }

    const signalingServers = signalingServersSetting.value as string;
    const awarenessTimeout = awarenessTimeoutSetting.value as number;
    const autoReconnect = autoReconnectSetting.value as boolean;

    const serversToUse = signalingServers.split(',').map((s) => s.trim());

    return {
      signalingServers: serversToUse,
      autoReconnect,
      awarenessTimeout: awarenessTimeout * 1000
    };
  }, [getSetting]);

  const getEnabledLSPPlugins = useCallback((): string[] => {
    const allLSPPlugins = pluginRegistry.getAllLSPPlugins();
    return allLSPPlugins.filter((plugin) => {
      const enabledSetting = getSetting(`${plugin.id}-enabled`);
      return enabledSetting?.value as boolean ?? false;
    }).map((plugin) => plugin.id);
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
    getSpellCheckEnabled,
    getCollabOptions,
    getEnabledLSPPlugins,
    editorSettingsVersion
  };

  return (
    <EditorContext.Provider value={contextValue}>
			{children}
		</EditorContext.Provider>);

};