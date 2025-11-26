// src/extensions/codemirror/toolbar/typstItems.tsx
import { t } from '@/i18n';
import type { EditorView } from '@codemirror/view';
import type { ToolbarItem } from 'codemirror-toolbar';
import { renderToString } from 'react-dom/server';

import { wrapSelection, insertText } from './helpers';
import { createTableCommand } from './tableItems';
import { ColorPicker } from './colorPicker';
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
	ToolbarSuperscriptIcon,
	ToolbarSubscriptIcon,
	ToolbarFootnoteIcon,
	ToolbarReferenceIcon,
	ToolbarLabelIcon,
	ToolbarColorIcon,
	ToolbarHyperlinkIcon,
	ToolbarQuoteIcon,
} from '../../../components/common/Icons';

const colorPickers = new WeakMap<EditorView, ColorPicker>();

export const createBold = (): ToolbarItem => ({
	key: 'typst-bold',
	label: t('Bold'),
	icon: renderToString(<ToolbarBoldIcon />),
	command: (view: EditorView) => wrapSelection(view, '*', '*'),
});

export const createItalic = (): ToolbarItem => ({
	key: 'typst-italic',
	label: t('Italic'),
	icon: renderToString(<ToolbarItalicIcon />),
	command: (view: EditorView) => wrapSelection(view, '_', '_'),
});

export const createStrike = (): ToolbarItem => ({
	key: 'typst-strike',
	label: t('Strikethrough'),
	icon: renderToString(<ToolbarStrikeIcon />),
	command: (view: EditorView) => wrapSelection(view, '#strike[', ']'),
});

export const createUnderline = (): ToolbarItem => ({
	key: 'typst-underline',
	label: t('Underline'),
	icon: renderToString(<ToolbarUnderlineIcon />),
	command: (view: EditorView) => wrapSelection(view, '#underline[', ']'),
});

export const createEmph = (): ToolbarItem => ({
	key: 'typst-emph',
	label: t('Emphasize'),
	icon: renderToString(<ToolbarItalicIcon />),
	command: (view: EditorView) => wrapSelection(view, '#emph[', ']'),
});

export const createMonospace = (): ToolbarItem => ({
	key: 'typst-monospace',
	label: t('Monospace'),
	icon: renderToString(<ToolbarMonospaceIcon />),
	command: (view: EditorView) => wrapSelection(view, '`', '`'),
});

export const createHeading1 = (): ToolbarItem => ({
	key: 'typst-heading1',
	label: t('Heading 1'),
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
	label: t('Heading 2'),
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
	label: t('Heading 3'),
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
	label: t('Heading 4'),
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
	label: t('Bullet List'),
	icon: renderToString(<ToolbarBulletListIcon />),
	command: (view: EditorView) => {
		const text = '- ';
		return insertText(view, text, 0);
	},
});

export const createNumberedList = (): ToolbarItem => ({
	key: 'typst-numbered-list',
	label: t('Numbered List'),
	icon: renderToString(<ToolbarNumberListIcon />),
	command: (view: EditorView) => {
		const text = '+ ';
		return insertText(view, text, 0);
	},
});

export const createTermList = (): ToolbarItem => ({
	key: 'typst-term-list',
	label: t('Term List'),
	icon: renderToString(<ToolbarTermListIcon />),
	command: (view: EditorView) => {
		const text = '/ Term: Definition';
		return insertText(view, text, -11);
	},
});

export const createInlineMath = (): ToolbarItem => ({
	key: 'typst-inline-math',
	label: t('Inline Math'),
	icon: renderToString(<ToolbarMathInlineIcon />),
	command: (view: EditorView) => wrapSelection(view, '$', '$'),
});

export const createDisplayMath = (): ToolbarItem => ({
	key: 'typst-display-math',
	label: t('Display Math'),
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
	label: t('Equation'),
	icon: renderToString(<ToolbarEquationIcon />),
	command: (view: EditorView) => {
		const text = '#math.equation[\n\t\n]';
		return insertText(view, text, -2);
	},
});

export const createFigure = (): ToolbarItem => ({
	key: 'typst-figure',
	label: t('Figure'),
	icon: renderToString(<ToolbarImageIcon />),
	command: (view: EditorView) => {
		const text = '#figure(\n\timage(""),\n\tcaption: []\n)';
		return insertText(view, text, -18);
	},
});

export const createTable = (): ToolbarItem => ({
	key: 'typst-table',
	label: t('Table'),
	icon: renderToString(<ToolbarTableIcon />),
	command: createTableCommand('typst'),
});

