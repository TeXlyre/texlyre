// src/extensions/codemirror/toolbar/tableItems.ts
import type { EditorView } from '@codemirror/view';

import { TableGridSelector } from '../../../utils/popover/TableGridSelector';
import { insertText } from './helpers';

export type TableType = 'latex' | 'typst' | 'markdown' | 'rst';

const gridSelectors = new WeakMap<EditorView, TableGridSelector>();

const generateLatexTable = (rows: number, cols: number): string => {
	const colSpec = `|${'c|'.repeat(cols)}`;
	const headerRow = new Array(cols)
		.fill(null)
		.map((_, i) => `Header ${i + 1}`)
		.join(' & ');
	const emptyRow = new Array(cols).fill('').join(' & ');
	const dataRows = new Array(rows - 1)
		.fill(null)
		.map(() => `\t\t${emptyRow} \\\\`)
		.join('\n\t\t\\hline\n');

	return `\\begin{table}[h]
\t\\centering
\t\\begin{tabular}{${colSpec}}
\t\t\\hline
\t\t${headerRow} \\\\
\t\t\\hline
${dataRows}
\t\t\\hline
\t\\end{tabular}
\t\\caption{}
\t\\label{tab:}
\\end{table}`;
};

const generateTypstTable = (rows: number, cols: number): string => {
	const headers = new Array(cols)
		.fill(null)
		.map((_, i) => `[Header ${i + 1}]`)
		.join(', ');
	const emptyRow = new Array(cols).fill('[]').join(', ');
	const dataRows = new Array(rows - 1)
		.fill(null)
		.map(() => `\t${emptyRow},`)
		.join('\n');

	return `#table(
\tcolumns: ${cols},
\t${headers},
${dataRows}
)`;
};

const generateMarkdownTable = (rows: number, cols: number): string => {
	const headerRow = new Array(cols)
		.fill(null)
		.map((_, i) => `Header ${i + 1}`)
		.join(' | ');
	const separator = new Array(cols).fill('---').join(' | ');
	const dataRows = new Array(rows - 1)
		.fill(null)
		.map(() => `| ${new Array(cols).fill('').join(' | ')} |`)
		.join('\n');

	return `| ${headerRow} |\n| ${separator} |\n${dataRows}`;
};

const generateRstTable = (rows: number, cols: number): string => {
	const row = (cells: string[]) =>
		cells.map((cell, i) => `\t${i === 0 ? '*' : ' '} - ${cell}`).join('\n');
	const headerRow = row(
		new Array(cols).fill(null).map((_, i) => `Header ${i + 1}`),
	);
	const dataRows = new Array(rows - 1)
		.fill(null)
		.map(() => row(new Array(cols).fill('')))
		.join('\n');

	return `.. list-table::\n\t:header-rows: 1\n\n${headerRow}\n${dataRows}`;
};

const tableGenerators: Record<
	TableType,
	(rows: number, cols: number) => string
> = {
	latex: generateLatexTable,
	typst: generateTypstTable,
	markdown: generateMarkdownTable,
	rst: generateRstTable,
};

const handleTableSelect = (
	view: EditorView,
	rows: number,
	cols: number,
	type: TableType,
): void => {
	insertText(view, tableGenerators[type](rows, cols), 0);
};

export const createTableCommand = (type: TableType) => {
	return (view: EditorView): boolean => {
		const toolbar = document.querySelector('.plugin-toolbar');
		if (!toolbar) return false;

		const button = toolbar.querySelector(
			`[data-item="${type}-table"]`,
		) as HTMLElement;
		if (!button) return false;

		let selector = gridSelectors.get(view);

		if (
			selector &&
			!document.body.contains(selector.container) &&
			!toolbar.contains(selector.container)
		) {
			selector.destroy();
			gridSelectors.delete(view);
			selector = null;
		}

		if (!selector) {
			selector = new TableGridSelector(button, {
				maxRows: 8,
				maxCols: 8,
				onSelect: (rows, cols) => handleTableSelect(view, rows, cols, type),
			});
			gridSelectors.set(view, selector);
		}

		selector.toggle();
		return true;
	};
};
