// extras/viewers/milkdown/toolbar/helpers.ts
import { setBlockType, toggleMark, wrapIn } from '@milkdown/kit/prose/commands';
import { redo, undo } from '@milkdown/kit/prose/history';
import type { MarkType, NodeType, Schema } from '@milkdown/kit/prose/model';
import { wrapInList } from '@milkdown/kit/prose/schema-list';
import type { EditorView } from '@milkdown/kit/prose/view';
import { insertTableCommand } from '@milkdown/kit/preset/gfm';

import { TableGridSelector } from '@/utils/popover/TableGridSelector';
import { ImagePicker } from '@/utils/popover/ImagePicker';
import { getPendingMilkdownImagePath } from './pendingImage';

const getMark = (schema: Schema, names: string[]): MarkType | null => {
	for (const name of names) {
		const mark = schema.marks[name];
		if (mark) return mark;
	}

	return null;
};

const getNode = (schema: Schema, names: string[]): NodeType | null => {
	for (const name of names) {
		const node = schema.nodes[name];
		if (node) return node;
	}

	return null;
};

const run = (
	view: EditorView,
	command: (
		state: EditorView['state'],
		dispatch?: EditorView['dispatch'],
	) => boolean,
): boolean => {
	const didRun = command(view.state, view.dispatch);
	if (didRun) view.focus();
	return didRun;
};

export const toggleMarkByName = (
	view: EditorView,
	names: string[],
): boolean => {
	const mark = getMark(view.state.schema, names);
	return !!mark && run(view, toggleMark(mark));
};

export const setBlockTypeByName = (
	view: EditorView,
	names: string[],
	attrs?: Record<string, unknown>,
): boolean => {
	const node = getNode(view.state.schema, names);
	return !!node && run(view, setBlockType(node, attrs));
};

export const wrapInNodeByName = (
	view: EditorView,
	names: string[],
): boolean => {
	const node = getNode(view.state.schema, names);
	return !!node && run(view, wrapIn(node));
};

export const wrapInListByName = (
	view: EditorView,
	names: string[],
): boolean => {
	const node = getNode(view.state.schema, names);
	return !!node && run(view, wrapInList(node));
};

export const insertMath = (view: EditorView): boolean => {
	const codeBlock = getNode(view.state.schema, ['code_block', 'codeBlock']);
	if (!codeBlock) return false;

	const node = codeBlock.createAndFill({ language: 'latex' });
	if (!node) return false;

	view.dispatch(view.state.tr.replaceSelectionWith(node).scrollIntoView());
	view.focus();
	return true;
};

const imagePickers = new WeakMap<EditorView, ImagePicker>();

const insertImageNode = (view: EditorView, src: string): void => {
	const imageType = view.state.schema.nodes.image;
	if (!imageType || !src) return;

	const node = imageType.create({ src });
	view.dispatch(
		view.state.tr.replaceSelectionWith(node, false).scrollIntoView(),
	);
	view.focus();
};

export const insertImage = (
	view: EditorView,
	getCurrentFilePath: () => string = () => '',
): boolean => {
	const pending = getPendingMilkdownImagePath();
	if (pending) {
		insertImageNode(view, pending);
		return true;
	}

	const toolbar = document.querySelector('.plugin-toolbar');
	if (!toolbar) return false;

	const button = toolbar.querySelector(
		'[data-item="image"]',
	) as HTMLElement | null;
	if (!button) return false;

	let picker = imagePickers.get(view);

	if (
		picker &&
		!document.body.contains(picker.container) &&
		!toolbar.contains(picker.container)
	) {
		picker.destroy();
		imagePickers.delete(view);
		picker = null;
	}

	if (!picker) {
		picker = new ImagePicker(button, {
			getCurrentFilePath,
			onSelect: (src) => insertImageNode(view, src),
		});
		imagePickers.set(view, picker);
	}

	picker.toggle();
	return true;
};

export const insertLink = (view: EditorView): boolean => {
	const linkMark = getMark(view.state.schema, ['link']);
	if (!linkMark || view.state.selection.empty) return false;

	return run(view, toggleMark(linkMark, { href: '' }));
};

export const runUndo = (view: EditorView): boolean => run(view, undo);

export const runRedo = (view: EditorView): boolean => run(view, redo);

export const toggleFullScreen = (view: EditorView): boolean => {
	const doc = view.dom.ownerDocument;

	if (doc.fullscreenElement) {
		doc.exitFullscreen();
	} else {
		const target = view.dom.closest('.milkdown-editor-shell') ?? view.dom;
		target.requestFullscreen();
	}

	return true;
};

export const insertHorizontalRule = (view: EditorView): boolean => {
	const horizontalRule = getNode(view.state.schema, [
		'hr',
		'horizontal_rule',
		'horizontalRule',
	]);

	if (!horizontalRule) return false;

	view.dispatch(
		view.state.tr
			.replaceSelectionWith(horizontalRule.create())
			.scrollIntoView(),
	);
	view.focus();

	return true;
};

const tableSelectors = new WeakMap<EditorView, TableGridSelector>();

export const setListType = (
	view: EditorView,
	kind: 'bullet' | 'ordered' | 'task',
): boolean => {
	const names =
		kind === 'ordered'
			? ['ordered_list', 'orderedList']
			: ['bullet_list', 'bulletList'];

	const listNode = getNode(view.state.schema, names);
	if (!listNode) return false;

	const attrs = kind === 'task' ? { checked: false } : undefined;
	const wrapped = run(view, wrapInList(listNode, attrs));
	if (!wrapped || kind !== 'task') return wrapped;

	const itemNode = getNode(view.state.schema, ['list_item', 'listItem']);
	if (!itemNode) return wrapped;

	const { tr } = view.state;
	view.state.doc.nodesBetween(
		view.state.selection.from,
		view.state.selection.to,
		(node, pos) => {
			if (node.type === itemNode) {
				tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: false });
			}
		},
	);
	view.dispatch(tr);
	return true;
};

const insertSizedTable = (
	view: EditorView,
	rows: number,
	cols: number,
): void => {
	insertTableCommand.run({ row: rows, col: cols });
	view.focus();
};

export const insertTable = (view: EditorView): boolean => {
	const toolbar = document.querySelector('.plugin-toolbar');
	if (!toolbar) return false;

	const button = toolbar.querySelector(
		'[data-item="table"]',
	) as HTMLElement | null;
	if (!button) return false;

	let selector = tableSelectors.get(view);

	if (
		selector &&
		!document.body.contains(selector.container) &&
		!toolbar.contains(selector.container)
	) {
		selector.destroy();
		tableSelectors.delete(view);
		selector = null;
	}

	if (!selector) {
		selector = new TableGridSelector(button, {
			maxRows: 8,
			maxCols: 8,
			onSelect: (rows, cols) => insertSizedTable(view, rows, cols),
		});
		tableSelectors.set(view, selector);
	}

	selector.toggle();
	return true;
};
