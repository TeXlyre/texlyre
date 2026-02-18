import type { BibEntry } from '@/types/bibliography';
import type { SecretsContextType } from '@/contexts/SecretsContext';
import type { PropertiesContextType } from '@/contexts/PropertiesContext';
import { zoteroAPIService } from './ZoteroAPIService';

interface ZoteroItemData {
    itemType: string;
    title?: string;
    creators?: Array<{ creatorType: string; firstName?: string; lastName?: string; name?: string }>;
    date?: string;
    publicationTitle?: string;
    volume?: string;
    issue?: string;
    pages?: string;
    DOI?: string;
    publisher?: string;
    collections?: string[];
    [key: string]: any;
}

class ZoteroService {
    private secretsContext: SecretsContextType | null = null;
    private propertiesContext: PropertiesContextType | null = null;
    private connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error' = 'disconnected';
    private statusListeners: Array<(status: 'connected' | 'connecting' | 'disconnected' | 'error') => void> = [];

    private itemTypeMap: Record<string, string> = {
        'journalArticle': 'article',
        'book': 'book',
        'bookSection': 'incollection',
        'conferencePaper': 'inproceedings',
        'thesis': 'phdthesis',
        'report': 'techreport',
        'webpage': 'online',
        'manuscript': 'unpublished'
    };

    setSecretsContext(secretsContext: SecretsContextType): void {
        this.secretsContext = secretsContext;
    }

    setPropertiesContext(propertiesContext: PropertiesContextType): void {
        this.propertiesContext = propertiesContext;
    }

    getConnectionStatus(): 'connected' | 'connecting' | 'disconnected' | 'error' {
        return this.connectionStatus;
    }

    addStatusListener(listener: (status: 'connected' | 'connecting' | 'disconnected' | 'error') => void): () => void {
        this.statusListeners.push(listener);
        return () => {
            this.statusListeners = this.statusListeners.filter(l => l !== listener);
        };
    }

    private notifyStatusListeners(): void {
        this.statusListeners.forEach(listener => listener(this.connectionStatus));
    }

    async connect(apiKey: string, userId: string, libraryId: string, libraryType: 'user' | 'group', projectId?: string): Promise<void> {
        if (!this.secretsContext || !this.propertiesContext) {
            throw new Error('Contexts not initialized');
        }

        this.connectionStatus = 'connecting';
        this.notifyStatusListeners();

        try {
            await this.secretsContext.setSecret('zotero-bibliography', 'api-key', apiKey, { scope: 'global' });
            await this.secretsContext.setSecret('zotero-bibliography', 'user-id', userId, { scope: 'global' });

            this.propertiesContext.setProperty('zotero-library-id', libraryId, { scope: 'project', projectId });
            this.propertiesContext.setProperty('zotero-library-type', libraryType, { scope: 'project', projectId });

            this.connectionStatus = 'connected';
            this.notifyStatusListeners();
        } catch (error) {
            console.error('[ZoteroService] Error connecting:', error);
            this.connectionStatus = 'error';
            this.notifyStatusListeners();
            throw error;
        }
    }

    async autoConnect(projectId?: string): Promise<void> {
        const credentials = await this.getStoredCredentials();
        if (!credentials) return;

        const library = this.getStoredLibrary(projectId);
        if (!library) return;

        try {
            this.connectionStatus = 'connecting';
            this.notifyStatusListeners();

            await zoteroAPIService.testConnection(credentials.apiKey, credentials.userId);

            this.connectionStatus = 'connected';
            this.notifyStatusListeners();
        } catch {
            this.connectionStatus = 'error';
            this.notifyStatusListeners();
        }
    }

    async disconnect(projectId?: string): Promise<void> {
        if (!this.secretsContext || !this.propertiesContext) return;

        await this.secretsContext.removeSecret('zotero-bibliography', 'api-key', { scope: 'global' });
        await this.secretsContext.removeSecret('zotero-bibliography', 'user-id', { scope: 'global' });

        this.propertiesContext.setProperty('zotero-library-id', '', { scope: 'project', projectId });
        this.propertiesContext.setProperty('zotero-library-type', '', { scope: 'project', projectId });

        this.connectionStatus = 'disconnected';
        this.notifyStatusListeners();
    }

    async hasStoredCredentials(): Promise<boolean> {
        if (!this.secretsContext) return false;

        const hasApiKey = this.secretsContext.hasSecret('zotero-bibliography', 'api-key', { scope: 'global' });
        const hasUserId = this.secretsContext.hasSecret('zotero-bibliography', 'user-id', { scope: 'global' });

        return hasApiKey && hasUserId;
    }

    async getStoredCredentials(): Promise<{ apiKey: string; userId: string } | null> {
        if (!this.secretsContext) return null;

        try {
            const apiKeySecret = await this.secretsContext.getSecret('zotero-bibliography', 'api-key', { scope: 'global' });
            const userIdSecret = await this.secretsContext.getSecret('zotero-bibliography', 'user-id', { scope: 'global' });

            if (!apiKeySecret?.value || !userIdSecret?.value) return null;

            return {
                apiKey: apiKeySecret.value,
                userId: userIdSecret.value
            };
        } catch (error) {
            console.error('[ZoteroService] Error retrieving credentials:', error);
            return null;
        }
    }

