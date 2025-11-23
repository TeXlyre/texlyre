// src/extensions/codemirror/ToolbarExtension.ts
import { type Extension, Compartment } from '@codemirror/state';
import type { ToolbarSplit, ToolbarSpace, ToolbarItem } from 'codemirror-toolbar';
import toolbar from 'codemirror-toolbar';
import { type EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import * as CodeMirrorItems from './toolbar/codemirrorItems';
import * as LaTeXItems from './toolbar/latexItems';
import * as TypstItems from './toolbar/typstItems';
import * as TableScopeItems from './toolbar/tableScopeItems';
import { detectTableScope } from './toolbar/tableScope';

const split: ToolbarSplit = { type: 'split' };
const space: ToolbarSpace = { type: 'space' };

export type FileType = 'latex' | 'typst';

const getBaseItems = (fileType: FileType) => {
	if (fileType === 'latex') {
		return [
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
			space,
			CodeMirrorItems.ToolbarfullScreen
		];
	}

	return [
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
		space,
		CodeMirrorItems.ToolbarfullScreen
	];
};

const getTableScopeItems = (fileType: FileType) => [
	space,
	split,
	TableScopeItems.createRowAddBefore(fileType),
	TableScopeItems.createRowAddAfter(fileType),
	TableScopeItems.createRowRemove(fileType),
	split,
	TableScopeItems.createColAddBefore(fileType),
	TableScopeItems.createColAddAfter(fileType),
	TableScopeItems.createColRemove(fileType),
];

function createTableScopePlugin(fileType: FileType, toolbarCompartment: Compartment) {
	return ViewPlugin.fromClass(
		class {
			private inTable = false;

			update(update: ViewUpdate) {
				if (!update.selectionSet && !update.docChanged) return;

				const nowInTable = detectTableScope(update.view, fileType) !== null;
				if (nowInTable !== this.inTable) {
					this.inTable = nowInTable;
					this.reconfigureToolbar(update.view, nowInTable, fileType, toolbarCompartment);
				}
			}

			private reconfigureToolbar(
				view: EditorView,
				inTable: boolean,
				type: FileType,
				compartment: Compartment
			) {
				const items = inTable
					? [...getBaseItems(type), ...getTableScopeItems(type)]
					: getBaseItems(type);

				requestAnimationFrame(() => {
					view.dispatch({
						effects: compartment.reconfigure(toolbar({ items })),
					});
				});
			}
		}
	);
}

export const createToolbarExtension = (fileType: FileType): Extension => {
	const toolbarCompartment = new Compartment();

	return [
		toolbarCompartment.of(toolbar({ items: getBaseItems(fileType) })),
		createTableScopePlugin(fileType, toolbarCompartment),
	];
};
