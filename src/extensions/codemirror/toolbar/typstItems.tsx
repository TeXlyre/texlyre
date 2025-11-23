// src/extensions/codemirror/toolbar/typstItems.tsx
import type { EditorView } from '@codemirror/view';
import type { ToolbarItem } from 'codemirror-toolbar';
import { renderToString } from 'react-dom/server';
import {
	ToolbarBoldIcon,
	ToolbarItalicIcon,
	ToolbarUnderlineIcon,
	ToolbarStrikeIcon,
	ToolbarMonospaceIcon,
	ToolbarHeading1Icon,
	ToolbarHeading2Icon,
	ToolbarHeading3Icon,
	ToolbarHeading4Icon,
	ToolbarBulletListIcon,
	ToolbarNumberListIcon,
	ToolbarTermListIcon,
	ToolbarMathInlineIcon,
	ToolbarMathBlockIcon,
	ToolbarEquationIcon,
	ToolbarImageIcon,
	ToolbarTableIcon,
	ToolbarCodeInlineIcon,
	ToolbarCodeBlockIcon,
	ToolbarHyperlinkIcon,
	ToolbarQuoteIcon,
} from '@/components/common/Icons';
import { wrapSelection, insertText } from './helpers';
import { createTableCommand } from './tableItems';

export const createBold = (): ToolbarItem => ({
	key: 'typst-bold',
	label: 'Bold',
	icon: renderToString(<ToolbarBoldIcon />),
	command: (view: EditorView) => wrapSelection(view, '*', '*'),
});

export const createItalic = (): ToolbarItem => ({
	key: 'typst-italic',
	label: 'Italic',
	icon: renderToString(<ToolbarItalicIcon />),
	command: (view: EditorView) => wrapSelection(view, '_', '_'),
});

export const createStrike = (): ToolbarItem => ({
	key: 'typst-strike',
	label: 'Strikethrough',
	icon: renderToString(<ToolbarStrikeIcon />),
	command: (view: EditorView) => wrapSelection(view, '#strike[', ']'),
});

export const createUnderline = (): ToolbarItem => ({
	key: 'typst-underline',
	label: 'Underline',
	icon: renderToString(<ToolbarUnderlineIcon />),
	command: (view: EditorView) => wrapSelection(view, '#underline[', ']'),
});

export const createEmph = (): ToolbarItem => ({
	key: 'typst-emph',
	label: 'Emphasize',
	icon: renderToString(<ToolbarItalicIcon />),
	command: (view: EditorView) => wrapSelection(view, '#emph[', ']'),
});

export const createMonospace = (): ToolbarItem => ({
	key: 'typst-monospace',
	label: 'Monospace',
	icon: renderToString(<ToolbarMonospaceIcon />),
	command: (view: EditorView) => wrapSelection(view, '`', '`'),
});

export const createHeading1 = (): ToolbarItem => ({
	key: 'typst-heading1',
	label: 'Heading 1',
	icon: renderToString(<ToolbarHeading1Icon />),
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		const text = selectedText || 'Heading';
		return insertText(view, `= ${text}\n`, -(text.length + 1));
	},
});

export const createHeading2 = (): ToolbarItem => ({
	key: 'typst-heading2',
	label: 'Heading 2',
	icon: renderToString(<ToolbarHeading2Icon />),
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		const text = selectedText || 'Heading';
		return insertText(view, `== ${text}\n`, -(text.length + 1));
	},
});

export const createHeading3 = (): ToolbarItem => ({
	key: 'typst-heading3',
	label: 'Heading 3',
	icon: renderToString(<ToolbarHeading3Icon />),
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		const text = selectedText || 'Heading';
		return insertText(view, `=== ${text}\n`, -(text.length + 1));
	},
});

export const createHeading4 = (): ToolbarItem => ({
	key: 'typst-heading4',
	label: 'Heading 4',
	icon: renderToString(<ToolbarHeading4Icon />),
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		const text = selectedText || 'Heading';
		return insertText(view, `==== ${text}\n`, -(text.length + 1));
	},
});

