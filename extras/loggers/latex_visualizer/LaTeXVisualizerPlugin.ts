// extras/loggers/latex_visualizer/LaTeXVisualizerPlugin.ts
import type { LoggerPlugin } from "../../../src/plugins/PluginInterface";
import LaTeXVisualizer from "./LaTeXVisualizer";

const latexVisualizerPlugin: LoggerPlugin = {
	id: "texlyre-latex-visualizer",
	name: "LaTeX Error Visualizer",
	version: "1.0.0",
	type: "logger",

	canHandle: (logType: string): boolean => {
		return logType === "latex";
	},

	renderVisualizer: LaTeXVisualizer,
};

export default latexVisualizerPlugin;
