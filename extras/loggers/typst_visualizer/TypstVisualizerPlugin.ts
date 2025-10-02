// extras/loggers/typst_visualizer/TypstVisualizerPlugin.ts
import type { LoggerPlugin } from "../../../src/plugins/PluginInterface";
import TypstVisualizer from "./TypstVisualizer";

export const PLUGIN_NAME = "Typst Log Parser";
export const PLUGIN_VERSION = "0.1.0";

const typstVisualizerPlugin: LoggerPlugin = {
    id: "typst-visualizer",
    name: PLUGIN_NAME,
    version: PLUGIN_VERSION,
    type: "logger",

    canHandle: (logType: string): boolean => {
        return logType === "typst";
    },

    renderVisualizer: TypstVisualizer,
};

export default typstVisualizerPlugin;