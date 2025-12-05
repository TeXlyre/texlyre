import type { EditorView } from '@codemirror/view';
import { latexLinkPatterns, typstLinkPatterns, bibLinkPatterns, type LinkPattern } from './patterns';

export interface DetectedLink {
    from: number;
    to: number;
    type: 'url' | 'file' | 'doi' | 'bibentry';
    value: string;
    fileType: 'latex' | 'typst' | 'bib';
}

export class LinkDetector {
    private currentFileType: 'latex' | 'typst' | 'bib' = 'latex';

    setFileType(fileName?: string, content?: string): void {
        if (!fileName && !content) {
            this.currentFileType = 'latex';
            return;
        }

        if (fileName) {
            const ext = fileName.split('.').pop()?.toLowerCase();
            if (ext === 'typ' || ext === 'typst') {
                this.currentFileType = 'typst';
                return;
            }
            if (ext === 'bib' || ext === 'bibtex') {
                this.currentFileType = 'bib';
                return;
            }
            if (ext === 'tex' || ext === 'latex') {
                this.currentFileType = 'latex';
                return;
            }
        }

        if (content) {
            if (content.includes('= ') || content.includes('#import')) {
                this.currentFileType = 'typst';
            } else if (content.includes('@article') || content.includes('@book')) {
                this.currentFileType = 'bib';
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

    private getPatterns(): LinkPattern[] {
        switch (this.currentFileType) {
            case 'typst':
                return typstLinkPatterns;
            case 'bib':
                return bibLinkPatterns;
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
        if (fileType === 'typst' && type === 'bibentry' && match[0].startsWith('@')) {
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