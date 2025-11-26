// src/extensions/codemirror/ToolbarExtension.ts
import { type Extension, Compartment } from '@codemirror/state';
import type { ToolbarSplit, ToolbarSpace, ToolbarItem } from 'codemirror-toolbar';
import toolbar from 'codemirror-toolbar';
import { type EditorView, ViewPlugin } from '@codemirror/view';
import * as CodeMirrorItems from './toolbar/codemirrorItems';
import * as LaTeXItems from './toolbar/latexItems';
import * as TypstItems from './toolbar/typstItems';
import * as TableScopeItems from './toolbar/tableScopeItems';
import { detectTableScope } from './toolbar/tableScope';

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

const getCommonEndItems = (isFullScreen: boolean): ToolbarEntry[] => [
	space,
	CodeMirrorItems.createUndo(),
	CodeMirrorItems.createRedo(),
	split,
	CodeMirrorItems.createFullScreen(isFullScreen),
];

const getItems = (fileType: FileType, isFullScreen: boolean, inTable: boolean): ToolbarEntry[] => {
	const tableItems = inTable ? getTableScopeItems(fileType) : [];
	const endItems = getCommonEndItems(isFullScreen);

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
			LaTeXItems.createFigure(),
			LaTeXItems.createTable(),
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
			LaTeXItems.createTextColor(),
			...tableItems,
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
		TypstItems.createFigure(),
		TypstItems.createTable(),
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
		TypstItems.createTextColor(),
		...tableItems,
		...endItems,
	];
};

function createToolbarPlugin(fileType: FileType, toolbarCompartment: Compartment) {
	return ViewPlugin.fromClass(
		class {
			private inTable = false;
			private isFullScreen = false;
			private boundFullScreenHandler: () => void;

			constructor(private view: EditorView) {
				this.boundFullScreenHandler = this.handleFullScreenChange.bind(this);
				view.dom.ownerDocument.addEventListener('fullscreenchange', this.boundFullScreenHandler);
			}

			update() {
				const nowInTable = detectTableScope(this.view, fileType) !== null;
				if (nowInTable !== this.inTable) {
					this.inTable = nowInTable;
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
				const items = getItems(fileType, this.isFullScreen, this.inTable);

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

export const createToolbarExtension = (fileType: FileType): Extension => {
	const toolbarCompartment = new Compartment();

	return [
		toolbarCompartment.of(toolbar({ items: getItems(fileType, false, false) })),
		createToolbarPlugin(fileType, toolbarCompartment),
	];
};