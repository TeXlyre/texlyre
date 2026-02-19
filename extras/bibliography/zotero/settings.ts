// extras/bibliography/zotero/settings.ts
import { t } from '@/i18n';
import type { Setting } from '@/contexts/SettingsContext';

export const getZoteroSettings = (): Setting[] => [
    {
        id: 'zotero-bibliography-enabled',
        category: t("Bibliography"),
        subcategory: t("Zotero"),
        type: 'checkbox',
        label: t("Enable Zotero"),
        description: t("Enable Zotero integration for bibliography management"),
        defaultValue: false,
        liveUpdate: false
    },
    {
        id: 'zotero-bibliography-merge-duplicates',
        category: t("Bibliography"),
        subcategory: t("Zotero"),
        type: 'select',
        label: t("Duplicate handling"),
        description: t("How to handle entries that already exist locally"),
        defaultValue: 'keep-local',
        options: [
            { label: t("Keep local version"), value: 'keep-local' },
            { label: t("Replace with external"), value: 'replace' },
            { label: t("Rename imported entry"), value: 'rename' }
        ]
    }
];