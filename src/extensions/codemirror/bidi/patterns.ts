// src/extensions/codemirror/bidi/patterns.ts
export type FileType = 'latex' | 'typst' | 'bib';

export interface BidiPattern {
    pattern: RegExp;
    fileType: FileType;
}

export const latexBidiPatterns: BidiPattern[] = [
    { pattern: /\$[^\$\n]+\$/g, fileType: 'latex' },
    { pattern: /\\\[[\s\S]*?\\\]/g, fileType: 'latex' },
    { pattern: /\\\([\s\S]*?\\\)/g, fileType: 'latex' },
    { pattern: /\\begin\{(?:equation|align|aligned|gather|cases|array|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix)\*?\}[\s\S]*?\\end\{(?:equation|align|aligned|gather|cases|array|matrix|pmatrix|bmatrix|Bmatrix|vmatrix|Vmatrix)\*?\}/g, fileType: 'latex' },
    // Commands with argument groups, consuming trailing structural punctuation
    { pattern: /\\[A-Za-z@]+\*?(?:\s*(?:\[[^\]]*\]|\{[^}]*\}|\[[^\]]*$|\{[^}]*$))+[{}[\]);,]*/gm, fileType: 'latex' },
    // Standalone commands consuming trailing structural punctuation
    { pattern: /\\[A-Za-z@]+\*?(?!\s*[\[{])[{}[\]);,]*/g, fileType: 'latex' },
    // Bare structural punctuation only when preceded by a command match (opening braces/brackets)
    { pattern: /(?<=\\[A-Za-z@]+[^{}[\]]*)[{}[\]]+/g, fileType: 'latex' },
];

export const typstBidiPatterns: BidiPattern[] = [
    { pattern: /\$[\s\S]*?\$/g, fileType: 'typst' },
    // Functions with argument groups, consuming trailing structural punctuation
    { pattern: /#[A-Za-z_][A-Za-z0-9_\-]*(?:\s*(?:\([^)]*\)|\[[^\]]*\]|\{[^}]*\}|\([^)]*$|\[[^\]]*$|\{[^}]*$))+[{}[\]);,]*/gm, fileType: 'typst' },
    // Bare #identifier consuming trailing structural punctuation
    { pattern: /#[A-Za-z_][A-Za-z0-9_\-]*(?!\s*[\(\[\{])[{}[\]);,]*/g, fileType: 'typst' },
];

export const bibBidiPatterns: BidiPattern[] = [
    { pattern: /@[A-Za-z]+\s*[\({][^@]*/g, fileType: 'bib' },
    { pattern: /[A-Za-z_][A-Za-z0-9_]*\s*=\s*(?:\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}|"[^"]*")/g, fileType: 'bib' },
];

export function getPatternsForFileType(fileType: FileType): BidiPattern[] {
    switch (fileType) {
        case 'latex': return latexBidiPatterns;
        case 'typst': return typstBidiPatterns;
        case 'bib': return bibBidiPatterns;
    }
}

export const allBidiPatterns: BidiPattern[] = [
    ...latexBidiPatterns,
    ...typstBidiPatterns,
    ...bibBidiPatterns,
];