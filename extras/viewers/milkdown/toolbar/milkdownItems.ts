// extras/viewers/milkdown/toolbar/milkdownItems.ts
import type { MilkdownToolbarEntry } from './types';
import { split, space } from './types';
import {
	insertHorizontalRule,
	insertTable,
	setBlockTypeByName,
	toggleMarkByName,
	wrapInListByName,
	wrapInNodeByName,
} from './helpers';
import { getPendingMilkdownImagePath } from './pendingImage';

export const milkdownToolbarItems: MilkdownToolbarEntry[] = [
	{
		key: 'bold',
		title: 'Bold',
		label: 'B',
		command: (view) => toggleMarkByName(view, ['strong', 'bold']),
	},
	{
		key: 'italic',
		title: 'Italic',
		label: 'I',
		command: (view) => toggleMarkByName(view, ['emphasis', 'em', 'italic']),
	},
	{
		key: 'strike',
		title: 'Strikethrough',
		label: 'S',
		command: (view) =>
			toggleMarkByName(view, ['strike_through', 'strikethrough', 'strike']),
	},
	{
		key: 'code',
		title: 'Inline code',
		label: '</>',
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
		label: 'H1',
		command: (view) => setBlockTypeByName(view, ['heading'], { level: 1 }),
	},
	{
		key: 'h2',
		title: 'Heading 2',
		label: 'H2',
		command: (view) => setBlockTypeByName(view, ['heading'], { level: 2 }),
	},
	{
		key: 'h3',
		title: 'Heading 3',
		label: 'H3',
		command: (view) => setBlockTypeByName(view, ['heading'], { level: 3 }),
	},
	split,
	{
		key: 'bullet',
		title: 'Bullet list',
		label: '•',
		command: (view) => wrapInListByName(view, ['bullet_list', 'bulletList']),
	},
	{
		key: 'ordered',
		title: 'Numbered list',
		label: '1.',
		command: (view) => wrapInListByName(view, ['ordered_list', 'orderedList']),
	},
	split,
	{
		key: 'quote',
		title: 'Blockquote',
		label: '""',
		command: (view) => wrapInNodeByName(view, ['blockquote']),
	},
	{
		key: 'codeblock',
		title: 'Code block',
		label: '{}',
		command: (view) => setBlockTypeByName(view, ['code_block', 'codeBlock']),
	},
	{
		key: 'table',
		title: 'Table',
		label: '田',
		command: insertTable,
	},
	{
		key: 'hr',
		title: 'Divider',
		label: '―',
		command: insertHorizontalRule,
	},
	{
		key: 'image',
		title: 'Image',
		label: '🖼',
		command: (view) => {
			const imageType = view.state.schema.nodes.image;
			if (!imageType) return false;

			const src = getPendingMilkdownImagePath() ?? '';
			const node = imageType.create({ src });
			view.dispatch(
				view.state.tr.replaceSelectionWith(node, false).scrollIntoView(),
			);
			view.focus();
			return true;
		},
	},
	space,
];
