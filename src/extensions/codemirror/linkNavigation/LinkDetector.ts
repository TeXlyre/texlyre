// src/extensions/codemirror/linkNavigation/LinkDetector.ts
import type { EditorView } from '@codemirror/view';
import { isLatexFile, isTypstFile, isBibFile, isMarkdownFile, isLatexContent, isTypstContent, isBibContent } from '../../../utils/fileUtils';
import { latexLinkPatterns, typstLinkPatterns, bibLinkPatterns, markdownLinkPatterns, type LinkPattern } from './patterns';

export interface DetectedLink {
    from: number;
    to: number;
    type: 'url' | 'file' | 'doi' | 'bibentry' | 'reference';
    value: string;
    fileType: 'latex' | 'typst' | 'bib' | 'markdown';
}

export class LinkDetector {
    private currentFileType: 'latex' | 'typst' | 'bib' | 'markdown' = 'latex';

    setFileType(fileName?: string, content?: string): void {
        if (!fileName && !content) {
            this.currentFileType = 'latex';
            return;
        }

        if (fileName) {
            if (isTypstFile(fileName)) {
                this.currentFileType = 'typst';
                return;
            }
            if (isBibFile(fileName)) {
                this.currentFileType = 'bib';
                return;
            }
            if (isMarkdownFile(fileName)) {
                this.currentFileType = 'markdown';
                return;
            }
            if (isLatexFile(fileName)) {
                this.currentFileType = 'latex';
                return;
            }
        }

        if (content) {
            if (isTypstContent(content)) {
                this.currentFileType = 'typst';
            } else if (isBibContent(content)) {
                this.currentFileType = 'bib';
            } else if (isLatexContent(content)) {
                this.currentFileType = 'latex';
            } else {
                this.currentFileType = 'latex';
            }
        }
    }

    detectLinkAtPosition(view: EditorView, pos: number): DetectedLink | null {
        const doc = view.state.doc;
        const line = doc.lineAt(pos);
        const lineText = line.text;
        const posInLine = pos - line.from;

        const patterns = this.getPatterns();

        for (const patternConfig of patterns) {
            const { pattern, type, fileType, extractValue } = patternConfig;
            pattern.lastIndex = 0;
            let match;

            while ((match = pattern.exec(lineText)) !== null) {
                const matchStart = match.index;
                const matchEnd = matchStart + match[0].length;

                if (posInLine >= matchStart && posInLine <= matchEnd) {
                    if (type === 'bibentry' && fileType === 'latex') {
                        const individualLink = this.detectIndividualCitation(lineText, match, posInLine, line.from);
                        if (individualLink) {
                            return individualLink;
                        }
                    }

                    if (type === 'reference' && fileType === 'typst' && match[0].startsWith('@')) {
                        const label = match[1];
                        return {
                            from: line.from + matchStart,
                            to: line.from + matchEnd,
                            type: 'reference',
                            value: label,
                            fileType: 'typst'
                        };
                    }

                    const rawValue = extractValue ? extractValue(match) : (match[1] || match[0]);

                    const { valueStart, valueEnd } = this.findValueBounds(
                        lineText,
                        match,
                        type,
                        this.currentFileType,
                        rawValue
                    );

                    const extractedValue = lineText.substring(valueStart, valueEnd).trim();

                    return {
                        from: line.from + valueStart,
                        to: line.from + valueEnd,
                        type,
                        value: extractedValue,
                        fileType: fileType || this.currentFileType
                    };
                }
            }
        }

        return null;
    }

