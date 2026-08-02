// src/extensions/codemirror/toolbar/rstItems.tsx
import type { EditorView } from '@codemirror/view';
import { renderToString } from 'react-dom/server';

import { t } from '@/i18n';
import {
	ToolbarBoldIcon,
	ToolbarItalicIcon,
	ToolbarSuperscriptIcon,
	ToolbarSubscriptIcon,
	ToolbarHeading1Icon,
	ToolbarHeading2Icon,
	ToolbarHeading3Icon,
	ToolbarBulletListIcon,
	ToolbarNumberListIcon,
	ToolbarTermListIcon,
	ToolbarMathInlineIcon,
	ToolbarMathBlockIcon,
	ToolbarCodeInlineIcon,
	ToolbarCodeBlockIcon,
	ToolbarHyperlinkIcon,
	ToolbarQuoteIcon,
	ToolbarCitationIcon,
	ToolbarReferenceIcon,
	ToolbarLabelIcon,
	ToolbarFootnoteIcon,
	ToolbarImageIcon,
	ToolbarTableIcon,
} from '../../../components/common/Icons';
import { getPendingImagePath } from '../PasteExtension';
import { wrapSelection, insertText } from './helpers';
import type { ToolbarItem } from './types';
import { createTableCommand } from './tableItems';

const selectedText = (view: EditorView): string => {
	const selection = view.state.selection.main;
	return view.state.doc.sliceString(selection.from, selection.to);
};

const insertHeading = (view: EditorView, adornment: string): boolean => {
	const title = selectedText(view) || 'Heading';
	const text = `${title}\n${adornment.repeat(title.length)}\n`;
	return insertText(view, text, -(title.length + 2));
};

export const createBold = (): ToolbarItem => ({
	key: 'rst-bold',
	label: t('Bold'),
	icon: renderToString(<ToolbarBoldIcon />),
	command: (view: EditorView) => wrapSelection(view, '**', '**'),
});

export const createItalic = (): ToolbarItem => ({
	key: 'rst-italic',
	label: t('Italic'),
	icon: renderToString(<ToolbarItalicIcon />),
	command: (view: EditorView) => wrapSelection(view, '*', '*'),
});

export const createSuperscript = (): ToolbarItem => ({
	key: 'rst-superscript',
	label: t('Superscript'),
	icon: renderToString(<ToolbarSuperscriptIcon />),
	command: (view: EditorView) => wrapSelection(view, ':sup:`', '`'),
});

export const createSubscript = (): ToolbarItem => ({
	key: 'rst-subscript',
	label: t('Subscript'),
	icon: renderToString(<ToolbarSubscriptIcon />),
	command: (view: EditorView) => wrapSelection(view, ':sub:`', '`'),
});

export const createSection = (): ToolbarItem => ({
	key: 'rst-section',
	label: t('Section'),
	icon: renderToString(<ToolbarHeading1Icon />),
	command: (view: EditorView) => insertHeading(view, '='),
});

export const createSubsection = (): ToolbarItem => ({
	key: 'rst-subsection',
	label: t('Subsection'),
	icon: renderToString(<ToolbarHeading2Icon />),
	command: (view: EditorView) => insertHeading(view, '-'),
});

export const createSubsubsection = (): ToolbarItem => ({
	key: 'rst-subsubsection',
	label: t('Subsubsection'),
	icon: renderToString(<ToolbarHeading3Icon />),
	command: (view: EditorView) => insertHeading(view, '~'),
});

export const createBulletList = (): ToolbarItem => ({
	key: 'rst-bullet-list',
	label: t('Bullet List'),
	icon: renderToString(<ToolbarBulletListIcon />),
	command: (view: EditorView) => insertText(view, '- ', 0),
});

export const createNumberedList = (): ToolbarItem => ({
	key: 'rst-numbered-list',
	label: t('Numbered List'),
	icon: renderToString(<ToolbarNumberListIcon />),
	command: (view: EditorView) => insertText(view, '#. ', 0),
});

