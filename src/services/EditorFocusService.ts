// src/services/EditorFocusService.ts

// What the user has open in the editor, so the agent can be told which file
// "this" refers to. FileDocumentController sets the focus; the cursor comes
// from the editor's editor-cursor-update events for that file or document.
export type EditorFocus =
	| { kind: 'file'; fileId: string; path: string; binary: boolean }
	| {
			kind: 'document';
			documentId: string;
			name: string;
			// The project file the document is linked to, if any.
			path?: string;
	  };

export interface EditorCursor {
	line: number;
	// Set when text is selected; both lines are 1-based and inclusive.
	selection?: { fromLine: number; toLine: number };
}

export interface EditorFocusState {
	focus: EditorFocus | null;
	cursor: EditorCursor | null;
}

interface CursorUpdateDetail {
	line?: number;
	selection?: { fromLine: number; toLine: number };
	fileId?: string;
	documentId?: string;
	isEditingFile?: boolean;
}

const sameFocus = (a: EditorFocus | null, b: EditorFocus | null) =>
	JSON.stringify(a) === JSON.stringify(b);

const isFocusedEditor = (focus: EditorFocus, detail: CursorUpdateDetail) =>
	focus.kind === 'file'
		? detail.isEditingFile === true && detail.fileId === focus.fileId
		: detail.isEditingFile === false && detail.documentId === focus.documentId;

class EditorFocusService {
	private state: EditorFocusState = { focus: null, cursor: null };
	private readonly listeners = new Set<() => void>();
	private listening = false;

	getState = (): EditorFocusState => this.state;

	subscribe = (listener: () => void): (() => void) => {
		this.listen();
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	};

	setFocus(focus: EditorFocus | null): void {
		this.listen();
		if (sameFocus(focus, this.state.focus)) return;
		this.update({ focus, cursor: null });
	}

	private update(state: EditorFocusState): void {
		this.state = state;
		for (const listener of this.listeners) listener();
	}

	private listen(): void {
		if (this.listening || typeof document === 'undefined') return;
		this.listening = true;
		document.addEventListener('editor-cursor-update', this.handleCursorUpdate);
	}

	private readonly handleCursorUpdate = (event: Event) => {
		const detail = (event as CustomEvent<CursorUpdateDetail>).detail;
		const { focus } = this.state;
		if (!focus || !detail || typeof detail.line !== 'number') return;
		if (!isFocusedEditor(focus, detail)) return;
		this.update({
			focus,
			cursor: { line: detail.line, selection: detail.selection },
		});
	};
}

export const editorFocusService = new EditorFocusService();

const where = (cursor: EditorCursor | null): string => {
	if (!cursor) return '';
	const { selection } = cursor;
	if (selection && selection.fromLine !== selection.toLine) {
		return `, with lines ${selection.fromLine}-${selection.toLine} selected`;
	}
	if (selection) return `, with text selected on line ${selection.fromLine}`;
	return `, with the cursor on line ${cursor.line}`;
};

// The context sent to the agent ahead of the user's message, or null when
// nothing is open.
export const describeEditorFocus = ({
	focus,
	cursor,
}: EditorFocusState): string | null => {
	if (!focus) return null;
	let sentence: string;
	if (focus.kind === 'file' && focus.binary) {
		sentence = `The user is viewing ${focus.path} in TeXlyre.`;
	} else if (focus.kind === 'file' || focus.path) {
		sentence = `The user has ${focus.path} open in the TeXlyre editor${where(cursor)}.`;
	} else {
		sentence =
			`The user has the TeXlyre document "${focus.name}" open${where(cursor)}. ` +
			"It isn't a project file, so the project tools can't read it.";
	}
	return `<editor_context>\n${sentence}\n</editor_context>`;
};

// A short label for the same context, e.g. "main.tex:12" or "main.tex:3-8".
export const editorFocusLabel = ({
	focus,
	cursor,
}: EditorFocusState): string | null => {
	if (!focus) return null;
	const name =
		focus.kind === 'file' || focus.path
			? (focus.path ?? '').split('/').pop() || focus.path
			: focus.name;
	if (!name) return null;
	if (!cursor || (focus.kind === 'file' && focus.binary)) return name;
	const { selection } = cursor;
	if (selection && selection.fromLine !== selection.toLine) {
		return `${name}:${selection.fromLine}-${selection.toLine}`;
	}
	return `${name}:${cursor.line}`;
};
