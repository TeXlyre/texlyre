// extras/renderers/svg/SvgRendererPlugin.ts
import type { RendererPlugin } from '@/plugins/PluginInterface';
import SvgRenderer from './SvgRenderer';
import { getSvgRendererSettings } from './settings';

export const PLUGIN_NAME = 'Enhanced SVG Viewer';
export const PLUGIN_VERSION = '0.1.0';

const svgRendererPlugin: RendererPlugin = {
    id: 'svg-renderer',
    name: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    type: 'renderer',
    get settings() {
        return getSvgRendererSettings();
    },

    canHandle: (outputType: string): boolean => {
        return outputType === 'svg' || outputType === 'typst-svg';
    },

    renderOutput: SvgRenderer,
};

export default svgRendererPlugin;