// src/extensions/codemirror/linkNavigation/patterns.ts
export interface LinkPattern {
    pattern: RegExp;
    type: 'url' | 'file' | 'doi' | 'bibentry' | 'reference';
    fileType?: 'latex' | 'typst' | 'bib' | 'markdown';
    extractValue?: (match: RegExpExecArray) => string;
}

export const latexLinkPatterns: LinkPattern[] = [
    {
        pattern: /\\href\{([^}]+)\}/g,
        type: 'url',
        fileType: 'latex'
    },
    {
        pattern: /\\url\{([^}]+)\}/g,
        type: 'url',
        fileType: 'latex'
    },
    {
        pattern: /\\cite(?:\w*)\{([^}]+)\}/g,
        type: 'bibentry',
        fileType: 'latex'
    },
    {
        pattern: /\\(?:ref|eqref|pageref|autoref|nameref|cref|Cref|vref)\{([^}]+)\}/g,
        type: 'reference',
        fileType: 'latex',
        extractValue: (match) => match[1]
    }
];

export const typstLinkPatterns: LinkPattern[] = [
    {
        pattern: /#link\("([^"]+)"\)/g,
        type: 'url',
        fileType: 'typst',
        extractValue: (match) => match[1]
    },
    {
        pattern: /https?:\/\/[^\s\)>\]"']+/g,
        type: 'url',
        fileType: 'typst',
        extractValue: (match) => match[0]
    },
    {
        pattern: /#import\s+"@preview\/([^:"]+):([^"]+)"/g,
        type: 'url',
        fileType: 'typst',
        extractValue: (match) => {
            const name = match[1];
            const version = match[2];

            return `https://github.com/typst/packages/tree/main/packages/preview/${name}/${version}`;
        }
    },
    {
        pattern: /#cite\s*\(\s*<([^>]+)>/g,
        type: 'bibentry',
        fileType: 'typst',
        extractValue: (match) => match[1]
    },
    {
        pattern: /@([a-zA-Z0-9_:-]+)/g,
        type: 'reference',
        fileType: 'typst',
        extractValue: (match) => match[1]
    },
    {
        pattern: /#ref\s*\(\s*<([^>]+)>/g,
        type: 'reference',
        fileType: 'typst',
        extractValue: (match) => match[1]
    }
];

export const bibLinkPatterns: LinkPattern[] = [
    {
        pattern: /\bdoi\s*=\s*\{([^}]+)\}/gi,
        type: 'doi',
        fileType: 'bib',
        extractValue: (match) => match[1]
    },
    {
        pattern: /\bdoi\s*=\s*"?([^,\s}"]+)"?/gi,
        type: 'doi',
        fileType: 'bib',
        extractValue: (match) => match[1]
    },
    {
        pattern: /\burl\s*=\s*\{([^}]+)\}/gi,
        type: 'url',
        fileType: 'bib',
        extractValue: (match) => match[1]
    },
    {
        pattern: /\burl\s*=\s*"?([^,\s}"]+)"?/gi,
        type: 'url',
        fileType: 'bib',
        extractValue: (match) => match[1]
    },
    {
        pattern: /https?:\/\/[^\s,}\]"']+/g,
        type: 'url',
        fileType: 'bib',
        extractValue: (match) => match[0]
    }
];

export const markdownLinkPatterns: LinkPattern[] = [
    {
        pattern: /\[([^\]]+)\]\(([^)]+)\)/g,
        type: 'url',
        fileType: 'markdown',
        extractValue: (match) => match[2]
    },
    {
        pattern: /https?:\/\/[^\s\)>\]"']+/g,
        type: 'url',
        fileType: 'markdown',
        extractValue: (match) => match[0]
    }
];
