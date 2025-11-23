import type { EditorView } from '@codemirror/view';

export const wrapSelection = (view: EditorView, before: string, after: string): boolean => {
    const selection = view.state.selection.main;
    const selectedText = view.state.doc.sliceString(selection.from, selection.to);

    view.dispatch({
        changes: {
            from: selection.from,
            to: selection.to,
            insert: `${before}${selectedText}${after}`,
        },
        selection: {
            anchor: selection.from + before.length,
            head: selection.from + before.length + selectedText.length,
        },
    });

    view.focus();
    return true;
};

export const insertText = (view: EditorView, text: string, cursorOffset: number = 0): boolean => {
    const selection = view.state.selection.main;

    view.dispatch({
        changes: {
            from: selection.from,
            to: selection.to,
            insert: text,
        },
        selection: {
            anchor: selection.from + text.length + cursorOffset,
        },
    });

    view.focus();
    return true;
};