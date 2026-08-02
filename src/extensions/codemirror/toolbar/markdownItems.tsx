// src/extensions/codemirror/toolbar/markdownItems.tsx
import type { EditorView } from '@codemirror/view';
import {
	bold,
	italic,
	strike,
	quote,
	link,
	h1,
	h2,
	h3,
	ul,
	ol,
	todo,
} from 'codemirror-markdown-commands';
import { renderToString } from 'react-dom/server';

import { t } from '@/i18n';
import {
	ToolbarBoldIcon,
	ToolbarItalicIcon,
	ToolbarStrikeIcon,
	ToolbarHeading1Icon,
	ToolbarHeading2Icon,
	ToolbarHeading3Icon,
	ToolbarBulletListIcon,
	ToolbarNumberListIcon,
	ToolbarTaskListIcon,
	ToolbarMathInlineIcon,
	ToolbarMathBlockIcon,
	ToolbarCodeInlineIcon,
	ToolbarCodeBlockIcon,
	ToolbarHyperlinkIcon,
	ToolbarQuoteIcon,
	ToolbarImageIcon,
	ToolbarTableIcon,
	MinusIcon,
} from '../../../components/common/Icons';
import { getPendingImagePath } from '../PasteExtension';
import { wrapSelection, insertText } from './helpers';
import type { ToolbarItem } from './types';
import { createTableCommand } from './tableItems';

export const createBold = (): ToolbarItem => ({
	key: 'markdown-bold',
	label: t('Bold'),
	icon: renderToString(<ToolbarBoldIcon />),
	command: bold,
});

export const createItalic = (): ToolbarItem => ({
	key: 'markdown-italic',
	label: t('Italic'),
	icon: renderToString(<ToolbarItalicIcon />),
	command: italic,
});

export const createStrike = (): ToolbarItem => ({
	key: 'markdown-strike',
	label: t('Strikethrough'),
	icon: renderToString(<ToolbarStrikeIcon />),
	command: strike,
});

export const createDivider = (): ToolbarItem => ({
	key: 'markdown-divider',
	label: t('Divider'),
	icon: renderToString(<MinusIcon />),
	command: (view: EditorView) => insertText(view, '\n---\n', 0),
});

export const createHeading1 = (): ToolbarItem => ({
	key: 'markdown-heading1',
	label: t('Heading 1'),
	icon: renderToString(<ToolbarHeading1Icon />),
	command: h1,
});

export const createHeading2 = (): ToolbarItem => ({
	key: 'markdown-heading2',
	label: t('Heading 2'),
	icon: renderToString(<ToolbarHeading2Icon />),
	command: h2,
});

export const createHeading3 = (): ToolbarItem => ({
	key: 'markdown-heading3',
	label: t('Heading 3'),
	icon: renderToString(<ToolbarHeading3Icon />),
	command: h3,
});

export const createBulletList = (): ToolbarItem => ({
	key: 'markdown-bullet-list',
	label: t('Bullet List'),
	icon: renderToString(<ToolbarBulletListIcon />),
	command: ul,
});

export const createNumberedList = (): ToolbarItem => ({
	key: 'markdown-numbered-list',
	label: t('Numbered List'),
	icon: renderToString(<ToolbarNumberListIcon />),
	command: ol,
});

export const createTaskList = (): ToolbarItem => ({
	key: 'markdown-task-list',
	label: t('Task List'),
	icon: renderToString(<ToolbarTaskListIcon />),
	command: todo,
});

export const createInlineMath = (): ToolbarItem => ({
	key: 'markdown-inline-math',
	label: t('Inline Math'),
	icon: renderToString(<ToolbarMathInlineIcon />),
	command: (view: EditorView) => wrapSelection(view, '$', '$'),
});

export const createDisplayMath = (): ToolbarItem => ({
	key: 'markdown-display-math',
	label: t('Display Math'),
	icon: renderToString(<ToolbarMathBlockIcon />),
	command: (view: EditorView) => wrapSelection(view, '$$\n', '\n$$'),
});

export const createInlineCode = (): ToolbarItem => ({
	key: 'markdown-inline-code',
	label: t('Inline Code'),
	icon: renderToString(<ToolbarCodeInlineIcon />),
	command: (view: EditorView) => wrapSelection(view, '`', '`'),
});

export const createCodeBlock = (): ToolbarItem => ({
	key: 'markdown-code-block',
	label: t('Code Block'),
	icon: renderToString(<ToolbarCodeBlockIcon />),
	command: (view: EditorView) => wrapSelection(view, '```\n', '\n```'),
});

export const createLink = (): ToolbarItem => ({
	key: 'markdown-link',
	label: t('Link'),
	icon: renderToString(<ToolbarHyperlinkIcon />),
	command: link,
});

export const createQuote = (): ToolbarItem => ({
	key: 'markdown-quote',
	label: t('Quote'),
	icon: renderToString(<ToolbarQuoteIcon />),
	command: quote,
});

export const createImage = (): ToolbarItem => ({
	key: 'markdown-image',
	label: t('Image'),
	icon: renderToString(<ToolbarImageIcon />),
	command: (view: EditorView) => {
		const pastedPath = getPendingImagePath();
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(
			selection.from,
			selection.to,
		);
		const text = `![${selectedText}](${pastedPath || ''})`;
		return insertText(view, text, pastedPath ? 0 : -1);
	},
});

export const createTable = (): ToolbarItem => ({
	key: 'markdown-table',
	label: t('Table'),
	icon: renderToString(<ToolbarTableIcon />),
	command: createTableCommand('markdown'),
});
