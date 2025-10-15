// src/contexts/SearchContext.tsx
import type React from 'react';
import { createContext, useCallback, useState, useEffect } from 'react';
import { searchService, type SearchResult } from '../services/SearchService';

export interface SearchContextType {
    query: string;
    replaceText: string;
    results: SearchResult[];
    isSearching: boolean;
    isReplacing: boolean;
    caseSensitive: boolean;
    wholeWord: boolean;
    useRegex: boolean;
    showReplace: boolean;
    totalMatches: number;
    setQuery: (query: string) => void;
    setReplaceText: (text: string) => void;
    performSearch: () => Promise<void>;
    toggleCaseSensitive: () => void;
    toggleWholeWord: () => void;
    toggleRegex: () => void;
    toggleReplace: () => void;
    clearSearch: () => void;
    replaceInFile: (fileId: string, documentId?: string) => Promise<boolean>;
    replaceAll: () => Promise<number>;
}

export const SearchContext = createContext<SearchContextType | null>(null);

export const SearchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [query, setQuery] = useState('');
    const [replaceText, setReplaceText] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [isReplacing, setIsReplacing] = useState(false);
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [wholeWord, setWholeWord] = useState(false);
    const [useRegex, setUseRegex] = useState(false);
    const [showReplace, setShowReplace] = useState(false);
    const [projectId, setProjectId] = useState<string>('');
    const [totalMatches, setTotalMatches] = useState(0);

    useEffect(() => {
        const hash = window.location.hash.substring(1);
        const yjsUrl = hash.split('&')[0];
        if (yjsUrl.startsWith('yjs:')) {
            setProjectId(yjsUrl.slice(4));
        }
    }, []);

    const performSearch = useCallback(async () => {
        if (!query.trim()) {
            setResults([]);
            setTotalMatches(0);
            return;
        }

        setIsSearching(true);
        try {
            const searchResults = await searchService.search(query, {
                caseSensitive,
                wholeWord,
                useRegex,
                includeFilenames: true,
                includeContent: true,
            });
            setResults(searchResults);
            setTotalMatches(searchResults.reduce((sum, r) => sum + (r.matchCount || 0), 0));
        } catch (error) {
            console.error('Search error:', error);
            setResults([]);
            setTotalMatches(0);
        } finally {
            setIsSearching(false);
        }
    }, [query, caseSensitive, wholeWord, useRegex]);

    const replaceInFile = useCallback(async (fileId: string, documentId?: string): Promise<boolean> => {
        if (!query.trim() || !replaceText) return false;

        setIsReplacing(true);
        try {
            let success = false;

            if (documentId) {
                success = await searchService.replaceInDocument(
                    documentId,
                    projectId,
                    query,
                    replaceText,
                    { caseSensitive, wholeWord, useRegex }
                );
            } else {
                success = await searchService.replaceInFile(
                    fileId,
                    query,
                    replaceText,
                    { caseSensitive, wholeWord, useRegex }
                );
            }

            if (success) {
                await performSearch();
            }

            return success;
        } catch (error) {
            console.error('Replace error:', error);
            return false;
        } finally {
            setIsReplacing(false);
        }
    }, [query, replaceText, caseSensitive, wholeWord, useRegex, projectId, performSearch]);

    const replaceAll = useCallback(async (): Promise<number> => {
        if (!query.trim() || !replaceText) return 0;

        setIsReplacing(true);
        try {
            const count = await searchService.replaceAll(
                results,
                query,
                replaceText,
                projectId,
                { caseSensitive, wholeWord, useRegex }
            );

            if (count > 0) {
                await performSearch();
            }

            return count;
        } catch (error) {
            console.error('Replace all error:', error);
            return 0;
        } finally {
            setIsReplacing(false);
        }
    }, [query, replaceText, results, caseSensitive, wholeWord, useRegex, projectId, performSearch]);

    const toggleCaseSensitive = useCallback(() => {
        setCaseSensitive((prev) => !prev);
    }, []);

    const toggleWholeWord = useCallback(() => {
        setWholeWord((prev) => !prev);
    }, []);

    const toggleRegex = useCallback(() => {
        setUseRegex((prev) => !prev);
    }, []);

    const toggleReplace = useCallback(() => {
        setShowReplace((prev) => !prev);
    }, []);

    const clearSearch = useCallback(() => {
        setQuery('');
        setReplaceText('');
        setResults([]);
        setTotalMatches(0);
        searchService.cancel();
        document.dispatchEvent(new CustomEvent('clear-search-highlights'));
    }, []);

    return (
        <SearchContext.Provider
            value={{
                query,
                replaceText,
                results,
                isSearching,
                isReplacing,
                caseSensitive,
                wholeWord,
                useRegex,
                showReplace,
                totalMatches,
                setQuery,
                setReplaceText,
                performSearch,
                toggleCaseSensitive,
                toggleWholeWord,
                toggleRegex,
                toggleReplace,
                clearSearch,
                replaceInFile,
                replaceAll,
            }}
        >
            {children}
        </SearchContext.Provider>
    );
};