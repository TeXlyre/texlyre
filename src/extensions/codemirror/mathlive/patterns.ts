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
];

export const typstMathPatterns: MathPattern[] = [
    {
        pattern: /\$([^\$\n]+)\$/g,
        type: 'inline',
        fileType: 'typst',
        getDelimiters: () => ({ start: '$', end: '$' }),
    },
    {
        pattern: /\$ ([^\$](?:[^\$]|\$(?!\s))*?) \$/g,
        type: 'display',
        fileType: 'typst',
        getDelimiters: () => ({ start: '$ ', end: ' $' }),
    },
];

export function getPatternsForFileType(fileType: FileType): MathPattern[] {
    return fileType === 'latex' ? latexMathPatterns : typstMathPatterns;
}