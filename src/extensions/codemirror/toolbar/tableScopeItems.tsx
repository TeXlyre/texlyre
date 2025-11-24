import type { EditorView } from '@codemirror/view';
import type { ToolbarItem } from 'codemirror-toolbar';
import { renderToString } from 'react-dom/server';

import { detectTableScope, type TableInfo, type TableType } from './tableScope';
import {
    ToolbarRowAddBeforeIcon,
    ToolbarRowAddAfterIcon,
    ToolbarRowRemoveIcon,
    ToolbarColAddBeforeIcon,
    ToolbarColAddAfterIcon,
    ToolbarColRemoveIcon,
} from '../../../components/common/Icons';

function addTypstRow(view: EditorView, info: TableInfo, before: boolean): boolean {
    const row = info.rows[info.rowIndex];
    if (!row) return false;

    const newCells = new Array(info.totalCols).fill('[]').join(', ');
    const newRow = `\t${newCells},\n`;

    let insertPos: number;
    if (before) {
        const doc = view.state.doc.toString();
        const lineStart = doc.lastIndexOf('\n', row.start - 1);
        insertPos = lineStart === -1 ? row.start : lineStart + 1;
    } else {
        const doc = view.state.doc.toString();
        let pos = row.end;
        const commaIdx = doc.indexOf(',', pos);
        if (commaIdx !== -1 && commaIdx < pos + 3) {
            pos = commaIdx + 1;
        }
        const newlineIdx = doc.indexOf('\n', pos);
        insertPos = newlineIdx !== -1 && newlineIdx < pos + 3 ? newlineIdx + 1 : pos;
    }

    view.dispatch({
        changes: { from: insertPos, to: insertPos, insert: newRow },
    });
    view.focus();
    return true;
}

function removeTypstRow(view: EditorView, info: TableInfo): boolean {
    if (info.totalRows <= 1) return false;
    const row = info.rows[info.rowIndex];
    if (!row) return false;

    const doc = view.state.doc.toString();
    let end = row.end;
    const commaAfter = doc.indexOf(',', end);
    if (commaAfter !== -1 && commaAfter < end + 3) {
        end = commaAfter + 1;
    }

    let start = row.start;
    const newlineBefore = doc.lastIndexOf('\n', start - 1);
    if (newlineBefore !== -1) {
        start = newlineBefore + 1;
    }

    view.dispatch({
        changes: { from: start, to: end + 1, insert: '' },
    });
    view.focus();
    return true;
}

function addTypstColumn(view: EditorView, info: TableInfo, before: boolean): boolean {
    const doc = view.state.doc.toString();
    const changes: { from: number; to: number; insert: string }[] = [];

    const colsMatch = doc.substring(info.start, info.end).match(/columns\s*:\s*(\d+)/);
    if (colsMatch) {
        const colsStart = info.start + doc.substring(info.start).indexOf(colsMatch[0]);
        const newCols = parseInt(colsMatch[1], 10) + 1;
        changes.push({ from: colsStart, to: colsStart + colsMatch[0].length, insert: `columns: ${newCols}` });
    }

    for (const row of info.rows) {
        const insertIdx = before ? info.colIndex : info.colIndex + 1;
        if (insertIdx === 0) {
            changes.push({ from: row.cells[0].start, to: row.cells[0].start, insert: '[], ' });
        } else if (insertIdx >= row.cells.length) {
            changes.push({ from: row.cells[row.cells.length - 1].end, to: row.cells[row.cells.length - 1].end, insert: ', []' });
        } else {
            const cell = row.cells[insertIdx];
            changes.push({ from: cell.start, to: cell.start, insert: '[], ' });
        }
    }

    changes.sort((a, b) => b.from - a.from);
    view.dispatch({ changes });
    view.focus();
    return true;
}

