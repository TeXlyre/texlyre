// src/extensions/codemirror/ListingsExtension.ts
import { booleanLiteral } from '@babel/types';
import { type Extension } from '@codemirror/state';
import { keymap, type KeyBinding } from '@codemirror/view';
import type { EditorView } from 'codemirror';

export type FileType = 'latex' | 'typst';

interface ListContext {
    type: 'latex-itemize' | 'latex-enumerate' | 'latex-description' | 'typst-bullet' | 'typst-numbered' | 'typst-term';
    indentLevel: number;
    itemPrefix: string;
    lineStart: number;
    lineEnd: number;
}

function detectLatexListContext(view: EditorView, pos: number): ListContext | null {
    const line = view.state.doc.lineAt(pos);
    const lineText = line.text;
    const trimmedText = lineText.trim();

    if (!trimmedText.startsWith('\\item')) {
        return null;
    }

    let searchPos = line.from;
    let depth = 0;
    let currentEnv: 'itemize' | 'enumerate' | 'description' | null = null;

    while (searchPos > 0) {
        const currentLine = view.state.doc.lineAt(searchPos);
        const currentText = currentLine.text.trim();

        const beginMatch = currentText.match(/\\begin\{(itemize|enumerate|description)\}/);
        if (beginMatch) {
            if (depth === 0) {
                currentEnv = beginMatch[1] as 'itemize' | 'enumerate' | 'description';
                break;
            }
            depth--;
        }

        const endMatch = currentText.match(/\\end\{(itemize|enumerate|description)\}/);
        if (endMatch) {
            depth++;
        }

        searchPos = currentLine.from - 1;
        if (searchPos < 0) break;
    }

    if (!currentEnv) {
        return null;
    }

    const leadingWhitespace = lineText.match(/^(\s*)/)?.[1] || '';
    const indentLevel = leadingWhitespace.length;

    return {
        type: `latex-${currentEnv}`,
        indentLevel,
        itemPrefix: currentEnv === 'description' ? '\\item[]' : '\\item',
        lineStart: line.from,
        lineEnd: line.to,
    };
}

function detectTypstListContext(view: EditorView, pos: number): ListContext | null {
    const line = view.state.doc.lineAt(pos);
    const lineText = line.text;
    const trimmedText = lineText.trim();

    let listType: 'typst-bullet' | 'typst-numbered' | 'typst-term' | null = null;
    let itemPrefix = '';

    if (trimmedText.match(/^-(\s|$)/)) {
        listType = 'typst-bullet';
        itemPrefix = '-';
    } else if (trimmedText.match(/^\+(\s|$)/)) {
        listType = 'typst-numbered';
        itemPrefix = '+';
    } else if (trimmedText.match(/^\/\s+\w+:/)) {
        listType = 'typst-term';
        itemPrefix = '/';
    } else {
        return null;
    }

    const leadingWhitespace = lineText.match(/^(\s*)/)?.[1] || '';
    const indentLevel = leadingWhitespace.length;

    return {
        type: listType,
        indentLevel,
        itemPrefix,
        lineStart: line.from,
        lineEnd: line.to,
    };
}

function findParentListContext(view: EditorView, fileType: FileType, startPos: number): ListContext | null {
    let searchPos = startPos;
    let linesSearched = 0;
    const maxLinesToSearch = 20;

    while (searchPos > 0 && linesSearched < maxLinesToSearch) {
        const currentLine = view.state.doc.lineAt(searchPos);
        const currentText = currentLine.text.trim();

        if (currentText === '') {
            return null;
        }

        if (fileType === 'latex') {
            if (currentText.match(/\\end\{(itemize|enumerate|description)\}/)) {
                return null;
            }
            if (currentText.startsWith('\\item')) {
                return detectLatexListContext(view, currentLine.from + 1);
            }
        } else if (fileType === 'typst') {
            if (currentText.match(/^[-+](\s|$)/) || currentText.match(/^\/\s+\w+:/)) {
                return detectTypstListContext(view, currentLine.from + 1);
            }
        }

        searchPos = currentLine.from - 1;
        linesSearched++;
        if (searchPos < 0) break;
    }

    return null;
}

