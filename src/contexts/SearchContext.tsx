import type React from 'react';
import { createContext, useCallback, useState } from 'react';
import { searchService, type SearchResult } from '../services/SearchService';

export interface SearchContextType {
    query: string;
    replaceText: string;
    results: SearchResult[];
    isSearching: boolean;
    isReplacing: boolean;
    caseSensitive: boolean;
    wholeWord: boolean;
    showReplace: boolean;
    setQuery: (query: string) => void;
    setReplaceText: (text: string) => void;
    performSearch: () => Promise<void>;
    toggleCaseSensitive: () => void;
    toggleWholeWord: () => void;
    toggleReplace: () => void;
    clearSearch: () => void;
    replaceInFile: (fileId: string) => Promise<boolean>;
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
    const [showReplace, setShowReplace] = useState(false);

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

    const replaceInFile = useCallback(async (fileId: string): Promise<boolean> => {
        if (!query.trim() || !replaceText) return false;

        setIsReplacing(true);
        try {
            const success = await searchService.replaceInFile(
                fileId,
                query,
                replaceText,
                { caseSensitive, wholeWord }
            );

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
    }, [query, replaceText, caseSensitive, wholeWord, performSearch]);

    const replaceAll = useCallback(async (): Promise<number> => {
        if (!query.trim() || !replaceText) return 0;

        setIsReplacing(true);
        try {
            const count = await searchService.replaceAll(
                results,
                query,
                replaceText,
                { caseSensitive, wholeWord }
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
    }, [query, replaceText, results, caseSensitive, wholeWord, performSearch]);

    const toggleCaseSensitive = useCallback(() => {
        setCaseSensitive((prev) => !prev);
    }, []);

    const toggleWholeWord = useCallback(() => {
        setWholeWord((prev) => !prev);
    }, []);

    const toggleReplace = useCallback(() => {
        setShowReplace((prev) => !prev);
    }, []);

    const clearSearch = useCallback(() => {
        setQuery('');
        setReplaceText('');
        setResults([]);
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
                showReplace,
                setQuery,
                setReplaceText,
                performSearch,
                toggleCaseSensitive,
                toggleWholeWord,
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