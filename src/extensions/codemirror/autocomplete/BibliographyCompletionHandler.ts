// src/extensions/codemirror/autocomplete/BibliographyCompletionHandler.ts
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';

import { fileStorageService } from '../../../services/FileStorageService';
import { BibtexParser } from '../../../../extras/viewers/bibtex/BibtexParser';
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
                file.name.endsWith('.bib') &&
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
        const textBeforeCursor = lineText.substring(0, posInLine);

        for (const { pattern, type } of citationCommandPatterns) {
            const isTypstCitation = pattern.source.includes('#cite');

            if (isTypstCitation) {
                const match = textBeforeCursor.match(pattern);

                if (match) {
                    const delimiter = match[0].endsWith('<') ? '<' : '"';
                    const delimiterPos = match.index! + match[0].length - 1;
                    const partial = textBeforeCursor.substring(delimiterPos + 1).trim();
                    return { command: 'cite', partial, type };
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

    private isInLatexFile(currentFilePath: string): boolean {
        return currentFilePath.endsWith('.tex') || currentFilePath.endsWith('.latex');
    }

    private isInTypstFile(currentFilePath: string): boolean {
        return currentFilePath?.endsWith('.typ') || currentFilePath?.endsWith('.typst') || false;
    }

    private isInBibFile(currentFilePath: string): boolean {
        return currentFilePath.endsWith('.bib') || currentFilePath.endsWith('.bibtex');
    }

    private async getExternalBibliographyEntries(): Promise<BibliographyEntry[]> {
        const allEntries: BibliographyEntry[] = [];

        try {
            const { pluginRegistry } = await import('../../../plugins/PluginRegistry');
            const lspPlugins = pluginRegistry.getEnabledLSPPlugins();

            for (const plugin of lspPlugins) {
                if (plugin.getConnectionStatus() !== 'connected') continue;

                if ('getBibliographyEntries' in plugin) {
                    try {
                        const bibEntries = await (plugin as any).getBibliographyEntries();
                        const entries: BibliographyEntry[] = bibEntries.map((entry: any) => ({
                            key: entry.key,
                            title: entry.fields?.title || entry.title || '',
                            authors: entry.fields?.author ? [entry.fields.author] : entry.authors || [],
                            year: entry.fields?.year || entry.year || '',
                            source: 'external' as const,
                            journal: entry.fields?.journal || entry.fields.booktitle || entry.journal || '',
                            rawEntry: entry.rawEntry || this.formatBibEntry(entry),
                            entryType: entry.entryType || entry.type || 'article'
                        }));
                        allEntries.push(...entries);
                    } catch (error) {
                        console.error(`Error getting bibliography entries from ${plugin.name}:`, error);
                    }
                }
            }
        } catch (error) {
            console.error('Error getting external bibliography entries:', error);
        }

        return allEntries;
    }

    private formatBibEntry(entry: any): string {
        const fields: string[] = [];
        if (entry.title || entry.fields?.title) fields.push(`  title = {${entry.title || entry.fields.title}}`);
        if (entry.authors?.length > 0) fields.push(`  author = {${entry.authors.join(' and ')}}`);
        if (entry.fields?.author) fields.push(`  author = {${entry.fields.author}}`);
        if (entry.year || entry.fields?.year) fields.push(`  year = {${entry.year || entry.fields.year}}`);
        if (entry.journal || entry.fields?.journal) fields.push(`  journal = {${entry.journal || entry.fields.journal}}`);

        const entryType = entry.entryType || entry.type || 'article';
        return `@${entryType}{${entry.key},\n${fields.join(',\n')}\n}`;
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

    private async handleBibtexEntryCompletion(context: CompletionContext, bibtexInfo: any, _localCache: BibliographyEntry[]): Promise<CompletionResult | null> {
        const partial = bibtexInfo.partial;
        const entryType = bibtexInfo.entryType.toLowerCase();

        const externalEntries = await this.getExternalBibliographyEntries();

        let filteredEntries = externalEntries;
        if (entryType) {
            filteredEntries = externalEntries.filter(entry =>
                entry.entryType?.toLowerCase() === entryType &&
                (!partial || entry.key.toLowerCase().includes(partial.toLowerCase()))
            );
        } else {
            filteredEntries = externalEntries.filter(entry =>
                !partial || entry.key.toLowerCase().includes(partial.toLowerCase())
            );
        }

        const options = this.createBibtexEntryOptions(filteredEntries, partial, context);
        if (options.length === 0) return null;

        const partialStart = this.getBibtexCompletionStart(context, bibtexEntryPatterns);

        return {
            from: partialStart,
            options,
            validFor: /^[^}]*$/,
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

    private createBibtexEntryOptions(entries: BibliographyEntry[], partial: string, context: CompletionContext) {
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
                    detail: `${displayTitle} ⬇️`,
                    info: `External | ${authors} (${entry.year})\n${entry.journal}`,
                    apply: async (view: EditorView, completion: any, from: number, to: number) => {
                        const fullEntry = entry.rawEntry;

                        const line = view.state.doc.lineAt(from);
                        const lineStart = line.from;
                        const currentLine = line.text;

                        const atIndex = currentLine.indexOf('@');
                        if (atIndex !== -1) {
                            const replaceFrom = lineStart + atIndex;
                            view.dispatch({
                                changes: { from: replaceFrom, to, insert: fullEntry }
                            });
                        } else {
                            view.dispatch({
                                changes: { from, to, insert: fullEntry }
                            });
                        }
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
            const match = lineText.match(pattern);
            if (match && match.index !== undefined) {
                const isTypstCitation = match[0].startsWith('#cite');

                if (isTypstCitation) {
                    const anglePos = lineText.indexOf('<', match.index);
                    const quotePos = lineText.indexOf('"', match.index);

                    if (anglePos !== -1 && posInLine > anglePos) {
                        return line.from + anglePos + 1;
                    }
                    if (quotePos !== -1 && posInLine > quotePos) {
                        return line.from + quotePos + 1;
                    }
                } else {
                    const bracePos = lineText.indexOf('{', match.index);
                    if (bracePos !== -1 && posInLine > bracePos) {
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
        return posInLine;
    }

    private getBibtexCompletionStart(context: CompletionContext, patterns: any[]): number {
        const line = context.state.doc.lineAt(context.pos);
        const lineText = line.text;
        const posInLine = context.pos - line.from;

        let partialStart = posInLine;
        for (const { pattern } of patterns) {
            const match = lineText.match(pattern);
            if (match && match.index !== undefined) {
                const bracePos = lineText.indexOf('{', match.index);
                if (bracePos !== -1 && posInLine > bracePos) {
                    partialStart = line.from + bracePos + 1;
                    break;
                }
            }
        }
        return partialStart;
    }

    async getCompletions(context: CompletionContext, currentFilePath: string): Promise<CompletionResult | null> {
        const cache = this.bibliographyCache;
        const citationInfo = this.findCitationCommand(context);
        const bibtexInfo = this.findBibtexEntry(context);

        const isCurrentlyInBibFile = this.isInBibFile(currentFilePath);
        const isCurrentlyInLatexFile = this.isInLatexFile(currentFilePath);
        const isCurrentlyInTypstFile = this.isInTypstFile(currentFilePath);

        if (isCurrentlyInLatexFile && citationInfo) {
            return this.handleLatexCitationCompletion(context, citationInfo, cache);
        }

        if (isCurrentlyInTypstFile && citationInfo) {
            return this.handleTypstCitationCompletion(context, citationInfo, cache);
        }

        if (isCurrentlyInBibFile && bibtexInfo) {
            return await this.handleBibtexEntryCompletion(context, bibtexInfo, cache);
        }

        return null;
    }
}