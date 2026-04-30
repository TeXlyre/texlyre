// src/contexts/EditorContext.tsx
import type React from 'react';
import {
  type ReactNode,
  createContext,
  useCallback,
  useMemo,
} from 'react';

import { pluginRegistry } from '../plugins/PluginRegistry';
import { useSettings } from '../hooks/useSettings';
import type {
  EditorSettings,
  FontFamily,
  FontSize,
  HighlightTheme,
} from '../types/editor';
import type { CollabConnectOptions, CollabProviderType } from '../types/collab';

export const fontSizeMap: Record<FontSize, string> = {
  xs: '10px',
  sm: '12px',
  base: '14px',
  lg: '16px',
  xl: '18px',
  '2xl': '20px',
  '3xl': '24px',
};

export const fontFamilyMap: Record<FontFamily, string> = {
  monospace:
    "ui-monospace, 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', 'Noto Sans Mono', 'Droid Sans Mono', 'Consolas', monospace",
  serif: "ui-serif, 'Times New Roman', 'Times', serif",
  'sans-serif':
    "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif",
  'jetbrains-mono':
    "'JetBrains Mono', ui-monospace, 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
  'fira-code':
    "'Fira Code', ui-monospace, 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
  'source-code-pro':
    "'Source Code Pro', ui-monospace, 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace",
  inconsolata:
    "'Inconsolata', ui-monospace, 'SF Mono', 'Monaco', 'Roboto Mono', monospace",
};

export const defaultEditorSettings: EditorSettings = {
  fontSize: 'lg',
  fontFamily: 'monospace',
  showLineNumbers: true,
  syntaxHighlighting: true,
  autoSaveEnabled: false,
  autoSaveDelay: 150,
  highlightTheme: 'auto' as HighlightTheme,
  vimMode: false,
  spellCheck: true,
  mathLiveEnabled: true,
  mathLivePreviewMode: 'cursor',
  language: 'en',
};

interface EditorContextType {
  editorSettings: EditorSettings;
  updateEditorSetting: <K extends keyof EditorSettings>(
    key: K,
    value: EditorSettings[K]
  ) => void;
  getLineNumbersEnabled: () => boolean;
  getSyntaxHighlightingEnabled: () => boolean;
  getAutoSaveEnabled: () => boolean;
  getAutoSaveDelay: () => number;
  getVimModeEnabled: () => boolean;
  getSpellCheckEnabled: () => boolean;
  getCollabOptions: () => CollabConnectOptions | null;
  getEnabledLSPPlugins: () => string[];
  editorSettingsVersion: number;
}

export const EditorContext = createContext<EditorContextType>({
  editorSettings: defaultEditorSettings,
  updateEditorSetting: () => { },
  getLineNumbersEnabled: () => true,
  getSyntaxHighlightingEnabled: () => true,
  getAutoSaveEnabled: () => false,
  getAutoSaveDelay: () => 2000,
  getVimModeEnabled: () => false,
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
      fontSize:
        (getSetting('editor-font-size')?.value as FontSize) ??
        defaultEditorSettings.fontSize,
      showLineNumbers:
        (getSetting('editor-show-line-numbers')?.value as boolean) ??
        defaultEditorSettings.showLineNumbers,
      syntaxHighlighting:
        (getSetting('editor-syntax-highlighting')?.value as boolean) ??
        defaultEditorSettings.syntaxHighlighting,
      autoSaveEnabled:
        (getSetting('editor-auto-save-enable')?.value as boolean) ??
        defaultEditorSettings.autoSaveEnabled,
      autoSaveDelay:
        (getSetting('editor-auto-save-delay')?.value as number) ??
        defaultEditorSettings.autoSaveDelay,
      highlightTheme:
        (getSetting('editor-theme-highlights')?.value as HighlightTheme) ??
        defaultEditorSettings.highlightTheme,
      vimMode:
        (getSetting('editor-vim-mode')?.value as boolean) ??
        defaultEditorSettings.vimMode,
      spellCheck:
        (getSetting('editor-spell-check')?.value as boolean) ??
        defaultEditorSettings.spellCheck,
      mathLiveEnabled:
        (getSetting('editor-mathlive-enabled')?.value as boolean) ??
        defaultEditorSettings.mathLiveEnabled,
      mathLivePreviewMode:
        (getSetting('editor-mathlive-preview-mode')?.value as EditorSettings['mathLivePreviewMode']) ??
        defaultEditorSettings.mathLivePreviewMode,
      language:
        (getSetting('language')?.value as string) ??
        defaultEditorSettings.language,
    };
  }, [getSetting]);

  const updateEditorSetting = useCallback(
    <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => {
      const settingIdMap: Partial<Record<keyof EditorSettings, string>> = {
        fontFamily: 'editor-font-family',
        fontSize: 'editor-font-size',
        showLineNumbers: 'editor-show-line-numbers',
        syntaxHighlighting: 'editor-syntax-highlighting',
        autoSaveEnabled: 'editor-auto-save-enable',
        autoSaveDelay: 'editor-auto-save-delay',
        highlightTheme: 'editor-theme-highlights',
        vimMode: 'editor-vim-mode',
        spellCheck: 'editor-spell-check',
        mathLiveEnabled: 'editor-mathlive-enabled',
        mathLivePreviewMode: 'editor-mathlive-preview-mode',
        language: 'language',
      };

      const settingId = settingIdMap[key];
      if (settingId) {
        updateSetting(settingId, value);
      }
    },
    [updateSetting]
  );

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
    const signalingServers =
      (signalingServersSetting?.value as string) ?? '';
    const websocketServer =
      (websocketServerSetting?.value as string) ?? '';
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
        const enabledSetting = getSetting(`${plugin.id}-enabled`);
        return (enabledSetting?.value as boolean) ?? false;
      })
      .map((plugin) => plugin.id);
  }, [getSetting]);

  const editorSettingsSignature = JSON.stringify(editorSettings);

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
    getAutoSaveEnabled,
    getAutoSaveDelay,
    getVimModeEnabled,
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