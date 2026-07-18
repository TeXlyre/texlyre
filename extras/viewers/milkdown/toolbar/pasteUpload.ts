// extras/viewers/milkdown/toolbar/pasteUpload.ts
import type { EditorView } from '@milkdown/kit/prose/view';

import {
	extractUploadableBlob,
	readClipboardBlob,
	uploadPastedFile,
} from '@/utils/clipboardUtils';
import { milkdownToolbarItems } from './milkdownItems';
import { isToolbarButton } from './types';
import { setPendingMilkdownImagePath } from './pendingImage';

function runMilkdownCommand(view: EditorView, key: string): boolean {
	const item = milkdownToolbarItems.find(
		(entry) => isToolbarButton(entry) && entry.key === key,
	);
	return item && isToolbarButton(item) ? item.command(view) : false;
}

function insertUploadedImage(
	view: EditorView,
	blob: Blob,
	currentFileId?: string,
) {
	uploadPastedFile(blob, currentFileId)
		.then((uploadedPath) => {
			setPendingMilkdownImagePath(uploadedPath);
			if (!runMilkdownCommand(view, 'image')) {
				console.warn('[pasteUpload] Milkdown image command not found');
				setPendingMilkdownImagePath(null);
			}
		})
		.catch((error) => {
			console.error('[pasteUpload] Error handling pasted file in Milkdown:', error);
		});
}

export function createMilkdownPasteHandler(currentFileId?: string) {
	return (view: EditorView, event: ClipboardEvent): boolean => {
		const syncBlob = extractUploadableBlob(event);
		if (syncBlob) {
			insertUploadedImage(view, syncBlob, currentFileId);
			return true;
		}

		const types = Array.from(event.clipboardData?.types ?? []);
		const hasImageHint = types.some(
			(type) => type.startsWith('image/') || type === 'text/uri-list',
		);
		if (!hasImageHint) return false;

		readClipboardBlob().then((blob) => {
			if (blob) insertUploadedImage(view, blob, currentFileId);
		});

		return true;
	};
}
