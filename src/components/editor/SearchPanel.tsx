import type React from 'react';
import { useEffect, useRef } from 'react';
import { useSearch } from '../../hooks/useSearch';
import { SearchIcon, ReplaceIcon, CloseIcon, FileTextIcon } from '../common/Icons';

interface SearchPanelProps {
    className?: string;
    onNavigateToResult: (
        fileId: string,
        line?: number,
        column?: number,
        documentId?: string,
        isLinkedDocument?: boolean
    ) => void;
}

const SearchPanel: React.FC<SearchPanelProps> = ({ className = '', onNavigateToResult }) => {
    const {
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

    const handleResultClick = (
        fileId: string,
        line?: number,
        column?: number,
        documentId?: string,
        isLinkedDocument?: boolean
    ) => {
        onNavigateToResult(fileId, line, column, documentId, isLinkedDocument);

        document.dispatchEvent(
            new CustomEvent('highlight-search-in-editor', {
                detail: { query, caseSensitive },
            })
        );
    };

    const handleReplaceInFile = async (fileId: string, event: React.MouseEvent) => {
        event.stopPropagation();
        await replaceInFile(fileId);
    };

    const handleReplaceAll = async () => {
        if (!window.confirm(`Replace all occurrences in ${results.length} files?`)) {
            return;
        }

        const count = await replaceAll();
        alert(`Replaced in ${count} files`);
    };

    const highlightMatch = (text: string, matchStart: number, matchEnd: number) => {
        if (!text) return null;

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
                <div className="search-panel-title">
                    <h3>Search</h3>
                    <div className="search-mode-toggle">
                        <button
                            className={`mode-toggle-btn ${!showReplace ? 'active' : ''}`}
                            onClick={() => showReplace && toggleReplace()}
                            title="Search only"
                        >
                            <SearchIcon />
                        </button>
                        <button
                            className={`mode-toggle-btn ${showReplace ? 'active' : ''}`}
                            onClick={toggleReplace}
                            title="Search and Replace"
                        >
                            <ReplaceIcon />
                        </button>
                    </div>
                </div>
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

            {showReplace && (
                <div className="search-input-container">
                    <ReplaceIcon />
                    <input
                        type="text"
                        placeholder="Replace with..."
                        value={replaceText}
                        onChange={(e) => setReplaceText(e.target.value)}
                        className="search-input"
                    />
                    <button
                        className="replace-all-btn"
                        onClick={handleReplaceAll}
                        disabled={!query.trim() || !replaceText || results.length === 0 || isReplacing}
                        title="Replace all"
                    >
                        Replace All
                    </button>
                </div>
            )}

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
                {(isSearching || isReplacing) && (
                    <div className="search-loading">
                        {isSearching ? 'Searching...' : 'Replacing...'}
                    </div>
                )}

                {!isSearching && !isReplacing && results.length === 0 && query.trim() && (
                    <div className="search-empty">No results found</div>
                )}

                {!isSearching && !isReplacing && query.trim() === '' && (
                    <div className="search-empty">Enter a search query to find files</div>
                )}

                {!isSearching && !isReplacing && results.length > 0 && (
                    <>
                        <div className="search-results-header">
                            {results.length} file{results.length !== 1 ? 's' : ''} found
                        </div>

                        {results.map((result, resultIdx) => (
                            <div
                                key={`${result.fileId}-${result.matchType}-${resultIdx}`}
                                className="search-result-file"
                            >
                                <div className="search-result-file-header">
                                    <FileTextIcon />
                                    <span className="search-result-filename">
                                        {result.fileName || 'Untitled'}
                                    </span>
                                    <span className="search-result-filepath">
                                        {result.filePath || ''}
                                    </span>
                                    {showReplace && result.matchType === 'content' && !result.isLinkedDocument && (
                                        <button
                                            className="replace-file-btn"
                                            onClick={(e) => handleReplaceInFile(result.fileId, e)}
                                            disabled={!replaceText || isReplacing}
                                            title="Replace in this file"
                                        >
                                            Replace
                                        </button>
                                    )}
                                </div>

                                {result.matchType === 'filename' && result.matches.length > 0 ? (
                                    <div
                                        className="search-result-match"
                                        onClick={() => handleResultClick(
                                            result.fileId,
                                            undefined,
                                            undefined,
                                            result.documentId,
                                            result.isLinkedDocument
                                        )}
                                    >
                                        <span className="search-result-match-text">
                                            {highlightMatch(
                                                result.matches[0].text || result.fileName,
                                                result.matches[0].matchStart,
                                                result.matches[0].matchEnd
                                            )}
                                        </span>
                                    </div>
                                ) : result.matchType === 'content' && result.matches.length > 0 ? (
                                    <div className="search-result-matches">
                                        {result.matches.slice(0, 50).map((match, idx) => (
                                            <div
                                                key={`${result.fileId}-${match.line}-${idx}`}
                                                className="search-result-match"
                                                onClick={() =>
                                                    handleResultClick(
                                                        result.fileId,
                                                        match.line,
                                                        match.column,
                                                        result.documentId,
                                                        result.isLinkedDocument
                                                    )
                                                }
                                            >
                                                <span className="search-result-line">{match.line}</span>
                                                <span className="search-result-match-text">
                                                    {highlightMatch(
                                                        match.text || '',
                                                        match.matchStart,
                                                        match.matchEnd
                                                    )}
                                                </span>
                                            </div>
                                        ))}
                                        {result.matches.length > 50 && (
                                            <div className="search-result-more">
                                                +{result.matches.length - 50} more matches
                                            </div>
                                        )}
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </>
                )}
            </div>
        </div>
    );
};

export default SearchPanel;