// extras/viewers/pdf/PdfViewerPlugin.ts
import { t } from '@/i18n';
import type { ViewerPlugin } from '@/plugins/PluginInterface';
import PdfViewer from './PdfViewer';
import { getPdfViewerSettings } from './settings';
import { PdfIcon } from './Icon'

const PDF_EXTENSIONS = ['pdf'];
const PDF_MIMETYPES = ['application/pdf'];

export const PLUGIN_NAME = t('PDF.js Viewer') + ' (pdfjs-dist 5.4.296)';
export const PLUGIN_VERSION = '0.1.0';

const pdfViewerPlugin: ViewerPlugin = {
	id: 'pdf-viewer',
	name: PLUGIN_NAME,
	version: PLUGIN_VERSION,
	type: 'viewer',
	icon: PdfIcon,
	get settings() {
		return getPdfViewerSettings();
	},

	canHandle: (fileName: string, mimeType?: string): boolean => {
		if (mimeType && PDF_MIMETYPES.includes(mimeType)) {
			return true;
		}

		const extension = fileName.split('.').pop()?.toLowerCase();
		return extension ? PDF_EXTENSIONS.includes(extension) : false;
	},

	getSupportedExtensions: () => PDF_EXTENSIONS.map((ext, idx) => ({
		extension: ext,
		mimeType: PDF_MIMETYPES[idx]
	})),

	renderViewer: PdfViewer,
};

export default pdfViewerPlugin;
