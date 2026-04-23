// src/settings/registerTypstSettings.ts
import { t } from '@/i18n';
import { useEffect, useRef } from 'react';

import { useSettings } from '../hooks/useSettings';
import type { TypstOutputFormat } from '../types/typst';
import { typstService } from '../services/TypstService';

export function useRegisterTypstSettings() {
    const { registerSetting, getSetting } = useSettings();
    const settingsRegistered = useRef(false);

    useEffect(() => {
        if (settingsRegistered.current) return;
        settingsRegistered.current = true;

        const initialAutoCompile =
            getSetting('typst-auto-compile-on-open')?.value as boolean ?? false;
        const initialDefaultFormat =
            getSetting('typst-default-format')?.value as TypstOutputFormat ?? 'pdf';
        const initialAutoNavigate =
            getSetting('typst-auto-navigate-to-main')?.value as string ?? 'conditional';

        registerSetting({
            id: 'typst-auto-compile-on-open',
            category: t('Compilation'),
            subcategory: t('Typst'),
            type: 'checkbox',
            label: t('Auto-compile on project open'),
            description: t('Automatically compile Typst when opening a project'),
            defaultValue: initialAutoCompile
        });

        registerSetting({
            id: 'typst-auto-navigate-to-main',
            category: t('Compilation'),
            subcategory: t('Typst'),
            type: 'select',
            label: t('Auto-navigate to main file on compile'),
            description: t('Control when to automatically navigate to the main Typst file during compilation'),
            defaultValue: initialAutoNavigate,
            options: [
                { label: t('Only when no Typst file is open'), value: 'conditional' },
                { label: t('Always navigate to main file'), value: 'always' },
                { label: t('Never navigate to main file'), value: 'never' }]

        });

        registerSetting({
            id: 'typst-default-format',
            category: t('Compilation'),
            subcategory: t('Typst'),
            type: 'select',
            label: t('Default output format'),
            description: t('Default format for Typst compilation'),
            defaultValue: initialDefaultFormat,
            options: [
                { label: t('PDF'), value: 'pdf' },
                { label: t('Canvas (PDF)'), value: 'canvas-pdf' },
                { label: t('Canvas (SVG)'), value: 'canvas' }
            ]
        });

        registerSetting({
            id: 'typst-notifications',
            category: t('Compilation'),
            subcategory: t('Typst'),
            type: 'checkbox',
            label: t('Show compilation notifications'),
            description: t('Display notifications for Typst compilation activities'),
            defaultValue: true
        });

        typstService.setDefaultFormat(initialDefaultFormat);
    }, [registerSetting, getSetting]);
}