// extras/viewers/media/MediaViewerPlugin.ts
import { t } from '@/i18n';
import type { ViewerPlugin } from '@/plugins/PluginInterface';
import CombinedMediaViewer from './CombinedMediaViewer';
import { getMediaViewerSettings } from './settings';
import { MediaIcon } from './Icon';

const VIDEO_EXTENSIONS = ['mp4', 'webm', 'ogv', 'mov', 'm4v'];
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'oga', 'm4a', 'flac', 'aac'];

const VIDEO_MIMETYPES = [
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    'video/x-m4v',
];

const AUDIO_MIMETYPES = [
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/mp4',
    'audio/flac',
    'audio/aac',
];

const ALL_EXTENSIONS = [...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS];
const ALL_MIMETYPES = [...VIDEO_MIMETYPES, ...AUDIO_MIMETYPES];

export const PLUGIN_NAME = t('Media Viewer');
export const PLUGIN_VERSION = '0.1.0';

const mediaViewerPlugin: ViewerPlugin = {
    id: 'media-viewer',
    name: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    type: 'viewer',
    icon: MediaIcon,
    get settings() {
        return getMediaViewerSettings();
    },

    canHandle: (fileName: string, mimeType?: string): boolean => {
        if (mimeType && ALL_MIMETYPES.includes(mimeType)) return true;
        const extension = fileName.split('.').pop()?.toLowerCase();
        return extension ? ALL_EXTENSIONS.includes(extension) : false;
    },

    getSupportedExtensions: () => [
        ...VIDEO_EXTENSIONS.map((ext, idx) => ({
            extension: ext,
            mimeType: VIDEO_MIMETYPES[idx],
        })),
        ...AUDIO_EXTENSIONS.map((ext, idx) => ({
            extension: ext,
            mimeType: AUDIO_MIMETYPES[idx],
        })),
    ],

    renderViewer: CombinedMediaViewer,
};

export default mediaViewerPlugin;