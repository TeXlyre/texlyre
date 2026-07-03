// extras/collaborative_viewers/tikz/TikzCollaborativeViewerPlugin.ts
import { t } from '@/i18n';
import type { CollaborativeViewerPlugin } from '@/plugins/PluginInterface';
import { getTikzViewerSettings } from '../../viewers/tikz/settings';
import TikzCollaborativeViewer from './TikzCollaborativeViewer';

const TIKZ_EXTENSIONS = ['tikz', 'pgf'];
const TIKZ_MIMETYPES = ['text/x-tikz', 'application/x-tikz'];

export const PLUGIN_NAME = `${t('TikZ Collaborative Editor')} (tikz-editor 0.5.2)`;
export const PLUGIN_VERSION = '0.1.0';

const tikzCollaborativeViewerPlugin: CollaborativeViewerPlugin = {
	id: 'tikz-collaborative-viewer',
	name: PLUGIN_NAME,
	version: PLUGIN_VERSION,
	type: 'collaborative-viewer',
	get settings() {
		return getTikzViewerSettings();
	},

	canHandle: (fileName: string, mimeType?: string): boolean => {
		const extension = fileName.split('.').pop()?.toLowerCase();
		if (extension && TIKZ_EXTENSIONS.includes(extension)) return true;
		return Boolean(mimeType && TIKZ_MIMETYPES.includes(mimeType));
	},

	renderViewer: TikzCollaborativeViewer,
};

export default tikzCollaborativeViewerPlugin;
