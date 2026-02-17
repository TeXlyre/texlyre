// src/types/bibliography.ts

export interface BibEntry {
    key: string;
    entryType: string;
    fields: Record<string, string>;
    rawEntry: string;
    source?: 'local' | 'external';
    isImported?: boolean;
    filePath?: string;
    providerId?: string;
    providerName?: string;
    remoteId?: string;
}

export interface BibliographyFile {
    path: string;
    name: string;
    id: string;
}