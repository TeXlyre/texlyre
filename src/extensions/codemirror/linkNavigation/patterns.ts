export interface LinkPattern {
    pattern: RegExp;
    type: 'url' | 'file' | 'doi' | 'bibentry';
    fileType?: 'latex' | 'typst' | 'bib';
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
        pattern: /\\includegraphics(?:\[[^\]]*\])?\{([^}]+)\}/g,
        type: 'file',
        fileType: 'latex'
    },
    {
        pattern: /\\includesvg(?:\[[^\]]*\])?\{([^}]+)\}/g,
        type: 'file',
        fileType: 'latex'
    },
    {
        pattern: /\\input\{([^}]+)\}/g,
        type: 'file',
        fileType: 'latex'
    },
    {
        pattern: /\\include\{([^}]+)\}/g,
        type: 'file',
        fileType: 'latex'
    },
    {
        pattern: /\\subfile\{([^}]+)\}/g,
        type: 'file',
        fileType: 'latex'
    },
    {
        pattern: /\\cite(?:\w*)\{([^}]+)\}/g,
        type: 'bibentry',
        fileType: 'latex'
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
        pattern: /https?:\/\/[^\s\)>\]]+/g,
        type: 'url',
        fileType: 'typst',
        extractValue: (match) => match[0]
    },
    {
        pattern: /#include\s+"([^"]+)"/g,
        type: 'file',
        fileType: 'typst',
        extractValue: (match) => match[1]
    },
    {
        pattern: /image\s*\(\s*"([^"]+)"/g,
        type: 'file',
        fileType: 'typst',
        extractValue: (match) => match[1]
    },
    {
        pattern: /#cite\s*\(\s*<([^>]+)>/g,
        type: 'bibentry',
        fileType: 'typst',
        extractValue: (match) => match[1]
    },
    {
        pattern: /@([a-zA-Z0-9_:-]+)/g,
        type: 'bibentry',
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
        pattern: /\bdoi\s*=\s*([^,\s}]+)/gi,
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
        pattern: /\burl\s*=\s*([^,\s}]+)/gi,
        type: 'url',
        fileType: 'bib',
        extractValue: (match) => match[1]
    },
    {
        pattern: /https?:\/\/[^\s,}\]]+/g,
        type: 'url',
        fileType: 'bib',
        extractValue: (match) => match[0]
    }
];