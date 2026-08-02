// src/extensions/codemirror/toolbar/toolbarItems.ts
import type { UndoManager } from 'yjs';

import type { ToolbarEntry } from '../../../components/common/PluginToolbar';
import type * as CodeMirrorItemsNS from './codemirrorItems';
import type * as LaTeXItemsNS from './latexItems';
import type * as TypstItemsNS from './typstItems';
import type * as MarkdownItemsNS from './markdownItems';
import type * as RstItemsNS from './rstItems';
import type * as JsonItemsNS from './jsonItems';
import type * as YamlItemsNS from './yamlItems';
import type * as TomlItemsNS from './tomlItems';
import type * as TableScopeItemsNS from './tableScopeItems';
import type * as ColorScopeItemsNS from './colorScopeItems';

type FileType =
	| 'latex'
	| 'typst'
	| 'markdown'
	| 'rst'
	| 'json'
	| 'yaml'
	| 'toml';
type ScopedFileType = 'latex' | 'typst';

interface Factories {
	CodeMirrorItems: typeof CodeMirrorItemsNS;
	LaTeXItems: typeof LaTeXItemsNS;
	TypstItems: typeof TypstItemsNS;
	MarkdownItems: typeof MarkdownItemsNS;
	RstItems: typeof RstItemsNS;
	JsonItems: typeof JsonItemsNS;
	YamlItems: typeof YamlItemsNS;
	TomlItems: typeof TomlItemsNS;
	TableScopeItems: typeof TableScopeItemsNS;
	ColorScopeItems: typeof ColorScopeItemsNS;
	undoManager?: UndoManager;
}

const split = { type: 'split' as const };
const space = { type: 'space' as const };

const tableScopeEntries = (
	fileType: ScopedFileType,
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
	fileType: ScopedFileType,
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
	const scopedType: ScopedFileType | null =
		fileType === 'latex' || fileType === 'typst' ? fileType : null;

	const tail = [
		...(scopedType && scope.inTable
			? tableScopeEntries(scopedType, f.TableScopeItems)
			: []),
		...(scopedType && scope.inColor
			? colorScopeEntries(scopedType, f.ColorScopeItems)
			: []),
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

	if (fileType === 'markdown') {
		const M = f.MarkdownItems;
		return [
			M.createBold(),
			M.createItalic(),
			M.createStrike(),
			M.createDivider(),
			split,
			M.createHeading1(),
			M.createHeading2(),
			M.createHeading3(),
			split,
			M.createBulletList(),
			M.createNumberedList(),
			M.createTaskList(),
			split,
			M.createInlineMath(),
			M.createDisplayMath(),
			split,
			M.createInlineCode(),
			M.createCodeBlock(),
			split,
			M.createLink(),
			M.createQuote(),
			split,
			M.createImage(),
			M.createTable(),
			...tail,
		];
	}

	if (fileType === 'rst') {
		const R = f.RstItems;
		return [
			R.createBold(),
			R.createItalic(),
			split,
			R.createSuperscript(),
			R.createSubscript(),
			split,
			R.createSection(),
			R.createSubsection(),
			R.createSubsubsection(),
			split,
			R.createBulletList(),
			R.createNumberedList(),
			R.createDefinitionList(),
			split,
			R.createInlineMath(),
			R.createDisplayMath(),
			split,
			R.createInlineCode(),
			R.createCodeBlock(),
			split,
			R.createLink(),
			R.createQuote(),
			split,
			R.createCitation(),
			R.createReference(),
			R.createLabel(),
			R.createFootnote(),
			split,
			R.createImage(),
			R.createTable(),
			...tail,
		];
	}

	if (fileType === 'json') {
		const J = f.JsonItems;
		return [
			J.createKeyValue(),
			J.createObject(),
			J.createArray(),
			split,
			J.createString(),
			J.createNumber(),
			J.createBoolean(),
			J.createNull(),
			split,
			f.CodeMirrorItems.createFoldAll(),
			f.CodeMirrorItems.createUnfoldAll(),
			...tail,
		];
	}

	if (fileType === 'yaml') {
		const Y = f.YamlItems;
		return [
			Y.createKeyValue(),
			Y.createMapping(),
			Y.createListItem(),
			split,
			Y.createBlockScalar(),
			Y.createFoldedScalar(),
			split,
			Y.createAnchor(),
			Y.createAlias(),
			split,
			Y.createComment(),
			Y.createDocumentSeparator(),
			split,
			f.CodeMirrorItems.createFoldAll(),
			f.CodeMirrorItems.createUnfoldAll(),
			...tail,
		];
	}

	if (fileType === 'toml') {
		const O = f.TomlItems;
		return [
			O.createKeyValue(),
			O.createTable(),
			O.createArrayOfTables(),
			split,
			O.createArray(),
			O.createInlineTable(),
			split,
			O.createString(),
			O.createMultilineString(),
			split,
			O.createComment(),
			split,
			f.CodeMirrorItems.createFoldAll(),
			f.CodeMirrorItems.createUnfoldAll(),
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
