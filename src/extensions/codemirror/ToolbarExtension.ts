// src/extensions/codemirror/ToolbarExtension.ts
import type { Extension } from '@codemirror/state';
import type { ToolbarSplit, ToolbarSpace } from 'codemirror-toolbar';
import toolbar from 'codemirror-toolbar';
import * as LaTeXItems from './toolbar/latexItems';
import * as TypstItems from './toolbar/typstItems';

const split: ToolbarSplit = { type: 'split' };
const space: ToolbarSpace = { type: 'space' };

export type FileType = 'latex' | 'typst';

export const createToolbarExtension = (fileType: FileType): Extension => {
	if (fileType === 'latex') {
		return toolbar({
			items: [
				LaTeXItems.createBold(),
				LaTeXItems.createItalic(),
				LaTeXItems.createUnderline(),
				LaTeXItems.createEmph(),
				LaTeXItems.createTypewriter(),
				split,
				LaTeXItems.createSection(),
				LaTeXItems.createSubsection(),
				LaTeXItems.createSubsubsection(),
				split,
				LaTeXItems.createItemize(),
				LaTeXItems.createEnumerate(),
				split,
				LaTeXItems.createInlineMath(),
				LaTeXItems.createDisplayMath(),
				LaTeXItems.createEquation(),
				split,
				LaTeXItems.createFigure(),
				LaTeXItems.createTable(),
				split,
				LaTeXItems.createVerbatim(),
				LaTeXItems.createLstlisting(),
			],
		});
	}

	return toolbar({
		items: [
			TypstItems.createBold(),
			TypstItems.createItalic(),
			TypstItems.createUnderline(),
			TypstItems.createStrike(),
			TypstItems.createMonospace(),
			split,
			TypstItems.createHeading1(),
			TypstItems.createHeading2(),
			TypstItems.createHeading3(),
			TypstItems.createHeading4(),
			split,
			TypstItems.createBulletList(),
			TypstItems.createNumberedList(),
			TypstItems.createTermList(),
			split,
			TypstItems.createInlineMath(),
			TypstItems.createDisplayMath(),
			TypstItems.createEquation(),
			split,
			TypstItems.createFigure(),
			TypstItems.createTable(),
			split,
			TypstItems.createInlineCode(),
			TypstItems.createCodeBlock(),
			split,
			TypstItems.createLink(),
			TypstItems.createQuote(),
		],
	});
};