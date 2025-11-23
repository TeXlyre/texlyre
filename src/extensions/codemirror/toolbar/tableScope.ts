import type { EditorView } from '@codemirror/view';

export type TableType = 'latex' | 'typst';

export interface TableInfo {
    type: TableType;
    start: number;
    end: number;
    rowIndex: number;
    colIndex: number;
    totalRows: number;
    totalCols: number;
    rows: TableRow[];
}

export interface TableRow {
    start: number;
    end: number;
    cells: TableCell[];
}

export interface TableCell {
    start: number;
    end: number;
    content: string;
}

export function detectTableScope(view: EditorView, fileType: TableType): TableInfo | null {
    const pos = view.state.selection.main.head;
    const doc = view.state.doc.toString();

    if (fileType === 'latex') {
        return detectLatexTable(doc, pos);
    }
    return detectTypstTable(doc, pos);
}

function detectLatexTable(doc: string, pos: number): TableInfo | null {
    const tabularRegex = /\\begin\{tabular\}(\{[^}]*\})([\s\S]*?)\\end\{tabular\}/g;
    let match: RegExpExecArray | null;

    while ((match = tabularRegex.exec(doc)) !== null) {
        const start = match.index;
        const end = start + match[0].length;

        if (pos >= start && pos <= end) {
            const colSpec = match[1];
            const content = match[2];
            const totalCols = (colSpec.match(/[lcr|p]/gi) || []).filter(c => c !== '|').length;

            const rows = parseLatexRows(content, start + match[0].indexOf(match[2]));
            const { rowIndex, colIndex } = findLatexPosition(rows, pos);

            return {
                type: 'latex',
                start,
                end,
                rowIndex,
                colIndex,
                totalRows: rows.length,
                totalCols,
                rows,
            };
        }
    }

    return null;
}

function parseLatexRows(content: string, offset: number): TableRow[] {
    const rows: TableRow[] = [];
    const lines = content.split('\\\\');
    let currentPos = offset;

    for (const line of lines) {
        const trimmed = line.replace(/\\hline/g, '').trim();
        if (!trimmed) {
            currentPos += line.length + 2;
            continue;
        }

        const cells = parseLatexCells(trimmed, currentPos + line.indexOf(trimmed));
        if (cells.length > 0) {
            rows.push({
                start: currentPos,
                end: currentPos + line.length,
                cells,
            });
        }
        currentPos += line.length + 2;
    }

    return rows;
}

function parseLatexCells(row: string, offset: number): TableCell[] {
    const cells: TableCell[] = [];
    const parts = row.split('&');
    let currentPos = offset;

    for (const part of parts) {
        const content = part.trim();
        const cellStart = currentPos + part.indexOf(content);
        cells.push({
            start: cellStart,
            end: cellStart + content.length,
            content,
        });
        currentPos += part.length + 1;
    }

    return cells;
}

function findLatexPosition(rows: TableRow[], pos: number): { rowIndex: number; colIndex: number } {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        if (pos >= row.start && pos <= row.end) {
            for (let colIndex = 0; colIndex < row.cells.length; colIndex++) {
                const cell = row.cells[colIndex];
                if (pos >= cell.start && pos <= cell.end + 1) {
                    return { rowIndex, colIndex };
                }
            }
            return { rowIndex, colIndex: 0 };
        }
    }
    return { rowIndex: 0, colIndex: 0 };
}

function detectTypstTable(doc: string, pos: number): TableInfo | null {
    const tableRegex = /#table\s*\(([\s\S]*?)\n\)/g;
    let match: RegExpExecArray | null;

    while ((match = tableRegex.exec(doc)) !== null) {
        const start = match.index;
        const end = start + match[0].length;

        if (pos >= start && pos <= end) {
            const content = match[1];
            const colsMatch = content.match(/columns\s*:\s*(\d+)/);
            const totalCols = colsMatch ? parseInt(colsMatch[1], 10) : 1;

            const rows = parseTypstRows(content, start + match[0].indexOf(match[1]), totalCols);
            const { rowIndex, colIndex } = findTypstPosition(rows, pos);

            return {
                type: 'typst',
                start,
                end,
                rowIndex,
                colIndex,
                totalRows: rows.length,
                totalCols,
                rows,
            };
        }
    }

    return null;
}

function parseTypstRows(content: string, offset: number, totalCols: number): TableRow[] {
    const rows: TableRow[] = [];
    const cellRegex = /\[([^\]]*)\]/g;
    const cells: TableCell[] = [];
    let match: RegExpExecArray | null;

    while ((match = cellRegex.exec(content)) !== null) {
        cells.push({
            start: offset + match.index,
            end: offset + match.index + match[0].length,
            content: match[1],
        });
    }

    for (let i = 0; i < cells.length; i += totalCols) {
        const rowCells = cells.slice(i, i + totalCols);
        if (rowCells.length > 0) {
            rows.push({
                start: rowCells[0].start,
                end: rowCells[rowCells.length - 1].end,
                cells: rowCells,
            });
        }
    }

    return rows;
}

function findTypstPosition(rows: TableRow[], pos: number): { rowIndex: number; colIndex: number } {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        if (pos >= row.start && pos <= row.end) {
            for (let colIndex = 0; colIndex < row.cells.length; colIndex++) {
                const cell = row.cells[colIndex];
                if (pos >= cell.start && pos <= cell.end) {
                    return { rowIndex, colIndex };
                }
            }
            return { rowIndex, colIndex: 0 };
        }
    }
    return { rowIndex: 0, colIndex: 0 };
}