// extras/bibliography/zotero/ZoteroAPIService.ts
interface ZoteroItem {
    key: string;
    version: number;
    data: {
        itemType: string;
        title?: string;
        creators?: Array<{ creatorType: string; firstName?: string; lastName?: string; name?: string }>;
        date?: string;
        publicationTitle?: string;
        journalAbbreviation?: string;
        volume?: string;
        issue?: string;
        pages?: string;
        DOI?: string;
        ISBN?: string;
        publisher?: string;
        place?: string;
        url?: string;
        abstractNote?: string;
        collections?: string[];
        [key: string]: any;
    };
}

interface ZoteroGroup {
    id: number;
    version: number;
    name: string;
    type: string;
}

interface ZoteroCollection {
    key: string;
    data: { name: string; parentCollection: string | false };
}

export class ZoteroAPIService {
    private baseUrl = 'https://api.zotero.org';

    async testConnection(apiKey: string, userId: string): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/users/${userId}/items?limit=1`, {
                headers: { 'Zotero-API-Key': apiKey }
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    async getUserLibraries(apiKey: string, userId: string): Promise<Array<{ id: string; name: string; type: 'user' | 'group' }>> {
        const libraries: Array<{ id: string; name: string; type: 'user' | 'group' }> = [
            { id: userId, name: 'My Library', type: 'user' }
        ];

        try {
            const response = await fetch(`${this.baseUrl}/users/${userId}/groups`, {
                headers: { 'Zotero-API-Key': apiKey }
            });

            if (response.ok) {
                const groups: ZoteroGroup[] = await response.json();
                groups.forEach(group => {
                    libraries.push({
                        id: group.id.toString(),
                        name: group.name,
                        type: 'group'
                    });
                });
            }
        } catch (error) {
            console.error('[ZoteroAPIService] Error fetching groups:', error);
        }

        return libraries;
    }

    async getLibraryItems(apiKey: string, libraryType: 'user' | 'group', libraryId: string): Promise<ZoteroItem[]> {
        try {
            const endpoint = libraryType === 'user'
                ? `${this.baseUrl}/users/${libraryId}/items`
                : `${this.baseUrl}/groups/${libraryId}/items`;

            const headers = {
                'Zotero-API-Key': apiKey,
                'Zotero-API-Version': '3'
            };

            const countResponse = await fetch(`${endpoint}?limit=1`, { headers });
            if (!countResponse.ok) {
                throw new Error(`Failed to fetch items: ${countResponse.statusText}`);
            }
            const totalItems = parseInt(countResponse.headers.get('Total-Results') || '0', 10);

            const pageSize = 100;
            const pages = Math.ceil(totalItems / pageSize);
            const requests = Array.from({ length: pages }, (_, i) =>
                fetch(`${endpoint}?limit=${pageSize}&start=${i * pageSize}`, { headers })
                    .then(r => r.ok ? r.json() : Promise.reject(new Error(`Failed page ${i}: ${r.statusText}`)))
            );

            const results = await Promise.all(requests);
            const items: ZoteroItem[] = results.flat();

            return items.filter((item: ZoteroItem) =>
                item.data.itemType !== 'attachment' && item.data.itemType !== 'note'
            );
        } catch (error) {
            console.error('[ZoteroAPIService] Error fetching library items:', error);
            throw error;
        }
    }

    async getLibraryCollections(apiKey: string, libraryType: 'user' | 'group', libraryId: string): Promise<Map<string, string>> {
        try {
            const endpoint = libraryType === 'user'
                ? `${this.baseUrl}/users/${libraryId}/collections`
                : `${this.baseUrl}/groups/${libraryId}/collections`;

            const response = await fetch(`${endpoint}?limit=100`, {
                headers: {
                    'Zotero-API-Key': apiKey,
                    'Zotero-API-Version': '3'
                }
            });

            if (!response.ok) return new Map();

            const collections: ZoteroCollection[] = await response.json();
            return new Map(collections.map(c => [c.key, c.data.name]));
        } catch (error) {
            console.error('[ZoteroAPIService] Error fetching collections:', error);
            return new Map();
        }
    }
}

export const zoteroAPIService = new ZoteroAPIService();