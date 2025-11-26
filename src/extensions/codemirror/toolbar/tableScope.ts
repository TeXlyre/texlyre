// src/extensions/codemirror/toolbar/tableScope.ts
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

    if (!deepestTable) return null;

    const totalCols = deepestTable.totalCols || 1;
    const rows = parseLatexRows(doc, deepestTable, totalCols);
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
    const envPattern = /\\begin\{(tabular|array|longtable|tabularx)\}(\[[^\]]*\])?\{([^}]+)\}/g;
    let match;

    while ((match = envPattern.exec(doc)) !== null) {
        const envName = match[1];
        const start = match.index;
        const colSpec = match[3];
        const totalCols = countLatexColumns(colSpec);
        const contentStart = match.index + match[0].length;

        const endPattern = new RegExp(`\\\\end\\{${envName}\\}`);
        const endMatch = endPattern.exec(doc.substring(contentStart));

        if (endMatch) {
            const contentEnd = contentStart + endMatch.index;
            const end = contentEnd + endMatch[0].length;

            tables.push({
                start,
                end,
                contentStart,
                contentEnd,
                colSpec,
                totalCols,
            });
        }
    }

    return tables;
}

function countLatexColumns(colSpec: string): number {
    let count = 0;
    let i = 0;

    while (i < colSpec.length) {
        const char = colSpec[i];
        if (/[lcrp]/.test(char)) {
            count++;
        } else if (char === 'p' || char === 'm' || char === 'b') {
            if (i + 1 < colSpec.length && colSpec[i + 1] === '{') {
                let braceDepth = 1;
                i += 2;
                while (i < colSpec.length && braceDepth > 0) {
                    if (colSpec[i] === '{') braceDepth++;
                    else if (colSpec[i] === '}') braceDepth--;
                    i++;
                }
                count++;
                continue;
            }
        } else if (char === '*') {
            if (i + 1 < colSpec.length && colSpec[i + 1] === '{') {
                let braceDepth = 1;
                let j = i + 2;
                let repeatCount = '';
                while (j < colSpec.length && braceDepth > 0) {
                    if (colSpec[j] === '{') braceDepth++;
                    else if (colSpec[j] === '}') braceDepth--;
                    else if (braceDepth === 1) repeatCount += colSpec[j];
                    j++;
                }
                const num = parseInt(repeatCount, 10);
                if (!isNaN(num) && j < colSpec.length && colSpec[j] === '{') {
                    braceDepth = 1;
                    j++;
                    let specStart = j;
                    while (j < colSpec.length && braceDepth > 0) {
                        if (colSpec[j] === '{') braceDepth++;
                        else if (colSpec[j] === '}') braceDepth--;
                        j++;
                    }
                    const innerSpec = colSpec.substring(specStart, j - 1);
                    count += num * countLatexColumns(innerSpec);
                    i = j;
                    continue;
                }
            }
        }
        i++;
    }

    return count;
}

function parseLatexRows(doc: string, table: TableBoundary, totalCols: number): TableRow[] {
    const content = doc.substring(table.contentStart, table.contentEnd);
    const rows: TableRow[] = [];

    let currentPos = 0;
    let rowStart = 0;
    let braceDepth = 0;
    let escaped = false;

    while (currentPos < content.length) {
        const char = content[currentPos];

        if (escaped) {
            escaped = false;
            currentPos++;
            continue;
        }

        if (char === '\\') {
            if (currentPos + 1 < content.length) {
                if (content[currentPos + 1] === '\\') {
                    if (braceDepth === 0) {
                        const rowContent = content.substring(rowStart, currentPos);
                        if (containsTableData(rowContent)) {
                            const absoluteStart = table.contentStart + rowStart;
                            const absoluteEnd = table.contentStart + currentPos;
                            const cells = parseLatexCells(doc, absoluteStart, absoluteEnd, totalCols);

                            if (cells.length > 0) {
                                rows.push({
                                    start: absoluteStart,
                                    end: absoluteEnd,
                                    cells,
                                });
                            }
                        }
                        currentPos += 2;
                        rowStart = currentPos;
                        continue;
                    }
                } else if (/[a-zA-Z]/.test(content[currentPos + 1])) {
                    escaped = true;
                }
            }
        } else if (char === '{') {
            braceDepth++;
        } else if (char === '}') {
            braceDepth--;
        }

        currentPos++;
    }

    if (rowStart < content.length) {
        const rowContent = content.substring(rowStart);
        if (containsTableData(rowContent)) {
            const absoluteStart = table.contentStart + rowStart;
            const absoluteEnd = table.contentStart + content.length;
            const cells = parseLatexCells(doc, absoluteStart, absoluteEnd, totalCols);

            if (cells.length > 0) {
                rows.push({
                    start: absoluteStart,
                    end: absoluteEnd,
                    cells,
                });
            }
        }
    }

    return rows;
}

