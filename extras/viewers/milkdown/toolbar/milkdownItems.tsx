// extras/viewers/milkdown/toolbar/milkdownItems.tsx
import { renderToString } from 'react-dom/server';

import {
	ToolbarBoldIcon,
	ToolbarItalicIcon,
	ToolbarStrikeIcon,
	ToolbarCodeInlineIcon,
	ToolbarHeading1Icon,
	ToolbarHeading2Icon,
	ToolbarHeading3Icon,
	ToolbarBulletListIcon,
	ToolbarNumberListIcon,
	ToolbarTaskListIcon,
	ToolbarQuoteIcon,
	ToolbarCodeBlockIcon,
	ToolbarTableIcon,
	ToolbarMathBlockIcon,
	ToolbarImageIcon,
	ToolbarHyperlinkIcon,
	UndoIcon,
	RedoIcon,
	ExpandIcon,
} from '@/components/common/Icons';
import type { MilkdownToolbarEntry } from './types';
import { split, space } from './types';
import {
	insertHorizontalRule,
	insertMath,
	insertCodeBlock,
	insertImage,
	insertLink,
	insertTable,
	runRedo,
	runUndo,
	setBlockTypeByName,
	setListType,
	toggleFullScreen,
	toggleMarkByName,
	wrapInNodeByName,
} from './helpers';

export const milkdownToolbarItems: MilkdownToolbarEntry[] = [
	{
		key: 'bold',
		title: 'Bold',
		label: renderToString(<ToolbarBoldIcon />),
		command: (view) => toggleMarkByName(view, ['strong', 'bold']),
	},
	{
		key: 'italic',
		title: 'Italic',
		label: renderToString(<ToolbarItalicIcon />),
		command: (view) => toggleMarkByName(view, ['emphasis', 'em', 'italic']),
	},
	{
		key: 'strike',
		title: 'Strikethrough',
		label: renderToString(<ToolbarStrikeIcon />),
		command: (view) =>
			toggleMarkByName(view, ['strike_through', 'strikethrough', 'strike']),
	},
	{
		key: 'hr',
		title: 'Divider',
		label: '—',
		command: insertHorizontalRule,
	},
	split,
	{
		key: 'h1',
		title: 'Heading 1',
		label: renderToString(<ToolbarHeading1Icon />),
		command: (view) => setBlockTypeByName(view, ['heading'], { level: 1 }),
	},
	{
		key: 'h2',
		title: 'Heading 2',
		label: renderToString(<ToolbarHeading2Icon />),
		command: (view) => setBlockTypeByName(view, ['heading'], { level: 2 }),
	},
	{
		key: 'h3',
		title: 'Heading 3',
		label: renderToString(<ToolbarHeading3Icon />),
		command: (view) => setBlockTypeByName(view, ['heading'], { level: 3 }),
	},
	split,
	{
		key: 'bullet',
		title: 'Bullet List',
		label: renderToString(<ToolbarBulletListIcon />),
		command: (view) => setListType(view, 'bullet'),
	},
	{
		key: 'ordered',
		title: 'Numbered List',
		label: renderToString(<ToolbarNumberListIcon />),
		command: (view) => setListType(view, 'ordered'),
	},
	{
		key: 'task',
		title: 'Task List',
		label: renderToString(<ToolbarTaskListIcon />),
		command: (view) => setListType(view, 'task'),
	},
	split,
	{
		key: 'math',
		title: 'Display Math',
		label: renderToString(<ToolbarMathBlockIcon />),
		command: insertMath,
	},
	split,
	{
		key: 'code',
		title: 'Inline Code',
		label: renderToString(<ToolbarCodeInlineIcon />),
		command: (view) =>
			toggleMarkByName(view, [
				'inlineCode',
				'inline_code',
				'code_inline',
				'code',
			]),
	},
	{
		key: 'codeBlock',
		title: 'Code Block',
		label: renderToString(<ToolbarCodeBlockIcon />),
		command: insertCodeBlock,
	},
	split,
	{
		key: 'link',
		title: 'Link',
		label: renderToString(<ToolbarHyperlinkIcon />),
		command: insertLink,
	},
	{
		key: 'quote',
		title: 'Quote',
		label: renderToString(<ToolbarQuoteIcon />),
		command: (view) => wrapInNodeByName(view, ['blockquote']),
	},
	split,
	{
		key: 'image',
		title: 'Image',
		label: renderToString(<ToolbarImageIcon />),
		command: (view, getCurrentFilePath) =>
			insertImage(view, getCurrentFilePath),
	},
	{
		key: 'table',
		title: 'Table',
		label: renderToString(<ToolbarTableIcon />),
		command: insertTable,
	},
	space,
	{
		key: 'undo',
		title: 'Undo',
		label: renderToString(<UndoIcon />),
		command: runUndo,
	},
	{
		key: 'redo',
		title: 'Redo',
		label: renderToString(<RedoIcon />),
		command: runRedo,
	},
	split,
	{
		key: 'fullscreen',
		title: 'Fullscreen',
		label: renderToString(<ExpandIcon />),
		command: toggleFullScreen,
	},
];
