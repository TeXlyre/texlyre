import { t } from '@/i18n';
import type { Setting } from '@/contexts/SettingsContext';

export const getDrawioViewerSettings = (): Setting[] => [
    {
        id: 'drawio-viewer-auto-save',
        category: t("Viewers"),
        subcategory: t("Draw.io Editor"),
        type: 'checkbox',
        label: t("Auto-save in editor"),
        description: t("Automatically save changes in the Draw.io editor"),
        defaultValue: true
    },
    {
        id: 'drawio-viewer-auto-save-file',
        category: t("Viewers"),
        subcategory: t("Draw.io Editor"),
        type: 'checkbox',
        label: t("Auto-save to file"),
        description: t("Automatically save changes to the file system"),
        defaultValue: true
    },
    {
        id: 'drawio-viewer-theme',
        category: t("Viewers"),
        subcategory: t("Draw.io Editor"),
        type: 'select',
        label: t("Theme"),
        description: t("Theme for the Draw.io editor"),
        defaultValue: 'auto',
        options: [
            { label: t("Auto"), value: 'auto' },
            { label: t("Light"), value: 'light' },
            { label: t("Dark"), value: 'dark' }
        ]
    }
];