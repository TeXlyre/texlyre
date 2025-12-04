// src/extensions/codemirror/autocomplete/patterns.ts

export const latexCommandPatterns = [
    {
        commands: ['includegraphics', 'includesvg'],
        pattern: /\\(includegraphics|includesvg)(?:\[[^\]]*\])?\{([^}]*)/,
        fileTypes: 'images' as const,
    },
    {
        commands: ['input', 'include', 'subfile'],
        pattern: /\\(input|include|subfile)\{([^}]*)/,
        fileTypes: 'tex' as const,
    },
    {
        commands: ['bibliography', 'addbibresource'],
        pattern: /\\(bibliography|addbibresource)(?:\[[^\]]*\])?\{([^}]*)/,
        fileTypes: 'bib' as const,
    },
    {
        commands: ['lstinputlisting', 'verbatiminput'],
        pattern: /\\(lstinputlisting|verbatiminput)(?:\[[^\]]*\])?\{([^}]*)/,
        fileTypes: 'all' as const,
    },
];

export const typstCommandPatterns = [
    {
        commands: ['include'],
        pattern: /#include\s+"/,
        fileTypes: 'typst' as const,
    },
    {
        commands: ['image'],
        pattern: /\bimage\s*\(\s*"/,
        fileTypes: 'images' as const,
    },
    {
        commands: ['read'],
        pattern: /\bread\s*\(\s*"/,
        fileTypes: 'all' as const,
    },
    {
        commands: ['csv'],
        pattern: /\bcsv\s*\(\s*"/,
        fileTypes: 'data' as const,
    },
    {
        commands: ['json', 'yaml', 'toml'],
        pattern: /\b(json|yaml|toml)\s*\(\s*"/,
        fileTypes: 'data' as const,
    },
    {
        commands: ['bibliography'],
        pattern: /#bibliography\("/,
        fileTypes: 'bib' as const,
    }
];

export const typstCitationPatterns = [
    {
        commands: ['cite'],
        pattern: /#cite\s*\(\s*</,
        type: 'citation' as const,
    },
    {
        commands: ['cite-label'],
        pattern: /#cite\s*\(\s*label\s*\(\s*"/,
        type: 'citation' as const,
    },
];

export const citationCommandPatterns = [
    {
        commands: ['cite', 'citep', 'citet', 'autocite', 'textcite', 'parencite', 'footcite', 'fullcite'],
        pattern: /\\(cite|citep|citet|autocite|textcite|parencite|footcite|fullcite)\w*(?:\[[^\]]*\])?(?:\[[^\]]*\])?\{([^}]*)/,
        type: 'citation' as const,
    },
    ...typstCitationPatterns,
];

export const latexReferencePatterns = [
    {
        commands: ['ref', 'eqref', 'pageref', 'autoref', 'nameref', 'cref', 'Cref', 'vref'],
        pattern: /\\(ref|eqref|pageref|autoref|nameref|cref|Cref|vref)\{([^}]*)/,
        type: 'reference' as const,
    },
];

export const typstReferencePatterns = [
    {
        commands: ['ref'],
        pattern: /@([a-zA-Z0-9_-]*)/,
        type: 'reference' as const,
    },
    {
        commands: ['ref-function'],
        pattern: /#ref\s*\(\s*<([^>]*)/,
        type: 'reference' as const,
    },
];

export const bibtexEntryPatterns = [
    {
        pattern: /@([a-zA-Z]*)\{([^,}]*)/,
        type: 'bibtex-entry' as const,
    },
];