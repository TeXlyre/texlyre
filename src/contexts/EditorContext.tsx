// src/contexts/EditorContext.tsx
import { t } from '@/i18n';
import type React from 'react';
import {
  type ReactNode,
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { pluginRegistry } from '../plugins/PluginRegistry';
import { useSettings } from '../hooks/useSettings';
import type {
  EditorSettings,
  FontFamily,
  FontSize,
} from '../types/editor';
import type { CollabConnectOptions, CollabProviderType } from '../types/collab';
import type { Setting } from '../contexts/SettingsContext';

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
  highlightTheme: 'auto',
  vimMode: false,
  spellCheck: true,
  mathLiveEnabled: true,
  mathLivePreviewMode: 'cursor', // hover-cursor, hover, cursor, never
  language: 'en',
};

interface EditorSettingDescriptor extends Setting {
  ref: keyof EditorSettings;
  onAfterChange?: (value: EditorSettings[keyof EditorSettings]) => void;
}

function getSettingDescriptors(): EditorSettingDescriptor[] {
  return [
    {
      id: 'editor-font-family',
      ref: 'fontFamily',
      category: t('Appearance'),
      subcategory: t('Text Editor'),
      type: 'select',
      label: t('Font family'),
      description: t('Select the font family for the editor'),
      defaultValue: defaultEditorSettings.fontFamily,
      options: [
        { label: t('Monospace (System)'), value: 'monospace' },
        { label: t('JetBrains Mono'), value: 'jetbrains-mono' },
        { label: t('Fira Code'), value: 'fira-code' },
        { label: t('Source Code Pro'), value: 'source-code-pro' },
        { label: t('Inconsolata'), value: 'inconsolata' },
        { label: t('Serif'), value: 'serif' },
        { label: t('Sans Serif'), value: 'sans-serif' },
      ],
      onAfterChange: (value) => {
        document.documentElement.style.setProperty(
          '--editor-font-family',
          fontFamilyMap[value as FontFamily]
        );
      },
    },
    {
      id: 'editor-font-size',
      ref: 'fontSize',
      category: t('Appearance'),
      subcategory: t('Text Editor'),
      type: 'select',
      label: t('Font size'),
      description: t('Select the font size for the editor'),
      defaultValue: defaultEditorSettings.fontSize,
      options: [
        { label: t('Extra Small (10px)'), value: 'xs' },
        { label: t('Small (12px)'), value: 'sm' },
        { label: t('Base (14px)'), value: 'base' },
        { label: t('Large (16px)'), value: 'lg' },
        { label: t('Extra Large (18px)'), value: 'xl' },
        { label: t('2X Large (20px)'), value: '2xl' },
        { label: t('3X Large (24px)'), value: '3xl' },
      ],
      onAfterChange: (value) => {
        document.documentElement.style.setProperty(
          '--editor-font-size',
          fontSizeMap[value as FontSize]
        );
      },
    },
    {
      id: 'editor-show-line-numbers',
      ref: 'showLineNumbers',
      category: t('Appearance'),
      subcategory: t('Text Editor'),
      type: 'checkbox',
      label: t('Show line numbers'),
      description: t('Show line numbers in the editor'),
      defaultValue: defaultEditorSettings.showLineNumbers,
    },
    {
      id: 'editor-syntax-highlighting',
      ref: 'syntaxHighlighting',
      category: t('Appearance'),
      subcategory: t('Text Editor'),
      type: 'checkbox',
      label: t('Show syntax highlighting'),
      description: t('Show syntax highlighting in the editor including tooltip and linting (LaTeX, Typst, BibTeX, and markdown)'),
      defaultValue: defaultEditorSettings.syntaxHighlighting,
    },
    {
      id: 'editor-theme-highlights',
      ref: 'highlightTheme',
      category: t('Appearance'),
      subcategory: t('Text Editor'),
      type: 'select',
      label: t('Syntax highlighting theme'),
      description: t('Choose the color theme for syntax highlighting'),
      defaultValue: defaultEditorSettings.highlightTheme,
      options: [
        { label: t('Auto (follows app theme)'), value: 'auto' },
        { label: t('Light theme'), value: 'light' },
        { label: t('Dark theme (OneDark)'), value: 'dark' },
      ],
    },
    {
      id: 'editor-auto-save-enable',
      ref: 'autoSaveEnabled',
      category: t('Viewers'),
      subcategory: t('Text Editor'),
      type: 'checkbox',
      label: t('Auto-save on changes'),
      description: t('Automatically save file changes while editing'),
      defaultValue: defaultEditorSettings.autoSaveEnabled,
    },
    {
      id: 'editor-auto-save-delay',
      ref: 'autoSaveDelay',
      category: t('Viewers'),
      subcategory: t('Text Editor'),
      type: 'number',
      label: t('Auto-save delay (milliseconds)'),
      description: t('Delay in milliseconds before saving changes'),
      defaultValue: defaultEditorSettings.autoSaveDelay,
      min: 50,
      max: 10000,
    },
    {
      id: 'editor-vim-mode',
      ref: 'vimMode',
      category: t('Viewers'),
      subcategory: t('Text Editor'),
      type: 'checkbox',
      label: t('Enable Vim keybindings'),
      description: t('Enable Vim-style keybindings in the editor'),
      defaultValue: defaultEditorSettings.vimMode,
    },
    {
      id: 'editor-spell-check',
      ref: 'spellCheck',
      category: t('Viewers'),
      subcategory: t('Text Editor'),
      type: 'checkbox',
      label: t('Enable spell checking'),
      description: t('Enable browser spell checking in the editor (note: not compatible with typesetter syntax)'),
      defaultValue: defaultEditorSettings.spellCheck,
    },
    {
      id: 'editor-mathlive-enabled',
      ref: 'mathLiveEnabled',
      category: t('Viewers'),
      subcategory: t('Text Editor'),
      type: 'checkbox',
      label: t('Enable MathLive'),
      description: t('Enable interactive math editing with MathLive'),
      defaultValue: defaultEditorSettings.mathLiveEnabled,
    },
    {
      id: 'editor-mathlive-preview-mode',
      ref: 'mathLivePreviewMode',
      category: t('Viewers'),
      subcategory: t('Text Editor'),
      type: 'select',
      label: t('MathLive preview mode'),
      description: t('When to show rendered math equations'),
      defaultValue: defaultEditorSettings.mathLivePreviewMode,
      options: [
        { label: t('On hover and cursor'), value: 'hover-cursor' },
        { label: t('On hover'), value: 'hover' },
        { label: t('On cursor'), value: 'cursor' },
        // { label: t('Never'), value: 'never' },
      ],
    },
  ];
}

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
  getCollabOptions: () => CollabConnectOptions;
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
  getCollabOptions: () => ({}),
  getEnabledLSPPlugins: () =>
    pluginRegistry.getLSPPlugins().map((plugin) => plugin.id),
  editorSettingsVersion: 0,
});

