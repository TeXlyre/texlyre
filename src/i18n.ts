// src/i18n.ts
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import enTranslations from '../translations/en.json';

i18next
    .use(initReactI18next)
    .init({
        resources: {
            en: {
                translation: enTranslations,
            },
        },
        lng: 'en',
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false,
        },
    });

export const t = (key: string, options?: { count?: number;[key: string]: any }): string => {
    return i18next.t(key, options) as string;
};

export default i18next;