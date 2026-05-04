// src/settings/registerLatexSettings.ts
import { t } from '@/i18n';
import { useEffect, useRef } from 'react';

import { useSettings } from '../hooks/useSettings';
import { BUSYTEX_BUNDLE_LABELS } from '../extensions/texlyre-busytex/BusyTeXService';
import type { LaTeXOutputFormat, LaTeXEngine } from '../types/latex';

export function useRegisterLatexSettings() {
    const { registerSetting, getSetting } = useSettings();
    const settingsRegistered = useRef(false);

    useEffect(() => {
        if (settingsRegistered.current) return;
        settingsRegistered.current = true;

        const initialEngine =
            getSetting('latex-engine')?.value as LaTeXEngine ?? 'pdftex';
        const initialTexliveEndpoint =
            getSetting('latex-texlive-endpoint')?.value as string ?? 'http://texlive.localhost:8082';
        const initialStoreCache =
            getSetting('latex-store-cache')?.value as boolean ?? true;
        const initialStoreWorkingDirectory =
            getSetting('latex-store-working-directory')?.value as boolean ?? false;
        const initialSourceMap =
            getSetting('latex-sourcemap-enabled')?.value as boolean ?? true;
        const initialAutoCompile =
            getSetting('latex-auto-compile-on-open')?.value as boolean ?? false;
        const initialDefaultFormat =
            getSetting('latex-default-format')?.value as LaTeXOutputFormat ?? 'pdf';
        const initialAutoNavigate =
            getSetting('latex-auto-navigate-to-main')?.value as string ?? 'conditional';
        const initialBusyTeXEndpoint =
            getSetting('latex-busytex-endpoint')?.value as string ?? 'http://texlive2026.localhost:8082';
        const initialBusyTeXBundles =
            getSetting('latex-busytex-bundles')?.value as string ?? 'recommended';
        const initialNotifications =
            getSetting('latex-notifications')?.value as boolean ?? true;

        registerSetting({
            id: 'latex-engine',
            category: t('Compilation'),
            subcategory: t('LaTeX'),
            type: 'select',
            label: t('LaTeX Engine'),
            description: t('Choose the LaTeX engine for compilation'),
            defaultValue: initialEngine,
            options: [
                { label: t('pdfTeX (SwiftLaTeX / TeX Live 2020)'), value: 'pdftex' },
                { label: t('XeTeX (SwiftLaTeX / TeX Live 2020)'), value: 'xetex' },
                { label: t('pdfTeX (BusyTeX / TeX Live 2026)'), value: 'busytex-pdftex' },
                { label: t('XeTeX (BusyTeX / TeX Live 2026)'), value: 'busytex-xetex' },
                { label: t('LuaTeX (BusyTeX / TeX Live 2026)'), value: 'busytex-luatex' },
            ],
        });

        registerSetting({
            id: 'latex-texlive-endpoint',
            category: t('Compilation'),
            subcategory: t('LaTeX'),
            type: 'text',
            label: t('TeX Live 2020 remote endpoint (SwiftLaTeX)'),
            description: t('URL endpoint for on-demand TeX Live 2020 package downloads used by SwiftLaTeX engines. Leave blank to disable.'),
            defaultValue: initialTexliveEndpoint,
        });

        registerSetting({
            id: 'latex-busytex-endpoint',
            category: t('Compilation'),
            subcategory: t('LaTeX'),
            type: 'text',
            label: t('TeX Live 2026 remote endpoint (BusyTeX)'),
            description: t('URL endpoint for on-demand TeX Live 2026 package downloads used by BusyTeX engines beyond preloaded bundles. Leave blank to disable.'),
            defaultValue: initialBusyTeXEndpoint,
        });

        registerSetting({
            id: 'latex-busytex-bundles',
            category: t('Compilation'),
            subcategory: t('LaTeX'),
            type: 'select',
            label: t('BusyTeX preloaded bundle'),
            description: t('TeX Live 2026 package bundle to preload. Larger bundles take longer to download but cover more packages offline.'),
            defaultValue: initialBusyTeXBundles,
            options: Object.entries(BUSYTEX_BUNDLE_LABELS).map(([id, label]) => ({
                label: t(label),
                value: id,
            })),
        });

        registerSetting({
            id: 'latex-sourcemap-enabled',
            category: t('Compilation'),
            subcategory: t('LaTeX'),
            type: 'checkbox',
            label: t('Enable source map (SyncTeX)'),
            description: t('Enable SyncTeX source mapping between editor and PDF output'),
            defaultValue: initialSourceMap,
        });

        registerSetting({
            id: 'latex-auto-compile-on-open',
            category: t('Compilation'),
            subcategory: t('LaTeX'),
            type: 'checkbox',
            label: t('Auto-compile on project open'),
            description: t('Automatically compile LaTeX when opening a project'),
            defaultValue: initialAutoCompile,
        });

        registerSetting({
            id: 'latex-auto-navigate-to-main',
            category: t('Compilation'),
            subcategory: t('LaTeX'),
            type: 'select',
            label: t('Auto-navigate to main file on compile'),
            description: t('Control when to automatically navigate to the main LaTeX file during compilation'),
            defaultValue: initialAutoNavigate,
            options: [
                { label: t('Only when no LaTeX file is open'), value: 'conditional' },
                { label: t('Always navigate to main file'), value: 'always' },
                { label: t('Never navigate to main file'), value: 'never' },
            ],
        });

        registerSetting({
            id: 'latex-default-format',
            category: t('Compilation'),
            subcategory: t('LaTeX'),
            type: 'select',
            label: t('Default output format'),
            description: t('Default format for LaTeX compilation'),
            defaultValue: initialDefaultFormat,
            options: [
                { label: t('PDF'), value: 'pdf' },
                { label: t('Canvas (PDF)'), value: 'canvas-pdf' },
            ],
        });

        registerSetting({
            id: 'latex-store-cache',
            category: t('Compilation'),
            subcategory: t('LaTeX'),
            type: 'checkbox',
            label: t('Store compilation cache'),
            description: t('Save TeX cache files for faster subsequent compilations'),
            defaultValue: initialStoreCache,
        });

        registerSetting({
            id: 'latex-store-working-directory',
            category: t('Compilation'),
            subcategory: t('LaTeX'),
            type: 'checkbox',
            label: t('Store working directory'),
            description: t('Save all working directory files after compilation'),
            defaultValue: initialStoreWorkingDirectory,
        });

        registerSetting({
            id: 'latex-notifications',
            category: t('Compilation'),
            subcategory: t('LaTeX'),
            type: 'checkbox',
            label: t('Show compilation notifications'),
            description: t('Display notifications for LaTeX compilation activities (PDF only)'),
            defaultValue: initialNotifications,
        });
    }, [registerSetting, getSetting]);
}
