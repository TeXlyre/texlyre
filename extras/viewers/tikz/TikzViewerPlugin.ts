// extras/viewers/tikz/TikzViewerPlugin.ts
import { t } from '@/i18n';
import type { ViewerPlugin } from '@/plugins/PluginInterface';
import TikzViewer from './TikzViewer';
import { TikzIcon } from './Icon';
import { getTikzViewerSettings } from './settings';

const TIKZ_EXTENSIONS = ['tikz', 'pgf'];
const TIKZ_MIMETYPES = ['text/x-tikz', 'application/x-tikz'];

export const PLUGIN_NAME = `${t('TikZ Editor')} (tikz-editor 0.5.2)`;
export const PLUGIN_VERSION = '0.1.0';

const tikzViewerPlugin: ViewerPlugin = {
	id: 'tikz-viewer',
	name: PLUGIN_NAME,
	version: PLUGIN_VERSION,
	type: 'viewer',
	isEditable: true,
	icon: TikzIcon,
	get settings() {
		return getTikzViewerSettings();
	},

	canHandle: (fileName: string, mimeType?: string): boolean => {
		const extension = fileName.split('.').pop()?.toLowerCase();
		if (extension && TIKZ_EXTENSIONS.includes(extension)) return true;
		return Boolean(mimeType && TIKZ_MIMETYPES.includes(mimeType));
	},

	getSupportedExtensions: () => [
		{
			extension: 'tikz',
			mimeType: 'text/x-tikz',
			fileLabel: t('{editor} File', { editor: t('TikZ') }),
		},
	],

	renderViewer: TikzViewer,
};

export default tikzViewerPlugin;
