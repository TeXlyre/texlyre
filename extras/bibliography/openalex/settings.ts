// extras/bibliography/openalex/settings.ts
import { t } from '@/i18n';
import type { Setting } from '@/contexts/SettingsContext';

export const getOpenAlexSettings = (): Setting[] => [
    {
        id: 'openalex-bibliography-enabled',
        category: t('Bibliography'),
        subcategory: t('OpenAlex'),
        type: 'checkbox',
        label: t('Enable OpenAlex'),
        description: t('Enable OpenAlex integration for searching scholarly works'),
        defaultValue: true,
        liveUpdate: false,
    },
    {
        id: 'openalex-bibliography-search-mode',
        category: t('Bibliography'),
        subcategory: t('OpenAlex'),
        type: 'select',
        label: t('Search mode'),
        description: t('Whether to search as you type or on button click'),
        defaultValue: 'on-demand',
        options: [
            { label: t('On button click'), value: 'on-demand' },
            { label: t('As you type (instant)'), value: 'instant' },
        ],
    },
    {
        id: 'openalex-bibliography-max-completions',
        category: t('Bibliography'),
        subcategory: t('OpenAlex'),
        type: 'number',
        label: t('Results per search'),
        description: t('Number of results to return per search query'),
        defaultValue: 25,
        min: 5,
        max: 200,
    },
    {
        id: 'openalex-bibliography-merge-duplicates',
        category: t('Bibliography'),
        subcategory: t('OpenAlex'),
        type: 'select',
        label: t('Duplicate handling'),
        description: t('How to handle entries that already exist locally'),
        defaultValue: 'keep-local',
        options: [
            { label: t('Keep local version'), value: 'keep-local' },
            { label: t('Replace with external'), value: 'replace' },
            { label: t('Rename imported entry'), value: 'rename' },
        ],
    },
];
