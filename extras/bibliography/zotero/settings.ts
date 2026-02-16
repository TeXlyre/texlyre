import { t } from '@/i18n';
import type { Setting } from '@/contexts/SettingsContext';

export const getZoteroSettings = (): Setting[] => [
    {
        id: 'zotero-citation-style',
        category: t("Bibliography"),
        subcategory: t("Zotero"),
        type: 'select',
        label: t("Default citation style"),
        description: t("Default citation style for auto-completion"),
        defaultValue: 'numeric',
        options: [
            { label: t("Numeric [1]"), value: 'numeric' },
            { label: t("Author-Year (Smith, 2023)"), value: 'author-year' },
            { label: t("Alphabetic [Smi23]"), value: 'alphabetic' }
        ]
    },
    {
        id: 'zotero-max-completions',
        category: t("Bibliography"),
        subcategory: t("Zotero"),
        type: 'number',
        label: t("Maximum completion items"),
        description: t("Maximum number of citation suggestions to show"),
        defaultValue: 20,
        min: 5,
        max: 100
    },
    {
        id: 'zotero-auto-import',
        category: t("Bibliography"),
        subcategory: t("Zotero"),
        type: 'checkbox',
        label: t("Auto-import external citations"),
        description: t("Automatically import Zotero entries when selected"),
        defaultValue: true
    },
    {
        id: 'zotero-merge-duplicates',
        category: t("Bibliography"),
        subcategory: t("Zotero"),
        type: 'select',
        label: t("Duplicate handling"),
        description: t("How to handle entries that already exist locally"),
        defaultValue: 'keep-local',
        options: [
            { label: t("Keep local version"), value: 'keep-local' },
            { label: t("Replace with external"), value: 'replace' },
            { label: t("Rename imported entry"), value: 'rename' },
            { label: t("Always ask"), value: 'ask' }
        ]
    }
];