// extra/viewers/bibtex/BibtexViewerPlugin.ts
import { t } from '@/i18n';
import type { ViewerPlugin } from '@/plugins/PluginInterface';
import BibtexViewer from './BibtexViewer';
import { getBibtexViewerSettings } from './settings';
import { BibIcon } from './Icon';

const BIBTEX_EXTENSIONS = ['bib', 'bibtex'];
const BIBTEX_MIMETYPES = ['text/x-bibtex', 'application/x-bibtex'];

export const PLUGIN_NAME = t('BibTeX Editor') + ' (bib-editor 1.14.0)';
export const PLUGIN_VERSION = '0.1.0';

const bibtexViewerPlugin: ViewerPlugin = {
	id: 'bibtex-viewer',
	name: PLUGIN_NAME,
	version: PLUGIN_VERSION,
	type: 'viewer',
	isEditable: true,
	icon: BibIcon,
	get settings() {
		return getBibtexViewerSettings();
	},

	canHandle: (fileName: string, mimeType?: string): boolean => {
		if (mimeType && BIBTEX_MIMETYPES.includes(mimeType)) {
			return true;
		}

		const extension = fileName.split('.').pop()?.toLowerCase();
		return extension ? BIBTEX_EXTENSIONS.includes(extension) : false;
	},

	// getSupportedExtensions: () => BIBTEX_EXTENSIONS.map((ext, idx) => ({
	// 	extension: ext,
	// 	mimeType: BIBTEX_MIMETYPES[idx],
	// 	fileLabel: t('Bibliography File')
	// })),
	getSupportedExtensions: () => [{
		extension: BIBTEX_EXTENSIONS[0],
		mimeType: BIBTEX_MIMETYPES[0],
		fileLabel: t('Bibliography File')
	}],

	renderViewer: BibtexViewer,
};

export default bibtexViewerPlugin;
