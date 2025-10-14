import { fileStorageService } from './FileStorageService';
import type { FileNode } from '../types/files';

export interface SearchResult {
    fileId: string;
    fileName: string;
    filePath: string;
    matches: SearchMatch[];
    matchType: 'filename' | 'content';
    documentId?: string;
    isLinkedDocument?: boolean;
}

export interface SearchMatch {
    line: number;
    column: number;
    text: string;
    matchStart: number;
    matchEnd: number;
}

class SearchService {
    private currentAbortController: AbortController | null = null;
    private readonly CHUNK_SIZE = 50;

    async search(
        query: string,
        options: {
            caseSensitive?: boolean;
            wholeWord?: boolean;
            includeFilenames?: boolean;
            includeContent?: boolean;
        } = {}
    ): Promise<SearchResult[]> {
        if (!query.trim()) return [];

        this.currentAbortController?.abort();
        this.currentAbortController = new AbortController();
        const signal = this.currentAbortController.signal;

        const {
            caseSensitive = false,
            wholeWord = false,
            includeFilenames = true,
            includeContent = true,
        } = options;

        const results: SearchResult[] = [];
        const allFiles = await fileStorageService.getAllFiles(false);

        // Separate linked files from unlinked files
        const linkedFileIds = new Set<string>();
        const linkedDocumentIds = new Set<string>();

        allFiles.forEach(file => {
            if (file.documentId) {
                linkedFileIds.add(file.id);
                linkedDocumentIds.add(file.documentId);
            }
        });

        // Only search unlinked files
        const unlinkedFiles = allFiles.filter(file => !file.documentId);
        const textFiles = unlinkedFiles.filter(
            (file) => file.type === 'file' && !file.isBinary
        );

        if (includeFilenames) {
            const filenameResults = this.searchFilenames(
                unlinkedFiles,
                query,
                caseSensitive,
                signal
            );
            results.push(...filenameResults);
        }

        if (includeContent) {
            const contentResults = await this.searchFileContents(
                textFiles,
                query,
                caseSensitive,
                wholeWord,
                signal
            );
            results.push(...contentResults);
        }

        // Search linked documents instead of linked files
        if (includeContent && linkedDocumentIds.size > 0) {
            const documentResults = await this.searchLinkedDocuments(
                Array.from(linkedDocumentIds),
                allFiles,
                query,
                caseSensitive,
                wholeWord,
                signal
            );
            results.push(...documentResults);
        }

        return results;
    }

    private async searchLinkedDocuments(
        documentIds: string[],
        allFiles: FileNode[],
        query: string,
        caseSensitive: boolean,
        wholeWord: boolean,
        signal: AbortSignal
    ): Promise<SearchResult[]> {
        const results: SearchResult[] = [];
        const searchRegex = this.buildSearchRegex(query, caseSensitive, wholeWord);

        // We need to get the document content from Yjs
        // For now, we'll search the linked files but mark them as documents
        const linkedFiles = allFiles.filter(file =>
            file.documentId && documentIds.includes(file.documentId)
        );

        for (const file of linkedFiles) {
            if (signal.aborted) break;

            const result = await this.searchFileContent(file, searchRegex, signal);

            if (result.matches.length > 0) {
                // Mark this as a linked document result
                result.isLinkedDocument = true;
                result.documentId = file.documentId;
                // Keep the file name but indicate it's a document
                result.fileName = `${file.name} (Document)`;
                results.push(result);
            }
        }

        return results;
    }

    private searchFilenames(
        files: FileNode[],
        query: string,
        caseSensitive: boolean,
        signal: AbortSignal
    ): SearchResult[] {
        const results: SearchResult[] = [];
        const searchQuery = caseSensitive ? query : query.toLowerCase();

        for (const file of files) {
            if (signal.aborted) break;

            const fileName = caseSensitive ? file.name : file.name.toLowerCase();
            const index = fileName.indexOf(searchQuery);

            if (index !== -1) {
                results.push({
                    fileId: file.id,
                    fileName: file.name,
                    filePath: file.path,
                    matches: [
                        {
                            line: 0,
                            column: index,
                            text: file.name,
                            matchStart: index,
                            matchEnd: index + query.length,
                        },
                    ],
                    matchType: 'filename',
                });
            }
        }

        return results;
    }

    private async searchFileContents(
        files: FileNode[],
        query: string,
        caseSensitive: boolean,
        wholeWord: boolean,
        signal: AbortSignal
    ): Promise<SearchResult[]> {
        const results: SearchResult[] = [];
        const searchRegex = this.buildSearchRegex(query, caseSensitive, wholeWord);

        for (let i = 0; i < files.length; i += this.CHUNK_SIZE) {
            if (signal.aborted) break;

            const chunk = files.slice(i, i + this.CHUNK_SIZE);
            const chunkResults = await Promise.all(
                chunk.map((file) => this.searchFileContent(file, searchRegex, signal))
            );

            results.push(...chunkResults.filter((r) => r.matches.length > 0));

            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        return results;
    }

    private async searchFileContent(
        file: FileNode,
        searchRegex: RegExp,
        signal: AbortSignal
    ): Promise<SearchResult> {
        const result: SearchResult = {
            fileId: file.id,
            fileName: file.name,
            filePath: file.path,
            matches: [],
            matchType: 'content',
        };

        if (signal.aborted) return result;

        try {
            const fileData = await fileStorageService.getFile(file.id);
            if (!fileData?.content) return result;

            let content: string;
            if (typeof fileData.content === 'string') {
                content = fileData.content;
            } else if (fileData.content instanceof ArrayBuffer) {
                content = new TextDecoder().decode(fileData.content);
            } else {
                return result;
            }

            const lines = content.split('\n');
            for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
                if (signal.aborted) break;

                const line = lines[lineIndex];
                let match: RegExpExecArray | null;

                searchRegex.lastIndex = 0;
                while ((match = searchRegex.exec(line)) !== null) {
                    result.matches.push({
                        line: lineIndex + 1,
                        column: match.index,
                        text: line,
                        matchStart: match.index,
                        matchEnd: match.index + match[0].length,
                    });

                    if (!searchRegex.global) break;
                }
            }
        } catch (error) {
            console.error(`Error searching file ${file.path}:`, error);
        }

        return result;
    }

    private buildSearchRegex(
        query: string,
        caseSensitive: boolean,
        wholeWord: boolean
    ): RegExp {
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = wholeWord ? `\\b${escapedQuery}\\b` : escapedQuery;
        const flags = caseSensitive ? 'g' : 'gi';
        return new RegExp(pattern, flags);
    }

    cancel(): void {
        this.currentAbortController?.abort();
        this.currentAbortController = null;
    }
}

export const searchService = new SearchService();