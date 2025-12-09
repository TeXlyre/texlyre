// src/extensions/codemirror/autocomplete/ReferenceCompletionHandler.ts
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';

import { filePathCacheService } from '../../../services/FilePathCacheService';
import { isLatexFile, isTypstFile } from '../../../utils/fileUtils';
import { latexReferencePatterns, typstReferencePatterns } from './patterns';

export class ReferenceCompletionHandler {
    private texLabels: Map<string, string[]> = new Map();
    private typstLabels: Map<string, string[]> = new Map();

    initialize() {
        this.texLabels = filePathCacheService.getTexLabels();
        this.typstLabels = filePathCacheService.getTypstLabels();
    }

    destroy() {
    }

    updateLabels(labels: Map<string, string[]>) {
        const isTexLabels = Array.from(labels.keys()).some(path => isLatexFile(path));
        const isTypstLabels = Array.from(labels.keys()).some(path => isTypstFile(path));

        if (isTexLabels) {
            this.texLabels = labels;
        } else if (isTypstLabels) {
            this.typstLabels = labels;
        }
    }

    private findLatexReferenceCommand(context: CompletionContext): { command: string; partial: string; type: 'reference' } | null {
        const line = context.state.doc.lineAt(context.pos);
        const lineText = line.text;
        const posInLine = context.pos - line.from;

        for (const { pattern, type } of latexReferencePatterns) {
            const matches = Array.from(lineText.matchAll(new RegExp(pattern.source, 'g')));

            for (const match of matches) {
                const matchStart = match.index!;
                const braceStart = lineText.indexOf('{', matchStart);
                const braceEnd = lineText.indexOf('}', braceStart);

                if (braceStart !== -1 && posInLine > braceStart && (braceEnd === -1 || posInLine <= braceEnd)) {
                    const partial = lineText.substring(braceStart + 1, posInLine);
                    return { command: match[1], partial, type };
                }
            }
        }

        return null;
    }

    private findTypstReferenceCommand(context: CompletionContext): { command: string; partial: string; type: 'reference' } | null {
        const line = context.state.doc.lineAt(context.pos);
        const lineText = line.text;
        const posInLine = context.pos - line.from;

        for (const { pattern, type } of typstReferencePatterns) {
            const isRefFunction = pattern.source.includes('#ref');

            if (isRefFunction) {
                const textBeforeCursor = lineText.substring(0, posInLine);
                const match = textBeforeCursor.match(pattern);

                if (match) {
                    const partial = match[1] || '';
                    return { command: 'ref', partial, type };
                }
            } else {
                const matches = Array.from(lineText.matchAll(new RegExp(pattern.source, 'g')));

                for (const match of matches) {
                    if (match.index === undefined) continue;

                    const matchStart = match.index;
                    const matchEnd = matchStart + match[0].length;

                    if (posInLine > matchStart && posInLine <= matchEnd) {
                        const partial = match[1] || '';
                        return { command: 'ref', partial, type };
                    }
                }
            }
        }

        return null;
    }