export const createBulletList = (): ToolbarItem => ({
	key: 'typst-bullet-list',
	label: 'Bullet List',
	icon: renderToString(<ToolbarBulletListIcon />),
	command: (view: EditorView) => {
		const text = '- ';
		return insertText(view, text, 0);
	},
});

export const createNumberedList = (): ToolbarItem => ({
	key: 'typst-numbered-list',
	label: 'Numbered List',
	icon: renderToString(<ToolbarNumberListIcon />),
	command: (view: EditorView) => {
		const text = '+ ';
		return insertText(view, text, 0);
	},
});

export const createTermList = (): ToolbarItem => ({
	key: 'typst-term-list',
	label: 'Term List',
	icon: renderToString(<ToolbarTermListIcon />),
	command: (view: EditorView) => {
		const text = '/ Term: Definition';
		return insertText(view, text, -11);
	},
});

export const createInlineMath = (): ToolbarItem => ({
	key: 'typst-inline-math',
	label: 'Inline Math',
	icon: renderToString(<ToolbarMathInlineIcon />),
	command: (view: EditorView) => wrapSelection(view, '$', '$'),
});

export const createDisplayMath = (): ToolbarItem => ({
	key: 'typst-display-math',
	label: 'Display Math',
	icon: renderToString(<ToolbarMathBlockIcon />),
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		const text = `$ ${selectedText} $`;
		return insertText(view, text, selectedText ? -(selectedText.length + 2) : -2);
	},
});

export const createEquation = (): ToolbarItem => ({
	key: 'typst-equation',
	label: 'Equation',
	icon: renderToString(<ToolbarEquationIcon />),
	command: (view: EditorView) => {
		const text = '#math.equation[\n\t\n]';
		return insertText(view, text, -2);
	},
});

export const createFigure = (): ToolbarItem => ({
	key: 'typst-figure',
	label: 'Figure',
	icon: renderToString(<ToolbarImageIcon />),
	command: (view: EditorView) => {
		const text = '#figure(\n\timage(""),\n\tcaption: []\n)';
		return insertText(view, text, -22);
	},
});

export const createTable = (): ToolbarItem => ({
	key: 'typst-table',
	label: 'Table',
	icon: renderToString(<ToolbarTableIcon />),
	command: createTableCommand('typst'),
});

export const createInlineCode = (): ToolbarItem => ({
	key: 'typst-inline-code',
	label: 'Inline Code',
	icon: renderToString(<ToolbarCodeInlineIcon />),
	command: (view: EditorView) => wrapSelection(view, '`', '`'),
});

export const createCodeBlock = (): ToolbarItem => ({
	key: 'typst-code-block',
	label: 'Code Block',
	icon: renderToString(<ToolbarCodeBlockIcon />),
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		const text = `\`\`\`\n${selectedText}\n\`\`\``;
		return insertText(view, text, selectedText ? -(selectedText.length + 4) : -4);
	},
});

export const createRawBlock = (): ToolbarItem => ({
	key: 'typst-raw-block',
	label: 'Raw Block',
	icon: renderToString(<ToolbarCodeBlockIcon />),
	command: (view: EditorView) => {
		const text = '#raw(block: true, ```\n\n```)';
		return insertText(view, text, -5);
	},
});

export const createLink = (): ToolbarItem => ({
	key: 'typst-link',
	label: 'Link',
	icon: renderToString(<ToolbarHyperlinkIcon />),
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
});

export const createQuote = (): ToolbarItem => ({
	key: 'typst-quote',
	label: 'Quote',
	icon: renderToString(<ToolbarQuoteIcon />),
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		const text = `#quote[\n${selectedText}\n]`;
		return insertText(view, text, selectedText ? -(selectedText.length + 2) : -2);
	},
});