interface EditorProviderProps {
  children: ReactNode;
}

export const EditorProvider: React.FC<EditorProviderProps> = ({ children }) => {
  const { getSetting, batchGetSettings, registerSetting } = useSettings();
  const [editorSettings, setEditorSettings] =
    useState<EditorSettings>(defaultEditorSettings);
  const [editorSettingsVersion, setEditorSettingsVersion] = useState(0);
  const settingsRegisteredOnce = useRef(false);

  const updateEditorSetting = useCallback(
    <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => {
      setEditorSettings((prev) => ({ ...prev, [key]: value }));
      setEditorSettingsVersion((prev) => prev + 1);
    },
    []
  );

  useEffect(() => {
    if (settingsRegisteredOnce.current) return;
    settingsRegisteredOnce.current = true;

    const descriptors = getSettingDescriptors();
    const settingIds = descriptors.map((d) => d.id);
    const batchedSettings = batchGetSettings([...settingIds, 'language']);

    const initialLanguage = (batchedSettings['language'] as string) ?? 'en';
    updateEditorSetting('language', initialLanguage);

    for (const descriptor of descriptors) {
      const persisted = batchedSettings[descriptor.id];
      const initialValue = persisted ?? descriptor.defaultValue;

      const { ref, onAfterChange, ...baseSetting } = descriptor;

      registerSetting({
        ...baseSetting,
        defaultValue: initialValue,
        onChange: (value) => {
          updateEditorSetting(
            ref,
            value as EditorSettings[typeof ref]
          );
          onAfterChange?.(
            value as EditorSettings[keyof EditorSettings]
          );
        },
      });
    }
  }, [registerSetting, batchGetSettings]);

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