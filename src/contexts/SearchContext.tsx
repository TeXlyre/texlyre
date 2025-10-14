import type React from 'react';
import { createContext, useCallback, useState } from 'react';
import { searchService, type SearchResult } from '../services/SearchService';

export interface SearchContextType {
    query: string;
    results: SearchResult[];
    isSearching: boolean;
    caseSensitive: boolean;
    wholeWord: boolean;
    setQuery: (query: string) => void;
    performSearch: () => Promise<void>;
    toggleCaseSensitive: () => void;
    toggleWholeWord: () => void;
    clearSearch: () => void;
}

export const SearchContext = createContext<SearchContextType | null>(null);

export const SearchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [wholeWord, setWholeWord] = useState(false);

    const performSearch = useCallback(async () => {
        if (!query.trim()) {
            setResults([]);
            return;
        }

        setIsSearching(true);
        try {
            const searchResults = await searchService.search(query, {
                caseSensitive,
                wholeWord,
                includeFilenames: true,
                includeContent: true,
            });
            setResults(searchResults);
        } catch (error) {
            console.error('Search error:', error);
            setResults([]);
        } finally {
            setIsSearching(false);
        }
    }, [query, caseSensitive, wholeWord]);

    const toggleCaseSensitive = useCallback(() => {
        setCaseSensitive((prev) => !prev);
    }, []);

    const toggleWholeWord = useCallback(() => {
        setWholeWord((prev) => !prev);
    }, []);

    const clearSearch = useCallback(() => {
        setQuery('');
        setResults([]);
        searchService.cancel();
        document.dispatchEvent(new CustomEvent('clear-search-highlights'));
    }, []);

    return (
        <SearchContext.Provider
            value={{
                query,
                results,
                isSearching,
                caseSensitive,
                wholeWord,
                setQuery,
                performSearch,
                toggleCaseSensitive,
                toggleWholeWord,
                clearSearch,
            }}
        >
            {children}
        </SearchContext.Provider>
    );
};