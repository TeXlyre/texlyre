// src/components/bibliography/BibliographyPanel.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useRef, useState } from 'react';

import { useBibliography } from '../../hooks/useBibliography';
import PositionedDropdown from '../common/PositionedDropdown';
import {
  SyncIcon,
  ChevronDownIcon,
  BibliographyIcon,
  OptionsIcon,
  ImportIcon,
  TrashIcon,
  CheckIcon,
  CloseIcon,
} from '../common/Icons';
import type { BibEntry } from '../../types/bibliography';

interface BibliographyPanelProps {
  className?: string;
}

const BibliographyPanel: React.FC<BibliographyPanelProps> = ({ className = '' }) => {
  const {
    showPanel,
    activeTab,
    setActiveTab,
    selectedProvider,
    availableProviders,
    selectedItem,
    showDropdown,
    setShowDropdown,
    isRefreshing,
    searchQuery,
    setSearchQuery,
    entries,
    localEntries,
    externalEntries,
    filteredEntries,
    availableBibFiles,
    targetBibFile,
    isLoading,
    importingEntries,
    currentProvider,
    citationStyle,
    autoImport,
    handleRefresh,
    handleProviderSelect,
    handleItemSelect,
    handleBackToList,
    handleEntryClick,
    handleImportEntry,
    handleTargetFileChange,
    handleDeleteEntry,
    handleUpdateEntry,
    getConnectionStatus,
    getStatusColor,
    showToolbar,
    setShowToolbar,
    sortField,
    setSortField,
    sortOrder,
    setSortOrder,
    entryTypeFilter,
    setEntryTypeFilter,
    sourceFilter,
    setSourceFilter,
    selectedCollection,
    setSelectedCollection,
    availableCollections,
    isMultiSelectMode,
    setIsMultiSelectMode,
    selectedEntryKeys,
    toggleEntrySelection,
    selectAllVisible,
    clearSelection,
    importSelectedEntries,
    updateSelectedEntries,
    deleteSelectedEntries,
    isBulkOperating,
  } = useBibliography();

  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const providerGroupRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  const toggleExpand = (key: string, e: React.MouseEvent) => {
    if (isMultiSelectMode) return;
    e.stopPropagation();
    setExpandedEntries(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const getEntryTypeLabel = (entryType: string) => {
    switch (entryType.toLowerCase()) {
      case 'article': return 'ART';
      case 'book': return 'BOOK';
      case 'inproceedings':
      case 'conference': return 'CONF';
      case 'phdthesis': return 'PHD';
      case 'mastersthesis': return 'MSC';
      case 'techreport': return 'REP';
      case 'misc': return 'MISC';
      case 'online': return 'WEB';
      case 'inbook':
      case 'incollection': return 'CHAP';
      default: return entryType.slice(0, 4).toUpperCase();
    }
  };

  const getDisplayTitle = (entry: BibEntry) =>
    entry.fields.title || entry.fields.booktitle || t('Untitled');

  const getDisplayAuthors = (entry: BibEntry) => {
    const author = entry.fields.author || entry.fields.editor;
    if (!author) return t('Unknown author');
    const authors = author.split(' and ').map((a: string) => a.trim());
    if (authors.length === 1) return authors[0];
    if (authors.length === 2) return `${authors[0]} & ${authors[1]}`;
    return `${authors[0]} et al.`;
  };

  const getDisplayYear = (entry: BibEntry) =>
    entry.fields.year || entry.fields.date || '';

  const getDisplayVenue = (entry: BibEntry) =>
    entry.fields.journal ||
    entry.fields.booktitle ||
    entry.fields.publisher ||
    entry.fields.school ||
    entry.fields.institution || '';

  const getUniqueKey = (entry: BibEntry, index: number) => {
    const base = `${entry.source}-${entry.key}`;
    return entry.source === 'local' && entry.filePath
      ? `${base}-${entry.filePath.replace(/[^a-zA-Z0-9]/g, '_')}-${index}`
      : `${base}-${index}`;
  };

  const hasUpdateAvailable = (entry: BibEntry) =>
    entry.source === 'local' &&
    externalEntries.some(ext =>
      (ext.remoteId && ext.remoteId === entry.remoteId) || ext.key === entry.key
    );

  const getRemoteEntry = (entry: BibEntry) =>
    externalEntries.find(ext =>
      (ext.remoteId && ext.remoteId === entry.remoteId) || ext.key === entry.key
    );

  const hasActiveFilters =
    entryTypeFilter !== 'all' || sourceFilter !== 'all' || selectedCollection !== 'all';

  const selectedCount = selectedEntryKeys.size;
  const canImportSelected = filteredEntries.some(
    e => selectedEntryKeys.has(e.key) && e.source === 'external' && !e.isImported
  );
  const canUpdateSelected = filteredEntries.some(
    e => selectedEntryKeys.has(e.key) && hasUpdateAvailable(e)
  );
  const canDeleteSelected = filteredEntries.some(
    e => selectedEntryKeys.has(e.key) && e.source === 'local'
  );

  if (!showPanel) return null;

  const renderProviderDropdown = () => (
    <PositionedDropdown
      isOpen={showDropdown}
      triggerElement={providerGroupRef.current}
      className="bib-dropdown">
      {availableProviders.length > 1 && (
        <div className="bib-dropdown-item" onClick={() => handleProviderSelect('all')}>
          <span className="service-indicator" />
          {t('All Sources')}
        </div>
      )}
      <div className="bib-dropdown-item" onClick={() => handleProviderSelect('local')}>
        <BibliographyIcon />
        {t('Local Bibliography')}
      </div>
      {availableProviders.map(provider => {
        const IconComponent = provider.icon;
        return (
          <div
            key={provider.id}
            className="bib-dropdown-item"
            onClick={() => handleProviderSelect(provider.id)}>
            <span className="service-indicator" style={{
              fontSize: '8px',
              color: provider.getConnectionStatus() === 'connected' ? '#28a745' : '#666'
            }}>●</span>
            {IconComponent && <IconComponent />}
            {provider.name}
          </div>
        );
      })}
    </PositionedDropdown>
  );

  const renderToolbar = () => (
    <PositionedDropdown
      isOpen={showToolbar}
      triggerElement={toolbarRef.current}
      className="bib-toolbar-dropdown"
      align="right">
      <div className="bib-toolbar-content">
        {selectedProvider !== 'local' && (
          <div className="bib-toolbar-section">
            <div className="bib-toolbar-label">{t('Bib File')}</div>
            <select
              value={targetBibFile}
              onChange={e => handleTargetFileChange(e.target.value)}
              className="bib-toolbar-select">
              <option value="">{t('Select file...')}</option>
              <option value="CREATE_NEW">{t('+ Create new...')}</option>
              {availableBibFiles.map(f => (
                <option key={f.path} value={f.path}>{f.name}</option>
              ))}
            </select>
          </div>
        )}

        {availableCollections.length > 0 && (
          <div className="bib-toolbar-section">
            <div className="bib-toolbar-label">{t('Collection')}</div>
            <select
              value={selectedCollection}
              onChange={e => setSelectedCollection(e.target.value)}
              className="bib-toolbar-select">
              <option value="all">{t('All Collections')}</option>
              {availableCollections.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        )}

        <div className="bib-toolbar-section">
          <div className="bib-toolbar-label">{t('Entry Type')}</div>
          <select
            value={entryTypeFilter}
            onChange={e => setEntryTypeFilter(e.target.value as any)}
            className="bib-toolbar-select">
            <option value="all">{t('All Types')}</option>
            <option value="article">{t('Article')}</option>
            <option value="book">{t('Book')}</option>
            <option value="inproceedings">{t('Conference')}</option>
            <option value="phdthesis">{t('Thesis')}</option>
            <option value="techreport">{t('Report')}</option>
            <option value="misc">{t('Misc')}</option>
            <option value="online">{t('Online')}</option>
          </select>
        </div>

        <div className="bib-toolbar-section">
          <div className="bib-toolbar-label">{t('Source')}</div>
          <select
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value as any)}
            className="bib-toolbar-select">
            <option value="all">{t('All Sources')}</option>
            <option value="local">{t('Local Only')}</option>
            <option value="external">{t('External Only')}</option>
          </select>
        </div>

        <div className="bib-toolbar-section bib-toolbar-sort">
          <div className="bib-toolbar-label">{t('Sort')}</div>
          <div className="bib-toolbar-sort-row">
            <select
              value={sortField}
              onChange={e => setSortField(e.target.value as any)}
              className="bib-toolbar-select bib-toolbar-sort-field">
              <option value="key">{t('Key')}</option>
              <option value="title">{t('Title')}</option>
              <option value="author">{t('Author')}</option>
              <option value="year">{t('Year')}</option>
            </select>
            <button
              className={`bib-sort-order-toggle ${sortOrder === 'desc' ? 'desc' : ''}`}
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              title={sortOrder === 'asc' ? t('Ascending') : t('Descending')}>
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>
      </div>
    </PositionedDropdown>
  );

  const renderControls = () => (
    <div className="bib-controls">
      <div className="bib-button-group" ref={providerGroupRef}>
        <div
          className={`bib-status-indicator main-button ${getConnectionStatus()}`}
          onClick={() => setShowDropdown(!showDropdown)}>
          <div className="status-dot" style={{ backgroundColor: getStatusColor() }} />
          {selectedProvider === 'all' ? (
            <span className="bib-label">{t('All Sources')}</span>
          ) : selectedProvider === 'local' ? (
            <span className="bib-label"><BibliographyIcon />{t('Local')}</span>
          ) : currentProvider ? (
            <>
              {currentProvider.icon && <currentProvider.icon />}
              <span className="bib-label">{currentProvider.name}</span>
            </>
          ) : (
            <span className="bib-label">{t('No Source')}</span>
          )}
        </div>
        <button
          className={`bib-dropdown-toggle ${getConnectionStatus()}`}
          onClick={() => setShowDropdown(!showDropdown)}>
          <ChevronDownIcon />
        </button>
      </div>

      {renderProviderDropdown()}

      <div className="bib-secondary-actions">
        <div ref={toolbarRef}>
          <button
            className={`bib-icon-button ${showToolbar || hasActiveFilters ? 'active' : ''}`}
            onClick={() => setShowToolbar(!showToolbar)}
            title={t('Filters & Options')}>
            <OptionsIcon />
            {hasActiveFilters && <span className="bib-filter-badge" />}
          </button>
        </div>

        <button
          className={`bib-icon-button ${isMultiSelectMode ? 'active' : ''}`}
          onClick={() => {
            setIsMultiSelectMode(!isMultiSelectMode);
            clearSelection();
          }}
          title={t('Multi-select')}>
          <CheckIcon />
        </button>

        <button
          className="bib-icon-button"
          onClick={handleRefresh}
          disabled={isRefreshing}
          title={t('Refresh')}>
          <SyncIcon />
        </button>
      </div>

      {renderToolbar()}
    </div>
  );

  const renderSearchBar = () => {
    if (isMultiSelectMode) {
      return (
        <div className="bib-multiselect-bar">
          <span className="bib-select-count">
            {selectedCount > 0
              ? `${selectedCount} ${t('selected')}`
              : t('None selected')}
          </span>
          <div className="bib-multiselect-actions">
            {canImportSelected && (
              <button
                className="bib-action-button import"
                onClick={importSelectedEntries}
                disabled={isBulkOperating || !targetBibFile}>
                <ImportIcon />
                {t('Import')}
              </button>
            )}
            {canUpdateSelected && (
              <button
                className="bib-action-button update"
                onClick={updateSelectedEntries}
                disabled={isBulkOperating}>
                <SyncIcon />
                {t('Update')}
              </button>
            )}
            {canDeleteSelected && (
              <button
                className="bib-action-button delete"
                onClick={deleteSelectedEntries}
                disabled={isBulkOperating}>
                <TrashIcon />
                {t('Delete')}
              </button>
            )}
            <button
              className="bib-multiselect-select-all"
              onClick={selectedCount === filteredEntries.length ? clearSelection : selectAllVisible}>
              {selectedCount === filteredEntries.length ? t('Deselect All') : t('Select All')}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="bib-panel-search">
        <input
          type="text"
          placeholder={
            selectedProvider === 'all' ? t('Search all sources...') :
              selectedProvider === 'local' ? t('Search local bibliography...') :
                t('Search bibliography...')
          }
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="bib-search-input" />
        {searchQuery && (
          <button className="bib-clear-search-button" onClick={() => setSearchQuery('')}>
            ×
          </button>
        )}
      </div>
    );
  };

  const renderEntryCard = (entry: BibEntry, index: number) => {
    const isExpanded = expandedEntries.has(entry.key);
    const isSelected = selectedEntryKeys.has(entry.key);
    const isExternal = entry.source === 'external' && !entry.isImported;
    const hasUpdate = hasUpdateAvailable(entry);
    const year = getDisplayYear(entry);
    const key = getUniqueKey(entry, index);

    return (
      <div
        key={key}
        className={[
          'bib-entry-item',
          isExternal ? 'external-entry' : '',
          isExpanded ? 'expanded' : '',
          isSelected ? 'selected' : '',
          isMultiSelectMode ? 'multiselect' : '',
        ].filter(Boolean).join(' ')}
        onClick={e => {
          if (isMultiSelectMode) {
            toggleEntrySelection(entry.key);
          } else {
            toggleExpand(entry.key, e);
          }
        }}>

        {isMultiSelectMode && (
          <div className="bib-entry-checkbox checkbox-group">
            <div className={`checkbox ${isSelected ? 'checked' : ''}`}>
              {isSelected && <CheckIcon />}
            </div>
          </div>
        )}

        <div className="bib-entry-collapsed">
          <span className={`bib-entry-type-pill ${entry.entryType.toLowerCase()}`}>
            {getEntryTypeLabel(entry.entryType)}
          </span>
          <span className="bib-entry-key">{entry.key}</span>
          <span className="bib-entry-title-inline">{getDisplayTitle(entry)}</span>
          <div className="bib-entry-meta">
            {year && <span className="bib-entry-year">{year}</span>}
            {isExternal && (
              <span className="bib-entry-source-badge external" title={t('Not imported')}>↓</span>
            )}
            {entry.source === 'local' && (
              <span className="bib-entry-source-badge local" title={entry.filePath || t('Local')}>
                {entry.filePath ? entry.filePath.split('/').pop()?.replace('.bib', '') : '✓'}
              </span>
            )}
            {hasUpdate && (
              <span className="bib-entry-source-badge update" title={t('Update available')}>↻</span>
            )}
          </div>
        </div>

        {isExpanded && (
          <div className="bib-entry-expanded" onClick={e => e.stopPropagation()}>
            <div className="bib-entry-expanded-authors">
              {getDisplayAuthors(entry)}
            </div>
            {getDisplayVenue(entry) && (
              <div className="bib-entry-expanded-venue">
                <em>{getDisplayVenue(entry)}</em>
              </div>
            )}
            {entry.fields.volume && entry.fields.pages && (
              <div className="bib-entry-expanded-detail">
                {t('Vol.')} {entry.fields.volume}
                {entry.fields.number ? `, No. ${entry.fields.number}` : ''}{t(', pp.')} {entry.fields.pages}
              </div>
            )}
            {entry.fields.doi && (
              <div className="bib-entry-expanded-doi">
                DOI: {entry.fields.doi}
              </div>
            )}

            <div className="bib-entry-hover-actions">
              {isExternal && (
                <button
                  className="bib-action-button import"
                  disabled={importingEntries.has(entry.key)}
                  onClick={e => { e.stopPropagation(); handleImportEntry(entry); }}>
                  <ImportIcon />
                  {importingEntries.has(entry.key) ? t('Importing...') : t('Import')}
                </button>
              )}
              {entry.source === 'local' && (
                <button
                  className="bib-action-button delete"
                  onClick={e => { e.stopPropagation(); handleDeleteEntry(entry); }}>
                  <TrashIcon />
                  {t('Delete')}
                </button>
              )}
              {hasUpdate && (
                <button
                  className="bib-action-button update"
                  onClick={e => {
                    e.stopPropagation();
                    const remote = getRemoteEntry(entry);
                    if (remote) handleUpdateEntry(entry, remote);
                  }}>
                  <SyncIcon />
                  {t('Update')}
                </button>
              )}
              <button
                className="bib-action-button detail"
                onClick={e => {
                  e.stopPropagation();
                  handleItemSelect({
                    key: entry.key,
                    entryType: entry.entryType,
                    fields: entry.fields,
                    rawEntry: entry.rawEntry,
                    title: entry.fields.title || '',
                    authors: entry.fields.author ? [entry.fields.author] : [],
                    year: entry.fields.year || '',
                    journal: entry.fields.journal || entry.fields.booktitle || '',
                  });
                }}>
                {t('Detail')}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderList = () => {
    if (selectedProvider !== 'local' && selectedProvider !== 'all' && !currentProvider) {
      return <div className="bib-loading-indicator">{t('Initializing...')}</div>;
    }
    if (selectedProvider !== 'local' && currentProvider?.getConnectionStatus() !== 'connected' && selectedProvider !== 'all') {
      return (
        <div className="bib-loading-indicator">
          {t('Connecting...')} ({currentProvider?.getConnectionStatus()})
        </div>
      );
    }
    if (isLoading) {
      return <div className="bib-loading-indicator">{t('Loading...')}</div>;
    }
    if (filteredEntries.length === 0) {
      return (
        <div className="bib-no-entries">
          {searchQuery ? t('No entries match your search') : t('No entries available')}
          {localEntries.length === 0 && !searchQuery && (
            <div className="bib-no-entries-hint">
              {t('Add .bib files to your project to see local bibliography entries.')}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="bib-entries-list">
        {filteredEntries.map((entry, index) => renderEntryCard(entry, index))}
      </div>
    );
  };

  const renderDetailView = () => {
    if (!selectedItem) {
      return <div className="no-selection">{t('Select an entry from the Items tab')}</div>;
    }

    const sortedEntries = Object.entries(selectedItem)
      .filter(([key]) => key !== 'title' && key !== 'label')
      .sort(([a], [b]) => {
        const isObjA = typeof selectedItem[a] === 'object' && !Array.isArray(selectedItem[a]);
        const isObjB = typeof selectedItem[b] === 'object' && !Array.isArray(selectedItem[b]);
        if (a === 'rawEntry') return 1;
        if (b === 'rawEntry') return -1;
        if (isObjA && !isObjB) return 1;
        if (!isObjA && isObjB) return -1;
        return 0;
      });

    return (
      <div className="reference-detail">
        <h4>{selectedItem.title || selectedItem.key}</h4>
        {sortedEntries.map(([key, value]) => {
          if (!value || (Array.isArray(value) && value.length === 0)) return null;
          const displayKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');
          if (key === 'rawEntry') {
            return (
              <div key={key}>
                <p><strong>{displayKey}:</strong></p>
                <pre className="raw-entry">{String(value)}</pre>
              </div>
            );
          }
          if (typeof value === 'object' && !Array.isArray(value)) {
            return (
              <div key={key}>
                <p><strong>{displayKey}:</strong></p>
                <div className="detail-nested">
                  {Object.entries(value as Record<string, unknown>).map(([sk, sv]) => (
                    <p key={sk}><strong>{sk}:</strong> {String(sv)}</p>
                  ))}
                </div>
              </div>
            );
          }
          return (
            <p key={key}>
              <strong>{displayKey}:</strong> {Array.isArray(value) ? value.join(', ') : String(value)}
            </p>
          );
        })}
      </div>
    );
  };

  const footerStats = selectedProvider === 'all'
    ? `${entries.length} ${t('entries')}, ${availableProviders.filter(p => p.getConnectionStatus() === 'connected').length} ${t('sources')}`
    : selectedProvider === 'local'
      ? `${localEntries.length} ${t('local entries')}`
      : `${localEntries.length} ${t('local')}, ${externalEntries.filter(e => !e.isImported).length} ${t('external')}`;

  return (
    <div className={`bib-panel ${className}`}>
      <div className="bib-panel-header">
        <h3>{t('Bibliography')}</h3>
        <div className="view-tabs">
          <button
            className={`tab-button ${activeTab === 'list' ? 'active' : ''}`}
            onClick={() => setActiveTab('list')}>
            {t('Items')}
          </button>
          <button
            className={`tab-button ${activeTab === 'detail' ? 'active' : ''}`}
            onClick={() => setActiveTab('detail')}
            disabled={!selectedItem}>
            {t('Detail')}
          </button>
        </div>
      </div>

      <div className="bib-panel-content">
        {renderControls()}

        {activeTab === 'list' ? (
          <div className="bib-provider-panel">
            {selectedProvider !== 'all' && selectedProvider !== 'local' && currentProvider?.renderPanel && (
              <div className="provider-panel-container">
                <currentProvider.renderPanel
                  className="provider-panel"
                  pluginInstance={currentProvider}
                />
              </div>
            )}
            {renderSearchBar()}
            <div className="bib-list-container">
              {renderList()}
            </div>
            <div className="bib-panel-footer">
              <span className="bib-entry-count">{footerStats}</span>
            </div>
          </div>
        ) : (
          <div className="bib-detail-view">
            <div className="detail-header">
              <button className="back-button" onClick={handleBackToList}>
                ← {t('Back to Items')}
              </button>
            </div>
            <div className="detail-content">
              {renderDetailView()}
            </div>
          </div>
        )}
      </div>

      {showDropdown && (
        <div className="dropdown-overlay" onClick={() => setShowDropdown(false)} />
      )}
    </div>
  );
};

export default BibliographyPanel;