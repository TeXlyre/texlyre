// src/extensions/codemirror/toolbar/typstItems.ts
import type { EditorView } from '@codemirror/view';
import type { ToolbarItem } from 'codemirror-toolbar';

/**
 * Helper function to wrap selected text with Typst commands
 */
const wrapSelection = (view: EditorView, before: string, after: string): boolean => {
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

/**
 * Helper function to insert text at cursor or replace selection
 */
const insertText = (view: EditorView, text: string, cursorOffset: number = 0): boolean => {
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

// Text formatting items
export const bold: ToolbarItem = {
	label: 'Bold',
	icon: '<b>B</b>',
	command: (view: EditorView) => wrapSelection(view, '*', '*'),
};

export const italic: ToolbarItem = {
	label: 'Italic',
	icon: '<i>I</i>',
	command: (view: EditorView) => wrapSelection(view, '_', '_'),
};

export const strike: ToolbarItem = {
	label: 'Strikethrough',
	icon: '<s>S</s>',
	command: (view: EditorView) => wrapSelection(view, '#strike[', ']'),
};

export const underline: ToolbarItem = {
	label: 'Underline',
	icon: '<u>U</u>',
	command: (view: EditorView) => wrapSelection(view, '#underline[', ']'),
};

export const emph: ToolbarItem = {
	label: 'Emphasize',
	icon: '<em>E</em>',
	command: (view: EditorView) => wrapSelection(view, '#emph[', ']'),
};

export const monospace: ToolbarItem = {
	label: 'Monospace',
	icon: '<tt>T</tt>',
	command: (view: EditorView) => wrapSelection(view, '`', '`'),
};

// Section headings
export const heading1: ToolbarItem = {
	label: 'Heading 1',
	icon: 'H1',
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		const text = selectedText || 'Heading';
		return insertText(view, `= ${text}\n`, -(text.length + 1));
	},
};

export const heading2: ToolbarItem = {
	label: 'Heading 2',
	icon: 'H2',
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		const text = selectedText || 'Heading';
		return insertText(view, `== ${text}\n`, -(text.length + 1));
	},
};

export const heading3: ToolbarItem = {
	label: 'Heading 3',
	icon: 'H3',
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		const text = selectedText || 'Heading';
		return insertText(view, `=== ${text}\n`, -(text.length + 1));
	},
};

export const heading4: ToolbarItem = {
	label: 'Heading 4',
	icon: 'H4',
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		const text = selectedText || 'Heading';
		return insertText(view, `==== ${text}\n`, -(text.length + 1));
	},
};

// Lists
export const bulletList: ToolbarItem = {
	label: 'Bullet List',
	icon: '•',
	command: (view: EditorView) => {
		const text = '- ';
		return insertText(view, text, 0);
	},
};

export const numberedList: ToolbarItem = {
	label: 'Numbered List',
	icon: '1.',
	command: (view: EditorView) => {
		const text = '+ ';
		return insertText(view, text, 0);
	},
};

export const termList: ToolbarItem = {
	label: 'Term List',
	icon: '/',
	command: (view: EditorView) => {
		const text = '/ Term: Definition';
		return insertText(view, text, -11);
	},
};

// Math
export const inlineMath: ToolbarItem = {
	label: 'Inline Math',
	icon: '$',
	command: (view: EditorView) => wrapSelection(view, '$', '$'),
};

export const displayMath: ToolbarItem = {
	label: 'Display Math',
	icon: '$$',
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		const text = `$ ${selectedText} $`;
		return insertText(view, text, selectedText ? -(selectedText.length + 2) : -2);
	},
};

export const equation: ToolbarItem = {
	label: 'Equation',
	icon: '=',
	command: (view: EditorView) => {
		const text = '#math.equation[\n\t\n]';
		return insertText(view, text, -2);
	},
};

// Figure and table
export const figure: ToolbarItem = {
	label: 'Figure',
	icon: '🖼',
	command: (view: EditorView) => {
		const text = '#figure(\n\timage(""),\n\tcaption: []\n)';
		return insertText(view, text, -22);
	},
};

export const table: ToolbarItem = {
	label: 'Table',
	icon: '⊞',
	command: (view: EditorView) => {
		const text = '#table(\n\tcolumns: 2,\n\t[Header 1], [Header 2],\n\t[], []\n)';
		return insertText(view, text, -8);
	},
};

// Code
export const inlineCode: ToolbarItem = {
	label: 'Inline Code',
	icon: '&lt;/&gt;',
	command: (view: EditorView) => wrapSelection(view, '`', '`'),
};

export const codeBlock: ToolbarItem = {
	label: 'Code Block',
	icon: '{}',
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		const text = `\`\`\`\n${selectedText}\n\`\`\``;
		return insertText(view, text, selectedText ? -(selectedText.length + 4) : -4);
	},
};

export const rawBlock: ToolbarItem = {
	label: 'Raw Block',
	icon: '`',
	command: (view: EditorView) => {
		const text = '#raw(block: true, ```\n\n```)';
		return insertText(view, text, -5);
	},
};

// Link
export const link: ToolbarItem = {
	label: 'Link',
	icon: '🔗',
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		if (selectedText) {
			const text = `#link("")[${selectedText}]`;
			return insertText(view, text, -(selectedText.length + 3));
		}
		const text = '#link("")[]';
		return insertText(view, text, -4);
	},
};

// Quote
export const quote: ToolbarItem = {
	label: 'Quote',
	icon: '"',
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		const text = `#quote[\n${selectedText}\n]`;
		return insertText(view, text, selectedText ? -(selectedText.length + 2) : -2);
	},
};