function removeTypstColumn(view: EditorView, info: TableInfo): boolean {
    if (info.totalCols <= 1) return false;

    const doc = view.state.doc.toString();
    const changes: { from: number; to: number; insert: string }[] = [];

    const colsMatch = doc.substring(info.start, info.end).match(/columns\s*:\s*(\d+)/);
    if (colsMatch) {
        const colsStart = info.start + doc.substring(info.start).indexOf(colsMatch[0]);
        const newCols = parseInt(colsMatch[1], 10) - 1;
        changes.push({ from: colsStart, to: colsStart + colsMatch[0].length, insert: `columns: ${newCols}` });
    }

    for (const row of info.rows) {
        const cell = row.cells[info.colIndex];
        if (!cell) continue;

        let start = cell.start;
        let end = cell.end;

        if (info.colIndex === 0) {
            const commaAfter = doc.indexOf(',', end);
            if (commaAfter !== -1 && commaAfter < end + 5) {
                end = commaAfter + 1;
                if (doc[end] === ' ') end++;
            }
        } else {
            const commaBefore = doc.lastIndexOf(',', start - 1);
            if (commaBefore !== -1 && commaBefore > start - 5) {
                start = commaBefore;
                if (doc[start - 1] === ' ') start--;
            }
        }

        changes.push({ from: start, to: end, insert: '' });
    }

    // Sort changes by position (descending) to apply from end to beginning
    changes.sort((a, b) => b.from - a.from);

    // Apply each change individually, starting from the end of the document
    // This way, earlier positions remain valid
    for (let i = 0; i < changes.length; i++) {
        const change = changes[i];

        // Get current document state
        const currentDoc = view.state.doc.toString();

        // Verify the change is still valid
        if (change.from >= 0 && change.to <= currentDoc.length && change.from <= change.to) {
            view.dispatch({
                changes: {
                    from: change.from,
                    to: change.to,
                    insert: change.insert
                }
            });
        }
    }

    view.focus();
    return true;
}

function addLatexRow(view: EditorView, info: TableInfo, before: boolean): boolean {
    const row = info.rows[info.rowIndex];
    if (!row) return false;
    const newCells = new Array(info.totalCols).fill('').join(' & ');
    const newRow = `${newCells} \\\\`;
    const doc = view.state.doc.toString();
    let insertPos: number;
    if (before) {
        insertPos = row.start;
        while (insertPos > 0 && /[ \t]/.test(doc[insertPos - 1])) insertPos--;
    } else {
        insertPos = row.end;
        while (insertPos < doc.length && /[ \t]/.test(doc[insertPos])) insertPos++;
        if (insertPos < doc.length && doc.substring(insertPos, insertPos + 2) === '\\\\') {
            insertPos += 2;
        }
        while (insertPos < doc.length && /[ \t]/.test(doc[insertPos])) insertPos++;
        if (insertPos < doc.length && doc[insertPos] === '\n') {
            insertPos++;
        }
    }

    const insertText = before ? `\n${newRow}` : `${newRow}\n`;

    view.dispatch({
        changes: { from: insertPos, to: insertPos, insert: insertText },
    });
    view.focus();
    return true;
}

function removeLatexRow(view: EditorView, info: TableInfo): boolean {
    if (info.totalRows <= 1) return false;
    const row = info.rows[info.rowIndex];
    if (!row) return false;

    const doc = view.state.doc.toString();
    let start = row.start;
    while (start > 0 && /[ \t]/.test(doc[start - 1])) start--;

    let end = row.end;
    while (end < doc.length && /[ \t]/.test(doc[end])) end++;
    if (end < doc.length && doc.substring(end, end + 2) === '\\\\') {
        end += 2;
    }
    while (end < doc.length && /[ \t]/.test(doc[end])) end++;
    if (end < doc.length && doc[end] === '\n') {
        end++;
    }

    view.dispatch({
        changes: { from: start, to: end, insert: '' },
    });
    view.focus();
    return true;
}

