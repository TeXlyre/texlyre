// src/hooks/editor/editorClipboard.ts
import type { MutableRefObject } from 'react';
import type { EditorView } from 'codemirror';
import { processTextSelection } from '../../utils/fileCommentUtils.ts';

export const registerEditorClipboard = (
    editorElement: HTMLDivElement,
    viewRef: MutableRefObject<EditorView | null>,
) => {
    const handleCopy = (event: ClipboardEvent) => {
        const view = viewRef.current;
        if (!view) return;

        const selection = view.state.selection;
        const primaryRange = selection.main;

        if (primaryRange.from !== primaryRange.to) {
            const selectedText = view.state.doc.sliceString(
                primaryRange.from,
                primaryRange.to,
            );
            const cleanedText = processTextSelection(selectedText);

            event.clipboardData?.setData('text/plain', cleanedText);
            event.preventDefault();
        }
    };

    editorElement.addEventListener('copy', handleCopy);

    return () => {
        editorElement.removeEventListener('copy', handleCopy);
    };
};
