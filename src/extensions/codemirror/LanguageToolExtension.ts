// src/extensions/codemirror/LanguageToolExtension.ts
import type { Extension } from '@codemirror/state';
import { linter, type Diagnostic } from '@codemirror/lint';

const SUPPORTED_EXTENSIONS = new Set([
    'tex',
    'latex',
    'typ',
    'typst',
    'md',
    'markdown',
    'txt',
    'bib',
    'bibtex',
]);

const DEFAULT_SERVER_URL = 'http://localhost:8010';
const DEFAULT_LANGUAGE = 'auto';

function normalizeUrl(url: string): string {
    return url.trim().replace(/\/+$/, '');
}

function mapLanguageToolSeverity(issueType?: string): 'error' | 'warning' | 'info' | 'hint' {
    switch (issueType) {
        case 'misspelling':
        case 'grammar':
        case 'typographical':
            return 'warning';
        case 'style':
            return 'info';
        case 'other':
            return 'info';
        default:
            return 'warning';
    }
}

function buildMessage(match: any): string {
    const suggestions = Array.isArray(match.replacements)
        ? match.replacements.slice(0, 3).map((replacement: any) => replacement.value).join(', ')
        : '';
    const baseMessage = match.message || 'LanguageTool issue';
    return suggestions
        ? `${baseMessage} (${suggestions})`
        : baseMessage;
}

function shouldIgnoreLanguageToolMatch(match: any, fullText: string): boolean {
    const message = String(match.message || '');
    const offset = Number(match.offset ?? -1);
    const length = Number(match.length || 0);
    const matchedText = offset >= 0 && length > 0
        ? fullText.substring(offset, offset + length)
        : '';
    const leadingChar = offset > 0 ? fullText[offset - 1] : '';
    const tokenText = leadingChar && /^[\\#$]$/.test(leadingChar)
        ? leadingChar + matchedText
        : matchedText;

    const whitespacePattern = /(?:multiple|double|extra|consecutive|too many)\s+(?:spaces?|blank lines?|newlines?|line breaks?|whitespace)/i;
    const newlinePattern = /(?:multiple|extra|consecutive|too many)\s+(?:blank lines?|new lines?|line breaks?)/i;
    const spacePattern = /(?:multiple|double|extra|too many)\s+spaces?/i;

    if (whitespacePattern.test(message) || newlinePattern.test(message) || spacePattern.test(message)) {
        return true;
    }

    if (/\b(extra\s+spaces|double\s+spaces|multiple\s+spaces|too\s+many\s+spaces|extra\s+whitespace|extra\s+line break|extra\s+newline|blank\s+line|multiple\s+blank\s+lines|multiple\s+new\s+lines)\b/i.test(message)) {
        return true;
    }

    // Suppress matches inside \anycommand[...] option brackets.
    // Covers \usepackage[...], \documentclass[...], \includegraphics[...], etc.
    const bracketSearchStart = Math.max(0, offset - 200);
    const textBefore = fullText.slice(bracketSearchStart, offset);
    const cmdBracketMatch = textBefore.match(/\\[a-zA-Z]+\[[^\]]*$/);
    if (cmdBracketMatch) {
        const closeIdx = fullText.indexOf(']', offset);
        if (closeIdx !== -1) {
            return true;
        }
    }

    const commandTokenPattern = /^(?:[\\#$][^\s\n\r\t\[\]{}()<>.,:;!?\'"`]+(?:[\[\]{}])?)$/;
    if (/^Possible spelling mistake found\./i.test(message) && commandTokenPattern.test(tokenText.trim())) {
        return true;
    }

    // Suppress matches inside $...$ inline math and $$...$$ display math.
    // Walk the text before the offset, counting unescaped $ tokens.
    // A double $$ counts as one display-math delimiter; a single $ as an
    // inline-math delimiter. An odd total count means we are inside math.
    let dollarCount = 0;
    for (let i = 0; i < offset; ) {
        if (fullText[i] === '$' && (i === 0 || fullText[i - 1] !== '\\')) {
            if (fullText[i + 1] === '$') {
                dollarCount++;
                i += 2;
            } else {
                dollarCount++;
                i++;
            }
        } else {
            i++;
        }
    }
    if (dollarCount % 2 === 1) return true;

    // Suppress matches inside \begin{env}...\end{env} for math and verbatim environments.
    const mathEnvs = /^(equation|align|alignat|gather|multline|flalign|eqnarray|math|displaymath|split|aligned|gathered|alignedat)(\*)?$/;
    const verbatimEnvs = /^(verbatim|lstlisting|minted|comment|Verbatim|BVerbatim|LVerbatim|alltt|filecontents)(\*)?$/;
    const beginPattern = /\\begin\{([^}]+)\}/g;
    let beginMatch: RegExpExecArray | null;
    while ((beginMatch = beginPattern.exec(fullText)) !== null) {
        if (beginMatch.index >= offset) break;
        const envName = beginMatch[1];
        if (!mathEnvs.test(envName) && !verbatimEnvs.test(envName)) continue;
        const endTag = `\\end{${envName}}`;
        const endIdx = fullText.indexOf(endTag, beginMatch.index + beginMatch[0].length);
        if (endIdx === -1 || offset < endIdx + endTag.length) {
            return true;
        }
    }

    return false;
}

async function fetchLanguageToolDiagnostics(
    text: string,
    serverUrl: string,
    language: string,
): Promise<Diagnostic[]> {
    const normalizedUrl = normalizeUrl(serverUrl) || DEFAULT_SERVER_URL;
    const targetUrl = `${normalizedUrl}/v2/check`;
    const params = new URLSearchParams({
        language: language || DEFAULT_LANGUAGE,
        text,
    });

    try {
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
        });

        if (!response.ok) {
            return [];
        }

        const data = await response.json();
        if (!data || !Array.isArray(data.matches)) {
            return [];
        }

        return data.matches
            .filter((match: any) => !shouldIgnoreLanguageToolMatch(match, text))
            .map((match: any) => {
                const offset = Number(match.offset) || 0;
                const length = Number(match.length) || 0;
                const from = Math.max(0, offset);
                const to = Math.min(text.length, from + length);

                return {
                    from,
                    to,
                    severity: mapLanguageToolSeverity(match.rule?.issueType),
                    message: buildMessage(match),
                    source: 'LanguageTool',
                    info: {
                        replacements: Array.isArray(match.replacements)
                            ? match.replacements.map((replacement: any) => replacement.value)
                            : [],
                        raw: match,
                    },
                } as Diagnostic;
            });
    } catch {
        return [];
    }
}

export function createLanguageToolExtension(
    fileName: string,
    serverUrl: string,
    language: string,
): Extension[] {
    const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
        return [];
    }

    return [
        linter(async (view) => {
            const text = view.state.doc.toString();
            return await fetchLanguageToolDiagnostics(text, serverUrl, language);
        }, {
            delay: 700,
            tooltipFilter: () => [],
        }),
    ];
}
