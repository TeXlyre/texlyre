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
        [key: string]: any;
    };
}

interface ZoteroGroup {
    id: number;
    version: number;
    name: string;
    type: string;
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

            console.log('[ZoteroAPIService] Fetching items from:', endpoint);
            console.log('[ZoteroAPIService] Library type:', libraryType, 'Library ID:', libraryId);

            const response = await fetch(`${endpoint}?limit=100`, {
                headers: {
                    'Zotero-API-Key': apiKey,
                    'Zotero-API-Version': '3'
                }
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[ZoteroAPIService] Response error:', response.status, errorText);
                throw new Error(`Failed to fetch items: ${response.statusText}`);
            }

            const items = await response.json();

            const filteredItems = items.filter((item: ZoteroItem) => {
                return item.data.itemType !== 'attachment' && item.data.itemType !== 'note';
            });

            console.log('[ZoteroAPIService] Fetched items:', filteredItems.length, 'of', items.length);
            return filteredItems;
        } catch (error) {
            console.error('[ZoteroAPIService] Error fetching library items:', error);
            throw error;
        }
    }
}

export const zoteroAPIService = new ZoteroAPIService();