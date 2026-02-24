// extras/bibliography/openalex/OpenAlexService.ts
import type { BibEntry } from '@/types/bibliography';
import type { SecretsContextType } from '@/contexts/SecretsContext';
import { openAlexAPIService } from './OpenAlexAPIService';
import type { OpenAlexWork, OpenAlexFilters, OpenAlexSearchParams } from './OpenAlexAPIService';

interface OpenAlexCredentials {
    apiKey?: string;
    email?: string;
}

const OPENALEX_TYPE_MAP: Record<string, string> = {
    'article': 'article',
    'book': 'book',
    'book-chapter': 'incollection',
    'dissertation': 'phdthesis',
    'preprint': 'misc',
    'review': 'article',
    'editorial': 'article',
    'letter': 'article',
    'report': 'techreport',
    'dataset': 'misc',
    'other': 'misc',
};

const reconstructAbstract = (invertedIndex: Record<string, number[]> | null): string => {
    if (!invertedIndex) return '';
    const wordPositions: Array<[string, number]> = [];
    for (const [word, positions] of Object.entries(invertedIndex)) {
        for (const pos of positions) {
            wordPositions.push([word, pos]);
        }
    }
    wordPositions.sort((a, b) => a[1] - b[1]);
    return wordPositions.map(([word]) => word).join(' ');
};

class OpenAlexService {
    private secretsContext: SecretsContextType | null = null;
    private connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error' = 'disconnected';
    private statusListeners: Array<(status: 'connected' | 'connecting' | 'disconnected' | 'error') => void> = [];

    setSecretsContext(secretsContext: SecretsContextType): void {
        this.secretsContext = secretsContext;
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
        this.statusListeners.forEach(l => l(this.connectionStatus));
    }

    async connect(apiKey?: string, email?: string): Promise<void> {
        if (!this.secretsContext) throw new Error('Secrets context not initialized');

        this.connectionStatus = 'connecting';
        this.notifyStatusListeners();

        try {
            const isValid = await openAlexAPIService.testConnection(apiKey, email);
            if (!isValid) throw new Error('OpenAlex API unreachable');

            if (apiKey) {
                await this.secretsContext.setSecret('openalex-bibliography', 'api-key', apiKey, { scope: 'global' });
            } else {
                await this.secretsContext.removeSecret('openalex-bibliography', 'api-key', { scope: 'global' });
            }

            if (email) {
                await this.secretsContext.setSecret('openalex-bibliography', 'email', email, { scope: 'global' });
            } else {
                await this.secretsContext.removeSecret('openalex-bibliography', 'email', { scope: 'global' });
            }

            this.connectionStatus = 'connected';
            this.notifyStatusListeners();
        } catch (error) {
            console.error('[OpenAlexService] Connection error:', error);
            this.connectionStatus = 'error';
            this.notifyStatusListeners();
            throw error;
        }
    }

    async autoConnect(): Promise<void> {
        try {
            this.connectionStatus = 'connecting';
            this.notifyStatusListeners();

            const creds = await this.getStoredCredentials();
            const isValid = await openAlexAPIService.testConnection(creds?.apiKey, creds?.email);

            this.connectionStatus = isValid ? 'connected' : 'error';
            this.notifyStatusListeners();
        } catch {
            this.connectionStatus = 'error';
            this.notifyStatusListeners();
        }
    }

    async disconnect(): Promise<void> {
        if (!this.secretsContext) return;
        await this.secretsContext.removeSecret('openalex-bibliography', 'api-key', { scope: 'global' });
        await this.secretsContext.removeSecret('openalex-bibliography', 'email', { scope: 'global' });
        this.connectionStatus = 'disconnected';
        this.notifyStatusListeners();
    }

    async getStoredCredentials(): Promise<OpenAlexCredentials | null> {
        if (!this.secretsContext) return null;
        try {
            const apiKeySecret = await this.secretsContext.getSecret('openalex-bibliography', 'api-key', { scope: 'global' });
            const emailSecret = await this.secretsContext.getSecret('openalex-bibliography', 'email', { scope: 'global' });
            if (!apiKeySecret?.value && !emailSecret?.value) return null;
            return {
                apiKey: apiKeySecret?.value || undefined,
                email: emailSecret?.value || undefined,
            };
        } catch {
            return null;
        }
    }

    async hasStoredCredentials(): Promise<boolean> {
        const creds = await this.getStoredCredentials();
        return creds !== null;
    }