export const createDefinitionList = (): ToolbarItem => ({
	key: 'rst-definition-list',
	label: t('Definition List'),
	icon: renderToString(<ToolbarTermListIcon />),
	command: (view: EditorView) => insertText(view, 'Term\n\tDefinition', -16),
});

export const createInlineMath = (): ToolbarItem => ({
	key: 'rst-inline-math',
	label: t('Inline Math'),
	icon: renderToString(<ToolbarMathInlineIcon />),
	command: (view: EditorView) => wrapSelection(view, ':math:`', '`'),
});

export const createDisplayMath = (): ToolbarItem => ({
	key: 'rst-display-math',
	label: t('Display Math'),
	icon: renderToString(<ToolbarMathBlockIcon />),
	command: (view: EditorView) => wrapSelection(view, '.. math::\n\n\t', '\n'),
});

export const createInlineCode = (): ToolbarItem => ({
	key: 'rst-inline-code',
	label: t('Inline Code'),
	icon: renderToString(<ToolbarCodeInlineIcon />),
	command: (view: EditorView) => wrapSelection(view, '``', '``'),
});

export const createCodeBlock = (): ToolbarItem => ({
	key: 'rst-code-block',
	label: t('Code Block'),
	icon: renderToString(<ToolbarCodeBlockIcon />),
	command: (view: EditorView) =>
		wrapSelection(view, '.. code-block::\n\n\t', '\n'),
});

export const createLink = (): ToolbarItem => ({
	key: 'rst-link',
	label: t('Link'),
	icon: renderToString(<ToolbarHyperlinkIcon />),
	command: (view: EditorView) => {
		const text = selectedText(view);
		return insertText(view, `\`${text} <>\`_`, text ? -3 : -4);
	},
});

export const createQuote = (): ToolbarItem => ({
	key: 'rst-quote',
	label: t('Quote'),
	icon: renderToString(<ToolbarQuoteIcon />),
	command: (view: EditorView) => wrapSelection(view, '\n\t', '\n'),
});

export const createCitation = (): ToolbarItem => ({
	key: 'rst-citation',
	label: t('Citation'),
	icon: renderToString(<ToolbarCitationIcon />),
	command: (view: EditorView) => {
		const text = selectedText(view);
		return insertText(view, `[${text}]_`, text ? 0 : -2);
	},
});

export const createReference = (): ToolbarItem => ({
	key: 'rst-reference',
	label: t('Reference'),
	icon: renderToString(<ToolbarReferenceIcon />),
	command: (view: EditorView) => wrapSelection(view, ':ref:`', '`'),
});

export const createLabel = (): ToolbarItem => ({
	key: 'rst-label',
	label: t('Label'),
	icon: renderToString(<ToolbarLabelIcon />),
	command: (view: EditorView) => {
		const text = selectedText(view);
		return insertText(view, `.. _${text}:\n`, text ? 0 : -2);
	},
});

export const createFootnote = (): ToolbarItem => ({
	key: 'rst-footnote',
	label: t('Footnote'),
	icon: renderToString(<ToolbarFootnoteIcon />),
	command: (view: EditorView) => insertText(view, '[#]_', 0),
});

export const createImage = (): ToolbarItem => ({
	key: 'rst-image',
	label: t('Image'),
	icon: renderToString(<ToolbarImageIcon />),
	command: (view: EditorView) => {
		const pastedPath = getPendingImagePath();
		const text = `.. image:: ${pastedPath || ''}\n\t:width: 80%\n`;
		return insertText(view, text, pastedPath ? 0 : -13);
	},
});

export const createTable = (): ToolbarItem => ({
	key: 'rst-table',
	label: t('Table'),
	icon: renderToString(<ToolbarTableIcon />),
	command: createTableCommand('rst'),
});
