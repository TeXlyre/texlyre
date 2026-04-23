// src/settings/registerThemeSettings.ts
import { t } from '@/i18n';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useSettings } from '../hooks/useSettings';
import { pluginRegistry } from '../plugins/PluginRegistry';

export function useRegisterThemeSettings(
    defaultThemeId = 'texlyre-theme',
    defaultVariant = 'dark'
) {
    const { registerSetting, getSetting } = useSettings();
    const settingsRegisteredOnce = useRef(false);
    const [languageVersion, setLanguageVersion] = useState(0);

    useEffect(() => {
        const handleLanguageChange = () => {
            setLanguageVersion((prev) => prev + 1);
        };

        window.addEventListener('language-changed', handleLanguageChange);
        return () => {
            window.removeEventListener('language-changed', handleLanguageChange);
        };
    }, []);

    const availableThemes = useMemo(() => {
        return pluginRegistry.getThemes();
    }, [languageVersion]);

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

    useEffect(() => {
        if (availableThemes.length === 0) {
            return;
        }

        registerSetting({
            id: 'theme-plugin',
            category: t('Appearance'),
            subcategory: t('Theme'),
            type: 'select',
            label: t('Layout'),
            description: t('Select the theme layout to use for TeXlyre'),
            defaultValue: currentThemePlugin?.id || defaultThemeId,
            options: availableThemes.map((theme) => ({
                label: t(theme.name),
                value: theme.id
            })),
        });

        settingsRegisteredOnce.current = true;
    }, [availableThemes, currentThemePlugin, defaultThemeId, registerSetting, languageVersion]);

    useEffect(() => {
        if (!currentThemePlugin) {
            return;
        }

        const variants = currentThemePlugin.getThemeVariants() || [];
        const variantOptions = variants.map((variant) => ({
            label: variant.name,
            value: variant.id
        }));

        const defaultVariantForCurrentTheme =
            variants.find((v) => v.id === currentVariant)?.id ||
            variantOptions[0]?.value ||
            '';

        registerSetting({
            id: 'theme-variant',
            category: t('Appearance'),
            subcategory: t('Theme'),
            type: 'select',
            label: t('Variant'),
            description: t('Select the theme variant (color palette)'),
            defaultValue: defaultVariantForCurrentTheme,
            options: variantOptions,
        });
    }, [currentThemePlugin, currentVariant, registerSetting, languageVersion]);
}