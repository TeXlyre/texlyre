// extras/viewers/drawio/settings.ts
import { t } from '@/i18n';
import type { Setting } from '@/contexts/SettingsContext';

export const getDrawioViewerSettings = (): Setting[] => [
    {
        id: 'drawio-viewer-auto-save',
        category: t('Viewers'),
        subcategory: t('Draw.io Editor'),
        type: 'checkbox',
        label: t('Auto-save in editor'),
        description: t('Automatically save changes in the Draw.io editor'),
        defaultValue: true
    },
    {
        id: 'drawio-viewer-auto-save-file',
        category: t('Viewers'),
        subcategory: t('Draw.io Editor'),
        type: 'checkbox',
        label: t('Auto-save to file'),
        description: t('Automatically save changes to the file system'),
        defaultValue: true
    },
    {
        id: 'drawio-viewer-theme',
        category: t('Viewers'),
        subcategory: t('Draw.io Editor'),
        type: 'select',
        label: t('Theme'),
        description: t('Theme for the Draw.io editor'),
        defaultValue: 'auto-app',
        options: [
            { label: t('Auto (follows app theme)'), value: 'auto-app' },
            { label: t('Auto (follows Draw.io theme)'), value: 'auto-drawio' },
            { label: t('Light'), value: 'light' },
            { label: t('Dark'), value: 'dark' }
        ]
    },
    {
        id: 'drawio-viewer-language',
        category: t('Viewers'),
        subcategory: t('Draw.io Editor'),
        type: 'select',
        label: t('Language'),
        description: t('Language for the Draw.io editor'),
        defaultValue: 'auto-app',
        options: [
            { label: t('Auto (follows app language)'), value: 'auto-app' },
            { label: t('Auto (follows Draw.io language)'), value: 'auto-drawio' }
        ]
    }
];