function addLatexColumn(view: EditorView, info: TableInfo, before: boolean): boolean {
    const doc = view.state.doc.toString();
    const changes: { from: number; to: number; insert: string }[] = [];

    const colSpecMatch = doc.substring(info.start, info.end).match(/\\begin\{(?:tabular|array|longtable|tabularx)\}(?:\[[^\]]*\])?\{([^}]+)\}/);
    if (colSpecMatch) {
        const colSpec = colSpecMatch[1];
        const newColSpec = insertColumnInSpec(colSpec, info.colIndex, before);
        const specStart = info.start + doc.substring(info.start).indexOf(colSpec);
        changes.push({ from: specStart, to: specStart + colSpec.length, insert: newColSpec });
    }

    for (const row of info.rows) {
        const insertIdx = before ? info.colIndex : info.colIndex + 1;

        if (insertIdx === 0) {
            const firstCell = row.cells[0];
            changes.push({ from: firstCell.start, to: firstCell.start, insert: ' & ' });
        } else if (insertIdx >= row.cells.length) {
            const lastCell = row.cells[row.cells.length - 1];
            changes.push({ from: lastCell.end, to: lastCell.end, insert: ' & ' });
        } else {
            const cell = row.cells[insertIdx];
            changes.push({ from: cell.start, to: cell.start, insert: ' & ' });
        }
    }

    changes.sort((a, b) => b.from - a.from);
    view.dispatch({ changes });
    view.focus();
    return true;
}

function removeLatexColumn(view: EditorView, info: TableInfo): boolean {
    if (info.totalCols <= 1) return false;

    const doc = view.state.doc.toString();
    const changes: { from: number; to: number; insert: string }[] = [];

    const colSpecMatch = doc.substring(info.start, info.end).match(/\\begin\{(?:tabular|array|longtable|tabularx)\}(?:\[[^\]]*\])?\{([^}]+)\}/);
    if (colSpecMatch) {
        const colSpec = colSpecMatch[1];
        const newColSpec = removeColumnFromSpec(colSpec, info.colIndex);
        const specStart = info.start + doc.substring(info.start).indexOf(colSpec);
        changes.push({ from: specStart, to: specStart + colSpec.length, insert: newColSpec });
    }

    for (const row of info.rows) {
        const cell = row.cells[info.colIndex];
        if (!cell) continue;

        let start = cell.start;
        let end = cell.end;

        if (info.colIndex === 0) {
            while (end < doc.length && /[ \t]/.test(doc[end])) end++;
            if (end < doc.length && doc[end] === '&') {
                end++;
                while (end < doc.length && /[ \t]/.test(doc[end])) end++;
            }
        } else {
            while (start > 0 && /[ \t]/.test(doc[start - 1])) start--;
            if (start > 0 && doc[start - 1] === '&') {
                start--;
                while (start > 0 && /[ \t]/.test(doc[start - 1])) start--;
            }
        }

        changes.push({ from: start, to: end, insert: '' });
    }

    changes.sort((a, b) => b.from - a.from);
    view.dispatch({ changes });
    view.focus();
    return true;
}

function insertColumnInSpec(colSpec: string, index: number, before: boolean): string {
    const positions = findColumnPositions(colSpec);
    const insertIdx = before ? index : index + 1;

    if (insertIdx >= positions.length) {
        return colSpec + 'c';
    }

    const insertPos = positions[insertIdx];
    return colSpec.slice(0, insertPos) + 'c' + colSpec.slice(insertPos);
}

function removeColumnFromSpec(colSpec: string, index: number): string {
    const positions = findColumnPositions(colSpec);

    if (index >= positions.length) return colSpec;

    const start = positions[index];
    const end = index + 1 < positions.length ? positions[index + 1] : colSpec.length;

    return colSpec.slice(0, start) + colSpec.slice(end);
}

