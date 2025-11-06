// extra/viewers/bibtex/BibtexViewerPlugin.ts
import type { ViewerPlugin } from '@/plugins/PluginInterface';
import BibtexViewer from './BibtexViewer';
import { bibtexViewerSettings } from './settings';
import { BibIcon } from './Icon';

const BIBTEX_EXTENSIONS = ['bib', 'bibtex'];
const BIBTEX_MIMETYPES = ['text/x-bibtex', 'application/x-bibtex'];

export const PLUGIN_NAME = 'BibTeX Editor (bib-editor 1.14.0)';
export const PLUGIN_VERSION = '0.1.0';

const bibtexViewerPlugin: ViewerPlugin = {
	id: 'bibtex-viewer',
	name: PLUGIN_NAME,
	version: PLUGIN_VERSION,
	type: 'viewer',
	icon: BibIcon,
	settings: bibtexViewerSettings,

	canHandle: (fileName: string, mimeType?: string): boolean => {
		if (mimeType && BIBTEX_MIMETYPES.includes(mimeType)) {
			return true;
		}

		const extension = fileName.split('.').pop()?.toLowerCase();
		return extension ? BIBTEX_EXTENSIONS.includes(extension) : false;
	},

	renderViewer: BibtexViewer,
};

export default bibtexViewerPlugin;
