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
		key: 'code',
		title: 'Inline code',
		label: renderToString(<ToolbarCodeInlineIcon />),
		command: (view) =>
			toggleMarkByName(view, [
				'inlineCode',
				'inline_code',
				'code_inline',
				'code',
			]),
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
		title: 'Bullet list',
		label: renderToString(<ToolbarBulletListIcon />),
		command: (view) => setListType(view, 'bullet'),
	},
	{
		key: 'ordered',
		title: 'Numbered list',
		label: renderToString(<ToolbarNumberListIcon />),
		command: (view) => setListType(view, 'ordered'),
	},
	{
		key: 'task',
		title: 'Task list',
		label: renderToString(<ToolbarTaskListIcon />),
		command: (view) => setListType(view, 'task'),
	},
	split,
	{
		key: 'quote',
		title: 'Blockquote',
		label: renderToString(<ToolbarQuoteIcon />),
		command: (view) => wrapInNodeByName(view, ['blockquote']),
	},
	{
		key: 'codeblock',
		title: 'Code block',
		label: renderToString(<ToolbarCodeBlockIcon />),
		command: (view) => setBlockTypeByName(view, ['code_block', 'codeBlock']),
	},
	{
		key: 'table',
		title: 'Table',
		label: renderToString(<ToolbarTableIcon />),
		command: insertTable,
	},
	{
		key: 'hr',
		title: 'Divider',
		label: renderToString(<ToolbarTableIcon />),
		command: insertHorizontalRule,
	},
	{
		key: 'image',
		title: 'Image',
		label: renderToString(<ToolbarImageIcon />),
		command: (view, getCurrentFilePath) =>
			insertImage(view, getCurrentFilePath),
	},
	{
		key: 'link',
		title: 'Link',
		label: renderToString(<ToolbarHyperlinkIcon />),
		command: insertLink,
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
