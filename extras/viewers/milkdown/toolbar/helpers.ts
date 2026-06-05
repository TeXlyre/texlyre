// extras/viewers/milkdown/toolbar/helpers.ts
import { setBlockType, toggleMark, wrapIn } from '@milkdown/kit/prose/commands';
import type {
	MarkType,
	Node as ProseNode,
	NodeType,
	Schema,
} from '@milkdown/kit/prose/model';
import { wrapInList } from '@milkdown/kit/prose/schema-list';
import type { EditorView } from '@milkdown/kit/prose/view';

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

export const insertHorizontalRule = (view: EditorView): boolean => {
	const horizontalRule = getNode(view.state.schema, [
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

const createFilledCell = (
	cell: NodeType,
	paragraph: NodeType,
): ProseNode | null =>
	cell.createAndFill(null, paragraph.create()) ?? cell.createAndFill();

export const insertTable = (view: EditorView): boolean => {
	const schema = view.state.schema;
	const table = getNode(schema, ['table']);
	const row = getNode(schema, ['table_row', 'tableRow']);
	const cell = getNode(schema, ['table_cell', 'tableCell']);
	const paragraph = getNode(schema, ['paragraph']);

	if (!table || !row || !cell || !paragraph) return false;

	const rows: ProseNode[] = [];

	for (let rowIndex = 0; rowIndex < 3; rowIndex += 1) {
		const cells: ProseNode[] = [];

		for (let colIndex = 0; colIndex < 3; colIndex += 1) {
			const nextCell = createFilledCell(cell, paragraph);
			if (!nextCell) return false;
			cells.push(nextCell);
		}

		rows.push(row.createChecked(null, cells));
	}

	view.dispatch(
		view.state.tr
			.replaceSelectionWith(table.createChecked(null, rows))
			.scrollIntoView(),
	);
	view.focus();

	return true;
};
