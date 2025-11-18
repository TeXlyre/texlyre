import type { RendererPlugin } from '@/plugins/PluginInterface';
import CanvasRenderer from './CanvasRenderer';
import { getCanvasRendererSettings } from './settings';

export const PLUGIN_NAME = 'Canvas Renderer';
export const PLUGIN_VERSION = '0.1.0';

const canvasRendererPlugin: RendererPlugin = {
    id: 'canvas-renderer',
    name: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    type: 'renderer',
    get settings() {
        return getCanvasRendererSettings();
    },

    canHandle: (outputType: string): boolean => {
        return outputType === 'canvas';
    },

    renderOutput: CanvasRenderer,
};

export default canvasRendererPlugin;