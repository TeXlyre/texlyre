// src/extensions/codemirror/ToolbarExtension.ts
import { type Extension, Compartment } from '@codemirror/state';
import type { ToolbarSplit, ToolbarSpace, ToolbarItem } from 'codemirror-toolbar';
import toolbar from 'codemirror-toolbar';
import { type EditorView, ViewPlugin } from '@codemirror/view';
import type { UndoManager } from 'yjs';

import { createCollapsableToolbar } from './toolbar/collapsableToolbar';
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

const toolbarCommandsByView = new WeakMap<EditorView, Map<string, ToolbarItem>>();

function registerToolbarCommands(view: EditorView, items: ToolbarEntry[]) {
	const commands = new Map<string, ToolbarItem>();

	for (const item of items) {
		if (!('type' in item)) {
			commands.set(item.key, item);
		}
	}

	toolbarCommandsByView.set(view, commands);
}

export function runToolbarCommand(view: EditorView, key: string): boolean {
	const command = toolbarCommandsByView.get(view)?.get(key)?.command;
	return command?.(view) ?? false;
}

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

function createToolbarPlugin(
	fileType: FileType,
	toolbarCompartment: Compartment,
	scopeState: { inTable: boolean; inColor: boolean },
	onFullScreenChange: () => void,
	undoManager?: UndoManager,
) {
	return ViewPlugin.fromClass(
		class {
			private isFullScreen = false;
			private boundFullScreenHandler: () => void;

			constructor(private view: EditorView) {
				this.boundFullScreenHandler = this.handleFullScreenChange.bind(this);
				view.dom.ownerDocument.addEventListener('fullscreenchange', this.boundFullScreenHandler);

				registerToolbarCommands(
					view,
					getItems(fileType, this.isFullScreen, scopeState.inTable, scopeState.inColor, undoManager),
				);
			}

			update() {
				const nowInTable = detectTableScope(this.view, fileType) !== null;
				const nowInColor = detectColorScope(this.view, fileType) !== null;

				if (nowInTable !== scopeState.inTable || nowInColor !== scopeState.inColor) {
					scopeState.inTable = nowInTable;
					scopeState.inColor = nowInColor;
					this.reconfigureToolbar();
				}
			}

			private handleFullScreenChange() {
				const nowFullScreen = !!this.view.dom.ownerDocument.fullscreenElement;
				if (nowFullScreen !== this.isFullScreen) {
					this.isFullScreen = nowFullScreen;
					this.reconfigureToolbar();
					requestAnimationFrame(() => requestAnimationFrame(onFullScreenChange));
				}
			}

			private reconfigureToolbar() {
				const items = getItems(fileType, this.isFullScreen, scopeState.inTable, scopeState.inColor, undoManager);

				registerToolbarCommands(this.view, items);

				requestAnimationFrame(() => {
					this.view.dispatch({ effects: toolbarCompartment.reconfigure(toolbar({ items })) });
				});
			}

			destroy() {
				this.view.dom.ownerDocument.removeEventListener('fullscreenchange', this.boundFullScreenHandler);
			}
		},
	);
}

export const createToolbarExtension = (fileType: FileType, undoManager?: UndoManager): Extension => {
	const toolbarCompartment = new Compartment();
	const scopeState = { inTable: false, inColor: false };

	const initialItems = getItems(fileType, false, false, false, undoManager);

	const { plugin: responsivePlugin, reset: resetResponsive } = createCollapsableToolbar(
		() => getItems(fileType, !!document.fullscreenElement, scopeState.inTable, scopeState.inColor, undoManager),
		toolbarCompartment,
		() => (scopeState.inTable ? 2 : 0) + (scopeState.inColor ? 1 : 0),
	);

	return [
		toolbarCompartment.of(toolbar({ items: initialItems })),
		createToolbarPlugin(fileType, toolbarCompartment, scopeState, resetResponsive, undoManager),
		responsivePlugin,
	];
};