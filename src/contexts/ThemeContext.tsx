// src/contexts/ThemeContext.tsx
import type React from 'react';
import {
  type ReactNode,
  createContext,
  useCallback,
  useEffect,
  useMemo,
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
  isCurrentVariantDark: boolean;
}

export const ThemeContext = createContext<ThemeContextType>({
  currentThemePlugin: null,
  currentVariant: 'dark',
  currentLayout: null,
  setTheme: () => { },
  setVariant: () => { },
  availableThemes: [],
  isCurrentVariantDark: true
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
  const [availableThemes, setAvailableThemes] = useState<ThemePlugin[]>([]);
  const { getSetting, updateSetting } = useSettings();

  useEffect(() => {
    const themes = pluginRegistry.getThemes();
    setAvailableThemes(themes);
  }, []);

  const currentThemeId =
    (getSetting('theme-plugin')?.value as string) || defaultThemeId;

  const currentVariant =
    (getSetting('theme-variant')?.value as string) || defaultVariant;

  const currentThemePlugin = useMemo(() => {
    if (availableThemes.length === 0) return null;
    return (
      availableThemes.find((theme) => theme.id === currentThemeId) ||
      availableThemes[0] ||
      null
    );
  }, [availableThemes, currentThemeId]);

  const currentLayout = useMemo(() => {
    return currentThemePlugin?.getLayout() || null;
  }, [currentThemePlugin]);

  useEffect(() => {
    if (!currentThemePlugin) return;

    document.documentElement.removeAttribute('data-layout');
    currentThemePlugin.applyTheme(currentVariant);
    currentThemePlugin.applyLayout();
  }, [currentThemePlugin, currentVariant]);

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

  const setTheme = useCallback(
    (pluginId: string) => {
      updateSetting('theme-plugin', pluginId);
    },
    [updateSetting]
  );

  const setVariant = useCallback(
    (variantId: string) => {
      updateSetting('theme-variant', variantId);
    },
    [updateSetting]
  );

  const isCurrentVariantDark = useMemo(() => {
    if (!currentThemePlugin) return false;

    if (currentVariant === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    const variant = currentThemePlugin.getThemeVariants().find(v => v.id === currentVariant);
    return variant?.isDark ?? false;
  }, [currentThemePlugin, currentVariant]);

  return (
    <ThemeContext.Provider
      value={{
        currentThemePlugin,
        currentVariant,
        currentLayout,
        setTheme,
        setVariant,
        availableThemes,
        isCurrentVariantDark
      }}>

      {children}
    </ThemeContext.Provider>);

};