// src/extensions/codemirror/ToolbarExtension.ts
import type { Extension } from '@codemirror/state';
import type { ToolbarSplit } from 'codemirror-toolbar';
import toolbar from 'codemirror-toolbar';
import * as LaTeXItems from './toolbar/latexItems';
import * as TypstItems from './toolbar/typstItems';

// Define split item inline to avoid import issues
const split: ToolbarSplit = { type: 'split' };
const Items = { split };

export type FileType = 'latex' | 'typst';

/**
 * Creates a toolbar extension for LaTeX or Typst files
 */
export const createToolbarExtension = (fileType: FileType): Extension => {
	if (fileType === 'latex') {
		return toolbar({
			items: [
				LaTeXItems.bold,
				LaTeXItems.italic,
				LaTeXItems.underline,
				LaTeXItems.emph,
				LaTeXItems.typewriter,
				Items.split,
				LaTeXItems.section,
				LaTeXItems.subsection,
				LaTeXItems.subsubsection,
				Items.split,
				LaTeXItems.itemize,
				LaTeXItems.enumerate,
				Items.split,
				LaTeXItems.inlineMath,
				LaTeXItems.displayMath,
				LaTeXItems.equation,
				Items.split,
				LaTeXItems.figure,
				LaTeXItems.table,
				Items.split,
				LaTeXItems.verbatim,
				LaTeXItems.lstlisting,
			],
		});
	}

	// Typst toolbar
	return toolbar({
		items: [
			TypstItems.bold,
			TypstItems.italic,
			TypstItems.underline,
			TypstItems.strike,
			TypstItems.monospace,
			Items.split,
			TypstItems.heading1,
			TypstItems.heading2,
			TypstItems.heading3,
			TypstItems.heading4,
			Items.split,
			TypstItems.bulletList,
			TypstItems.numberedList,
			TypstItems.termList,
			Items.split,
			TypstItems.inlineMath,
			TypstItems.displayMath,
			TypstItems.equation,
			Items.split,
			TypstItems.figure,
			TypstItems.table,
			Items.split,
			TypstItems.inlineCode,
			TypstItems.codeBlock,
			Items.split,
			TypstItems.link,
			TypstItems.quote,
		],
	});
};
