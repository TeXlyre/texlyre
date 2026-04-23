// src/settings/registerLSPConfigSettings.tsx
import { t } from '@/i18n';
import { useEffect, useRef } from 'react';

import { useSettings } from '../hooks/useSettings';

export function useRegisterLSPConfigSettings() {
    const { registerSetting, batchGetSettings } = useSettings();
    const registered = useRef(false);

    useEffect(() => {
        if (registered.current) return;
        registered.current = true;

        const batchedSettings = batchGetSettings(['generic-lsp-configs']);
        const settingValue = batchedSettings['generic-lsp-configs'];

        let storedValue: string | unknown[] = '[]';

        if (typeof settingValue === 'string') {
            storedValue = settingValue;
        } else if (Array.isArray(settingValue)) {
            storedValue = settingValue;
        }

        registerSetting({
            id: 'generic-lsp-configs',
            category: t('LSP'),
            subcategory: t('Generic LSP'),
            type: 'codemirror',
            label: t('LSP Configurations'),
            description: (
                <>
                    {t('Stored LSP server configurations (JSON array)')}{' '}
                    <br />
                    <a href="https://texlyre.github.io/docs/lsp-with-texlyre" target="_blank" rel="noopener noreferrer">
                        {t('Learn more about the LSP configuration format')}
                    </a>
                    <br />
                    <a href="https://texlyre.github.io/docs/category/supported-lsp" target="_blank" rel="noopener noreferrer">
                        {t('Tested LSP servers and setup guides')}
                    </a>
                </>
            ),
            defaultValue: storedValue,
            liveUpdate: false,
        });
    }, [registerSetting, batchGetSettings]);
}