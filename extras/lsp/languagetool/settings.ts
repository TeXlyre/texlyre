// extras/lsp/languagetool/settings.ts
import { t } from '@/i18n';
import type { Setting } from '@/contexts/SettingsContext';

export const getLanguageToolSettings = (): Setting[] => [
    {
        id: 'languagetool-server-url',
        category: t('LSP'),
        subcategory: t('LanguageTool'),
        type: 'text',
        label: t('LanguageTool server URL'),
        description: t('The URL of the LanguageTool server used for grammar and spelling checks.'),
        defaultValue: 'http://localhost:8010',
        liveUpdate: true,
        validate: (value: unknown) => typeof value === 'string' && value.trim().length > 0,
    },
    {
        id: 'languagetool-language',
        category: t('LSP'),
        subcategory: t('LanguageTool'),
        type: 'text',
        label: t('LanguageTool server URL'),
        description: t('The URL of the LanguageTool server used for grammar and spelling checks.'),
        defaultValue: 'http://localhost:8010',
        liveUpdate: true,
        validate: (value: unknown) => typeof value === 'string' && value.trim().length > 0,
    },
    {
        id: 'languagetool-language',
        category: t('LSP'),
        subcategory: t('LanguageTool'),
        type: 'select',
        label: t('LanguageTool language'),
        description: t('Choose the default document language used by LanguageTool.'),
        defaultValue: 'en-US',
        options: [
            { label: t('Auto'), value: 'auto' },
            { label: t('English (US)'), value: 'en-US' },
            { label: t('English (UK)'), value: 'en-GB' },
            { label: t('German'), value: 'de-DE' },
            { label: t('French'), value: 'fr-FR' },
            { label: t('Spanish'), value: 'es-ES' },
        ],
        liveUpdate: true,
    },
];
