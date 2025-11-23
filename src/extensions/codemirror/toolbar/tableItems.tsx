// src/extensions/codemirror/toolbar/tableItems.ts
import type { EditorView } from '@codemirror/view';

import { TableGridSelector } from './tableGrid';
import { insertText } from './helpers';

export type TableType = 'latex' | 'typst';

const gridSelectors = new WeakMap<EditorView, TableGridSelector>();

const generateLatexTable = (rows: number, cols: number): string => {
    const colSpec = '|' + 'c|'.repeat(cols);
    const headerRow = new Array(cols).fill(null).map((_, i) => `Header ${i + 1}`).join(' & ');
    const emptyRow = new Array(cols).fill('').join(' & ');
    const dataRows = new Array(rows - 1).fill(null).map(() => `\t\t${emptyRow} \\\\`).join('\n\t\t\\hline\n');

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
    const headers = new Array(cols).fill(null).map((_, i) => `[Header ${i + 1}]`).join(', ');
    const emptyRow = new Array(cols).fill('[]').join(', ');
    const dataRows = new Array(rows - 1).fill(null).map(() => `\t${emptyRow},`).join('\n');

    return `#table(
\tcolumns: ${cols},
\t${headers},
${dataRows}
)`;
};

const handleTableSelect = (view: EditorView, rows: number, cols: number, type: TableType): void => {
    const text = type === 'latex' ? generateLatexTable(rows, cols) : generateTypstTable(rows, cols);
    insertText(view, text, 0);
};

export const createTableCommand = (type: TableType) => {
    return (view: EditorView): boolean => {
        const toolbar = view.dom.querySelector('.codemirror-toolbar');
        if (!toolbar) return false;

        const button = toolbar.querySelector(`[data-item="${type}-table"]`) as HTMLElement;
        if (!button) return false;

        let selector = gridSelectors.get(view);

        if (!selector) {
            selector = new TableGridSelector(view, button, {
                maxRows: 8,
                maxCols: 8,
                onSelect: (v, rows, cols) => handleTableSelect(v, rows, cols, type),
            });
            gridSelectors.set(view, selector);
        }

        selector.toggle();
        return true;
    };
};