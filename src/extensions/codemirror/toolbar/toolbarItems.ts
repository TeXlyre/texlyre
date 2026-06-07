// src/extensions/codemirror/toolbar/toolbarItems.ts
import type { UndoManager } from 'yjs';

import type { ToolbarEntry } from '../../../components/common/PluginToolbar';
import type * as CodeMirrorItemsNS from './codemirrorItems';
import type * as LaTeXItemsNS from './latexItems';
import type * as TypstItemsNS from './typstItems';
import type * as TableScopeItemsNS from './tableScopeItems';
import type * as ColorScopeItemsNS from './colorScopeItems';

type FileType = 'latex' | 'typst';

interface Factories {
	CodeMirrorItems: typeof CodeMirrorItemsNS;
	LaTeXItems: typeof LaTeXItemsNS;
	TypstItems: typeof TypstItemsNS;
	TableScopeItems: typeof TableScopeItemsNS;
	ColorScopeItems: typeof ColorScopeItemsNS;
	undoManager?: UndoManager;
}

const split = { type: 'split' as const };
const space = { type: 'space' as const };

const tableScopeEntries = (
	fileType: FileType,
	I: typeof TableScopeItemsNS,
): ToolbarEntry[] => [
	split,
	I.createRowAddBefore(fileType),
	I.createRowAddAfter(fileType),
	I.createRowRemove(fileType),
	split,
	I.createColAddBefore(fileType),
	I.createColAddAfter(fileType),
	I.createColRemove(fileType),
];

const colorScopeEntries = (
	fileType: FileType,
	I: typeof ColorScopeItemsNS,
): ToolbarEntry[] => [
	split,
	I.createColorEdit(fileType),
	I.createColorRemove(fileType),
];

const endEntries = (
	isFullScreen: boolean,
	I: typeof CodeMirrorItemsNS,
	undoManager?: UndoManager,
): ToolbarEntry[] => [
	space,
	I.createUndo(undoManager),
	I.createRedo(undoManager),
	split,
	I.createFullScreen(isFullScreen),
];

export function buildToolbarEntries(
	fileType: FileType,
	scope: { inTable: boolean; inColor: boolean; isFullScreen: boolean },
	f: Factories,
): ToolbarEntry[] {
	const tail = [
		...(scope.inTable ? tableScopeEntries(fileType, f.TableScopeItems) : []),
		...(scope.inColor ? colorScopeEntries(fileType, f.ColorScopeItems) : []),
		...endEntries(scope.isFullScreen, f.CodeMirrorItems, f.undoManager),
	];

	if (fileType === 'latex') {
		const L = f.LaTeXItems;
		return [
			L.createBold(),
			L.createItalic(),
			L.createUnderline(),
			L.createStrikethrough(),
			L.createEmph(),
			L.createTypewriter(),
			split,
			L.createSuperscript(),
			L.createSubscript(),
			split,
			L.createSection(),
			L.createSubsection(),
			L.createSubsubsection(),
			split,
			L.createItemize(),
			L.createEnumerate(),
			L.createDescription(),
			split,
			L.createInlineMath(),
			L.createDisplayMath(),
			L.createEquation(),
			split,
			L.createVerbatim(),
			L.createLstlisting(),
			split,
			L.createHyperlink(),
			L.createQuote(),
			split,
			L.createCitation(),
			L.createReference(),
			L.createLabel(),
			L.createFootnote(),
			split,
			L.createFigure(),
			L.createTable(),
			split,
			L.createTextColor(),
			L.createHighlight(),
			...tail,
		];
	}

	const T = f.TypstItems;
	return [
		T.createBold(),
		T.createItalic(),
		T.createUnderline(),
		T.createStrike(),
		T.createMonospace(),
		split,
		T.createSuperscript(),
		T.createSubscript(),
		split,
		T.createHeading1(),
		T.createHeading2(),
		T.createHeading3(),
		T.createHeading4(),
		split,
		T.createBulletList(),
		T.createNumberedList(),
		T.createTermList(),
		split,
		T.createInlineMath(),
		T.createDisplayMath(),
		T.createEquation(),
		split,
		T.createInlineCode(),
		T.createCodeBlock(),
		split,
		T.createLink(),
		T.createQuote(),
		split,
		T.createCitation(),
		T.createReference(),
		T.createLabel(),
		T.createFootnote(),
		split,
		T.createFigure(),
		T.createTable(),
		split,
		T.createTextColor(),
		T.createHighlight(),
		...tail,
	];
}
