// src/extensions/codemirror/mathlive/patterns.ts
export type FileType = 'latex' | 'typst';

export interface MathPattern {
    pattern: RegExp;
    type: 'inline' | 'display';
    fileType: FileType;
    getDelimiters: (match: string) => { start: string; end: string };
}

export const latexMathPatterns: MathPattern[] = [
    {
        pattern: /\$([^\$\n]+)\$/g,
        type: 'inline',
        fileType: 'latex',
        getDelimiters: () => ({ start: '$', end: '$' }),
    },
    {
        pattern: /\\\[[\s\S]*?\\\]/g,
        type: 'display',
        fileType: 'latex',
        getDelimiters: () => ({ start: '\\[', end: '\\]' }),
    },
    {
        pattern: /\\\([\s\S]*?\\\)/g,
        type: 'inline',
        fileType: 'latex',
        getDelimiters: () => ({ start: '\\(', end: '\\)' }),
    },
    {
        pattern: /\\begin\{equation\*?\}[\s\S]*?\\end\{equation\*?\}/g,
        type: 'display',
        fileType: 'latex',
        getDelimiters: (match: string) => {
            const isStarred = match.includes('equation*');
            return {
                start: isStarred ? '\\begin{equation*}' : '\\begin{equation}',
                end: isStarred ? '\\end{equation*}' : '\\end{equation}',
            };
        },
    },
    {
        pattern: /\\begin\{align\*?\}[\s\S]*?\\end\{align\*?\}/g,
        type: 'display',
        fileType: 'latex',
        getDelimiters: (match: string) => {
            const isStarred = match.includes('align*');
            return {
                start: isStarred ? '\\begin{align*}' : '\\begin{align}',
                end: isStarred ? '\\end{align*}' : '\\end{align}',
            };
        },
    },
    {
        pattern: /\\begin\{aligned\*?\}[\s\S]*?\\end\{aligned\*?\}/g,
        type: 'display',
        fileType: 'latex',
        getDelimiters: (match: string) => {
            const isStarred = match.includes('aligned*');
            return {
                start: isStarred ? '\\begin{aligned*}' : '\\begin{aligned}',
                end: isStarred ? '\\end{aligned*}' : '\\end{aligned}',
            };
        },
    },
    {
        pattern: /\\begin\{gather\*?\}[\s\S]*?\\end\{gather\*?\}/g,
        type: 'display',
        fileType: 'latex',
        getDelimiters: (match: string) => {
            const isStarred = match.includes('gather*');
            return {
                start: isStarred ? '\\begin{gather*}' : '\\begin{gather}',
                end: isStarred ? '\\end{gather*}' : '\\end{gather}',
            };
        },
    },
    {
        pattern: /\\begin\{cases\}[\s\S]*?\\end\{cases\}/g,
        type: 'display',
        fileType: 'latex',
        getDelimiters: () => ({ start: '\\begin{cases}', end: '\\end{cases}' }),
    },
    {
        pattern: /\\begin\{array\}[\s\S]*?\\end\{array\}/g,
        type: 'display',
        fileType: 'latex',
        getDelimiters: () => ({ start: '\\begin{array}', end: '\\end{array}' }),
    },
    {
        pattern: /\\begin\{matrix\*?\}[\s\S]*?\\end\{matrix\*?\}/g,
        type: 'display',
        fileType: 'latex',
        getDelimiters: (match: string) => {
            const isStarred = match.includes('matrix*');
            return {
                start: isStarred ? '\\begin{matrix*}' : '\\begin{matrix}',
                end: isStarred ? '\\end{matrix*}' : '\\end{matrix}',
            };
        },
    },
    {
        pattern: /\\begin\{pmatrix\*?\}[\s\S]*?\\end\{pmatrix\*?\}/g,
        type: 'display',
        fileType: 'latex',
        getDelimiters: (match: string) => {
            const isStarred = match.includes('pmatrix*');
            return {
                start: isStarred ? '\\begin{pmatrix*}' : '\\begin{pmatrix}',
                end: isStarred ? '\\end{pmatrix*}' : '\\end{pmatrix}',
            };
        },
    },
    {
        pattern: /\\begin\{bmatrix\*?\}[\s\S]*?\\end\{bmatrix\*?\}/g,
        type: 'display',
        fileType: 'latex',
        getDelimiters: (match: string) => {
            const isStarred = match.includes('bmatrix*');
            return {
                start: isStarred ? '\\begin{bmatrix*}' : '\\begin{bmatrix}',
                end: isStarred ? '\\end{bmatrix*}' : '\\end{bmatrix}',
            };
        },
    },
    {
        pattern: /\\begin\{Bmatrix\*?\}[\s\S]*?\\end\{Bmatrix\*?\}/g,
        type: 'display',
        fileType: 'latex',
        getDelimiters: (match: string) => {
            const isStarred = match.includes('Bmatrix*');
            return {
                start: isStarred ? '\\begin{Bmatrix*}' : '\\begin{Bmatrix}',
                end: isStarred ? '\\end{Bmatrix*}' : '\\end{Bmatrix}',
            };
        },
    },
    {
        pattern: /\\begin\{vmatrix\*?\}[\s\S]*?\\end\{vmatrix\*?\}/g,
        type: 'display',
        fileType: 'latex',
        getDelimiters: (match: string) => {
            const isStarred = match.includes('vmatrix*');
            return {
                start: isStarred ? '\\begin{vmatrix*}' : '\\begin{vmatrix}',
                end: isStarred ? '\\end{vmatrix*}' : '\\end{vmatrix}',
            };
        },
    },
    {
        pattern: /\\begin\{Vmatrix\*?\}[\s\S]*?\\end\{Vmatrix\*?\}/g,
        type: 'display',
        fileType: 'latex',
        getDelimiters: (match: string) => {
            const isStarred = match.includes('Vmatrix*');
            return {
                start: isStarred ? '\\begin{Vmatrix*}' : '\\begin{Vmatrix}',
                end: isStarred ? '\\end{Vmatrix*}' : '\\end{Vmatrix}',
            };
        },
    },
];

export const typstMathPatterns: MathPattern[] = [
    {
        pattern: /\$([\s\S]*?)\$/g,
        type: 'inline',
        fileType: 'typst',
        getDelimiters: () => ({ start: '$', end: '$' }),
    },
];

export function getPatternsForFileType(fileType: FileType): MathPattern[] {
    return fileType === 'latex' ? latexMathPatterns : typstMathPatterns;
}
