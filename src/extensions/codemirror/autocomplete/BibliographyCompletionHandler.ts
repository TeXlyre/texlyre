// src/extensions/codemirror/autocomplete/BibliographyCompletionHandler.ts
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';

import { fileStorageService } from '../../../services/FileStorageService';
import { BibtexParser } from '../../../../extras/viewers/bibtex/BibtexParser';
import { isLatexFile, isTypstFile, isBibFile } from '../../../utils/fileUtils';
import { citationCommandPatterns, bibtexEntryPatterns } from './patterns';

interface BibliographyEntry {
    key: string;
    title: string;
    authors: string[];
    year: string;
    source: 'local';
    journal?: string;
    rawEntry?: string;
    filePath?: string;
    entryType?: string;
}

export class BibliographyCompletionHandler {
    private bibliographyCache: BibliographyEntry[] = [];

    async initialize() {
        await this.updateCache();
    }

    destroy() {
    }

    async updateCache() {
        try {
            const localEntries = await this.getLocalBibliographyEntries();
            this.bibliographyCache = localEntries;
        } catch (error) {
            console.error('Error updating bibliography cache:', error);
        }
    }

    private async getLocalBibliographyEntries(): Promise<BibliographyEntry[]> {
        try {
            const allFiles = await fileStorageService.getAllFiles();
            const bibFiles = allFiles.filter(file =>
                isBibFile(file.name) &&
                !file.isDeleted &&
                file.content
            );

            const allEntries: BibliographyEntry[] = [];

            for (const bibFile of bibFiles) {
                const content = typeof bibFile.content === 'string'
                    ? bibFile.content
                    : new TextDecoder().decode(bibFile.content);

                const parsedEntries = BibtexParser.parse(content);
                const entries: BibliographyEntry[] = parsedEntries.map(entry => ({
                    key: entry.id,
                    title: entry.fields.title || '',
                    authors: entry.fields.author ? [entry.fields.author] : [],
                    year: entry.fields.year || '',
                    source: 'local' as const,
                    journal: entry.fields.journal || entry.fields.booktitle || '',
                    rawEntry: BibtexParser.serializeEntry(entry),
                    filePath: bibFile.path,
                    entryType: entry.type
                }));

                allEntries.push(...entries);
            }

            return allEntries;
        } catch (error) {
            console.error('Error getting local bibliography entries:', error);
            return [];
        }
    }

    private findCitationCommand(context: CompletionContext): { command: string; partial: string; type: 'citation' } | null {
        const line = context.state.doc.lineAt(context.pos);
        const lineText = line.text;
        const posInLine = context.pos - line.from;

        for (const { pattern, type } of citationCommandPatterns) {
            const isTypstCitation = pattern.source.includes('#cite');
            const isTypstAtSign = pattern.source.includes('@') && !pattern.source.includes('#');

            if (isTypstAtSign) {
                continue;
            }

            if (isTypstCitation) {
                const matches = Array.from(lineText.matchAll(new RegExp(pattern.source, 'g')));

                for (const match of matches) {
                    if (match.index === undefined) continue;

                    const delimiter = match[0].endsWith('<') ? '<' : '"';
                    const delimiterPos = match.index + match[0].length - 1;
                    const closeDelimiter = delimiter === '<' ? '>' : '"';
                    const closePos = lineText.indexOf(closeDelimiter, delimiterPos + 1);

                    if (posInLine > delimiterPos && (closePos === -1 || posInLine <= closePos)) {
                        const partial = lineText.substring(delimiterPos + 1, posInLine).trim();
                        return { command: 'cite', partial, type };
                    }
                }
            } else {
                const matches = Array.from(lineText.matchAll(new RegExp(pattern.source, 'g')));

                for (const match of matches) {
                    const matchStart = match.index!;
                    const braceStart = lineText.indexOf('{', matchStart);
                    const braceEnd = lineText.indexOf('}', braceStart);

                    if (braceStart !== -1 && posInLine > braceStart && (braceEnd === -1 || posInLine <= braceEnd)) {
                        const textInBraces = lineText.substring(braceStart + 1, posInLine);
                        const lastCommaPos = textInBraces.lastIndexOf(',');

                        const partial = lastCommaPos !== -1
                            ? textInBraces.substring(lastCommaPos + 1).trim()
                            : textInBraces.trim();

                        return { command: match[1], partial, type };
                    }
                }
            }
        }

        return null;
    }

    private findBibtexEntry(context: CompletionContext): { entryType: string; partial: string; type: 'bibtex-entry' } | null {
        const line = context.state.doc.lineAt(context.pos);
        const lineText = line.text;
        const posInLine = context.pos - line.from;

        for (const { pattern, type } of bibtexEntryPatterns) {
            const matches = Array.from(lineText.matchAll(new RegExp(pattern.source, 'g')));

            for (const match of matches) {
                const matchStart = match.index!;
                const commandEnd = matchStart + match[0].length;

                if (posInLine >= matchStart && posInLine <= commandEnd + 1) {
                    return {
                        entryType: match[1] || '',
                        partial: match[2] || '',
                        type,
                    };
                }
            }
        }

        return null;
    }

