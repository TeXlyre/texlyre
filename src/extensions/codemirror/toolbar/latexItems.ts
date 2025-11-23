// src/extensions/codemirror/toolbar/latexItems.ts
import type { EditorView } from '@codemirror/view';
import type { ToolbarItem } from 'codemirror-toolbar';
import { wrapSelection, insertText } from './helpers';
import { createTableCommand } from './tableItems';

export const createBold = (): ToolbarItem => ({
	key: 'latex-bold',
	label: 'Bold',
	icon: '<b>B</b>',
	command: (view: EditorView) => wrapSelection(view, '\\textbf{', '}'),
});

export const createItalic = (): ToolbarItem => ({
	key: 'latex-italic',
	label: 'Italic',
	icon: '<i>I</i>',
	command: (view: EditorView) => wrapSelection(view, '\\textit{', '}'),
});

export const createUnderline = (): ToolbarItem => ({
	key: 'latex-underline',
	label: 'Underline',
	icon: '<u>U</u>',
	command: (view: EditorView) => wrapSelection(view, '\\underline{', '}'),
});

export const createEmph = (): ToolbarItem => ({
	key: 'latex-emph',
	label: 'Emphasize',
	icon: '<em>E</em>',
	command: (view: EditorView) => wrapSelection(view, '\\emph{', '}'),
});

export const createTypewriter = (): ToolbarItem => ({
	key: 'latex-typewriter',
	label: 'Typewriter',
	icon: '<tt>T</tt>',
	command: (view: EditorView) => wrapSelection(view, '\\texttt{', '}'),
});

export const createSection = (): ToolbarItem => ({
	key: 'latex-section',
	label: 'Section',
	icon: 'H1',
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		const text = selectedText || '';
		return insertText(view, `\\section{${text}}\n`, -(text.length + 2));
	},
});

export const createSubsection = (): ToolbarItem => ({
	key: 'latex-subsection',
	label: 'Subsection',
	icon: 'H2',
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		const text = selectedText || '';
		return insertText(view, `\\subsection{${text}}\n`, -(text.length + 2));
	},
});

export const createSubsubsection = (): ToolbarItem => ({
	key: 'latex-subsubsection',
	label: 'Subsubsection',
	icon: 'H3',
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		const text = selectedText || '';
		return insertText(view, `\\subsubsection{${text}}\n`, -(text.length + 2));
	},
});

export const createItemize = (): ToolbarItem => ({
	key: 'latex-itemize',
	label: 'Itemize List',
	icon: '•',
	command: (view: EditorView) => {
		const text = '\\begin{itemize}\n\t\\item \n\\end{itemize}';
		return insertText(view, text, -14);
	},
});

export const createEnumerate = (): ToolbarItem => ({
	key: 'latex-enumerate',
	label: 'Enumerate List',
	icon: '1.',
	command: (view: EditorView) => {
		const text = '\\begin{enumerate}\n\t\\item \n\\end{enumerate}';
		return insertText(view, text, -16);
	},
});

export const createInlineMath = (): ToolbarItem => ({
	key: 'latex-inline-math',
	label: 'Inline Math',
	icon: '$',
	command: (view: EditorView) => wrapSelection(view, '$', '$'),
});

export const createDisplayMath = (): ToolbarItem => ({
	key: 'latex-display-math',
	label: 'Display Math',
	icon: '$$',
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		const text = `\\[\n\t${selectedText}\n\\]`;
		return insertText(view, text, selectedText ? -(selectedText.length + 3) : -3);
	},
});

export const createEquation = (): ToolbarItem => ({
	key: 'latex-equation',
	label: 'Equation',
	icon: '=',
	command: (view: EditorView) => {
		const text = '\\begin{equation}\n\t\n\\end{equation}';
		return insertText(view, text, -15);
	},
});

export const createFigure = (): ToolbarItem => ({
	key: 'latex-figure',
	label: 'Figure',
	icon: '🖼',
	command: (view: EditorView) => {
		const text = '\\begin{figure}[h]\n\t\\centering\n\t\\includegraphics[width=0.8\\textwidth]{}\n\t\\caption{}\n\t\\label{fig:}\n\\end{figure}';
		return insertText(view, text, -40);
	},
});

export const createTable = (): ToolbarItem => ({
	key: 'latex-table',
	label: 'Table',
	icon: '⊞',
	command: createTableCommand('latex'),
});

export const createVerbatim = (): ToolbarItem => ({
	key: 'latex-verbatim',
	label: 'Verbatim',
	icon: '&lt;/&gt;',
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		const text = `\\begin{verbatim}\n${selectedText}\n\\end{verbatim}`;
		return insertText(view, text, selectedText ? -(selectedText.length + 13) : -13);
	},
});

export const createLstlisting = (): ToolbarItem => ({
	key: 'latex-lstlisting',
	label: 'Code Listing',
	icon: '{}',
	command: (view: EditorView) => {
		const text = '\\begin{lstlisting}\n\t\n\\end{lstlisting}';
		return insertText(view, text, -18);
	},
});