// src/extensions/codemirror/ToolbarExtension.ts
import { type Extension, Compartment } from '@codemirror/state';
import type { ToolbarSplit, ToolbarSpace, ToolbarItem } from 'codemirror-toolbar';
import toolbar from 'codemirror-toolbar';
import { type EditorView, ViewPlugin } from '@codemirror/view';
import type { UndoManager } from 'yjs';
import * as CodeMirrorItems from './toolbar/codemirrorItems';
import * as LaTeXItems from './toolbar/latexItems';
import * as TypstItems from './toolbar/typstItems';
import * as TableScopeItems from './toolbar/tableScopeItems';
import { detectTableScope } from './toolbar/tableScope';
import * as ColorScopeItems from './toolbar/colorScopeItems';
import { detectColorScope } from './toolbar/colorScope';

const split: ToolbarSplit = { type: 'split' };
const space: ToolbarSpace = { type: 'space' };

export type FileType = 'latex' | 'typst';

type ToolbarEntry = ToolbarItem | ToolbarSplit | ToolbarSpace;

const getTableScopeItems = (fileType: FileType): ToolbarEntry[] => [
	split,
	TableScopeItems.createRowAddBefore(fileType),
	TableScopeItems.createRowAddAfter(fileType),
	TableScopeItems.createRowRemove(fileType),
	split,
	TableScopeItems.createColAddBefore(fileType),
	TableScopeItems.createColAddAfter(fileType),
	TableScopeItems.createColRemove(fileType),
];

const getColorScopeItems = (fileType: FileType): ToolbarEntry[] => [
	split,
	ColorScopeItems.createColorEdit(fileType),
	ColorScopeItems.createColorRemove(fileType),
];

const getCommonEndItems = (isFullScreen: boolean, undoManager?: UndoManager): ToolbarEntry[] => [
	space,
	CodeMirrorItems.createUndo(undoManager),
	CodeMirrorItems.createRedo(undoManager),
	split,
	CodeMirrorItems.createFullScreen(isFullScreen),
];

const getItems = (fileType: FileType, isFullScreen: boolean, inTable: boolean, inColor: boolean, undoManager?: UndoManager): ToolbarEntry[] => {
	const tableItems = inTable ? getTableScopeItems(fileType) : [];
	const colorItems = inColor ? getColorScopeItems(fileType) : [];
	const endItems = getCommonEndItems(isFullScreen, undoManager);

	if (fileType === 'latex') {
		return [
			LaTeXItems.createBold(),
			LaTeXItems.createItalic(),
			LaTeXItems.createUnderline(),
			LaTeXItems.createStrikethrough(),
			LaTeXItems.createEmph(),
			LaTeXItems.createTypewriter(),
			split,
			LaTeXItems.createSuperscript(),
			LaTeXItems.createSubscript(),
			split,
			LaTeXItems.createSection(),
			LaTeXItems.createSubsection(),
			LaTeXItems.createSubsubsection(),
			split,
			LaTeXItems.createItemize(),
			LaTeXItems.createEnumerate(),
			LaTeXItems.createDescription(),
			split,
			LaTeXItems.createInlineMath(),
			LaTeXItems.createDisplayMath(),
			LaTeXItems.createEquation(),
			split,
			LaTeXItems.createVerbatim(),
			LaTeXItems.createLstlisting(),
			split,
			LaTeXItems.createHyperlink(),
			LaTeXItems.createQuote(),
			split,
			LaTeXItems.createCitation(),
			LaTeXItems.createReference(),
			LaTeXItems.createLabel(),
			LaTeXItems.createFootnote(),
			split,
			LaTeXItems.createFigure(),
			LaTeXItems.createTable(),
			split,
			LaTeXItems.createTextColor(),
			LaTeXItems.createHighlight(),
			...tableItems,
			...colorItems,
			...endItems,
		];
	}

	return [
		TypstItems.createBold(),
		TypstItems.createItalic(),
		TypstItems.createUnderline(),
		TypstItems.createStrike(),
		TypstItems.createMonospace(),
		split,
		TypstItems.createSuperscript(),
		TypstItems.createSubscript(),
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
		TypstItems.createInlineCode(),
		TypstItems.createCodeBlock(),
		split,
		TypstItems.createLink(),
		TypstItems.createQuote(),
		split,
		TypstItems.createCitation(),
		TypstItems.createReference(),
		TypstItems.createLabel(),
		TypstItems.createFootnote(),
		split,
		TypstItems.createFigure(),
		TypstItems.createTable(),
		split,
		TypstItems.createTextColor(),
		TypstItems.createHighlight(),
		...tableItems,
		...colorItems,
		...endItems,
	];
};

function createToolbarPlugin(fileType: FileType, toolbarCompartment: Compartment, undoManager?: UndoManager) {
	return ViewPlugin.fromClass(
		class {
			private inTable = false;
			private inColor = false;
			private isFullScreen = false;
			private boundFullScreenHandler: () => void;

			constructor(private view: EditorView) {
				this.boundFullScreenHandler = this.handleFullScreenChange.bind(this);
				view.dom.ownerDocument.addEventListener('fullscreenchange', this.boundFullScreenHandler);
			}

			update() {
				const nowInTable = detectTableScope(this.view, fileType) !== null;
				const nowInColor = detectColorScope(this.view, fileType) !== null;

				if (nowInTable !== this.inTable || nowInColor !== this.inColor) {
					this.inTable = nowInTable;
					this.inColor = nowInColor;
					this.reconfigureToolbar();
				}
			}

			private handleFullScreenChange() {
				const nowFullScreen = !!this.view.dom.ownerDocument.fullscreenElement;
				if (nowFullScreen !== this.isFullScreen) {
					this.isFullScreen = nowFullScreen;
					this.reconfigureToolbar();
				}
			}

			private reconfigureToolbar() {
				const items = getItems(fileType, this.isFullScreen, this.inTable, this.inColor, undoManager);

				requestAnimationFrame(() => {
					this.view.dispatch({
						effects: toolbarCompartment.reconfigure(toolbar({ items })),
					});
				});
			}

			destroy() {
				this.view.dom.ownerDocument.removeEventListener('fullscreenchange', this.boundFullScreenHandler);
			}
		}
	);
}

export const createToolbarExtension = (fileType: FileType, undoManager?: UndoManager): Extension => {
	const toolbarCompartment = new Compartment();

	return [
		toolbarCompartment.of(toolbar({ items: getItems(fileType, false, false, false, undoManager) })),
		createToolbarPlugin(fileType, toolbarCompartment, undoManager),
	];
};