import type { ViewerPlugin } from '@/plugins/PluginInterface';
import DrawioViewer from './DrawioViewer';
import { getDrawioViewerSettings } from './settings';
import { DrawioIcon } from './Icon';

const DRAWIO_EXTENSIONS = ['drawio', 'dio', 'xml'];
const DRAWIO_MIMETYPES = ['application/vnd.jgraph.mxfile', 'application/x-drawio', 'application/xml'];

export const PLUGIN_NAME = 'Draw.io Diagram Editor';
export const PLUGIN_VERSION = '29.3.6';

const drawioViewerPlugin: ViewerPlugin = {
    id: 'drawio-viewer',
    name: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    type: 'viewer',
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

    renderViewer: DrawioViewer,
};

export default drawioViewerPlugin;