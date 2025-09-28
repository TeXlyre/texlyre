// extras/renderers/canvas/CanvasRendererPlugin.ts
import type { RendererPlugin } from "../../../src/plugins/PluginInterface";
import CanvasRenderer from "./CanvasRenderer";
import { canvasRendererSettings } from "./settings";

export const PLUGIN_NAME = "Enhanced Canvas Viewer (Typst.ts)";
export const PLUGIN_VERSION = "0.1.0";

const canvasRendererPlugin: RendererPlugin = {
    id: "canvas-renderer",
    name: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    type: "renderer",
    settings: canvasRendererSettings,

    canHandle: (outputType: string): boolean => {
        return outputType === "canvas" || outputType === "typst-canvas";
    },

    renderOutput: CanvasRenderer,
};

export default canvasRendererPlugin;