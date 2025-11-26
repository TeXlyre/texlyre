// src/extensions/codemirror/toolbar/latexItems.tsx
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
	ToolbarEmphIcon,
	ToolbarMonospaceIcon,
	ToolbarHeading1Icon,
	ToolbarHeading2Icon,
	ToolbarHeading3Icon,
	ToolbarBulletListIcon,
	ToolbarNumberListIcon,
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
	ToolbarCitationIcon,
	ToolbarLabelIcon,
	ToolbarColorIcon,
	ToolbarDescriptionIcon,
	ToolbarStrikeIcon,
	ToolbarQuoteIcon,
	ToolbarHyperlinkIcon
} from '../../../components/common/Icons';

const colorPickers = new WeakMap<EditorView, ColorPicker>();

export const createBold = (): ToolbarItem => ({
	key: 'latex-bold',
	label: t('Bold'),
	icon: renderToString(<ToolbarBoldIcon />),
	command: (view: EditorView) => wrapSelection(view, '\\textbf{', '}'),
});

export const createItalic = (): ToolbarItem => ({
	key: 'latex-italic',
	label: t('Italic'),
	icon: renderToString(<ToolbarItalicIcon />),
	command: (view: EditorView) => wrapSelection(view, '\\textit{', '}'),
});

export const createUnderline = (): ToolbarItem => ({
	key: 'latex-underline',
	label: t('Underline'),
	icon: renderToString(<ToolbarUnderlineIcon />),
	command: (view: EditorView) => wrapSelection(view, '\\underline{', '}'),
});

export const createEmph = (): ToolbarItem => ({
	key: 'latex-emph',
	label: t('Emphasize'),
	icon: renderToString(<ToolbarEmphIcon />),
	command: (view: EditorView) => wrapSelection(view, '\\emph{', '}'),
});

export const createTypewriter = (): ToolbarItem => ({
	key: 'latex-typewriter',
	label: t('Typewriter'),
	icon: renderToString(<ToolbarMonospaceIcon />),
	command: (view: EditorView) => wrapSelection(view, '\\texttt{', '}'),
});

export const createSection = (): ToolbarItem => ({
	key: 'latex-section',
	label: t('Section'),
	icon: renderToString(<ToolbarHeading1Icon />),
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		const text = selectedText || '';
		return insertText(view, `\\section{${text}}\n`, -(text.length + 2));
	},
});

export const createSubsection = (): ToolbarItem => ({
	key: 'latex-subsection',
	label: t('Subsection'),
	icon: renderToString(<ToolbarHeading2Icon />),
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		const text = selectedText || '';
		return insertText(view, `\\subsection{${text}}\n`, -(text.length + 2));
	},
});

export const createSubsubsection = (): ToolbarItem => ({
	key: 'latex-subsubsection',
	label: t('Subsubsection'),
	icon: renderToString(<ToolbarHeading3Icon />),
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		const text = selectedText || '';
		return insertText(view, `\\subsubsection{${text}}\n`, -(text.length + 2));
	},
});

export const createItemize = (): ToolbarItem => ({
	key: 'latex-itemize',
	label: t('Itemize List'),
	icon: renderToString(<ToolbarBulletListIcon />),
	command: (view: EditorView) => {
		const text = '\\begin{itemize}\n\t\\item \n\\end{itemize}';
		return insertText(view, text, -14);
	},
});

export const createEnumerate = (): ToolbarItem => ({
	key: 'latex-enumerate',
	label: t('Enumerate List'),
	icon: renderToString(<ToolbarNumberListIcon />),
	command: (view: EditorView) => {
		const text = '\\begin{enumerate}\n\t\\item \n\\end{enumerate}';
		return insertText(view, text, -16);
	},
});

export const createInlineMath = (): ToolbarItem => ({
	key: 'latex-inline-math',
	label: t('Inline Math'),
	icon: renderToString(<ToolbarMathInlineIcon />),
	command: (view: EditorView) => wrapSelection(view, '$', '$'),
});

export const createDisplayMath = (): ToolbarItem => ({
	key: 'latex-display-math',
	label: t('Display Math'),
	icon: renderToString(<ToolbarMathBlockIcon />),
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		const text = `\\[\n\t${selectedText}\n\\]`;
		return insertText(view, text, selectedText ? -(selectedText.length + 3) : -3);
	},
});

export const createEquation = (): ToolbarItem => ({
	key: 'latex-equation',
	label: t('Equation'),
	icon: renderToString(<ToolbarEquationIcon />),
	command: (view: EditorView) => {
		const text = '\\begin{equation}\n\t\n\\end{equation}';
		return insertText(view, text, -15);
	},
});

export const createFigure = (): ToolbarItem => ({
	key: 'latex-figure',
	label: t('Figure'),
	icon: renderToString(<ToolbarImageIcon />),
	command: (view: EditorView) => {
		const text = '\\begin{figure}[h]\n\t\\centering\n\t\\includegraphics[width=0.8\\textwidth]{}\n\t\\caption{}\n\t\\label{fig:}\n\\end{figure}';
		return insertText(view, text, -40);
	},
});

