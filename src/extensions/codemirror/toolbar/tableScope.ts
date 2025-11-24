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

interface TableBoundary {
    start: number;
    end: number;
    contentStart: number;
    contentEnd: number;
    colSpec?: string;
    totalCols?: number;
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
    const tables = findLatexTableBoundaries(doc);

    let deepestTable: TableBoundary | null = null;
    let smallestRange = Infinity;

    for (const table of tables) {
        if (pos >= table.start && pos <= table.end) {
            const range = table.end - table.start;
            if (range < smallestRange) {
                deepestTable = table;
                smallestRange = range;
            }
        }
    }

    if (!deepestTable || !deepestTable.colSpec) return null;

    const totalCols = (deepestTable.colSpec.match(/[lcr|p]/gi) || []).filter(c => c !== '|').length;
    const rows = parseLatexRowsAtDepth(doc, deepestTable);
    const { rowIndex, colIndex } = findLatexPosition(rows, pos);

    return {
        type: 'latex',
        start: deepestTable.start,
        end: deepestTable.end,
        rowIndex,
        colIndex,
        totalRows: rows.length,
        totalCols,
        rows,
    };
}

function findLatexTableBoundaries(doc: string): TableBoundary[] {
    const tables: TableBoundary[] = [];
    const stack: Array<{ start: number; contentStart: number }> = [];

    let i = 0;
    while (i < doc.length) {
        if (doc.substring(i).startsWith('\\begin{tabular}')) {
            const start = i;
            i += 15;

            while (i < doc.length && /\s/.test(doc[i])) i++;

            const colSpecMatch = doc.substring(i).match(/^(\{[^}]*\})/);
            if (colSpecMatch) {
                const colSpec = colSpecMatch[1];
                i += colSpecMatch[0].length;
                stack.push({ start, contentStart: i });
            }
        } else if (doc.substring(i).startsWith('\\end{tabular}')) {
            if (stack.length > 0) {
                const tableStart = stack.pop()!;
                const contentEnd = i;
                const end = i + 13;

                const fullText = doc.substring(tableStart.start, end);
                const colSpecMatch = fullText.match(/\\begin\{tabular\}\s*(\{[^}]*\})/);

                tables.push({
                    start: tableStart.start,
                    end,
                    contentStart: tableStart.contentStart,
                    contentEnd,
                    colSpec: colSpecMatch ? colSpecMatch[1] : undefined,
                });
            }
            i += 13;
        } else {
            i++;
        }
    }

    return tables;
}

function parseLatexRowsAtDepth(doc: string, table: TableBoundary): TableRow[] {
    const rows: TableRow[] = [];
    const content = doc.substring(table.contentStart, table.contentEnd);

    let depth = 0;
    let rowStart = table.contentStart;
    let currentContent = '';

    for (let i = 0; i < content.length; i++) {
        const absPos = table.contentStart + i;

        if (content.substring(i).startsWith('\\begin{tabular}')) {
            depth++;
            currentContent += content.substring(i, i + 15);
            i += 14;
        } else if (content.substring(i).startsWith('\\end{tabular}')) {
            depth--;
            currentContent += content.substring(i, i + 13);
            i += 12;
        } else if (content.substring(i).startsWith('\\\\') && depth === 0) {
            const trimmed = currentContent.replace(/\\hline/g, '').trim();
            if (trimmed) {
                const cells = parseLatexCellsAtDepth(trimmed, rowStart, doc, table);
                if (cells.length > 0) {
                    rows.push({
                        start: rowStart,
                        end: absPos,
                        cells,
                    });
                }
            }
            currentContent = '';
            rowStart = absPos + 2;
            i += 1;
        } else {
            currentContent += content[i];
        }
    }

    const trimmed = currentContent.replace(/\\hline/g, '').trim();
    if (trimmed && depth === 0) {
        const cells = parseLatexCellsAtDepth(trimmed, rowStart, doc, table);
        if (cells.length > 0) {
            rows.push({
                start: rowStart,
                end: table.contentEnd,
                cells,
            });
        }
    }

    return rows;
}

