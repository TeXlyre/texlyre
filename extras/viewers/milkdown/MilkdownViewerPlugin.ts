// extras/viewers/milkdown/MilkdownViewerPlugin.ts
import { t } from '@/i18n';
import type { ViewerPlugin } from '@/plugins/PluginInterface';
import MilkdownViewer from './MilkdownViewer';
import { getMilkdownViewerSettings } from './settings';
import { MilkdownIcon } from './Icon';

const MARKDOWN_EXTENSIONS = ['md', 'markdown'];
const MARKDOWN_MIMETYPES = ['text/markdown', 'text/x-markdown'];

export const PLUGIN_NAME = `${t('Markdown Editor')} (milkdown 7.x)`;
export const PLUGIN_VERSION = '0.1.0';

const milkdownViewerPlugin: ViewerPlugin = {
	id: 'milkdown-viewer',
	name: PLUGIN_NAME,
	version: PLUGIN_VERSION,
	type: 'viewer',
	isEditable: true,
	icon: MilkdownIcon,
	get settings() {
		return getMilkdownViewerSettings();
	},

	canHandle: (fileName: string, mimeType?: string): boolean => {
		if (mimeType && MARKDOWN_MIMETYPES.includes(mimeType)) {
			return true;
		}

		const extension = fileName.split('.').pop()?.toLowerCase();
		return extension ? MARKDOWN_EXTENSIONS.includes(extension) : false;
	},

	getSupportedExtensions: () => [
		{
			extension: MARKDOWN_EXTENSIONS[0],
			mimeType: MARKDOWN_MIMETYPES[0],
			fileLabel: t('Markdown File'),
		},
	],

	renderViewer: MilkdownViewer,
};

export default milkdownViewerPlugin;