function handleEnterInList(view: EditorView, fileType: FileType): boolean {
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    const lineText = line.text;
    const trimmedText = lineText.trim();

    let listContext = null;

    if (fileType === 'latex') {
        listContext = detectLatexListContext(view, pos);
    }
    if (fileType === 'typst') {
        listContext = detectTypstListContext(view, pos);
    }

    if (!listContext) {
        const hasContent = trimmedText.length > 0;
        const isItemLine = fileType === 'latex'
            ? trimmedText.startsWith('\\item')
            : (trimmedText.match(/^[-+](\s|$)/) || trimmedText.match(/^\/\s+\w+:/));

        if (!hasContent || isItemLine) {
            return false;
        }

        listContext = findParentListContext(view, fileType, line.from - 1);
    }

    if (!listContext) {
        return false;
    }

    if (fileType === 'latex') {
        const isOnItemLine = trimmedText.startsWith('\\item');

        if (isOnItemLine) {
            const afterItem = trimmedText.substring(listContext.itemPrefix.length).trim();

            if (!afterItem) {
                view.dispatch({
                    changes: {
                        from: line.from,
                        to: line.to,
                        insert: '',
                    },
                    selection: { anchor: line.from },
                });
                return true;
            }
        }

        const indent = ' '.repeat(listContext.indentLevel);
        const newLine = `\n${indent}${listContext.itemPrefix} `;

        view.dispatch({
            changes: {
                from: pos,
                to: pos,
                insert: newLine,
            },
            selection: { anchor: pos + newLine.length },
        });
        return true;
    } else if (fileType === 'typst') {
        const isOnItemLine = trimmedText.match(/^[-+](\s|$)/) || trimmedText.match(/^\/\s+\w+:/);

        if (isOnItemLine) {
            const prefixMatch = trimmedText.match(/^([-+]|\/)(\s+\w+:)?(\s*)(.*)$/);
            if (prefixMatch) {
                const afterItem = prefixMatch[4].trim();

                if (!afterItem) {
                    view.dispatch({
                        changes: {
                            from: line.from,
                            to: line.to,
                            insert: '\n',
                        },
                        selection: { anchor: line.from + 1 },
                    });
                    return true;
                }
            }
        }

        const indent = ' '.repeat(listContext.indentLevel);
        const newLine = `\n${indent}${listContext.itemPrefix} `;

        view.dispatch({
            changes: {
                from: pos,
                to: pos,
                insert: newLine,
            },
            selection: { anchor: pos + newLine.length },
        });
        return true;
    }
}

function handleShiftEnterInList(view: EditorView, fileType: FileType): boolean {
    const pos = view.state.selection.main.head;

    let listContext = null;

    if (fileType === 'latex') {
        listContext = detectLatexListContext(view, pos);
    }
    if (fileType === 'typst') {
        listContext = detectTypstListContext(view, pos);
    }

    if (!listContext) {
        const line = view.state.doc.lineAt(pos);
        listContext = findParentListContext(view, fileType, line.from - 1);
    }

    if (!listContext) {
        return false;
    }

    const indent = ' '.repeat(listContext.indentLevel + 2);
    const newLine = `\n${indent}`;

    view.dispatch({
        changes: {
            from: pos,
            to: pos,
            insert: newLine,
        },
        selection: { anchor: pos + newLine.length },
    });

    return true;
}

export function createListingsExtension(fileType: FileType): Extension {
    const listingsKeymap: KeyBinding[] = [
        {
            key: 'Enter',
            run: (view: EditorView) => handleEnterInList(view, fileType),
        },
        {
            key: 'Shift-Enter',
            run: (view: EditorView) => handleShiftEnterInList(view, fileType),
        },
    ];

    return keymap.of(listingsKeymap);
}