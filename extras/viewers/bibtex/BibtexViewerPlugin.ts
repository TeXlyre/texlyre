import type { ViewerPlugin } from "../../../src/plugins/PluginInterface";
import BibtexViewer from "./BibtexViewer";
import { bibtexViewerSettings } from "./settings";

const BIBTEX_EXTENSIONS = ["bib", "bibtex"];
const BIBTEX_MIMETYPES = ["text/x-bibtex", "application/x-bibtex"];

const bibtexViewerPlugin: ViewerPlugin = {
	id: "texlyre-bibtex-viewer",
	name: "BibTeX Viewer",
	version: "1.0.0",
	type: "viewer",
	settings: bibtexViewerSettings,

	canHandle: (fileName: string, mimeType?: string): boolean => {
		if (mimeType && BIBTEX_MIMETYPES.includes(mimeType)) {
			return true;
		}

		const extension = fileName.split(".").pop()?.toLowerCase();
		return extension ? BIBTEX_EXTENSIONS.includes(extension) : false;
	},

	renderViewer: BibtexViewer,
};

export default bibtexViewerPlugin;
