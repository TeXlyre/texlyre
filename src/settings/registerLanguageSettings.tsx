import { t } from '@/i18n';
import { useEffect, useRef } from 'react';

import { useSettings } from '../hooks/useSettings';
import languagesConfig from '../../translations/languages.config.json';

interface Language {
    code: string;
    name: string;
    nativeName: string;
    direction: 'ltr' | 'rtl';
    coverage: number;
    totalKeys: number;
    translatedKeys: number;
    filePath: string;
}

export function useRegisterLanguageSettings() {
    const { registerSetting, getSetting } = useSettings();
    const settingsRegistered = useRef(false);
    const availableLanguages = languagesConfig.languages as Language[] || [];

    useEffect(() => {
        if (settingsRegistered.current) return;

        const initialLanguageCode = getSetting('language')?.value as string || 'en';

        registerSetting({
            id: 'language',
            category: t('Appearance'),
            subcategory: t('Language'),
            type: 'language-select',
            label: t('Interface language'),
            description: (
                <div>
                    {t('Select the interface language and view translation coverage')}{' '}
                    <br />
                    <a href="https://github.com/TeXlyre/texlyre/blob/main/CONTRIBUTING.md#translation--localization" target="_blank" rel="noopener noreferrer">
                        {t('Help translate or add a language')}
                    </a>
                </div>
            ),
            defaultValue: initialLanguageCode,
            options: availableLanguages.map((lang) => ({
                label: `${lang.nativeName} (${lang.name})`,
                value: lang.code
            })),
            liveUpdate: false
        });

        registerSetting({
            id: 'text-direction',
            category: t('Appearance'),
            subcategory: t('Language'),
            type: 'select',
            label: t('Text direction'),
            description: t('Control text direction (Auto follows language)'),
            defaultValue: 'auto',
            options: [
                { label: t('Auto (follows app language)'), value: 'auto' },
                { label: t('Left-to-Right (LTR)'), value: 'ltr' },
                { label: t('Right-to-Left (RTL)'), value: 'rtl' }
            ]
        });

        settingsRegistered.current = true;
    }, [availableLanguages, registerSetting, getSetting]);
}