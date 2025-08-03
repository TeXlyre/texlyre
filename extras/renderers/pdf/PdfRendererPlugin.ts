// extras/renderers/pdf/PdfRendererPlugin.ts
import type { RendererPlugin } from "../../../src/plugins/PluginInterface";
import PdfRenderer from "./PdfRenderer";
import { pdfRendererSettings } from "./settings";

export const PLUGIN_NAME = "Enhanced PDF.js Viewer (pdfjs-dist 5.3.31)";
export const PLUGIN_VERSION = "0.1.0";

const pdfRendererPlugin: RendererPlugin = {
	id: "pdf-renderer",
	name: PLUGIN_NAME,
	version: PLUGIN_VERSION,
	type: "renderer",
	settings: pdfRendererSettings,

	canHandle: (outputType: string): boolean => {
		return outputType === "pdf";
	},

	renderOutput: PdfRenderer,
};

export default pdfRendererPlugin;
