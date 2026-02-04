// extras/collaborative_viewers/drawio/DrawioCollaborativeViewerPlugin.ts
import type { CollaborativeViewerPlugin } from '@/plugins/PluginInterface';
import { getDrawioViewerSettings } from '../../../src/plugins/viewers/drawio/settings';
import DrawioCollaborativeViewer from './DrawioCollaborativeViewer';

const DRAWIO_EXTENSIONS = ['drawio', 'dio', 'xml'];
const DRAWIO_MIMETYPES = ['application/vnd.jgraph.mxfile', 'application/x-drawio', 'application/xml'];

export const PLUGIN_NAME = 'Draw.io Collaborative Editor';
export const PLUGIN_VERSION = '0.1.0';

const drawioCollaborativeViewerPlugin: CollaborativeViewerPlugin = {
    id: 'drawio-collaborative-viewer',
    name: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    type: 'collaborative-viewer',
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

    renderViewer: DrawioCollaborativeViewer,
};

export default drawioCollaborativeViewerPlugin;