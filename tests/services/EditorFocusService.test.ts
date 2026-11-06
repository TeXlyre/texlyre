import {
	describeEditorFocus,
	editorFocusLabel,
	editorFocusService,
} from '@src/services/EditorFocusService';

const cursorUpdate = (detail: Record<string, unknown>) =>
	document.dispatchEvent(new CustomEvent('editor-cursor-update', { detail }));

describe('EditorFocusService', () => {
	afterEach(() => editorFocusService.setFocus(null));

	it('follows the cursor of the focused file only', () => {
		editorFocusService.setFocus({
			kind: 'file',
			fileId: 'f1',
			path: '/main.tex',
			binary: false,
		});
		cursorUpdate({ line: 4, fileId: 'f1', isEditingFile: true });
		cursorUpdate({ line: 9, fileId: 'f2', isEditingFile: true });
		// The same file's document in the documents view is another editor.
		cursorUpdate({ line: 7, fileId: 'f1', documentId: 'd1', isEditingFile: false });

		expect(editorFocusService.getState().cursor).toEqual({
			line: 4,
			selection: undefined,
		});
	});

	it('forgets the cursor when the focus changes', () => {
		const listener = jest.fn();
		const unsubscribe = editorFocusService.subscribe(listener);
		editorFocusService.setFocus({ kind: 'document', documentId: 'd1', name: 'Notes' });
		cursorUpdate({ line: 2, documentId: 'd1', isEditingFile: false });
		expect(editorFocusService.getState().cursor?.line).toBe(2);

		editorFocusService.setFocus({ kind: 'document', documentId: 'd2', name: 'Other' });
		expect(editorFocusService.getState().cursor).toBeNull();
		// Setting the same focus again changes nothing.
		editorFocusService.setFocus({ kind: 'document', documentId: 'd2', name: 'Other' });
		expect(listener).toHaveBeenCalledTimes(3);
		unsubscribe();
	});
});

describe('describeEditorFocus', () => {
	const file = { kind: 'file' as const, fileId: 'f1', path: '/sec/a.tex', binary: false };

	it('names the file and the cursor line or selection', () => {
		expect(describeEditorFocus({ focus: file, cursor: null })).toBe(
			'<editor_context>\nThe user has /sec/a.tex open in the TeXlyre editor.\n</editor_context>',
		);
		expect(
			describeEditorFocus({
				focus: file,
				cursor: { line: 5, selection: { fromLine: 3, toLine: 5 } },
			}),
		).toContain('with lines 3-5 selected.');
		expect(
			describeEditorFocus({
				focus: file,
				cursor: { line: 5, selection: { fromLine: 5, toLine: 5 } },
			}),
		).toContain('with text selected on line 5.');
		expect(editorFocusLabel({ focus: file, cursor: { line: 5 } })).toBe('a.tex:5');
	});

	it('says when the tools cannot reach an open document', () => {
		const notes = { kind: 'document' as const, documentId: 'd1', name: 'Notes' };
		expect(describeEditorFocus({ focus: notes, cursor: { line: 1 } })).toBe(
			'<editor_context>\nThe user has the TeXlyre document "Notes" open, with the cursor on line 1. ' +
				"It isn't a project file, so the project tools can't read it.\n</editor_context>",
		);
		expect(editorFocusLabel({ focus: notes, cursor: null })).toBe('Notes');
	});

	it('uses the linked file for a linked document and skips lines for viewers', () => {
		const linked = {
			kind: 'document' as const,
			documentId: 'd1',
			name: 'main',
			path: '/main.tex',
		};
		expect(describeEditorFocus({ focus: linked, cursor: { line: 2 } })).toContain(
			'The user has /main.tex open in the TeXlyre editor, with the cursor on line 2.',
		);
		const pdf = { kind: 'file' as const, fileId: 'f2', path: '/fig.pdf', binary: true };
		expect(describeEditorFocus({ focus: pdf, cursor: null })).toContain(
			'The user is viewing /fig.pdf in TeXlyre.',
		);
		expect(editorFocusLabel({ focus: pdf, cursor: { line: 3 } })).toBe('fig.pdf');
		expect(describeEditorFocus({ focus: null, cursor: null })).toBeNull();
	});
});