function parseLatexCellsAtDepth(rowContent: string, rowStart: number, doc: string, table: TableBoundary): TableCell[] {
    const cells: TableCell[] = [];
    let depth = 0;
    let cellContent = '';
    let cellStart = rowStart;

    for (let i = 0; i < rowContent.length; i++) {
        const absPos = rowStart + i;

        if (doc.substring(absPos).startsWith('\\begin{tabular}')) {
            depth++;
            cellContent += rowContent.substring(i, i + 15);
            i += 14;
        } else if (doc.substring(absPos).startsWith('\\end{tabular}')) {
            depth--;
            cellContent += rowContent.substring(i, i + 13);
            i += 12;
        } else if (rowContent[i] === '&' && depth === 0) {
            const trimmed = cellContent.trim();
            if (trimmed || cells.length > 0) {
                const contentStart = cellStart + cellContent.indexOf(trimmed);
                cells.push({
                    start: contentStart,
                    end: contentStart + trimmed.length,
                    content: trimmed,
                });
            }
            cellContent = '';
            cellStart = absPos + 1;
        } else {
            cellContent += rowContent[i];
        }
    }

    const trimmed = cellContent.trim();
    if (trimmed || cells.length > 0) {
        const contentStart = cellStart + cellContent.indexOf(trimmed);
        cells.push({
            start: contentStart,
            end: contentStart + trimmed.length,
            content: trimmed,
        });
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
    const tables = findTypstTableBoundaries(doc);

    let deepestTable: TableBoundary | null = null;
    let smallestRange = Infinity;

    for (const table of tables) {
        if (pos >= table.start && pos <= table.end) {
            const range = table.end - table.start;
            if (range < smallestRange) {
                deepestTable = table;
                smallestRange = range;
            }
        }
    }

    if (!deepestTable) return null;

    const content = doc.substring(deepestTable.contentStart, deepestTable.contentEnd);
    const colsMatch = content.match(/columns\s*:\s*(\d+)/);
    const totalCols = colsMatch ? parseInt(colsMatch[1], 10) : 1;

    const rows = parseTypstRowsAtDepth(doc, deepestTable, totalCols);
    const { rowIndex, colIndex } = findTypstPosition(rows, pos);

    return {
        type: 'typst',
        start: deepestTable.start,
        end: deepestTable.end,
        rowIndex,
        colIndex,
        totalRows: rows.length,
        totalCols,
        rows,
    };
}

function findTypstTableBoundaries(doc: string): TableBoundary[] {
    const tables: TableBoundary[] = [];
    const stack: Array<{ start: number; contentStart: number }> = [];

    let i = 0;
    while (i < doc.length) {
        if (doc.substring(i).startsWith('#table')) {
            const start = i;
            i += 6;

            while (i < doc.length && /\s/.test(doc[i])) i++;

            if (i < doc.length && doc[i] === '(') {
                i++;
                stack.push({ start, contentStart: i });
            }
        } else if (doc[i] === '(' && i > 0 && !stack.some(s => s.contentStart === i)) {
            if (stack.length > 0) {
                const lastInStack = stack[stack.length - 1];
                if (i > lastInStack.contentStart) {
                    stack.push({ start: i, contentStart: i + 1 });
                }
            }
        } else if (doc[i] === ')') {
            if (stack.length > 0) {
                const tableStart = stack.pop()!;

                const isTableStart = doc.substring(tableStart.start).startsWith('#table');
                if (isTableStart) {
                    tables.push({
                        start: tableStart.start,
                        end: i + 1,
                        contentStart: tableStart.contentStart,
                        contentEnd: i,
                    });
                }
            }
            i++;
            continue;
        }
        i++;
    }

    return tables;
}

function parseTypstRowsAtDepth(doc: string, table: TableBoundary, totalCols: number): TableRow[] {
    const content = doc.substring(table.contentStart, table.contentEnd);
    const cells: TableCell[] = [];

    let depth = 0;
    let i = 0;

    while (i < content.length) {
        if (content[i] === '[' && depth === 0) {
            const cellStart = table.contentStart + i;
            let j = i + 1;
            let bracketDepth = 1;

            while (j < content.length && bracketDepth > 0) {
                if (content[j] === '[') bracketDepth++;
                else if (content[j] === ']') bracketDepth--;
                j++;
            }

            if (bracketDepth === 0) {
                const cellEnd = table.contentStart + j;
                const cellContent = content.substring(i + 1, j - 1);
                cells.push({
                    start: cellStart,
                    end: cellEnd,
                    content: cellContent,
                });
                i = j;
                continue;
            }
        } else if (content[i] === '(') {
            depth++;
        } else if (content[i] === ')') {
            depth--;
        }
        i++;
    }

    const rows: TableRow[] = [];
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
        const rowStart = row.start;
        const rowEnd = rowIndex < rows.length - 1 ? rows[rowIndex + 1].start : row.end;

        if (pos >= rowStart && pos < rowEnd) {
            for (let colIndex = 0; colIndex < row.cells.length; colIndex++) {
                const cell = row.cells[colIndex];
                if (pos >= cell.start && pos <= cell.end) {
                    return { rowIndex, colIndex };
                }
            }

            for (let colIndex = 0; colIndex < row.cells.length - 1; colIndex++) {
                const currentCell = row.cells[colIndex];
                const nextCell = row.cells[colIndex + 1];
                if (pos > currentCell.end && pos < nextCell.start) {
                    return { rowIndex, colIndex: colIndex + 1 };
                }
            }

            return { rowIndex, colIndex: row.cells.length - 1 };
        }
    }
    return { rowIndex: rows.length > 0 ? rows.length - 1 : 0, colIndex: 0 };
}