    getStoredLibrary(projectId?: string): { libraryId: string; libraryType: 'user' | 'group' } | null {
        if (!this.propertiesContext) return null;

        const libraryId = this.propertiesContext.getProperty('zotero-library-id', { scope: 'project', projectId }) as string;
        const libraryType = this.propertiesContext.getProperty('zotero-library-type', { scope: 'project', projectId }) as 'user' | 'group';

        if (!libraryId) return null;

        return {
            libraryId,
            libraryType: libraryType || 'user'
        };
    }

    convertZoteroItemToBibEntry(item: any, collectionMap?: Map<string, string>): BibEntry {
        const data: ZoteroItemData = item.data;
        const entryType = this.itemTypeMap[data.itemType] || 'misc';
        const key = this.generateCiteKey(data);

        const fields: Record<string, string> = {};

        if (data.title) {
            fields.title = data.title;
        }

        if (data.creators && data.creators.length > 0) {
            const authors = data.creators
                .filter(c => c.creatorType === 'author')
                .map(c => {
                    if (c.name) return c.name;
                    return `${c.lastName}, ${c.firstName || ''}`.trim();
                });
            if (authors.length > 0) {
                fields.author = authors.join(' and ');
            }

            const editors = data.creators
                .filter(c => c.creatorType === 'editor')
                .map(c => {
                    if (c.name) return c.name;
                    return `${c.lastName}, ${c.firstName || ''}`.trim();
                });
            if (editors.length > 0) {
                fields.editor = editors.join(' and ');
            }
        }

        if (data.date) {
            const yearMatch = data.date.match(/\d{4}/);
            if (yearMatch) fields.year = yearMatch[0];
        }

        if (data.publicationTitle) {
            if (entryType === 'article') {
                fields.journal = data.publicationTitle;
            } else if (entryType === 'inproceedings') {
                fields.booktitle = data.publicationTitle;
            }
        }

        if (data.volume) fields.volume = data.volume;
        if (data.issue) fields.number = data.issue;
        if (data.pages) fields.pages = data.pages;
        if (data.DOI) fields.doi = data.DOI;
        if (data.publisher) fields.publisher = data.publisher;
        if (data.url) fields.url = data.url;

        if (collectionMap && Array.isArray(data.collections) && data.collections.length > 0) {
            const names = data.collections
                .map((k: string) => collectionMap.get(k))
                .filter((name): name is string => Boolean(name));
            if (names.length > 0) fields.groups = names.join(', ');
        }

        const rawEntry = this.formatBibEntry(key, entryType, fields, item.key);

        return {
            key,
            entryType,
            fields,
            rawEntry,
            remoteId: item.key,
        };
    }

    private generateCiteKey(data: ZoteroItemData): string {
        let key = '';

        if (data.creators && data.creators.length > 0) {
            const firstAuthor = data.creators.find(c => c.creatorType === 'author');
            if (firstAuthor) {
                const lastName = firstAuthor.lastName || firstAuthor.name?.split(' ').pop() || 'Unknown';
                key = lastName.replace(/[^a-zA-Z]/g, '');
            }
        }

        if (!key) key = 'Unknown';

        if (data.date) {
            const yearMatch = data.date.match(/\d{4}/);
            if (yearMatch) key += yearMatch[0];
        }

        if (data.title) {
            const titleWords = data.title.split(/\s+/).filter(w => w.length > 3);
            if (titleWords.length > 0) {
                key += titleWords[0].substring(0, 4).replace(/[^a-zA-Z]/g, '');
            }
        }

        return key;
    }

    private formatBibEntry(key: string, entryType: string, fields: Record<string, string>, remoteId?: string): string {
        const allFields = { ...fields };
        if (remoteId) {
            allFields['remote-id'] = remoteId;
        }

        const fieldsString = Object.entries(allFields)
            .map(([k, v]) => `  ${k} = {${v}}`)
            .join(',\n');

        return `@${entryType}{${key},\n${fieldsString}\n}`;
    }

    async getBibliographyEntries(projectId?: string): Promise<BibEntry[]> {
        const credentials = await this.getStoredCredentials();
        if (!credentials) {
            this.connectionStatus = 'disconnected';
            this.notifyStatusListeners();
            return [];
        }

        const library = this.getStoredLibrary(projectId);
        if (!library) {
            this.connectionStatus = 'disconnected';
            this.notifyStatusListeners();
            return [];
        }

        try {
            this.connectionStatus = 'connected';
            this.notifyStatusListeners();

            const [items, collectionMap] = await Promise.all([
                zoteroAPIService.getLibraryItems(credentials.apiKey, library.libraryType, library.libraryId),
                zoteroAPIService.getLibraryCollections(credentials.apiKey, library.libraryType, library.libraryId)
            ]);

            return items.map(item => this.convertZoteroItemToBibEntry(item, collectionMap));
        } catch (error) {
            console.error('[ZoteroService] Error getting bibliography entries:', error);
            this.connectionStatus = 'error';
            this.notifyStatusListeners();
            return [];
        }
    }
}

export const zoteroService = new ZoteroService();