// src/extensions/codemirror/PasteExtension.ts
import { EditorView } from '@codemirror/view';

import { detectFileType } from '../../utils/fileUtils';
import {
	extractUploadableBlob,
	readClipboardBlob,
	uploadPastedFile,
} from '../../utils/clipboardUtils';
import { runToolbarCommand } from './ToolbarExtension';
import { createNamedLogger } from '@/logging';

const moduleLog = createNamedLogger('PasteExtension');

let pendingImagePath: string | null = null;

export function getPendingImagePath(): string | null {
	const path = pendingImagePath;
	pendingImagePath = null;
	return path;
}

export const createPasteExtension = (
	currentFileId?: string,
	fileName?: string,
) => {
	const insert = (view: EditorView, blob: Blob) => {
		uploadPastedFile(blob, currentFileId)
			.then((uploadedPath) => {
				pendingImagePath = uploadedPath;

				const fileType = detectFileType(fileName, view.state.doc.toString());
				const didRun = runToolbarCommand(view, `${fileType}-figure`);
				if (!didRun) {
					moduleLog.warn('Figure command not found in toolbar');
					pendingImagePath = null;
				}
			})
			.catch((error) => {
				moduleLog.error('Error handling pasted file:', error);
			});
	};

	return EditorView.domEventHandlers({
		paste: (event, view) => {
			const syncBlob = extractUploadableBlob(event);
			if (syncBlob) {
				event.preventDefault();
				insert(view, syncBlob);
				return true;
			}

			const types = Array.from(event.clipboardData?.types ?? []);
			const hasImageHint = types.some(
				(type) => type.startsWith('image/') || type === 'text/uri-list',
			);
			if (!hasImageHint) return false;

			event.preventDefault();
			readClipboardBlob().then((blob) => {
				if (blob) insert(view, blob);
			});

			return true;
		},
	});
};
