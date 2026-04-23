// src/settings/registerContentFormatterSettings.ts
import { t } from '@/i18n';
import { useEffect, useRef } from 'react';
import { useSettings } from '../hooks/useSettings';

export function useRegisterContentFormatterSettings() {
    const { registerSetting, getSetting } = useSettings();
    const registered = useRef(false);

    useEffect(() => {
        if (registered.current) return;
        registered.current = true;

        const initialLatexNotifications =
            getSetting('formatter-latex-notifications')?.value as boolean ?? true;
        const initialTypstNotifications =
            getSetting('formatter-typst-notifications')?.value as boolean ?? true;

        registerSetting({
            id: 'formatter-latex-notifications',
            category: t('Viewers'),
            subcategory: t('Text Editor'),
            type: 'checkbox',
            label: t('Show LaTeX formatting notifications'),
            description: t('Display notifications for LaTeX content formatting activities'),
            defaultValue: initialLatexNotifications
        });

        registerSetting({
            id: 'formatter-typst-notifications',
            category: t('Viewers'),
            subcategory: t('Text Editor'),
            type: 'checkbox',
            label: t('Show Typst formatting notifications'),
            description: t('Display notifications for Typst content formatting activities'),
            defaultValue: initialTypstNotifications
        });
    }, [registerSetting, getSetting]);
}