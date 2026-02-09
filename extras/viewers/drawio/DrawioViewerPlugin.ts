// extras/viewers/drawio/DrawioViewerPlugin.ts
import { t } from '@/i18n';
import type { ViewerPlugin } from '@/plugins/PluginInterface';
import DrawioViewer from './DrawioViewer';
import { getDrawioViewerSettings } from './settings';
import { DrawioIcon } from './Icon';

const DRAWIO_EXTENSIONS = ['drawio', 'dio'];
const DRAWIO_MIMETYPES = ['application/vnd.jgraph.mxfile', 'application/x-drawio'];

export const PLUGIN_NAME = t('Draw.io Diagram Editor') + ' (draw.io 29.3.7)';
export const PLUGIN_VERSION = '0.1.0';

const drawioViewerPlugin: ViewerPlugin = {
    id: 'drawio-viewer',
    name: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    type: 'viewer',
    isEditable: true,
    icon: DrawioIcon,
    get settings() {
        return getDrawioViewerSettings();
    },

    canHandle: (fileName: string, mimeType?: string): boolean => {
        if (mimeType && DRAWIO_MIMETYPES.includes(mimeType)) {
            return true;
        }

        const extension = fileName.split('.').pop()?.toLowerCase();
        return extension ? DRAWIO_EXTENSIONS.includes(extension) : false;
    },

    // getSupportedExtensions: () => DRAWIO_EXTENSIONS.map((ext, idx) => ({
    //     extension: ext,
    //     mimeType: DRAWIO_MIMETYPES[idx],
    //     fileLabel: t('Draw.io File')
    // })),
    getSupportedExtensions: () => [{
        extension: DRAWIO_EXTENSIONS[0],
        mimeType: DRAWIO_MIMETYPES[0],
        fileLabel: t('Draw.io File')
    }],

    renderViewer: DrawioViewer,
};

export default drawioViewerPlugin;