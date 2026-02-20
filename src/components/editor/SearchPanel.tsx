// src/components/editor/SearchPanel.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { useSearch } from '../../hooks/useSearch';
import { SearchIcon, ReplaceIcon, FileTextIcon } from '../common/Icons';
import SearchReplaceModal from './SearchReplaceModal';
import { fileOperationNotificationService } from '../../services/FileOperationNotificationService';

interface SearchPanelProps {
  className?: string;
  onNavigateToResult: (
    fileId: string,
    line?: number,
    column?: number,
    documentId?: string,
    isLinkedDocument?: boolean)
    => void;
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
    replaceAll
  } = useSearch();

  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [pendingReplace, setPendingReplace] = useState<{
    type: 'file' | 'document' | 'all';
    fileId?: string;
    documentId?: string;
    fileName?: string;
    count: number;
  } | null>(null);

  useEffect(() => {
    const handleOpenSearchPanel = (event: Event) => {
      const customEvent = event as CustomEvent;
      const mode = customEvent.detail?.mode;
      const selectedText = customEvent.detail?.selectedText;

      if (selectedText) {
        setQuery(selectedText);
      }

      if (mode === 'replace') {
        if (!showReplace) {
          toggleReplace();
        }
        setTimeout(() => {
          const replaceInput = document.querySelectorAll('.search-input')[1] as HTMLInputElement;
          if (replaceInput) {
            replaceInput.focus();
            replaceInput.select();
          }
        }, 50);
      } else {
        if (showReplace) {
          toggleReplace();
        }
        setTimeout(() => {
          const searchInput = document.querySelector('.search-input') as HTMLInputElement;
          if (searchInput) {
            searchInput.focus();
            searchInput.select();
          }
        }, 50);
      }
    };

    document.addEventListener('open-search-panel', handleOpenSearchPanel);

    return () => {
      document.removeEventListener('open-search-panel', handleOpenSearchPanel);
    };
  }, [showReplace, toggleReplace, setQuery]);

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
  }, [query, caseSensitive, wholeWord, useRegex]);

  const handleResultClick = (
    fileId: string,
    line?: number,
    column?: number,
    documentId?: string,
    isLinkedDocument?: boolean) => {
    onNavigateToResult(fileId, line, column, documentId, isLinkedDocument);

    document.dispatchEvent(
      new CustomEvent('highlight-search-in-editor', {
        detail: { query, caseSensitive }
      })
    );
  };

  const handleReplaceInFile = async (
    fileId: string,
    event: React.MouseEvent,
    documentId?: string) => {
    event.stopPropagation();

    const result = results.find((r) => r.fileId === fileId);
    if (!result) return;

    setPendingReplace({
      type: documentId ? 'document' : 'file',
      fileId,
      documentId,
      fileName: result.fileName,
      count: result.matchCount || 0
    });
    setShowReplaceModal(true);
  };

  const handleReplaceAll = async () => {
    setPendingReplace({
      type: 'all',
      count: results.length
    });
    setShowReplaceModal(true);
  };

  const handleConfirmReplace = async () => {
    if (!pendingReplace) return;

    const operationId = `replace-${Date.now()}`;
    setShowReplaceModal(false);

    try {
      if (pendingReplace.type === 'all') {
        fileOperationNotificationService.showLoading(
          operationId,
          t('Replacing in {count} file...', { count: pendingReplace.count })
        );

        const count = await replaceAll();

        fileOperationNotificationService.showSuccess(
          operationId,
          t('Successfully replaced in {count} file', { count })
        );
      } else {
        fileOperationNotificationService.showLoading(
          operationId,
          t('Replacing in {fileName}...', { fileName: pendingReplace.fileName })
        );

        const success = await replaceInFile(
          pendingReplace.fileId!,
          pendingReplace.documentId
        );

        if (success) {
          fileOperationNotificationService.showSuccess(
            operationId,
            t('Successfully replaced in {fileName}', { fileName: pendingReplace.fileName })
          );
        } else {
          fileOperationNotificationService.showError(
            operationId,
            t('No matches found in {fileName}', { fileName: pendingReplace.fileName })
          );
        }
      }
    } catch (error) {
      fileOperationNotificationService.showError(
        operationId,
        t('Failed to replace: {message}', { message: error.message })
      );
    } finally {
      setPendingReplace(null);
    }
  };

  const highlightMatch = (text: string, matchStart: number, matchEnd: number) => {
    if (!text) return null;

    return (
      <>
        {text.substring(0, matchStart)}
        <mark className="search-highlight">{text.substring(matchStart, matchEnd)}</mark>
        {text.substring(matchEnd)}
      </>);

  };

  return (
    <div className={`search-panel ${className}`}>
      <div className="file-explorer-header">
        <h3>{t('Search')}</h3>
        <div className="search-mode-toggle file-explorer-actions">
          <button
            className={`mode-toggle-btn ${!showReplace ? 'active' : ''}`}
            onClick={() => showReplace && toggleReplace()}
            title={t('Search only (Ctrl+Shift+F)')}>

            <SearchIcon />
          </button>
          <button
            className={`mode-toggle-btn ${showReplace ? 'active' : ''}`}
            onClick={toggleReplace}
            title={t('Search and Replace (Ctrl+Shift+H)')}>

            <ReplaceIcon />
          </button>
        </div>
      </div>

      <div className="search-options">
        <button
          className={`search-option-btn ${caseSensitive ? 'active' : ''}`}
          onClick={toggleCaseSensitive}
          title={t('Match case')}>{t('Aa')}


        </button>
        <button
          className={`search-option-btn ${wholeWord ? 'active' : ''}`}
          onClick={toggleWholeWord}
          title={t('Match whole word')}>{t('|w|')}


        </button>
        <button
          className={`search-option-btn ${useRegex ? 'active' : ''}`}
          onClick={toggleRegex}
          title={t('Use regular expression')}>{t('.*')}


        </button>
      </div>

      <div className="search-input-container">
        <input
          type="text"
          placeholder={t('Search in files...')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="search-input" />

        {query &&
          <button className="clear-search-button" onClick={clearSearch}>
            ×
          </button>
        }
      </div>

      {showReplace &&
        <div className="search-input-container">
          <input
            type="text"
            placeholder={t('Replace with...')}
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            className="search-input" />

          <button
            className="replace-all-btn"
            onClick={handleReplaceAll}
            disabled={!query.trim() || !replaceText || results.length === 0 || isReplacing}
            title={t('Replace all')}>

            {t('Replace All')}
          </button>
        </div>
      }

      <div className="search-results">
        {(isSearching || isReplacing) &&
          <div className="search-loading">
            {isSearching ? t('Searching...') : t('Replacing...')}
          </div>
        }

        {!isSearching && !isReplacing && results.length === 0 && query.trim() &&
          <div className="search-empty">{t('No results found')}</div>
        }

        {!isSearching && !isReplacing && query.trim() === '' &&
          <div className="search-empty">{t('Enter a search query to find files')}</div>
        }

        {!isSearching && !isReplacing && results.length > 0 &&
          <>
            <div className="search-results-header">
              {t('{totalMatches} match in {count} file', { totalMatches, count: results.length })}
            </div>
            <div className="search-results-note">
              {t('Click once to open file or document, twice to navigate to match')}
            </div>
            {results.map((result, resultIdx) =>
              <div
                key={`${result.fileId}-${result.matchType}-${resultIdx}`}
                className="search-result-file">

                <div className="search-result-file-header">
                  <FileTextIcon />
                  <span className="search-result-filename">
                    {result.fileName || t('Untitled')}
                  </span>
                  <span className="search-result-filepath">
                    {result.filePath || ''}
                  </span>
                  {showReplace && result.matchType === 'content' &&
                    <button
                      className="replace-file-btn"
                      onClick={(e) => handleReplaceInFile(
                        result.fileId,
                        e,
                        result.isLinkedDocument ? result.documentId : undefined
                      )}
                      disabled={!replaceText || isReplacing}
                      title={result.isLinkedDocument ? t('Replace in this document') : t('Replace in this file')}>

                      {t('Replace')}
                    </button>
                  }
                </div>

                {result.matchType === 'filename' && result.matches.length > 0 ?
                  <div
                    className="search-result-match"
                    onClick={() => handleResultClick(
                      result.fileId,
                      undefined,
                      undefined,
                      result.documentId,
                      result.isLinkedDocument
                    )}>

                    <span className="search-result-match-text">
                      {highlightMatch(
                        result.matches[0].text || result.fileName,
                        result.matches[0].matchStart,
                        result.matches[0].matchEnd
                      )}
                    </span>
                  </div> :
                  result.matchType === 'content' && result.matches.length > 0 ?
                    <div className="search-result-matches">
                      {result.matches.slice(0, 50).map((match, idx) =>
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
                          }>

                          <span className="search-result-line">{match.line}</span>
                          <span className="search-result-match-text">
                            {highlightMatch(
                              match.text || '',
                              match.matchStart,
                              match.matchEnd
                            )}
                          </span>
                        </div>
                      )}
                      {result.matches.length > 50 &&
                        <div className="search-result-more">
                          {t('+{count} more matches', { count: result.matches.length - 50 })}
                        </div>
                      }
                    </div> :
                    null}
              </div>
            )}
          </>
        }
      </div>

      {showReplaceModal && pendingReplace &&
        <SearchReplaceModal
          isOpen={showReplaceModal}
          onClose={() => {
            setShowReplaceModal(false);
            setPendingReplace(null);
          }}
          onConfirm={handleConfirmReplace}
          replaceCount={pendingReplace.count}
          replaceType={pendingReplace.type}
          fileName={pendingReplace.fileName} />

      }
    </div>);

};

export default SearchPanel;