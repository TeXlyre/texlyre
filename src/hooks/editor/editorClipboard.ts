// src/hooks/editor/editorClipboard.ts
import type { RefObject } from 'react';
import type { EditorView } from 'codemirror';

import { processTextSelection } from '../../utils/fileCommentUtils.ts';

export const registerEditorClipboard = (
	editorElement: HTMLDivElement,
	viewRef: RefObject<EditorView | null>,
) => {
	const handleClipboard = (event: ClipboardEvent) => {
		const data = event.clipboardData;
		if (!data) return;

		const copied = data.getData('text/plain');

		if (copied) {
			const cleaned = processTextSelection(copied);
			if (cleaned !== copied) data.setData('text/plain', cleaned);
			return;
		}

		if (event.type !== 'copy') return;

		const view = viewRef.current;
		const range = view?.state.selection.main;
		if (!view || !range || range.from === range.to) return;

		data.setData(
			'text/plain',
			processTextSelection(view.state.doc.sliceString(range.from, range.to)),
		);
		event.preventDefault();
	};

	editorElement.addEventListener('copy', handleClipboard);
	editorElement.addEventListener('cut', handleClipboard);

	return () => {
		editorElement.removeEventListener('copy', handleClipboard);
		editorElement.removeEventListener('cut', handleClipboard);
	};
};
