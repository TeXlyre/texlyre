// src/contexts/ThemeContext.tsx
import { t } from '@/i18n';
import type React from 'react';
import {
  type ReactNode,
  createContext,
  useCallback,
  useEffect,
  useRef,
  useState
} from
  'react';

import { useSettings } from '../hooks/useSettings';
import type { ThemeLayout, ThemePlugin } from '../plugins/PluginInterface';
import { pluginRegistry } from '../plugins/PluginRegistry';

interface ThemeContextType {
  currentThemePlugin: ThemePlugin | null;
  currentVariant: string;
  currentLayout: ThemeLayout | null;
  setTheme: (pluginId: string) => void;
  setVariant: (variantId: string) => void;
  availableThemes: ThemePlugin[];
}

export const ThemeContext = createContext<ThemeContextType>({
  currentThemePlugin: null,
  currentVariant: 'dark',
  currentLayout: null,
  setTheme: () => { },
  setVariant: () => { },
  availableThemes: []
});

interface ThemeProviderProps {
  children: ReactNode;
  defaultThemeId?: string;
  defaultVariant?: string;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  defaultThemeId = 'texlyre-theme',
  defaultVariant = 'dark'
}) => {
  const [currentThemePlugin, setCurrentThemePlugin] =
    useState<ThemePlugin | null>(null);
  const [currentVariant, setCurrentVariant] = useState<string>(defaultVariant);
  const [currentLayout, setCurrentLayout] = useState<ThemeLayout | null>(null);
  const [availableThemes, setAvailableThemes] = useState<ThemePlugin[]>([]);
  const { registerSetting, getSetting } = useSettings();

  const settingsRegisteredOnce = useRef(false);
  // Ref to store the last registered variant options to prevent infinite loop
  const lastRegisteredVariantOptions = useRef<string | null>(null);
  const currentVariantRef = useRef(defaultVariant);

  const setVariant = useCallback(
    (variantId: string) => {
      if (currentThemePlugin) {
        currentThemePlugin.applyTheme(variantId);
        setCurrentVariant(variantId);
        currentVariantRef.current = variantId;
      }
    },
    [currentThemePlugin]
  ); // Dependency ensures it captures the latest theme plugin

  const setTheme = useCallback(
    (pluginId: string) => {
      const plugin = availableThemes.find((theme) => theme.id === pluginId);
      if (plugin) {
        if (currentThemePlugin) {
          document.documentElement.removeAttribute('data-layout');
        }
        setCurrentThemePlugin(plugin);
        // Apply the new theme using the *current* variant from the ref.
        plugin.applyTheme(currentVariantRef.current);
        plugin.applyLayout();
        setCurrentLayout(plugin.getLayout());
      }
    },
    [availableThemes, currentThemePlugin, setVariant]
  );

  // Effect to keep currentVariantRef updated with currentVariant state
  useEffect(() => {
    currentVariantRef.current = currentVariant;
  }, [currentVariant]);

  // Initialize available themes once
  useEffect(() => {
    const themes = pluginRegistry.getThemes();
    setAvailableThemes(themes);
  }, []);

  // Effect to handle initial theme loading and initial theme-plugin setting registration
  useEffect(() => {
    if (settingsRegisteredOnce.current || availableThemes.length === 0) {
      return;
    }

    // Get initial values from the settings system or defaults
    const initialThemeId =
      getSetting('theme-plugin')?.value as string || defaultThemeId;
    const initialVariantId =
      getSetting('theme-variant')?.value as string || defaultVariant;

    const initialThemePlugin =
      availableThemes.find((theme) => theme.id === initialThemeId) ||
      availableThemes[0];

    if (initialThemePlugin) {
      setCurrentThemePlugin(initialThemePlugin);
      setCurrentVariant(initialVariantId);
      currentVariantRef.current = initialVariantId; // Initialize ref
      initialThemePlugin.applyTheme(initialVariantId);
      initialThemePlugin.applyLayout();
      setCurrentLayout(initialThemePlugin.getLayout());
    }

    // Register theme plugin setting (only once initially)
    registerSetting({
      id: 'theme-plugin',
      category: t("Appearance"),
      subcategory: t("Theme"),
      type: 'select',
      label: t("Layout"),
      description: t("Select the theme layout to use for TeXlyre"),
      defaultValue: initialThemePlugin?.id || defaultThemeId,
      options: availableThemes.map((theme) => ({
        label: t(theme.name),
        value: theme.id
      })),
      onChange: (value) => {
        setTheme(value as string);
      }
    });

    // Mark initial settings as registered
    settingsRegisteredOnce.current = true;
  }, [
    availableThemes,
    defaultThemeId,
    defaultVariant,
    getSetting,
    registerSetting,
    setTheme,
    setVariant]
  );

  // New useEffect: Register/Update theme-variant setting whenever currentThemePlugin changes
  useEffect(() => {
    // Ensure we have a theme plugin to get variants from
    if (!currentThemePlugin) {
      return;
    }

    const variants = currentThemePlugin.getThemeVariants() || [];
    const variantOptions = variants.map((variant) => ({
      label: variant.name,
      value: variant.id
    }));

    const defaultVariantForCurrentTheme =
      variants.find((v) => v.id === currentVariantRef.current)?.id ||
      variantOptions[0]?.value ||
      '';

    // Check if options have actually changed to avoid unnecessary re-registrations
    const serializedVariantOptions = JSON.stringify(variantOptions);
    if (lastRegisteredVariantOptions.current === serializedVariantOptions) {
      const currentSetting = getSetting('theme-variant');
      if (
        currentSetting &&
        currentSetting.defaultValue === defaultVariantForCurrentTheme) {
        return;
      }
    }
    lastRegisteredVariantOptions.current = serializedVariantOptions; // Update ref

    registerSetting({
      id: 'theme-variant',
      category: t("Appearance"),
      subcategory: t("Theme"),
      type: 'select',
      label: t("Variant"),
      description: t("Select the theme variant (color palette)"),
      // Ensure the default value is one of the new options
      defaultValue: defaultVariantForCurrentTheme,
      options: variantOptions,
      onChange: (value) => {
        setVariant(value as string);
      }
    });
  }, [currentThemePlugin, registerSetting, setVariant, getSetting]); // currentVariant is NOT a dependency here

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (currentThemePlugin && currentVariant === 'system') {
        currentThemePlugin.applyTheme('system');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [currentThemePlugin, currentVariant]);

  return (
    <ThemeContext.Provider
      value={{
        currentThemePlugin,
        currentVariant,
        currentLayout,
        setTheme,
        setVariant,
        availableThemes
      }}>

      {children}
    </ThemeContext.Provider>);

};