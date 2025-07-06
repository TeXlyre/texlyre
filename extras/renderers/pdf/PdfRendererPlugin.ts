// extras/renderers/pdf/PdfRendererPlugin.ts
import type { RendererPlugin } from "../../../src/plugins/PluginInterface";
import PdfRenderer from "./PdfRenderer";
import { pdfRendererSettings } from "./settings";

const pdfRendererPlugin: RendererPlugin = {
	id: "texlyre-pdf-renderer",
	name: "Enhanced PDF Renderer",
	version: "1.0.0",
	type: "renderer",
	settings: pdfRendererSettings,

	canHandle: (outputType: string): boolean => {
		return outputType === "pdf";
	},

	renderOutput: PdfRenderer,
};

export default pdfRendererPlugin;
