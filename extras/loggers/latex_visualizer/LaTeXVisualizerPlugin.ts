// extras/loggers/latex_visualizer/LaTeXVisualizerPlugin.ts
import type { LoggerPlugin } from "../../../src/plugins/PluginInterface";
import LaTeXVisualizer from "./LaTeXVisualizer";

export const PLUGIN_NAME = "LaTeX Log Parser";
export const PLUGIN_VERSION = "0.1.0";

const latexVisualizerPlugin: LoggerPlugin = {
	id: "latex-visualizer",
	name: PLUGIN_NAME,
	version: PLUGIN_VERSION,
	type: "logger",

	canHandle: (logType: string): boolean => {
		return logType === "latex";
	},

	renderVisualizer: LaTeXVisualizer,
};

export default latexVisualizerPlugin;
