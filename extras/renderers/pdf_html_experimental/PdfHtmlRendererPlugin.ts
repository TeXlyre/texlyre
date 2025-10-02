// extras/renderers/pdf_html_experimental/PdfRendererPlugin.ts
import type { RendererPlugin } from '../../../src/plugins/PluginInterface';
import PdfHtmlRenderer from './PdfHtmlRenderer.tsx';
import { pdfHtmlRendererSettings } from './settings';

const pdfHtmlRendererPlugin: RendererPlugin = {
	id: 'pdfhtml-renderer',
	name: 'Enhanced PDF HTML Renderer',
	version: '1.0.0',
	type: 'renderer',
	settings: pdfHtmlRendererSettings,

	canHandle: (outputType: string): boolean => {
		return outputType === 'pdf';
	},

	renderOutput: PdfHtmlRenderer,
};

export default pdfHtmlRendererPlugin;
