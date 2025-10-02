// extras/viewers/image/ImageViewerPlugin.ts
import type { ViewerPlugin } from '../../../src/plugins/PluginInterface';
import CombinedImageViewer from './CombinedImageViewer';
import { imageViewerSettings } from './settings';
import { ImageIcon } from './Icon'

const IMAGE_EXTENSIONS = [
	'png',
	'jpg',
	'jpeg',
	'gif',
	'bmp',
	'webp',
	'svg',
	'ico',
];

const IMAGE_MIMETYPES = [
	'image/png',
	'image/jpeg',
	'image/gif',
	'image/bmp',
	'image/webp',
	'image/svg+xml',
	'image/x-icon',
];

export const PLUGIN_NAME = 'Image Viewer';
export const PLUGIN_VERSION = '0.1.0';

const imageViewerPlugin: ViewerPlugin = {
	id: 'image-viewer',
	name: PLUGIN_NAME,
	version: PLUGIN_VERSION,
	type: 'viewer',
	icon: ImageIcon,
	settings: imageViewerSettings,

	canHandle: (fileName: string, mimeType?: string): boolean => {
		if (mimeType && IMAGE_MIMETYPES.includes(mimeType)) {
			return true;
		}

		const extension = fileName.split('.').pop()?.toLowerCase();
		return extension ? IMAGE_EXTENSIONS.includes(extension) : false;
	},

	renderViewer: CombinedImageViewer,
};

export default imageViewerPlugin;
