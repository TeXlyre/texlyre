import type React from 'react';
import { useEffect, useRef } from 'react';
import { useSearch } from '../../hooks/useSearch';
import { SearchIcon, CloseIcon, FileTextIcon } from '../common/Icons';

interface SearchPanelProps {
    className?: string;
    onNavigateToResult: (fileId: string, line?: number, column?: number) => void;
}

const SearchPanel: React.FC<SearchPanelProps> = ({ className = '', onNavigateToResult }) => {
    const {
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
    } = useSearch();

    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        if (query.trim()) {
            searchTimeoutRef.current = setTimeout(() => {
                performSearch();
            }, 300);
        } else {
            clearSearch();
        }

        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
            }
        };
    }, [query, caseSensitive, wholeWord]);

    const handleResultClick = (fileId: string, line?: number, column?: number) => {
        onNavigateToResult(fileId, line, column);

        document.dispatchEvent(
            new CustomEvent('highlight-search-in-editor', {
                detail: { query, caseSensitive },
            })
        );
    };

    const highlightMatch = (text: string, matchStart: number, matchEnd: number) => {
        return (
            <>
                {text.substring(0, matchStart)}
                <mark className="search-highlight">{text.substring(matchStart, matchEnd)}</mark>
                {text.substring(matchEnd)}
            </>
        );
    };

    return (
        <div className={`search-panel ${className}`}>
            <div className="search-panel-header">
                <h3>Search</h3>
                <button className="action-btn" onClick={clearSearch} title="Clear search">
                    <CloseIcon />
                </button>
            </div>

            <div className="search-input-container">
                <SearchIcon />
                <input
                    type="text"
                    placeholder="Search in files..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="search-input"
                />
            </div>

            <div className="search-options">
                <button
                    className={`search-option-btn ${caseSensitive ? 'active' : ''}`}
                    onClick={toggleCaseSensitive}
                    title="Match case"
                >
                    Aa
                </button>
                <button
                    className={`search-option-btn ${wholeWord ? 'active' : ''}`}
                    onClick={toggleWholeWord}
                    title="Match whole word"
                >
                    |w|
                </button>
            </div>

            <div className="search-results">
                {isSearching && <div className="search-loading">Searching...</div>}

                {!isSearching && results.length === 0 && query.trim() && (
                    <div className="search-empty">No results found</div>
                )}

                {!isSearching && query.trim() === '' && (
                    <div className="search-empty">Enter a search query to find files</div>
                )}

                {!isSearching && results.length > 0 && (
                    <>
                        <div className="search-results-header">
                            {results.length} file{results.length !== 1 ? 's' : ''} found
                        </div>

                        {results.map((result) => (
                            <div key={`${result.fileId}-${result.matchType}`} className="search-result-file">
                                <div className="search-result-file-header">
                                    <FileTextIcon />
                                    <span className="search-result-filename">{result.fileName}</span>
                                    <span className="search-result-filepath">{result.filePath}</span>
                                </div>

                                {result.matchType === 'filename' ? (
                                    <div
                                        className="search-result-match"
                                        onClick={() => handleResultClick(result.fileId)}
                                    >
                                        <span className="search-result-match-text">
                                            {highlightMatch(
                                                result.matches[0].text,
                                                result.matches[0].matchStart,
                                                result.matches[0].matchEnd
                                            )}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="search-result-matches">
                                        {result.matches.slice(0, 50).map((match, idx) => (
                                            <div
                                                key={idx}
                                                className="search-result-match"
                                                onClick={() =>
                                                    handleResultClick(result.fileId, match.line, match.column)
                                                }
                                            >
                                                <span className="search-result-line">{match.line}</span>
                                                <span className="search-result-match-text">
                                                    {highlightMatch(match.text, match.matchStart, match.matchEnd)}
                                                </span>
                                            </div>
                                        ))}
                                        {result.matches.length > 50 && (
                                            <div className="search-result-more">
                                                +{result.matches.length - 50} more matches
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </>
                )}
            </div>
        </div>
    );
};

export default SearchPanel;