function findColumnPositions(colSpec: string): number[] {
    const positions: number[] = [];
    let i = 0;

    while (i < colSpec.length) {
        const char = colSpec[i];
        if (/[lcrp]/.test(char)) {
            positions.push(i);
        } else if (char === 'p' || char === 'm' || char === 'b') {
            positions.push(i);
            if (i + 1 < colSpec.length && colSpec[i + 1] === '{') {
                let braceDepth = 1;
                i += 2;
                while (i < colSpec.length && braceDepth > 0) {
                    if (colSpec[i] === '{') braceDepth++;
                    else if (colSpec[i] === '}') braceDepth--;
                    i++;
                }
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
                    for (let k = 0; k < num; k++) {
                        positions.push(i);
                    }
                    braceDepth = 1;
                    j++;
                    while (j < colSpec.length && braceDepth > 0) {
                        if (colSpec[j] === '{') braceDepth++;
                        else if (colSpec[j] === '}') braceDepth--;
                        j++;
                    }
                    i = j;
                    continue;
                }
            }
        }
        i++;
    }

    return positions;
}

function createTableCommand(
    fileType: TableType,
    action: 'addRowBefore' | 'addRowAfter' | 'removeRow' | 'addColBefore' | 'addColAfter' | 'removeCol'
) {
    return (view: EditorView): boolean => {
        const info = detectTableScope(view, fileType);
        if (!info) return false;

        if (fileType === 'latex') {
            switch (action) {
                case 'addRowBefore': return addLatexRow(view, info, true);
                case 'addRowAfter': return addLatexRow(view, info, false);
                case 'removeRow': return removeLatexRow(view, info);
                case 'addColBefore': return addLatexColumn(view, info, true);
                case 'addColAfter': return addLatexColumn(view, info, false);
                case 'removeCol': return removeLatexColumn(view, info);
            }
        } else {
            switch (action) {
                case 'addRowBefore': return addTypstRow(view, info, true);
                case 'addRowAfter': return addTypstRow(view, info, false);
                case 'removeRow': return removeTypstRow(view, info);
                case 'addColBefore': return addTypstColumn(view, info, true);
                case 'addColAfter': return addTypstColumn(view, info, false);
                case 'removeCol': return removeTypstColumn(view, info);
            }
        }
        return false;
    };
}

export const createRowAddBefore = (fileType: TableType): ToolbarItem => ({
    key: `${fileType}-row-add-before`,
    label: 'Add Row Before',
    icon: renderToString(<ToolbarRowAddBeforeIcon />),
    command: createTableCommand(fileType, 'addRowBefore'),
});

export const createRowAddAfter = (fileType: TableType): ToolbarItem => ({
    key: `${fileType}-row-add-after`,
    label: 'Add Row After',
    icon: renderToString(<ToolbarRowAddAfterIcon />),
    command: createTableCommand(fileType, 'addRowAfter'),
});

export const createRowRemove = (fileType: TableType): ToolbarItem => ({
    key: `${fileType}-row-remove`,
    label: 'Remove Row',
    icon: renderToString(<ToolbarRowRemoveIcon />),
    command: createTableCommand(fileType, 'removeRow'),
});

export const createColAddBefore = (fileType: TableType): ToolbarItem => ({
    key: `${fileType}-col-add-before`,
    label: 'Add Column Before',
    icon: renderToString(<ToolbarColAddBeforeIcon />),
    command: createTableCommand(fileType, 'addColBefore'),
});

export const createColAddAfter = (fileType: TableType): ToolbarItem => ({
    key: `${fileType}-col-add-after`,
    label: 'Add Column After',
    icon: renderToString(<ToolbarColAddAfterIcon />),
    command: createTableCommand(fileType, 'addColAfter'),
});

export const createColRemove = (fileType: TableType): ToolbarItem => ({
    key: `${fileType}-col-remove`,
    label: 'Remove Column',
    icon: renderToString(<ToolbarColRemoveIcon />),
    command: createTableCommand(fileType, 'removeCol'),
});