export const createInlineCode = (): ToolbarItem => ({
	key: 'typst-inline-code',
	label: t('Inline Code'),
	icon: renderToString(<ToolbarCodeInlineIcon />),
	command: (view: EditorView) => wrapSelection(view, '`', '`'),
});

export const createCodeBlock = (): ToolbarItem => ({
	key: 'typst-code-block',
	label: t('Code Block'),
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
	label: t('Raw Block'),
	icon: renderToString(<ToolbarCodeBlockIcon />),
	command: (view: EditorView) => {
		const text = '#raw(block: true, ```\n\n```)';
		return insertText(view, text, -5);
	},
});

export const createLink = (): ToolbarItem => ({
	key: 'typst-link',
	label: t('Link'),
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
	label: t('Quote'),
	icon: renderToString(<ToolbarQuoteIcon />),
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		const text = `#quote[\n${selectedText}\n]`;
		return insertText(view, text, selectedText ? -(selectedText.length + 2) : -2);
	},
});

export const createSuperscript = (): ToolbarItem => ({
	key: 'typst-superscript',
	label: t('Superscript'),
	icon: renderToString(<ToolbarSuperscriptIcon />),
	command: (view: EditorView) => wrapSelection(view, '#super[', ']'),
});

export const createSubscript = (): ToolbarItem => ({
	key: 'typst-subscript',
	label: t('Subscript'),
	icon: renderToString(<ToolbarSubscriptIcon />),
	command: (view: EditorView) => wrapSelection(view, '#sub[', ']'),
});

export const createFootnote = (): ToolbarItem => ({
	key: 'typst-footnote',
	label: t('Footnote'),
	icon: renderToString(<ToolbarFootnoteIcon />),
	command: (view: EditorView) => wrapSelection(view, '#footnote[', ']'),
});

export const createReference = (): ToolbarItem => ({
	key: 'typst-reference',
	label: t('Reference'),
	icon: renderToString(<ToolbarReferenceIcon />),
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		if (selectedText) {
			const text = `@${selectedText}`;
			return insertText(view, text, 0);
		}
		const text = '#ref()';
		return insertText(view, text, -1);
	},
});

export const createCitation = (): ToolbarItem => ({
	key: 'typst-citation',
	label: t('Citation'),
	icon: renderToString(<ToolbarReferenceIcon />),
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		if (selectedText) {
			const text = `@${selectedText}`;
			return insertText(view, text, 0);
		}
		const text = '#cite(<>)';
		return insertText(view, text, -2);
	},
});

export const createLabel = (): ToolbarItem => ({
	key: 'typst-label',
	label: t('Label'),
	icon: renderToString(<ToolbarLabelIcon />),
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		if (selectedText) {
			const text = `<${selectedText}>`;
			return insertText(view, text, 0);
		}
		const text = '#label()';
		return insertText(view, text, -1);
	},
});

export const createTextColor = (): ToolbarItem => ({
	key: 'typst-textcolor',
	label: t('Text Color'),
	icon: renderToString(<ToolbarColorIcon />),
	command: createColorCommand('typst', 'text'),
});

export const createHighlight = (): ToolbarItem => ({
	key: 'typst-highlight',
	label: t('Highlight'),
	icon: renderToString(<ToolbarColorIcon />),
	command: createColorCommand('typst', 'highlight'),
});

function createColorCommand(fileType: 'typst', type: 'text' | 'highlight') {
	return (view: EditorView): boolean => {
		const toolbar = view.dom.querySelector('.codemirror-toolbar');
		if (!toolbar) return false;

		const button = toolbar.querySelector(`[data-item="${fileType}-${type === 'text' ? 'textcolor' : 'highlight'}"]`) as HTMLElement;
		if (!button) return false;

		let picker = colorPickers.get(view);

		if (picker && !document.body.contains(picker.container) && !toolbar.contains(picker.container)) {
			picker.destroy();
			colorPickers.delete(view);
			picker = null;
		}

		if (!picker) {
			picker = new ColorPicker(view, button, {
				onSelect: (v, color) => {
					const selection = v.state.selection.main;
					const selectedText = v.state.doc.sliceString(selection.from, selection.to);
					const func = type === 'text' ? 'text' : 'highlight';
					const text = `#${func}(fill: rgb("${color}"))[${selectedText}]`;
					insertText(v, text, selectedText ? -(selectedText.length + 1) : -1);
				},
			});
			colorPickers.set(view, picker);
		}

		picker.toggle();
		return true;
	};
}