// extras/viewers/media/settings.ts
import { t } from '@/i18n';
import type { Setting } from '@/contexts/SettingsContext';

export const getMediaViewerSettings = (): Setting[] => [
    {
        id: 'media-viewer-autoplay',
        category: t('Viewers'),
        subcategory: t('Media Viewer'),
        type: 'checkbox',
        label: t('Autoplay on open'),
        description: t('Start playback automatically when a media file is opened'),
        defaultValue: false,
    },
    {
        id: 'media-viewer-loop',
        category: t('Viewers'),
        subcategory: t('Media Viewer'),
        type: 'checkbox',
        label: t('Loop playback'),
        description: t('Restart media from the beginning when it ends'),
        defaultValue: false,
    },
    {
        id: 'media-viewer-default-volume',
        category: t('Viewers'),
        subcategory: t('Media Viewer'),
        type: 'select',
        label: t('Default volume'),
        description: t('Initial volume level when a media file is opened'),
        defaultValue: '100',
        options: [
            { label: t('25%'), value: '25' },
            { label: t('50%'), value: '50' },
            { label: t('75%'), value: '75' },
            { label: t('100%'), value: '100' },
        ],
    },
];