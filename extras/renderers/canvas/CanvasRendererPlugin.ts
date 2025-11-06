import type { RendererPlugin } from '@/plugins/PluginInterface';
import CanvasRenderer from './CanvasRenderer';
import { canvasRendererSettings } from './settings';

export const PLUGIN_NAME = 'Canvas Renderer';
export const PLUGIN_VERSION = '0.1.0';

const canvasRendererPlugin: RendererPlugin = {
    id: 'canvas-renderer',
    name: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    type: 'renderer',
    settings: canvasRendererSettings,

    canHandle: (outputType: string): boolean => {
        return outputType === 'canvas';
    },

    renderOutput: CanvasRenderer,
};

export default canvasRendererPlugin;