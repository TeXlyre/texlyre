// extras/bibliography/openalex/OpenAlexAPIService.ts

export interface OpenAlexWork {
    id: string;
    title: string | null;
    display_name: string | null;
    type: string;
    publication_year: number | null;
    publication_date: string | null;
    doi: string | null;
    authorships: Array<{
        author: { id: string; display_name: string };
        author_position: string;
    }>;
    primary_location: {
        source: {
            id: string;
            display_name: string;
            type: string;
            issn_l?: string;
        } | null;
        is_oa: boolean;
    } | null;
    open_access: { is_oa: boolean; oa_url: string | null };
    biblio: {
        volume: string | null;
        issue: string | null;
        first_page: string | null;
        last_page: string | null;
    } | null;
    cited_by_count: number;
    abstract_inverted_index: Record<string, number[]> | null;
    concepts: Array<{ display_name: string; level: number; score: number }>;
    keywords: Array<{ display_name: string }>;
}

export interface OpenAlexFilters {
    yearFrom?: number;
    yearTo?: number;
    isOA?: boolean;
    type?: string;
    hasDoi?: boolean;
    minCitations?: number;
}

export interface OpenAlexSearchParams {
    query: string;
    filters: OpenAlexFilters;
    perPage?: number;
    page?: number;
}

export interface OpenAlexSearchResult {
    works: OpenAlexWork[];
    total: number;
    page: number;
    perPage: number;
}

const WORK_TYPES = [
    'article',
    'book',
    'book-chapter',
    'dissertation',
    'preprint',
    'review',
    'editorial',
    'letter',
    'erratum',
    'grant',
    'dataset',
    'paratext',
    'libguides',
    'reference-entry',
    'supplementary-materials',
    'report',
    'peer-review',
    'standard',
    'other',
] as const;

export type OpenAlexWorkType = typeof WORK_TYPES[number];
export { WORK_TYPES };

export class OpenAlexAPIService {
    private readonly baseUrl = 'https://api.openalex.org';

    private buildHeaders(apiKey?: string, email?: string): Record<string, string> {
        const headers: Record<string, string> = {
            'Accept': 'application/json',
        };
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
        return headers;
    }

    private buildMailtoParam(email?: string): string {
        return email ? `&mailto=${encodeURIComponent(email)}` : '';
    }

    private buildFilterString(filters: OpenAlexFilters): string {
        const parts: string[] = [];
        if (filters.yearFrom && filters.yearTo) {
            parts.push(`publication_year:>${filters.yearFrom - 1},publication_year:<${filters.yearTo + 1}`);
        } else if (filters.yearFrom) {
            parts.push(`publication_year:>${filters.yearFrom - 1}`);
        } else if (filters.yearTo) {
            parts.push(`publication_year:<${filters.yearTo + 1}`);
        }
        if (filters.isOA === true) parts.push('is_oa:true');
        if (filters.isOA === false) parts.push('is_oa:false');
        if (filters.type) parts.push(`type:${filters.type}`);
        if (filters.hasDoi === true) parts.push('has_doi:true');
        if (filters.minCitations !== undefined && filters.minCitations > 0) {
            parts.push(`cited_by_count:>${filters.minCitations - 1}`);
        }
        return parts.length > 0 ? `&filter=${parts.join(',')}` : '';
    }

    async testConnection(apiKey?: string, email?: string): Promise<boolean> {
        try {
            const mailto = this.buildMailtoParam(email);
            const response = await fetch(
                `${this.baseUrl}/works?per_page=1${mailto}`,
                { headers: this.buildHeaders(apiKey, email) }
            );
            return response.ok;
        } catch {
            return false;
        }
    }

    async searchWorks(params: OpenAlexSearchParams, apiKey?: string, email?: string): Promise<OpenAlexSearchResult> {
        const { query, filters, perPage = 25, page = 1 } = params;
        const mailto = this.buildMailtoParam(email);
        const filterStr = this.buildFilterString(filters);
        const encodedQuery = encodeURIComponent(query);

        const url = `${this.baseUrl}/works?search=${encodedQuery}&per_page=${perPage}&page=${page}${filterStr}${mailto}&select=id,title,display_name,type,publication_year,publication_date,doi,authorships,primary_location,open_access,biblio,cited_by_count,abstract_inverted_index,concepts,keywords`;

        const response = await fetch(url, { headers: this.buildHeaders(apiKey, email) });

        if (!response.ok) {
            throw new Error(`OpenAlex API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return {
            works: data.results || [],
            total: data.meta?.count || 0,
            page: data.meta?.page || 1,
            perPage: data.meta?.per_page || perPage,
        };
    }

    async fetchWorksByIds(ids: string[], apiKey?: string, email?: string): Promise<OpenAlexWork[]> {
        if (ids.length === 0) return [];

        const mailto = this.buildMailtoParam(email);
        const chunks = [];
        for (let i = 0; i < ids.length; i += 50) {
            chunks.push(ids.slice(i, i + 50));
        }

        const results: OpenAlexWork[] = [];
        for (const chunk of chunks) {
            const filter = `openalex:${chunk.map(id => id.replace('https://openalex.org/', '')).join('|')}`;
            const url = `${this.baseUrl}/works?filter=${encodeURIComponent(filter)}&per_page=50${mailto}&select=id,title,display_name,type,publication_year,publication_date,doi,authorships,primary_location,open_access,biblio,cited_by_count,abstract_inverted_index,concepts,keywords`;

            try {
                const response = await fetch(url, { headers: this.buildHeaders(apiKey, email) });
                if (response.ok) {
                    const data = await response.json();
                    results.push(...(data.results || []));
                }
            } catch (error) {
                console.error('[OpenAlexAPIService] Error fetching chunk:', error);
            }
        }

        return results;
    }
}

export const openAlexAPIService = new OpenAlexAPIService();
