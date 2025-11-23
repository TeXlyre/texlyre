// src/extensions/codemirror/toolbar/latexItems.ts
import type { EditorView } from '@codemirror/view';
import type { ToolbarItem } from 'codemirror-toolbar';

/**
 * Helper function to wrap selected text with LaTeX commands
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
	command: (view: EditorView) => wrapSelection(view, '\\textbf{', '}'),
};

export const italic: ToolbarItem = {
	label: 'Italic',
	icon: '<i>I</i>',
	command: (view: EditorView) => wrapSelection(view, '\\textit{', '}'),
};

export const underline: ToolbarItem = {
	label: 'Underline',
	icon: '<u>U</u>',
	command: (view: EditorView) => wrapSelection(view, '\\underline{', '}'),
};

export const emph: ToolbarItem = {
	label: 'Emphasize',
	icon: '<em>E</em>',
	command: (view: EditorView) => wrapSelection(view, '\\emph{', '}'),
};

export const typewriter: ToolbarItem = {
	label: 'Typewriter',
	icon: '<tt>T</tt>',
	command: (view: EditorView) => wrapSelection(view, '\\texttt{', '}'),
};

// Section headings
export const section: ToolbarItem = {
	label: 'Section',
	icon: 'H1',
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		const text = selectedText || 'Section Title';
		return insertText(view, `\\section{${text}}\n`, -(text.length + 2));
	},
};

export const subsection: ToolbarItem = {
	label: 'Subsection',
	icon: 'H2',
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		const text = selectedText || 'Subsection Title';
		return insertText(view, `\\subsection{${text}}\n`, -(text.length + 2));
	},
};

export const subsubsection: ToolbarItem = {
	label: 'Subsubsection',
	icon: 'H3',
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		const text = selectedText || 'Subsubsection Title';
		return insertText(view, `\\subsubsection{${text}}\n`, -(text.length + 2));
	},
};

// Lists
export const itemize: ToolbarItem = {
	label: 'Itemize List',
	icon: '•',
	command: (view: EditorView) => {
		const text = '\\begin{itemize}\n\t\\item \n\\end{itemize}';
		return insertText(view, text, -14);
	},
};

export const enumerate: ToolbarItem = {
	label: 'Enumerate List',
	icon: '1.',
	command: (view: EditorView) => {
		const text = '\\begin{enumerate}\n\t\\item \n\\end{enumerate}';
		return insertText(view, text, -16);
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
		const text = `\\[\n\t${selectedText}\n\\]`;
		return insertText(view, text, selectedText ? -(selectedText.length + 3) : -3);
	},
};

export const equation: ToolbarItem = {
	label: 'Equation',
	icon: '=',
	command: (view: EditorView) => {
		const text = '\\begin{equation}\n\t\n\\end{equation}';
		return insertText(view, text, -15);
	},
};

// Figure and table
export const figure: ToolbarItem = {
	label: 'Figure',
	icon: '🖼',
	command: (view: EditorView) => {
		const text = '\\begin{figure}[h]\n\t\\centering\n\t\\includegraphics[width=0.8\\textwidth]{}\n\t\\caption{}\n\t\\label{fig:}\n\\end{figure}';
		return insertText(view, text, -83);
	},
};

export const table: ToolbarItem = {
	label: 'Table',
	icon: '⊞',
	command: (view: EditorView) => {
		const text = '\\begin{table}[h]\n\t\\centering\n\t\\begin{tabular}{|c|c|}\n\t\t\\hline\n\t\t & \\\\\n\t\t\\hline\n\t\\end{tabular}\n\t\\caption{}\n\t\\label{tab:}\n\\end{table}';
		return insertText(view, text, -90);
	},
};

// Code
export const verbatim: ToolbarItem = {
	label: 'Verbatim',
	icon: '&lt;/&gt;',
	command: (view: EditorView) => {
		const selection = view.state.selection.main;
		const selectedText = view.state.doc.sliceString(selection.from, selection.to);
		const text = `\\begin{verbatim}\n${selectedText}\n\\end{verbatim}`;
		return insertText(view, text, selectedText ? -(selectedText.length + 13) : -13);
	},
};

export const lstlisting: ToolbarItem = {
	label: 'Code Listing',
	icon: '{}',
	command: (view: EditorView) => {
		const text = '\\begin{lstlisting}\n\t\n\\end{lstlisting}';
		return insertText(view, text, -16);
	},
};
