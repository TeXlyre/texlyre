import { t } from '@/i18n';
import type React from 'react';
import {
  type ReactNode,
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';

import { pluginRegistry } from '../plugins/PluginRegistry';
import { useSettings } from '../hooks/useSettings';
import type {
  EditorSettings,
  FontFamily,
  FontSize
} from '../types/editorSettings';
import {
  defaultEditorSettings,
  fontFamilyMap,
  fontSizeMap
} from '../types/editorSettings';
import type { CollabConnectOptions, CollabProviderType } from '../types/collab';

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
  editorSettingsVersion: 0
});

interface EditorProviderProps {
  children: ReactNode;
}

export const EditorProvider: React.FC<EditorProviderProps> = ({ children }) => {
  const { getSetting, batchGetSettings, registerSetting } = useSettings();
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

  useEffect(() => {
    if (settingsRegisteredOnce.current) return;
    settingsRegisteredOnce.current = true;

    const batchedSettings = batchGetSettings([
      'editor-font-size',
      'editor-font-family',
      'editor-show-line-numbers',
      'editor-syntax-highlighting',
      'editor-auto-save-enable',
      'editor-auto-save-delay',
      'editor-theme-highlights',
      'editor-vim-mode',
      'editor-spell-check',
      'editor-mathlive-enabled',
      'editor-mathlive-preview-mode'
    ]);

    const initialFontSize =
      (batchedSettings['editor-font-size'] as FontSize) ??
      defaultEditorSettings.fontSize;
    const initialFontFamily =
      (batchedSettings['editor-font-family'] as FontFamily) ??
      defaultEditorSettings.fontFamily;
    const initialShowLineNumbers =
      (batchedSettings['editor-show-line-numbers'] as boolean) ??
      defaultEditorSettings.showLineNumbers;
    const initialSyntaxHighlighting =
      (batchedSettings['editor-syntax-highlighting'] as boolean) ??
      defaultEditorSettings.syntaxHighlighting;
    const initialAutoSaveEnabled =
      (batchedSettings['editor-auto-save-enable'] as boolean) ??
      defaultEditorSettings.autoSaveEnabled;
    const initialAutoSaveDelay =
      (batchedSettings['editor-auto-save-delay'] as number) ??
      defaultEditorSettings.autoSaveDelay;
    const initialHighlightTheme =
      (batchedSettings['editor-theme-highlights'] as 'auto' | 'light' | 'dark') ??
      defaultEditorSettings.highlightTheme;
    const initialVimMode =
      (batchedSettings['editor-vim-mode'] as boolean) ??
      defaultEditorSettings.vimMode;
    const initialSpellCheck =
      (batchedSettings['editor-spell-check'] as boolean) ??
      defaultEditorSettings.spellCheck;
    const initialMathLiveEnabled =
      (batchedSettings['editor-mathlive-enabled'] as boolean) ??
      defaultEditorSettings.mathLiveEnabled;
    const initialMathLivePreviewMode =
      (batchedSettings['editor-mathlive-preview-mode'] as 'hover' | 'always' | 'never') ??
      defaultEditorSettings.mathLivePreviewMode;

    registerSetting({
      id: 'editor-font-family',
      category: t("Appearance"),
      subcategory: t("Text Editor"),
      type: 'select',
      label: t("Font family"),
      description: t("Select the font family for the editor"),
      defaultValue: initialFontFamily,
      options: [
        { label: t("Monospace (System)"), value: 'monospace' },
        { label: t("JetBrains Mono"), value: 'jetbrains-mono' },
        { label: t("Fira Code"), value: 'fira-code' },
        { label: t("Source Code Pro"), value: 'source-code-pro' },
        { label: t("Inconsolata"), value: 'inconsolata' },
        { label: t("Serif"), value: 'serif' },
        { label: t("Sans Serif"), value: 'sans-serif' }
      ],
      onChange: (value) => {
        const fontFamily = value as FontFamily;
        updateEditorSetting('fontFamily', fontFamily);
        // fabawi: The font family is set in the useEditorView directly now, but
        // keeping this for backward compatibility with CSS variables. 
        document.documentElement.style.setProperty(
          '--editor-font-family',
          fontFamilyMap[fontFamily]
        );
      }
    });

    registerSetting({
      id: 'editor-font-size',
      category: t("Appearance"),
      subcategory: t("Text Editor"),
      type: 'select',
      label: t("Font size"),
      description: t("Select the font size for the editor"),
      defaultValue: initialFontSize,
      options: [
        { label: t("Extra Small (10px)"), value: 'xs' },
        { label: t("Small (12px)"), value: 'sm' },
        { label: t("Base (14px)"), value: 'base' },
        { label: t("Large (16px)"), value: 'lg' },
        { label: t("Extra Large (18px)"), value: 'xl' },
        { label: t("2X Large (20px)"), value: '2xl' },
        { label: t("3X Large (24px)"), value: '3xl' }
      ],
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
      id: 'editor-show-line-numbers',
      category: t("Appearance"),
      subcategory: t("Text Editor"),
      type: 'checkbox',
      label: t("Show line numbers"),
      description: t("Show line numbers in the editor"),
      defaultValue: initialShowLineNumbers,
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
      defaultValue: initialSyntaxHighlighting,
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
      defaultValue: initialHighlightTheme,
      options: [
        { label: t("Auto (follows app theme)"), value: 'auto' },
        { label: t("Light theme"), value: 'light' },
        { label: t("Dark theme (OneDark)"), value: 'dark' }
      ],
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
      defaultValue: initialAutoSaveEnabled,
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
      defaultValue: initialAutoSaveDelay,
      min: 50,
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
      defaultValue: initialVimMode,
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
      defaultValue: initialSpellCheck,
      onChange: (value) => {
        updateEditorSetting('spellCheck', value as boolean);
      }
    });

    registerSetting({
      id: 'editor-mathlive-enabled',
      category: t("Viewers"),
      subcategory: t("Text Editor"),
      type: 'checkbox',
      label: t("Enable MathLive"),
      description: t("Enable interactive math editing with MathLive"),
      defaultValue: initialMathLiveEnabled,
      onChange: (value) => {
        updateEditorSetting('mathLiveEnabled', value as boolean);
      }
    });

    registerSetting({
      id: 'editor-mathlive-preview-mode',
      category: t("Viewers"),
      subcategory: t("Text Editor"),
      type: 'select',
      label: t("Math preview mode"),
      description: t("When to show rendered math equations"),
      defaultValue: initialMathLivePreviewMode,
      options: [
        { label: t("On hover"), value: 'hover' },
        { label: t("Always"), value: 'always' },
        { label: t("Never"), value: 'never' }
      ],
      onChange: (value) => {
        updateEditorSetting('mathLivePreviewMode', value as 'hover' | 'always' | 'never');
      }
    });
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

    const providerType = (providerTypeSetting?.value as CollabProviderType) ?? 'webrtc';
    const signalingServers = (signalingServersSetting?.value as string) ?? '';
    const websocketServer = (websocketServerSetting?.value as string) ?? '';
    const awarenessTimeout = awarenessTimeoutSetting.value as number;
    const autoReconnect = autoReconnectSetting.value as boolean;

    const serversToUse = signalingServers.length > 0
      ? signalingServers.split(',').map((s) => s.trim())
      : undefined;

    return {
      providerType,
      signalingServers: serversToUse,
      websocketServer,
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
    </EditorContext.Provider>
  );
};