    private handleLatexReferenceCompletion(context: CompletionContext, referenceInfo: any): CompletionResult | null {
        const partial = referenceInfo.partial;
        const allLabels: Array<{ label: string; filePath: string }> = [];

        for (const [filePath, labels] of this.texLabels.entries()) {
            for (const label of labels) {
                allLabels.push({ label, filePath });
            }
        }

        const filteredLabels = allLabels.filter(({ label }) =>
            !partial || label.toLowerCase().includes(partial.toLowerCase())
        );

        const options = this.createLabelOptions(filteredLabels, partial);
        if (options.length === 0) return null;

        const partialStart = this.getReferenceCompletionStart(context, latexReferencePatterns);

        return {
            from: partialStart,
            options,
            validFor: /^[^}]*$/,
        };
    }

    private handleTypstReferenceCompletion(context: CompletionContext, referenceInfo: any): CompletionResult | null {
        const partial = referenceInfo.partial;
        const allLabels: Array<{ label: string; filePath: string }> = [];

        for (const [filePath, labels] of this.typstLabels.entries()) {
            for (const label of labels) {
                allLabels.push({ label, filePath });
            }
        }

        const filteredLabels = allLabels.filter(({ label }) =>
            !partial || label.toLowerCase().includes(partial.toLowerCase())
        );

        const options = this.createLabelOptions(filteredLabels, partial);
        if (options.length === 0) return null;

        const partialStart = this.getReferenceCompletionStart(context, typstReferencePatterns);

        return {
            from: partialStart,
            options,
            validFor: /^[^>\s]*$/,
        };
    }

    private createLabelOptions(labels: Array<{ label: string; filePath: string }>, partial: string) {
        return labels
            .sort((a, b) => {
                const aStartsWith = a.label.toLowerCase().startsWith(partial.toLowerCase());
                const bStartsWith = b.label.toLowerCase().startsWith(partial.toLowerCase());
                if (aStartsWith && !bStartsWith) return -1;
                if (!aStartsWith && bStartsWith) return 1;
                return a.label.localeCompare(b.label);
            })
            .slice(0, 20)
            .map(({ label, filePath }) => {
                const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);

                return {
                    label,
                    detail: fileName,
                    info: filePath,
                    apply: (view: EditorView, completion: any, from: number, to: number) => {
                        view.dispatch({
                            changes: { from, to, insert: label },
                            selection: { anchor: from + label.length }
                        });
                    },
                    boost: partial && label.toLowerCase().startsWith(partial.toLowerCase()) ? 10 : 0,
                };
            });
    }

    private getReferenceCompletionStart(context: CompletionContext, patterns: any[]): number {
        const line = context.state.doc.lineAt(context.pos);
        const lineText = line.text;
        const posInLine = context.pos - line.from;

        for (const { pattern } of patterns) {
            const matches = Array.from(lineText.matchAll(new RegExp(pattern.source, 'g')));

            for (const match of matches) {
                if (match.index === undefined) continue;

                const isTypstReference = pattern.source.includes('@');
                const isRefFunction = pattern.source.includes('#ref');

                if (isTypstReference && !isRefFunction) {
                    const atPos = match.index;
                    const matchEnd = match.index + match[0].length;
                    if (posInLine > atPos && posInLine <= matchEnd) {
                        return line.from + atPos + 1;
                    }
                } else if (isRefFunction) {
                    const anglePos = match.index + match[0].lastIndexOf('<');
                    if (anglePos !== -1 && posInLine > anglePos) {
                        const closePos = lineText.indexOf('>', anglePos);
                        if (closePos === -1 || posInLine <= closePos) {
                            return line.from + anglePos + 1;
                        }
                    }
                } else {
                    const bracePos = lineText.indexOf('{', match.index);
                    if (bracePos !== -1 && posInLine > bracePos) {
                        const braceEnd = lineText.indexOf('}', bracePos);
                        if (braceEnd === -1 || posInLine <= braceEnd) {
                            return line.from + bracePos + 1;
                        }
                    }
                }
            }
        }
        return posInLine;
    }

    getCompletions(context: CompletionContext, currentFilePath: string): CompletionResult | null {
        const isCurrentlyInLatexFile = isLatexFile(currentFilePath);
        const isCurrentlyInTypstFile = isTypstFile(currentFilePath);

        if (isCurrentlyInLatexFile) {
            const referenceInfo = this.findLatexReferenceCommand(context);
            if (referenceInfo) {
                return this.handleLatexReferenceCompletion(context, referenceInfo);
            }
        }

        if (isCurrentlyInTypstFile) {
            const referenceInfo = this.findTypstReferenceCommand(context);
            if (referenceInfo) {
                return this.handleTypstReferenceCompletion(context, referenceInfo);
            }
        }

        return null;
    }
}