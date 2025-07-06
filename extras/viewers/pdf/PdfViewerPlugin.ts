// extras/viewers/pdf/PdfViewerPlugin.ts
import type { ViewerPlugin } from "../../../src/plugins/PluginInterface";
import PdfViewer from "./PdfViewer";
import { pdfViewerSettings } from "./settings";

const PDF_EXTENSIONS = ["pdf"];
const PDF_MIMETYPES = ["application/pdf"];

const pdfViewerPlugin: ViewerPlugin = {
	id: "texlyre-pdf-viewer",
	name: "PDF Viewer",
	version: "1.0.0",
	type: "viewer",
	settings: pdfViewerSettings,

	canHandle: (fileName: string, mimeType?: string): boolean => {
		if (mimeType && PDF_MIMETYPES.includes(mimeType)) {
			return true;
		}

		const extension = fileName.split(".").pop()?.toLowerCase();
		return extension ? PDF_EXTENSIONS.includes(extension) : false;
	},

	renderViewer: PdfViewer,
};

export default pdfViewerPlugin;
