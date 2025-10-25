// src/contexts/LanguageContext.tsx
import type React from 'react';
import { type ReactNode, createContext, useCallback, useEffect, useRef, useState } from 'react';
import i18next from 'i18next';

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

interface LanguageContextType {
    currentLanguage: Language | null;
    availableLanguages: Language[];
    changeLanguage: (languageCode: string) => Promise<void>;
    isRTL: boolean;
}

export const LanguageContext = createContext<LanguageContextType>({
    currentLanguage: null,
    availableLanguages: [],
    changeLanguage: async () => { },
    isRTL: false
});

interface LanguageProviderProps {
    children: ReactNode;
}

export const LanguageProvider: React.FC<LanguageProviderProps> = ({ children }) => {
    const { registerSetting, getSetting } = useSettings();
    const [currentLanguage, setCurrentLanguage] = useState<Language | null>(null);
    const [isRTL, setIsRTL] = useState(false);
    const availableLanguages = (languagesConfig.languages as Language[]) || [];
    const settingsRegistered = useRef(false);

    const applyDirection = useCallback((direction: 'ltr' | 'rtl') => {
        document.documentElement.setAttribute('dir', direction);
        localStorage.setItem('text-direction', direction);
        setIsRTL(direction === 'rtl');
    }, []);

    const changeLanguage = useCallback(async (languageCode: string) => {
        const language = availableLanguages.find(lang => lang.code === languageCode);
        if (!language) return;

        await i18next.changeLanguage(languageCode);
        setCurrentLanguage(language);

        const directionSetting = getSetting('text-direction');
        const directionValue = directionSetting?.value as string;

        if (directionValue === 'auto') {
            applyDirection(language.direction);
        }
    }, [availableLanguages, applyDirection, getSetting]);

    useEffect(() => {
        if (settingsRegistered.current) return;

        const initialLanguageCode = (getSetting('language')?.value as string) || 'en';
        const initialLanguage = availableLanguages.find(lang => lang.code === initialLanguageCode) || availableLanguages[0];

        if (initialLanguage) {
            setCurrentLanguage(initialLanguage);
            i18next.changeLanguage(initialLanguage.code);

            const directionSetting = getSetting('text-direction');
            const directionValue = directionSetting?.value as string || 'auto';

            if (directionValue === 'auto') {
                applyDirection(initialLanguage.direction);
            } else {
                applyDirection(directionValue as 'ltr' | 'rtl');
            }
        }

        registerSetting({
            id: 'language',
            category: 'Appearance',
            subcategory: 'Language',
            type: 'language-select',
            label: 'Interface Language',
            description: 'Select the interface language and view translation coverage',
            defaultValue: 'en',
            options: availableLanguages.map(lang => ({
                label: `${lang.nativeName} (${lang.name})`,
                value: lang.code
            })),
            onChange: (value) => {
                changeLanguage(value as string);
            }
        });

        registerSetting({
            id: 'text-direction',
            category: 'Appearance',
            subcategory: 'Language',
            type: 'select',
            label: 'Text Direction',
            description: 'Control text direction (Auto follows language)',
            defaultValue: 'auto',
            options: [
                { label: 'Auto (Follow Language)', value: 'auto' },
                { label: 'Left-to-Right (LTR)', value: 'ltr' },
                { label: 'Right-to-Left (RTL)', value: 'rtl' }
            ],
            onChange: (value) => {
                const lang = availableLanguages.find(l => l.code === getSetting('language')?.value);
                if (value === 'auto' && lang) {
                    applyDirection(lang.direction);
                } else {
                    applyDirection(value as 'ltr' | 'rtl');
                }
            }
        });

        settingsRegistered.current = true;
    }, [availableLanguages, registerSetting, changeLanguage, applyDirection, getSetting]);

    return (
        <LanguageContext.Provider value={{ currentLanguage, availableLanguages, changeLanguage, isRTL }}>
            {children}
        </LanguageContext.Provider>
    );
};