import type { EditorView } from '@codemirror/view';

export type ColorType = 'text' | 'highlight';
export type FileType = 'latex' | 'typst';

export interface ColorInfo {
    type: ColorType;
    fileType: FileType;
    start: number;
    end: number;
    color: string;
    contentStart: number;
    contentEnd: number;
}

export function detectColorScope(view: EditorView, fileType: FileType): ColorInfo | null {
    const pos = view.state.selection.main.head;
    const doc = view.state.doc.toString();

    if (fileType === 'latex') {
        return detectLatexColor(doc, pos);
    }
    return detectTypstColor(doc, pos);
}

function detectLatexColor(doc: string, pos: number): ColorInfo | null {
    const textColorPattern = /\\textcolor(?:\[HTML\])?\{([^}]+)\}\{/g;
    const highlightPattern = /\\colorbox\{([^}]+)\}\{/g;

    let match;
    while ((match = textColorPattern.exec(doc)) !== null) {
        const start = match.index;
        const contentStart = start + match[0].length;
        const end = findMatchingBrace(doc, contentStart);

        if (pos >= start && pos <= end) {
            return {
                type: 'text',
                fileType: 'latex',
                start,
                end,
                color: match[1],
                contentStart,
                contentEnd: end,
            };
        }
    }

    while ((match = highlightPattern.exec(doc)) !== null) {
        const start = match.index;
        const contentStart = start + match[0].length;
        const end = findMatchingBrace(doc, contentStart);

        if (pos >= start && pos <= end) {
            return {
                type: 'highlight',
                fileType: 'latex',
                start,
                end,
                color: match[1],
                contentStart,
                contentEnd: end,
            };
        }
    }

    return null;
}

function detectTypstColor(doc: string, pos: number): ColorInfo | null {
    const textPattern = /#text\(fill:\s*rgb\("([^"]+)"\)\)\[/g;
    const highlightPattern = /#highlight\(fill:\s*rgb\("([^"]+)"\)\)\[/g;

    let match;
    while ((match = textPattern.exec(doc)) !== null) {
        const start = match.index;
        const contentStart = start + match[0].length;
        const end = findMatchingBracket(doc, contentStart);

        if (pos >= start && pos <= end) {
            return {
                type: 'text',
                fileType: 'typst',
                start,
                end,
                color: match[1],
                contentStart,
                contentEnd: end,
            };
        }
    }

    while ((match = highlightPattern.exec(doc)) !== null) {
        const start = match.index;
        const contentStart = start + match[0].length;
        const end = findMatchingBracket(doc, contentStart);

        if (pos >= start && pos <= end) {
            return {
                type: 'highlight',
                fileType: 'typst',
                start,
                end,
                color: match[1],
                contentStart,
                contentEnd: end,
            };
        }
    }

    return null;
}

function findMatchingBrace(doc: string, start: number): number {
    let depth = 1;
    let i = start;

    while (i < doc.length && depth > 0) {
        if (doc[i] === '{') depth++;
        else if (doc[i] === '}') depth--;
        i++;
    }

    return depth === 0 ? i : start;
}

function findMatchingBracket(doc: string, start: number): number {
    let depth = 1;
    let i = start;

    while (i < doc.length && depth > 0) {
        if (doc[i] === '[') depth++;
        else if (doc[i] === ']') depth--;
        i++;
    }

    return depth === 0 ? i : start;
}