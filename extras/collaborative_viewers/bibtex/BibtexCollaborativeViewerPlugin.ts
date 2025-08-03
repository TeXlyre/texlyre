// extras/collaborative_viewers/bibtex/BibtexCollaborativeViewerPlugin.ts
import type { CollaborativeViewerPlugin } from "../../../src/plugins/PluginInterface";
import { bibtexViewerSettings } from "../../viewers/bibtex/settings";
import BibtexCollaborativeViewer from "./BibtexCollaborativeViewer";

const BIBTEX_EXTENSIONS = ["bib", "bibtex"];
const BIBTEX_MIMETYPES = ["text/x-bibtex", "application/x-bibtex"];

export const PLUGIN_NAME = "BibTeX Collaborative Editor (bib-editor 1.14.0)";
export const PLUGIN_VERSION = "0.1.0";

const bibtexCollaborativeViewerPlugin: CollaborativeViewerPlugin = {
	id: "bibtex-collaborative-viewer",
	name: PLUGIN_NAME,
	version: PLUGIN_VERSION,
	type: "collaborative-viewer",
	settings: bibtexViewerSettings,

	canHandle: (fileName: string, mimeType?: string): boolean => {
		if (mimeType && BIBTEX_MIMETYPES.includes(mimeType)) {
			return true;
		}

		const extension = fileName.split(".").pop()?.toLowerCase();
		return extension ? BIBTEX_EXTENSIONS.includes(extension) : false;
	},

	renderViewer: BibtexCollaborativeViewer,
};

export default bibtexCollaborativeViewerPlugin;