    private handleLatexCitationCompletion(context: CompletionContext, citationInfo: any, cache: BibliographyEntry[]): CompletionResult | null {
        const partial = citationInfo.partial;
        const filteredEntries = cache.filter(entry =>
            !partial ||
            entry.key.toLowerCase().includes(partial.toLowerCase()) ||
            entry.title.toLowerCase().includes(partial.toLowerCase()) ||
            entry.authors.some(author => author.toLowerCase().includes(partial.toLowerCase()))
        );

        const options = this.createCitationOptions(filteredEntries, partial);
        if (options.length === 0) return null;

        const partialStart = this.getCitationCompletionStart(context, citationCommandPatterns);

        return {
            from: partialStart,
            options,
            validFor: /^[^}]*$/,
        };
    }

    private handleTypstCitationCompletion(context: CompletionContext, citationInfo: any, cache: BibliographyEntry[]): CompletionResult | null {
        const partial = citationInfo.partial;
        const filteredEntries = cache.filter(entry =>
            !partial ||
            entry.key.toLowerCase().includes(partial.toLowerCase()) ||
            entry.title.toLowerCase().includes(partial.toLowerCase()) ||
            entry.authors.some(author => author.toLowerCase().includes(partial.toLowerCase()))
        );

        const options = this.createCitationOptions(filteredEntries, partial);
        if (options.length === 0) return null;

        const partialStart = this.getCitationCompletionStart(context, citationCommandPatterns);

        return {
            from: partialStart,
            options,
            validFor: /^[^>\">]*$/,
        };
    }

    private createCitationOptions(entries: BibliographyEntry[], partial: string) {
        return entries
            .sort((a, b) => {
                const aStartsWith = a.key.toLowerCase().startsWith(partial.toLowerCase());
                const bStartsWith = b.key.toLowerCase().startsWith(partial.toLowerCase());
                if (aStartsWith && !bStartsWith) return -1;
                if (!aStartsWith && bStartsWith) return 1;
                return a.key.localeCompare(b.key);
            })
            .slice(0, 20)
            .map(entry => {
                const displayTitle = entry.title.length > 50
                    ? `${entry.title.substring(0, 47)}...`
                    : entry.title;

                const authors = entry.authors.length > 0
                    ? entry.authors.join(', ')
                    : 'Unknown author';

                return {
                    label: entry.key,
                    detail: `${displayTitle} ✓`,
                    info: `Local | ${authors} (${entry.year})\n${entry.journal}`,
                    apply: (view: EditorView, completion: any, from: number, to: number) => {
                        const insertText = entry.key;
                        view.dispatch({
                            changes: { from, to, insert: insertText },
                            selection: { anchor: from + insertText.length }
                        });
                    },
                    boost: 10,
                };
            });
    }

    private getCitationCompletionStart(context: CompletionContext, patterns: any[]): number {
        const line = context.state.doc.lineAt(context.pos);
        const lineText = line.text;
        const posInLine = context.pos - line.from;

        for (const { pattern } of patterns) {
            const matches = Array.from(lineText.matchAll(new RegExp(pattern.source, 'g')));

            for (const match of matches) {
                if (match.index === undefined) continue;

                const isTypstCitation = match[0].startsWith('#cite');

                if (isTypstCitation) {
                    const anglePos = lineText.indexOf('<', match.index);
                    const quotePos = lineText.indexOf('"', match.index);

                    if (anglePos !== -1 && posInLine > anglePos) {
                        const closePos = lineText.indexOf('>', anglePos);
                        if (closePos === -1 || posInLine <= closePos) {
                            return line.from + anglePos + 1;
                        }
                    }
                    if (quotePos !== -1 && posInLine > quotePos) {
                        const closePos = lineText.indexOf('"', quotePos + 1);
                        if (closePos === -1 || posInLine <= closePos) {
                            return line.from + quotePos + 1;
                        }
                    }
                } else {
                    const bracePos = lineText.indexOf('{', match.index);
                    if (bracePos !== -1 && posInLine > bracePos) {
                        const braceEnd = lineText.indexOf('}', bracePos);
                        if (braceEnd === -1 || posInLine <= braceEnd) {
                            const textInBraces = lineText.substring(bracePos + 1, posInLine);
                            const lastCommaPos = textInBraces.lastIndexOf(',');

                            if (lastCommaPos !== -1) {
                                return line.from + bracePos + 1 + lastCommaPos + 1;
                            } else {
                                return line.from + bracePos + 1;
                            }
                        }
                    }
                }
            }
        }
        return posInLine;
    }

    async getCompletions(context: CompletionContext, currentFilePath: string): Promise<CompletionResult | null> {
        const cache = this.bibliographyCache;
        const citationInfo = this.findCitationCommand(context);

        const isCurrentlyInLatexFile = isLatexFile(currentFilePath);
        const isCurrentlyInTypstFile = isTypstFile(currentFilePath);

        if (isCurrentlyInLatexFile && citationInfo) {
            return this.handleLatexCitationCompletion(context, citationInfo, cache);
        }

        if (isCurrentlyInTypstFile && citationInfo) {
            return this.handleTypstCitationCompletion(context, citationInfo, cache);
        }

        return null;
    }
}