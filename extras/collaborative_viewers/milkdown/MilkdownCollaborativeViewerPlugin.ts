// extras/collaborative_viewers/milkdown/MilkdownCollaborativeViewerPlugin.ts
import { t } from '@/i18n';
import type { CollaborativeViewerPlugin } from '@/plugins/PluginInterface';
import { getMilkdownViewerSettings } from '../../viewers/milkdown/settings';
import MilkdownCollaborativeViewer from './MilkdownCollaborativeViewer';

const MARKDOWN_EXTENSIONS = ['md', 'markdown'];
const MARKDOWN_MIMETYPES = ['text/markdown', 'text/x-markdown'];

export const PLUGIN_NAME = `${t('Markdown Collaborative Editor')} (milkdown 7.x)`;
export const PLUGIN_VERSION = '0.1.0';

const milkdownCollaborativeViewerPlugin: CollaborativeViewerPlugin = {
	id: 'milkdown-collaborative-viewer',
	name: PLUGIN_NAME,
	version: PLUGIN_VERSION,
	type: 'collaborative-viewer',
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

	renderViewer: MilkdownCollaborativeViewer,
};

export default milkdownCollaborativeViewerPlugin;