    convertWorkToBibEntry(work: OpenAlexWork): BibEntry {
        const entryType = OPENALEX_TYPE_MAP[work.type] || 'misc';
        const key = this.generateCiteKey(work);
        const fields: Record<string, string> = {};

        const title = work.display_name || work.title;
        if (title) fields.title = title;

        const authors = work.authorships
            .sort((a, b) => {
                const order = ['first', 'middle', 'last'];
                return order.indexOf(a.author_position) - order.indexOf(b.author_position);
            })
            .map(a => a.author.display_name);
        if (authors.length > 0) fields.author = authors.join(' and ');

        if (work.publication_year) fields.year = String(work.publication_year);

        const source = work.primary_location?.source;
        if (source) {
            if (entryType === 'article' || entryType === 'review') {
                fields.journal = source.display_name;
            } else if (entryType === 'incollection' || entryType === 'inproceedings') {
                fields.booktitle = source.display_name;
            } else {
                fields.journal = source.display_name;
            }
            if (source.issn_l) fields.issn = source.issn_l;
        }

        if (work.biblio) {
            if (work.biblio.volume) fields.volume = work.biblio.volume;
            if (work.biblio.issue) fields.number = work.biblio.issue;
            if (work.biblio.first_page && work.biblio.last_page) {
                fields.pages = `${work.biblio.first_page}--${work.biblio.last_page}`;
            } else if (work.biblio.first_page) {
                fields.pages = work.biblio.first_page;
            }
        }

        if (work.doi) fields.doi = work.doi.replace('https://doi.org/', '');
        if (work.open_access.oa_url) fields.url = work.open_access.oa_url;

        const abstract = reconstructAbstract(work.abstract_inverted_index);
        if (abstract) fields.abstract = abstract;

        fields['remote-id'] = work.id;

        const rawEntry = this.formatBibEntry(key, entryType, fields);
        return { key, entryType, fields, rawEntry, remoteId: work.id };
    }

    private generateCiteKey(work: OpenAlexWork): string {
        let key = '';

        if (work.authorships.length > 0) {
            const first = work.authorships.find(a => a.author_position === 'first') || work.authorships[0];
            const nameParts = first.author.display_name.split(/\s+/);
            const lastName = nameParts[nameParts.length - 1];
            key = lastName.replace(/[^a-zA-Z]/g, '');
        }

        if (!key) key = 'Unknown';
        if (work.publication_year) key += work.publication_year;

        const title = work.display_name || work.title;
        if (title) {
            const stopWords = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or']);
            const meaningful = title.split(/\s+/).find(w => w.length > 3 && !stopWords.has(w.toLowerCase()));
            if (meaningful) key += meaningful.substring(0, 4).replace(/[^a-zA-Z]/g, '');
        }

        return key;
    }

    private formatBibEntry(key: string, entryType: string, fields: Record<string, string>): string {
        const fieldsString = Object.entries(fields)
            .map(([k, v]) => `  ${k} = {${v}}`)
            .join(',\n');
        return `@${entryType}{${key},\n${fieldsString}\n}`;
    }

    async searchWorks(query: string, filters: OpenAlexFilters, perPage: number): Promise<BibEntry[]> {
        const creds = await this.getStoredCredentials();
        try {
            this.connectionStatus = 'connected';
            this.notifyStatusListeners();

            let authorId: string | undefined;
            if (filters.authorQuery?.trim()) {
                const authors = await openAlexAPIService.searchAuthors(filters.authorQuery.trim(), creds?.email);
                authorId = authors[0]?.id;
            }

            const { authorQuery: _, ...apiFilters } = filters;
            const params: OpenAlexSearchParams = { query, filters: apiFilters, perPage };
            const result = await openAlexAPIService.searchWorks(params, creds?.apiKey, creds?.email, authorId);
            return result.works.map(w => this.convertWorkToBibEntry(w));
        } catch (error) {
            console.error('[OpenAlexService] Search error:', error);
            this.connectionStatus = 'error';
            this.notifyStatusListeners();
            return [];
        }
    }

    async fetchLinkedEntries(localEntries: BibEntry[]): Promise<BibEntry[]> {
        const creds = await this.getStoredCredentials();
        const openAlexIds = localEntries
            .map(e => e.remoteId || e.fields['remote-id'])
            .filter((id): id is string => Boolean(id) && id.includes('openalex.org'));

        if (openAlexIds.length === 0) return [];

        try {
            const works = await openAlexAPIService.fetchWorksByIds(openAlexIds, creds?.apiKey, creds?.email);
            return works.map(w => this.convertWorkToBibEntry(w));
        } catch (error) {
            console.error('[OpenAlexService] Error fetching linked entries:', error);
            return [];
        }
    }

    async getBibliographyEntries(query?: string, localEntries?: BibEntry[], filters: OpenAlexFilters = {}, perPage = 25): Promise<BibEntry[]> {
        if (!query || query.trim() === '') {
            if (localEntries && localEntries.length > 0) {
                return this.fetchLinkedEntries(localEntries);
            }
            return [];
        }
        return this.searchWorks(query, filters, perPage);
    }
}

export const openAlexService = new OpenAlexService();