function containsTableData(rowContent: string): boolean {
    const trimmed = rowContent.trim();
    if (!trimmed) return false;

    let pos = 0;

    while (pos < trimmed.length) {
        while (pos < trimmed.length && /\s/.test(trimmed[pos])) pos++;
        if (pos >= trimmed.length) return false;

        if (trimmed[pos] === '\\') {
            const remaining = trimmed.substring(pos);
            const cmdMatch = remaining.match(/^\\([a-zA-Z]+)/);
            if (cmdMatch) {
                const cmd = cmdMatch[1];
                if (['hline', 'cline', 'midrule', 'toprule', 'bottomrule'].includes(cmd)) {
                    pos += cmdMatch[0].length;
                    if (pos < trimmed.length && trimmed[pos] === '{') {
                        let braceDepth = 1;
                        pos++;
                        while (pos < trimmed.length && braceDepth > 0) {
                            if (trimmed[pos] === '{') braceDepth++;
                            else if (trimmed[pos] === '}') braceDepth--;
                            pos++;
                        }
                    }
                    continue;
                }
            }
        }

        return true;
    }

    return false;
}

function parseLatexCells(doc: string, start: number, end: number, totalCols: number): TableCell[] {
    const cells: TableCell[] = [];
    const content = doc.substring(start, end);
    let cellStart = 0;
    let braceDepth = 0;
    let i = 0;

    while (i < content.length && /\s/.test(content[i])) {
        i++;
        cellStart = i;
    }

    while (i < content.length) {
        const char = content[i];

        if (char === '\\') {
            if (i + 1 < content.length && /[a-zA-Z]/.test(content[i + 1])) {
                let cmdEnd = i + 1;
                while (cmdEnd < content.length && /[a-zA-Z]/.test(content[cmdEnd])) {
                    cmdEnd++;
                }
                const cmd = content.substring(i + 1, cmdEnd);

                if (['hline', 'cline', 'midrule', 'toprule', 'bottomrule'].includes(cmd)) {
                    if (cmdEnd < content.length && content[cmdEnd] === '{') {
                        let braceDepth = 1;
                        cmdEnd++;
                        while (cmdEnd < content.length && braceDepth > 0) {
                            if (content[cmdEnd] === '{') braceDepth++;
                            else if (content[cmdEnd] === '}') braceDepth--;
                            cmdEnd++;
                        }
                    }
                    i = cmdEnd;
                    while (i < content.length && /\s/.test(content[i])) i++;
                    cellStart = i;
                    continue;
                }
                i = cmdEnd;
                continue;
            }
            i++;
            continue;
        }

        if (char === '{') {
            braceDepth++;
        } else if (char === '}') {
            braceDepth--;
        } else if (char === '&' && braceDepth === 0) {
            const cellContent = content.substring(cellStart, i).trim();
            cells.push({
                start: start + cellStart,
                end: start + i,
                content: cellContent,
            });
            cellStart = i + 1;
        }

        i++;
    }

    if (cellStart < content.length) {
        const cellContent = content.substring(cellStart).trim();
        cells.push({
            start: start + cellStart,
            end: end,
            content: cellContent,
        });
    }

    while (cells.length < totalCols) {
        cells.push({
            start: end,
            end: end,
            content: '',
        });
    }

    return cells.slice(0, totalCols);
}

function findLatexPosition(rows: TableRow[], pos: number): { rowIndex: number; colIndex: number } {
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];

        if (pos >= row.start && pos <= row.end) {
            for (let colIndex = 0; colIndex < row.cells.length; colIndex++) {
                const cell = row.cells[colIndex];
                if (pos >= cell.start && pos <= cell.end) {
                    return { rowIndex, colIndex };
                }
            }
            return { rowIndex, colIndex: row.cells.length - 1 };
        }
    }
    return { rowIndex: rows.length > 0 ? rows.length - 1 : 0, colIndex: 0 };
}