export const createTable = (): ToolbarItem => ({
	key: 'latex-table',
	label: t('Table'),
	icon: renderToString(<ToolbarTableIcon />),
	command: createTableCommand('latex'),
});

export const createVerbatim = (): ToolbarItem => ({
	key: 'latex-verbatim',
	label: t('Verbatim'),
	icon: renderToString(<ToolbarCodeInlineIcon />),
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		const text = `\\begin{verbatim}\n${selectedText}\n\\end{verbatim}`;
		return insertText(view, text, selectedText ? -(selectedText.length + 13) : -13);
	},
});

export const createLstlisting = (): ToolbarItem => ({
	key: 'latex-lstlisting',
	label: t('Code Listing'),
	icon: renderToString(<ToolbarCodeBlockIcon />),
	command: (view: EditorView) => {
		const text = '\\begin{lstlisting}\n\t\n\\end{lstlisting}';
		return insertText(view, text, -18);
	},
});

export const createSuperscript = (): ToolbarItem => ({
	key: 'latex-superscript',
	label: t('Superscript'),
	icon: renderToString(<ToolbarSuperscriptIcon />),
	command: (view: EditorView) => wrapSelection(view, '\\textsuperscript{', '}'),
});

export const createSubscript = (): ToolbarItem => ({
	key: 'latex-subscript',
	label: t('Subscript'),
	icon: renderToString(<ToolbarSubscriptIcon />),
	command: (view: EditorView) => wrapSelection(view, '\\textsubscript{', '}'),
});

export const createStrikethrough = (): ToolbarItem => ({
	key: 'latex-strikethrough',
	label: t('Strikethrough'),
	icon: renderToString(<ToolbarStrikeIcon />),
	command: (view: EditorView) => wrapSelection(view, '\\sout{', '}'),
});

export const createQuote = (): ToolbarItem => ({
	key: 'latex-quote',
	label: t('Quote'),
	icon: renderToString(<ToolbarQuoteIcon />),
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		const text = `\\begin{quote}\n${selectedText}\n\\end{quote}`;
		return insertText(view, text, selectedText ? -(selectedText.length + 11) : -11);
	},
});

export const createHyperlink = (): ToolbarItem => ({
	key: 'latex-hyperlink',
	label: t('Hyperlink'),
	icon: renderToString(<ToolbarHyperlinkIcon />),
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		if (selectedText) {
			const text = `\\href{}{${selectedText}}`;
			return insertText(view, text, -(selectedText.length + 2));
		}
		const text = '\\href{}{}';
		return insertText(view, text, -3);
	},
});

export const createCitation = (): ToolbarItem => ({
	key: 'latex-citation',
	label: t('Citation'),
	icon: renderToString(<ToolbarCitationIcon />),
	command: (view: EditorView) => wrapSelection(view, '\\cite{', '}'),
});

export const createReference = (): ToolbarItem => ({
	key: 'latex-reference',
	label: t('Reference'),
	icon: renderToString(<ToolbarReferenceIcon />),
	command: (view: EditorView) => wrapSelection(view, '\\ref{', '}'),
});

export const createLabel = (): ToolbarItem => ({
	key: 'latex-label',
	label: t('Label'),
	icon: renderToString(<ToolbarLabelIcon />),
	command: (view: EditorView) => wrapSelection(view, '\\label{', '}'),
});

export const createFootnote = (): ToolbarItem => ({
	key: 'latex-footnote',
	label: t('Footnote'),
	icon: renderToString(<ToolbarFootnoteIcon />),
	command: (view: EditorView) => wrapSelection(view, '\\footnote{', '}'),
});

export const createDescription = (): ToolbarItem => ({
	key: 'latex-description',
	label: t('Description List'),
	icon: renderToString(<ToolbarDescriptionIcon />),
	command: (view: EditorView) => {
		const text = '\\begin{description}\n\t\\item[Term] Description\n\\end{description}';
		return insertText(view, text, -18);
	},
});

export const createTextColor = (): ToolbarItem => ({
	key: 'latex-textcolor',
	label: t('Text Color'),
	icon: renderToString(<ToolbarColorIcon />),
	command: createColorCommand('latex', 'text'),
});

export const createHighlight = (): ToolbarItem => ({
	key: 'latex-highlight',
	label: t('Highlight'),
	icon: renderToString(<ToolbarColorIcon />),
	command: createColorCommand('latex', 'highlight'),
});

function createColorCommand(fileType: 'latex', type: 'text' | 'highlight') {
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
					const text = type === 'text'
						? `\\textcolor[HTML]{${color.substring(1)}}{${selectedText}}`
						: `\\colorbox{${color}}{${selectedText}}`;
					insertText(v, text, selectedText ? -(selectedText.length + 1) : -1);
				},
			});
			colorPickers.set(view, picker);
		}

		picker.toggle();
		return true;
	};
}
