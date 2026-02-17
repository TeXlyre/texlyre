// extras/bibliography/jabref/JabRefLSP.ts
import type { LSPPluginTransportConfig } from '@/plugins/PluginInterface';
import { genericLSPService } from '@/services/GenericLSPService';
import { bibliographyImportService } from '@/services/BibliographyImportService';
import type { BibEntry } from '@/types/bibliography';

export type JabRefLSPConfig = {
    id: string;
    name: string;
    getSupportedFileTypes: () => string[];
};

export const createJabRefLSP = () => {
    let currentServerUrl = 'ws://localhost:2087/';
    let registered = false;

    const setupBibtexParser = () => {
        try {
            const { BibtexParser } = require('../../viewers/bibtex/BibtexParser');
            if (BibtexParser) {
                bibliographyImportService.setParser({
                    parse: (content: string) => BibtexParser.parse(content),
                    serialize: (entries: any[]) => BibtexParser.serialize(entries),
                    serializeEntry: (entry: any) => BibtexParser.serializeEntry(entry),
                    findEntryPosition: (content: string, entry: any) => BibtexParser.findEntryPosition(content, entry),
                    updateEntryInContent: (content: string, entry: any) => BibtexParser.updateEntryInContent(content, entry)
                });
            }
        } catch (error) {
            console.log('[JabRefLSP] Using default BibTeX parser - BibtexParser not available');
        }
    };

    const getTransportConfig = (): LSPPluginTransportConfig => {
        return {
            type: 'websocket',
            url: currentServerUrl,
        };
    };

    const ensureRegistered = (config: JabRefLSPConfig) => {
        if (registered) return;
        registered = true;

        genericLSPService.registerConfig({
            id: config.id,
            name: config.name,
            enabled: false,
            fileExtensions: config.getSupportedFileTypes(),
            transportConfig: getTransportConfig(),
            clientConfig: {
                rootUri: 'texlyre://bibliography',
            },
        });
    };

    const updateServerUrl = (id: string, url: string): void => {
        currentServerUrl = url;

        if (registered) {
            genericLSPService.updateConfig(id, {
                transportConfig: getTransportConfig(),
            });
        }
    };

    const parseDocumentationFields = (documentation: string): Record<string, string> => {
        const fields: Record<string, string> = {};

        const titleMatch = documentation.match(/Title:\s*(.+?)(?:\n|$)/);
        if (titleMatch) {
            fields.title = titleMatch[1].replace(/[{}]/g, '').trim();
        }

        const authorMatch = documentation.match(/Authors?:\s*(.+?)(?:\n|$)/);
        if (authorMatch) {
            fields.author = authorMatch[1].trim();
        }

        const yearMatch = documentation.match(/Year:\s*(\d{4})/);
        if (yearMatch) {
            fields.year = yearMatch[1];
        }

        const journalMatch = documentation.match(/Journal:\s*(.+?)(?:\n|$)/);
        if (journalMatch) {
            fields.journal = journalMatch[1].trim();
        }

        return fields;
    };

    const extractEntryType = (documentation: string): string => {
        if (documentation.includes('Journal')) return 'article';
        if (documentation.includes('Book')) return 'book';
        if (documentation.includes('Conference') || documentation.includes('Proceedings')) return 'inproceedings';
        if (documentation.includes('Thesis')) return 'phdthesis';
        return 'article';
    };

    const constructRawEntry = (key: string, fields: Record<string, string>, entryType: string): string => {
        const fieldsString = Object.entries(fields)
            .map(([fieldKey, value]) => `  ${fieldKey} = {${value}}`)
            .join(',\n');

        return `@${entryType}{${key},\n${fieldsString}\n}`;
    };

    const parseCompletionItem = (item: any): BibEntry => {
        const documentation = item.documentation || '';
        const fields = parseDocumentationFields(documentation);
        const entryType = extractEntryType(documentation) || 'article';
        const key = item.label || item.insertText || '';

        return {
            key,
            entryType,
            fields,
            rawEntry: constructRawEntry(key, fields, entryType)
        };
    };

    const getBibliographyEntries = async (
        id: string,
        getConnectionStatus: () => 'connected' | 'connecting' | 'disconnected' | 'error'
    ): Promise<BibEntry[]> => {
        const status = getConnectionStatus();
        if (status !== 'connected') {
            console.warn('[JabRefLSP] Not connected to LSP server');
            return [];
        }

        const client = genericLSPService.getClient(id);
        if (!client) {
            console.warn('[JabRefLSP] LSP client not available');
            return [];
        }

        try {
            const response = await (client as any).request('textDocument/completion', {
                textDocument: { uri: 'texlyre://bibliography' },
                position: { line: 0, character: 0 }
            });

            const completionItems = response?.items || [];
            console.log(`[JabRefLSP] Retrieved ${completionItems.length} entries from LSP server`);
            return completionItems.map((item: any) => parseCompletionItem(item));
        } catch (error) {
            console.error('[JabRefLSP] Error getting bibliography entries:', error);
            return [];
        }
    };

    setupBibtexParser();

    return {
        ensureRegistered,
        updateServerUrl,
        getTransportConfig,
        getBibliographyEntries,
    };
};