    private detectIndividualCitation(
        lineText: string,
        match: RegExpExecArray,
        posInLine: number,
        lineFrom: number
    ): DetectedLink | null {
        const braceStart = lineText.indexOf('{', match.index);
        if (braceStart === -1 || posInLine <= braceStart) {
            return null;
        }

        const braceEnd = lineText.indexOf('}', braceStart);
        if (braceEnd === -1 || posInLine > braceEnd) {
            return null;
        }

        const content = lineText.substring(braceStart + 1, braceEnd);
        const citations = content.split(',').map(c => c.trim()).filter(c => c.length > 0);

        let currentPos = braceStart + 1;
        for (const citation of citations) {
            while (currentPos < braceEnd && lineText[currentPos] === ' ') {
                currentPos++;
            }

            const citationStart = currentPos;
            const citationEnd = citationStart + citation.length;

            if (posInLine >= citationStart && posInLine <= citationEnd) {
                return {
                    from: lineFrom + citationStart,
                    to: lineFrom + citationEnd,
                    type: 'bibentry',
                    value: citation,
                    fileType: 'latex'
                };
            }

            currentPos = citationEnd;
            const nextComma = lineText.indexOf(',', currentPos);
            if (nextComma !== -1 && nextComma < braceEnd) {
                currentPos = nextComma + 1;
            } else {
                break;
            }
        }

        return null;
    }

    private getPatterns(): LinkPattern[] {
        switch (this.currentFileType) {
            case 'typst':
                return typstLinkPatterns;
            case 'bib':
                return bibLinkPatterns;
            case 'markdown':
                return markdownLinkPatterns;
            default:
                return latexLinkPatterns;
        }
    }

    private findValueBounds(
        lineText: string,
        match: RegExpExecArray,
        type: string,
        fileType: string,
        rawValue: string
    ): { valueStart: number; valueEnd: number } {
        if (fileType === 'markdown' && type === 'url') {
            if (match[0].startsWith('[')) {
                const openParen = lineText.indexOf('(', match.index);
                const closeParen = lineText.indexOf(')', openParen);
                if (openParen !== -1 && closeParen !== -1) {
                    return {
                        valueStart: openParen + 1,
                        valueEnd: closeParen
                    };
                }
            }
            if (match[0].startsWith('http')) {
                return {
                    valueStart: match.index,
                    valueEnd: match.index + match[0].length
                };
            }
        }

        if (fileType === 'typst' && type === 'reference' && match[0].startsWith('@')) {
            return {
                valueStart: match.index + 1,
                valueEnd: match.index + match[0].length
            };
        }

        if (fileType === 'typst' && type === 'url' && match[0].startsWith('http')) {
            return {
                valueStart: match.index,
                valueEnd: match.index + match[0].length
            };
        }

        if (fileType === 'bib' && (type === 'url' || type === 'doi')) {
            if (match[0].startsWith('http')) {
                return {
                    valueStart: match.index,
                    valueEnd: match.index + match[0].length
                };
            }

            const fieldMatch = lineText.substring(match.index).match(/^\s*(doi|url)\s*=/i);
            if (fieldMatch) {
                const afterEquals = match.index + fieldMatch[0].length;
                let valueStart = afterEquals;
                let valueEnd = afterEquals;

                while (valueStart < lineText.length && /\s/.test(lineText[valueStart])) {
                    valueStart++;
                }

                if (valueStart < lineText.length && lineText[valueStart] === '{') {
                    const closeIndex = lineText.indexOf('}', valueStart + 1);
                    if (closeIndex !== -1) {
                        return {
                            valueStart: valueStart + 1,
                            valueEnd: closeIndex
                        };
                    }
                }

                valueEnd = valueStart;
                while (valueEnd < lineText.length &&
                    !/[,\s}]/.test(lineText[valueEnd])) {
                    valueEnd++;
                }

                return {
                    valueStart,
                    valueEnd
                };
            }
        }

        const openDelimiters: { [key: string]: string } = {
            '{': '}',
            '"': '"',
            '<': '>'
        };

        for (let i = match.index; i < match.index + match[0].length; i++) {
            const char = lineText[i];
            if (char in openDelimiters) {
                const closeDelim = openDelimiters[char];
                const closeIndex = lineText.indexOf(closeDelim, i + 1);
                if (closeIndex !== -1) {
                    return {
                        valueStart: i + 1,
                        valueEnd: closeIndex
                    };
                }
            }
        }

        return {
            valueStart: match.index,
            valueEnd: match.index + match[0].length
        };
    }
}