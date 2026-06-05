// extras/viewers/milkdown/toolbar/milkdownItems.ts
import {
	toggleStrongCommand,
	toggleEmphasisCommand,
	toggleInlineCodeCommand,
	wrapInHeadingCommand,
	wrapInBulletListCommand,
	wrapInOrderedListCommand,
	wrapInBlockquoteCommand,
	createCodeBlockCommand,
	insertHrCommand,
} from '@milkdown/kit/preset/commonmark';
import {
	toggleStrikethroughCommand,
	insertTableCommand,
} from '@milkdown/kit/preset/gfm';
import type { CmdKey } from '@milkdown/kit/core';

export interface MilkdownToolbarItem {
	key: string;
	title: string;
	label: string;
	command?: CmdKey<unknown>;
	payload?: unknown;
}

const rawItems: MilkdownToolbarItem[] = [
	{ key: 'bold', title: 'Bold', label: 'B', command: toggleStrongCommand?.key },
	{
		key: 'italic',
		title: 'Italic',
		label: 'I',
		command: toggleEmphasisCommand?.key,
	},
	{
		key: 'strike',
		title: 'Strikethrough',
		label: 'S',
		command: toggleStrikethroughCommand?.key,
	},
	{
		key: 'code',
		title: 'Inline code',
		label: '</>',
		command: toggleInlineCodeCommand?.key,
	},
	{
		key: 'h1',
		title: 'Heading 1',
		label: 'H1',
		command: wrapInHeadingCommand?.key,
		payload: 1,
	},
	{
		key: 'h2',
		title: 'Heading 2',
		label: 'H2',
		command: wrapInHeadingCommand?.key,
		payload: 2,
	},
	{
		key: 'h3',
		title: 'Heading 3',
		label: 'H3',
		command: wrapInHeadingCommand?.key,
		payload: 3,
	},
	{
		key: 'bullet',
		title: 'Bullet list',
		label: '•',
		command: wrapInBulletListCommand?.key,
	},
	{
		key: 'ordered',
		title: 'Numbered list',
		label: '1.',
		command: wrapInOrderedListCommand?.key,
	},
	{
		key: 'quote',
		title: 'Blockquote',
		label: '""',
		command: wrapInBlockquoteCommand?.key,
	},
	{
		key: 'codeblock',
		title: 'Code block',
		label: '{}',
		command: createCodeBlockCommand?.key,
	},
	{
		key: 'table',
		title: 'Table',
		label: '田',
		command: insertTableCommand?.key,
	},
	{ key: 'hr', title: 'Divider', label: '―', command: insertHrCommand?.key },
];

export const milkdownToolbarItems: MilkdownToolbarItem[] = rawItems.filter(
	(item) => item.command != null,
);
