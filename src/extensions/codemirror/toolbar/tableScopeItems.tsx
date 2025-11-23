
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

function addLatexRow(view: EditorView, info: TableInfo, before: boolean): boolean {
    const row = info.rows[info.rowIndex];
    if (!row) return false;

    const newRow = '\t\t' + new Array(info.totalCols).fill('').join(' & ') + ' \\\\\n\t\t\\hline\n';
    const insertPos = before ? row.start : row.end + 2;

    view.dispatch({
        changes: { from: insertPos, to: insertPos, insert: newRow },
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
    let end = row.end + 2;

    const beforeHline = doc.lastIndexOf('\\hline', start);
    if (beforeHline !== -1 && doc.substring(beforeHline, start).trim() === '\\hline') {
        start = beforeHline;
    }

    const afterHline = doc.indexOf('\\hline', end);
    if (afterHline !== -1 && afterHline < end + 10) {
        end = afterHline + 6;
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

    const colSpecMatch = doc.substring(info.start, info.end).match(/\\begin\{tabular\}\{([^}]*)\}/);
    if (colSpecMatch) {
        const colSpec = colSpecMatch[1];
        const colSpecStart = info.start + doc.substring(info.start).indexOf(colSpec);
        const cols = colSpec.split('').filter(c => /[lcr]/.test(c));
        const insertIdx = before ? info.colIndex : info.colIndex + 1;
        cols.splice(insertIdx, 0, 'c');
        const newColSpec = colSpec.replace(/[lcr]+/, cols.join('|'));
        changes.push({ from: colSpecStart, to: colSpecStart + colSpec.length, insert: newColSpec });
    }

    for (const row of info.rows) {
        const insertIdx = before ? info.colIndex : info.colIndex + 1;
        if (insertIdx === 0) {
            changes.push({ from: row.cells[0].start, to: row.cells[0].start, insert: ' & ' });
        } else if (insertIdx >= row.cells.length) {
            changes.push({ from: row.cells[row.cells.length - 1].end, to: row.cells[row.cells.length - 1].end, insert: ' & ' });
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

    const colSpecMatch = doc.substring(info.start, info.end).match(/\\begin\{tabular\}\{([^}]*)\}/);
    if (colSpecMatch) {
        const colSpec = colSpecMatch[1];
        const colSpecStart = info.start + doc.substring(info.start).indexOf(colSpec);
        const cols = colSpec.split('').filter(c => /[lcr]/.test(c));
        cols.splice(info.colIndex, 1);
        const newColSpec = colSpec.replace(/[lcr]+/, cols.join('|'));
        changes.push({ from: colSpecStart, to: colSpecStart + colSpec.length, insert: newColSpec });
    }

    for (const row of info.rows) {
        const cell = row.cells[info.colIndex];
        if (!cell) continue;

        let start = cell.start;
        let end = cell.end;

        if (info.colIndex > 0) {
            const prevCell = row.cells[info.colIndex - 1];
            start = prevCell.end;
        } else if (info.colIndex < row.cells.length - 1) {
            const nextCell = row.cells[info.colIndex + 1];
            end = nextCell.start;
        }

        changes.push({ from: start, to: end, insert: '' });
    }

    changes.sort((a, b) => b.from - a.from);
    view.dispatch({ changes });
    view.focus();
    return true;
}

function addTypstRow(view: EditorView, info: TableInfo, before: boolean): boolean {
    const row = info.rows[info.rowIndex];
    if (!row) return false;

    const newCells = new Array(info.totalCols).fill('[]').join(', ');
    const newRow = `\t${newCells},\n`;
    const insertPos = before ? row.start : row.end + 1;

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

        const textBefore = doc.substring(start - 2, start);
        const textAfter = doc.substring(end, end + 2);

        if (textAfter.includes(',')) {
            end = doc.indexOf(',', end) + 1;
            if (doc[end] === ' ') end++;
        } else if (textBefore.includes(',')) {
            start = doc.lastIndexOf(',', start - 1);
        }

        changes.push({ from: start, to: end, insert: '' });
    }

    changes.sort((a, b) => b.from - a.from);
    view.dispatch({ changes });
    view.focus();
    return true;
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