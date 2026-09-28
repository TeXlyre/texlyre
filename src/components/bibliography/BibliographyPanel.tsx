// src/components/bibliography/BibliographyPanel.tsx
import { t } from '@/i18n';
import { Trans } from 'react-i18next';
import type React from 'react';
import { useRef, useState } from 'react';

import { useBibliography } from '../../hooks/useBibliography';
import Modal from '../common/Modal';
import PositionedDropdown from '../common/PositionedDropdown';
import {
	SyncIcon,
	UpdateIcon,
	ChevronDownIcon,
	BibliographyIcon,
	OptionsIcon,
	ImportIcon,
	TrashIcon,
	InfoIcon,
	CheckIcon,
	SearchIcon,
} from '../common/Icons';
import type { BibEntry } from '../../types/bibliography';

interface BibliographyPanelProps {
	className?: string;
}

type PendingBibliographyDelete =
	| { kind: 'entry'; entry: BibEntry }
	| { kind: 'selected'; count: number };

const BibliographyPanel: React.FC<BibliographyPanelProps> = ({
	className = '',
}) => {
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
		handleRefresh,
		handleProviderSelect,
		handleItemSelect,
		handleBackToList,
		handleImportEntry,
		handleTargetFileChange,
		handleDeleteEntry,
		handleUpdateEntry,
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
		triggerSearch,
	} = useBibliography();

	const [expandedEntries, setExpandedEntries] = useState<Set<string>>(
		new Set(),
	);
	const [pendingDelete, setPendingDelete] =
		useState<PendingBibliographyDelete | null>(null);
	const [isDeleting, setIsDeleting] = useState(false);
	const providerGroupRef = useRef<HTMLButtonElement>(null);
	const toolbarRef = useRef<HTMLDivElement>(null);

	const isOnDemand = currentProvider?.searchMode === 'on-demand';

	const toggleExpand = (key: string, e: React.MouseEvent) => {
		if (isMultiSelectMode) return;
		e.stopPropagation();
		setExpandedEntries((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	};

	const getEntryTypeLabel = (entryType: string) => {
		switch (entryType.toLowerCase()) {
			case 'article':
				return 'ART';
			case 'book':
				return 'BOOK';
			case 'inproceedings':
			case 'conference':
				return 'CONF';
			case 'phdthesis':
				return 'PHD';
			case 'mastersthesis':
				return 'MSC';
			case 'techreport':
				return 'REP';
			case 'misc':
				return 'MISC';
			case 'online':
				return 'WEB';
			case 'inbook':
			case 'incollection':
				return 'CHAP';
			default:
				return entryType.slice(0, 4).toUpperCase();
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
		entry.fields.institution ||
		'';

	const getUniqueKey = (entry: BibEntry, index: number) => {
		const base = `${entry.source}-${entry.key}`;
		return entry.source === 'local' && entry.filePath
			? `${base}-${entry.filePath.replace(/[^a-zA-Z0-9]/g, '_')}-${index}`
			: `${base}-${index}`;
	};

	const hasUpdateAvailable = (entry: BibEntry) =>
		entry.source === 'local' &&
		externalEntries.some(
			(ext) =>
				(ext.remoteId && ext.remoteId === entry.remoteId) ||
				ext.key === entry.key,
		);

	const getRemoteEntry = (entry: BibEntry) =>
		externalEntries.find(
			(ext) =>
				(ext.remoteId && ext.remoteId === entry.remoteId) ||
				ext.key === entry.key,
		);

	const hasActiveFilters =
		entryTypeFilter !== 'all' ||
		sourceFilter !== 'all' ||
		selectedCollection !== 'all';

	const selectedCount = selectedEntryKeys.size;
	const canImportSelected =
		!!targetBibFile &&
		filteredEntries.some(
			(e) =>
				selectedEntryKeys.has(e.key) &&
				e.source === 'external' &&
				!e.isImported,
		);
	const canUpdateSelected = filteredEntries.some(
		(e) => selectedEntryKeys.has(e.key) && hasUpdateAvailable(e),
	);
	const deletableSelectedCount = filteredEntries.filter(
		(e) =>
			selectedEntryKeys.has(e.key) &&
			e.source === 'local' &&
			Boolean(e.filePath),
	).length;
	const canDeleteSelected = deletableSelectedCount > 0;

	const confirmDelete = async () => {
		if (!pendingDelete || isDeleting) return;
		setIsDeleting(true);
		try {
			if (pendingDelete.kind === 'entry') {
				await handleDeleteEntry(pendingDelete.entry);
			} else {
				await deleteSelectedEntries();
			}
			setPendingDelete(null);
		} finally {
			setIsDeleting(false);
		}
	};

	if (!showPanel) return null;

	const renderProviderDropdown = () => (
		<PositionedDropdown
			isOpen={showDropdown}
			triggerElement={providerGroupRef.current}
			className='bib-dropdown'
			align='left'
			onClose={() => setShowDropdown(false)}
		>
			{availableProviders.length > 1 && (
				<div
					className='ui-menu-item'
					data-density='compact'
					onClick={() => handleProviderSelect('all')}
				>
					{t('All Sources')}
				</div>
			)}
			<div
				className='ui-menu-item'
				data-density='compact'
				onClick={() => handleProviderSelect('local')}
			>
				<BibliographyIcon />
				{t('Local Bibliography')}
			</div>
			{availableProviders.map((provider) => {
				const IconComponent = provider.icon;
				return (
					<div
						key={provider.id}
						className='ui-menu-item'
						data-density='compact'
						onClick={() => handleProviderSelect(provider.id)}
					>
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
			className='bib-toolbar-dropdown'
			align='right'
			onClose={() => setShowToolbar(false)}
		>
			<div className='ui-menu-content'>
				{selectedProvider !== 'local' && !isOnDemand && (
					<div className='ui-menu-section' data-gap='xs' data-divided='true'>
						<div className='ui-menu-title' data-tone='secondary' data-size='sm'>
							{t('Target Bib File')}
						</div>
						<select
							value={targetBibFile}
							onChange={(e) => handleTargetFileChange(e.target.value)}
							className='ui-field-control ui-menu-control'
						>
							<option value=''>{t('Select file...')}</option>
							<option value='CREATE_NEW'>{t('+ Create new...')}</option>
							{availableBibFiles.map((f) => (
								<option key={f.path} value={f.path}>
									{f.name}
								</option>
							))}
						</select>
					</div>
				)}

				{selectedProvider !== 'local' && isOnDemand && (
					<div className='ui-menu-section' data-gap='xs' data-divided='true'>
						<div className='ui-menu-title' data-tone='secondary' data-size='sm'>
							{t('Target Bib File')}
						</div>
						<select
							value={targetBibFile}
							onChange={(e) => handleTargetFileChange(e.target.value)}
							className='ui-field-control ui-menu-control'
						>
							<option value=''>{t('Select file...')}</option>
							<option value='CREATE_NEW'>{t('+ Create new...')}</option>
							{availableBibFiles.map((f) => (
								<option key={f.path} value={f.path}>
									{f.name}
								</option>
							))}
						</select>
					</div>
				)}

				{availableCollections.length > 0 && (
					<div className='ui-menu-section' data-gap='xs' data-divided='true'>
						<div className='ui-menu-title' data-tone='secondary' data-size='sm'>
							{t('Collection')}
						</div>
						<select
							value={selectedCollection}
							onChange={(e) => setSelectedCollection(e.target.value)}
							className='ui-field-control ui-menu-control'
						>
							<option value='all'>{t('All Collections')}</option>
							{availableCollections.map((c) => (
								<option key={c} value={c}>
									{c}
								</option>
							))}
						</select>
					</div>
				)}

				<div className='ui-menu-section' data-gap='xs' data-divided='true'>
					<div className='ui-menu-title' data-tone='secondary' data-size='sm'>
						{t('Entry Type')}
					</div>
					<select
						value={entryTypeFilter}
						onChange={(e) => setEntryTypeFilter(e.target.value as any)}
						className='ui-field-control ui-menu-control'
					>
						<option value='all'>{t('All Types')}</option>
						<option value='article'>{t('Article')}</option>
						<option value='book'>{t('Book')}</option>
						<option value='inproceedings'>{t('Conference')}</option>
						<option value='phdthesis'>{t('Thesis')}</option>
						<option value='techreport'>{t('Report')}</option>
						<option value='misc'>{t('Misc')}</option>
						<option value='online'>{t('Online')}</option>
					</select>
				</div>

				<div className='ui-menu-section' data-gap='xs' data-divided='true'>
					<div className='ui-menu-title' data-tone='secondary' data-size='sm'>
						{t('Source')}
					</div>
					<select
						value={sourceFilter}
						onChange={(e) => setSourceFilter(e.target.value as any)}
						className='ui-field-control ui-menu-control'
					>
						<option value='all'>{t('All Sources')}</option>
						<option value='local'>{t('Local Only')}</option>
						<option value='external'>{t('External Only')}</option>
						<option value='synced'>{t('Synced (Local)')}</option>
						<option value='synced-external'>
							{t('Synced (Local + External)')}
						</option>
					</select>
				</div>

				<div className='ui-menu-section' data-gap='xs' data-divided='true'>
					<div className='ui-menu-title' data-tone='secondary' data-size='sm'>
						{t('Sort')}
					</div>
					<div className='ui-menu-sort-row'>
						<select
							value={sortField}
							onChange={(e) => setSortField(e.target.value as any)}
							className='ui-field-control ui-menu-control ui-menu-sort-field'
						>
							<option value='key'>{t('Key')}</option>
							<option value='title'>{t('Title')}</option>
							<option value='author'>{t('Author')}</option>
							<option value='year'>{t('Year')}</option>
						</select>
						<button
							type='button'
							className={`ui-menu-sort-toggle ${sortOrder === 'desc' ? 'desc' : ''}`}
							onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
							title={sortOrder === 'asc' ? t('Ascending') : t('Descending')}
						>
							{sortOrder === 'asc' ? '↑' : '↓'}
						</button>
					</div>
				</div>
			</div>
		</PositionedDropdown>
	);

	const renderPanelActions = () => (
		<div className='ui-toolbar-actions' data-gap='xs'>
			<div ref={toolbarRef}>
				<button
					type='button'
					className={`ui-icon-button ${showToolbar || hasActiveFilters ? 'active' : ''}`}
					data-variant='subtle'
					data-size='sm'
					onClick={() => setShowToolbar(!showToolbar)}
					title={t('Filters & Options')}
				>
					<OptionsIcon />
					{hasActiveFilters && (
						<span
							className='ui-status-dot'
							data-tone='accent'
							data-placement='corner'
						/>
					)}
				</button>
			</div>

			<button
				type='button'
				className={`ui-icon-button ${isMultiSelectMode ? 'active' : ''}`}
				data-variant='subtle'
				data-size='sm'
				onClick={() => {
					setIsMultiSelectMode(!isMultiSelectMode);
					clearSelection();
				}}
				title={t('Multi-select')}
			>
				<CheckIcon />
			</button>

			<button
				type='button'
				className='ui-icon-button'
				data-variant='subtle'
				data-size='sm'
				onClick={handleRefresh}
				disabled={isRefreshing}
				title={t('Refresh')}
			>
				<SyncIcon />
			</button>
		</div>
	);

	const renderSearchBar = () => {
		if (isMultiSelectMode) {
			return (
				<div className='bib-multiselect-bar ui-panel-controls'>
					<span className='bib-select-count'>
						{selectedCount > 0
							? `${selectedCount} ${t('selected')}`
							: t('None selected')}
					</span>
					<div
						className='ui-toolbar-actions'
						data-gap='xs'
						data-wrap='true'
						data-align='end'
					>
						{canImportSelected && (
							<button
								type='button'
								className='button '
								onClick={importSelectedEntries}
								disabled={isBulkOperating || !targetBibFile}
							>
								<ImportIcon />
								{t('Import')}
							</button>
						)}
						{canUpdateSelected && (
							<button
								type='button'
								className='button warn'
								onClick={updateSelectedEntries}
								disabled={isBulkOperating}
							>
								<UpdateIcon />
								{t('Update')}
							</button>
						)}
						{canDeleteSelected && (
							<button
								type='button'
								className='button danger'
								onClick={() =>
									setPendingDelete({
										kind: 'selected',
										count: deletableSelectedCount,
									})
								}
								disabled={isBulkOperating}
							>
								<TrashIcon />
								{t('Delete')}
							</button>
						)}
						<button
							type='button'
							className='button '
							onClick={
								selectedCount === filteredEntries.length
									? clearSelection
									: selectAllVisible
							}
						>
							{selectedCount === filteredEntries.length
								? t('Deselect All')
								: t('Select All')}
						</button>
					</div>
					{renderPanelActions()}
					{renderToolbar()}
				</div>
			);
		}

		return (
			<>
				<div className='ui-panel-controls' data-gap='xs'>
					<div className='bib-search-input-wrapper ui-search-field'>
						<input
							type='text'
							placeholder={
								selectedProvider === 'all'
									? t('Search all sources...')
									: selectedProvider === 'local'
										? t('Search local bibliography...')
										: isOnDemand
											? t('Search OpenAlex...')
											: t('Search bibliography...')
							}
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							onKeyDown={(e) => {
								if (isOnDemand && e.key === 'Enter') triggerSearch();
							}}
							className='bib-search-input ui-field-control ui-search-control'
						/>
						{searchQuery && (
							<button
								type='button'
								aria-label={t('Clear search')}
								className='bib-clear-search-button ui-search-clear'
								onClick={() => setSearchQuery('')}
								title={t('Clear search')}
							>
								<span aria-hidden='true'>×</span>
							</button>
						)}
					</div>
					{isOnDemand && (
						<button
							type='button'
							className='button primary icon-only'
							onClick={triggerSearch}
							disabled={isLoading || !searchQuery.trim()}
							title={t('Search')}
						>
							{isLoading ? '…' : <SearchIcon />}
						</button>
					)}
					{renderPanelActions()}
					{renderToolbar()}
				</div>
				{selectedProvider !== 'local' && !targetBibFile && (
					<div className='ui-message' data-tone='warning'>
						<Trans
							i18nKey='To import entries, select a target .bib file by clicking the <icon /> button above.'
							components={{
								icon: (
									<>
										{' '}
										<OptionsIcon />{' '}
									</>
								),
							}}
						/>
					</div>
				)}
			</>
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
					'ui-list-item',
					isExternal ? 'external-entry' : '',
					isMultiSelectMode ? 'multiselect' : '',
				]
					.filter(Boolean)
					.join(' ')}
				data-direction='column'
				data-interactive='true'
				data-hover='outline'
				data-expanded={isExpanded ? 'true' : undefined}
				data-selected={isSelected ? 'true' : undefined}
				onClick={(e) => {
					if (isMultiSelectMode) {
						toggleEntrySelection(entry.key);
					} else {
						toggleExpand(entry.key, e);
					}
				}}
			>
				{isMultiSelectMode && (
					<div className='bib-entry-checkbox checkbox-group'>
						<div className={`checkbox ${isSelected ? 'checked' : ''}`}>
							{isSelected && <CheckIcon />}
						</div>
					</div>
				)}

				<div className='bib-entry-collapsed ui-toolbar' data-gap='xs'>
					<span className='ui-badge' data-variant='label' data-tone='accent'>
						{getEntryTypeLabel(entry.entryType)}
					</span>
					<span className='bib-entry-key'>{entry.key}</span>
					<div className='bib-entry-meta ui-toolbar' data-gap='xs'>
						{year && <span className='bib-entry-year ui-note'>{year}</span>}
						{isExternal && (
							<>
								<span
									className='bib-entry-source-badge ui-badge'
									data-variant='label'
									data-tone='warning'
									title={targetBibFile || t('No target file selected')}
								>
									{targetBibFile
										? targetBibFile.split('/').pop()?.replace('.bib', '')
										: '⚠️'}
								</span>
								<span
									className='bib-entry-source-badge ui-badge'
									data-variant='label'
									data-tone='warning'
									title={t('Not imported')}
								>
									↓
								</span>
							</>
						)}
						{entry.source === 'local' && (
							<span
								className='bib-entry-source-badge ui-badge'
								data-variant='label'
								data-tone='success'
								title={entry.filePath || t('Local')}
							>
								{entry.filePath
									? entry.filePath.split('/').pop()?.replace('.bib', '')
									: '✓'}
							</span>
						)}
						{hasUpdate && (
							<span
								className='bib-entry-source-badge ui-badge'
								data-variant='label'
								data-tone='accent'
								title={t('Update available')}
							>
								↻
							</span>
						)}
					</div>
				</div>

				{isExpanded && (
					<div
						className='bib-entry-expanded'
						onClick={(e) => e.stopPropagation()}
					>
						<div className='bib-entry-expanded-title'>
							{getDisplayTitle(entry)}
						</div>
						<div className='bib-entry-expanded-authors ui-note'>
							{getDisplayAuthors(entry)}
						</div>
						{getDisplayVenue(entry) && (
							<div className='ui-note'>
								<em>{getDisplayVenue(entry)}</em>
							</div>
						)}
						{entry.fields.volume && entry.fields.pages && (
							<div className='ui-note'>
								{t('Vol.')} {entry.fields.volume}
								{entry.fields.number ? `, No. ${entry.fields.number}` : ''}
								{t(', pp.')} {entry.fields.pages}
							</div>
						)}
						{entry.fields.doi && (
							<div className='bib-entry-expanded-doi ui-note'>
								DOI: {entry.fields.doi}
							</div>
						)}

						<div className='bib-entry-hover-actions ui-toolbar-actions'>
							{isExternal && (
								<button
									type='button'
									className='button '
									disabled={importingEntries.has(entry.key) || !targetBibFile}
									onClick={(e) => {
										e.stopPropagation();
										handleImportEntry(entry);
									}}
								>
									<ImportIcon />
									{importingEntries.has(entry.key)
										? t('Importing...')
										: t('Import')}
								</button>
							)}
							{entry.source === 'local' && (
								<button
									type='button'
									className='ui-icon-button'
									data-variant='ghost'
									data-tone='danger'
									data-size='sm'
									onClick={(e) => {
										e.stopPropagation();
										setPendingDelete({ kind: 'entry', entry });
									}}
									title={t('Delete')}
									aria-label={t('Delete')}
								>
									<TrashIcon />
								</button>
							)}
							{hasUpdate && (
								<button
									type='button'
									className='button warn'
									onClick={(e) => {
										e.stopPropagation();
										const remote = getRemoteEntry(entry);
										if (remote) handleUpdateEntry(entry, remote);
									}}
								>
									<UpdateIcon />
									{t('Update')}
								</button>
							)}
							<button
								type='button'
								className='ui-icon-button'
								data-variant='ghost'
								data-size='sm'
								onClick={(e) => {
									e.stopPropagation();
									handleItemSelect({
										key: entry.key,
										entryType: entry.entryType,
										fields: entry.fields,
										rawEntry: entry.rawEntry,
										title: entry.fields.title || '',
										authors: entry.fields.author ? [entry.fields.author] : [],
										year: entry.fields.year || '',
										journal:
											entry.fields.journal || entry.fields.booktitle || '',
									});
								}}
								title={t('Detail')}
								aria-label={t('Detail')}
							>
								<InfoIcon />
							</button>
						</div>
					</div>
				)}
			</div>
		);
	};

	const renderList = () => {
		if (
			selectedProvider !== 'local' &&
			selectedProvider !== 'all' &&
			!currentProvider
		) {
			return (
				<div className='ui-empty-state' data-style='empty'>
					{t('Initializing...')}
				</div>
			);
		}
		if (
			selectedProvider !== 'local' &&
			currentProvider?.getConnectionStatus() !== 'connected' &&
			selectedProvider !== 'all'
		) {
			return (
				<div className='ui-empty-state' data-style='empty'>
					{t('Connecting...')} (
					{t(currentProvider?.getConnectionStatus() ?? 'disconnected')})
				</div>
			);
		}
		if (isLoading) {
			return (
				<div className='ui-empty-state' data-style='empty'>
					{t('Loading...')}
				</div>
			);
		}
		if (filteredEntries.length === 0) {
			return (
				<div className='ui-empty-state' data-style='empty'>
					{isOnDemand && !searchQuery
						? t('Enter a search query above to find works.')
						: searchQuery
							? t('No entries match your search')
							: t('No entries available')}
					{localEntries.length === 0 && !searchQuery && !isOnDemand && (
						<div className='ui-note'>
							{t(
								'Add .bib files to your project to see local bibliography entries.',
							)}
						</div>
					)}
				</div>
			);
		}

		return (
			<div className='ui-list'>
				{filteredEntries.map((entry, index) => renderEntryCard(entry, index))}
			</div>
		);
	};

	const renderDetailView = () => {
		if (!selectedItem) {
			return (
				<div className='ui-empty-state' data-style='empty'>
					{t('Select an entry from the Items tab')}
				</div>
			);
		}

		const sortedEntries = Object.entries(selectedItem)
			.filter(([key]) => key !== 'title' && key !== 'label')
			.sort(([a], [b]) => {
				const isObjA =
					typeof selectedItem[a] === 'object' &&
					!Array.isArray(selectedItem[a]);
				const isObjB =
					typeof selectedItem[b] === 'object' &&
					!Array.isArray(selectedItem[b]);
				if (a === 'rawEntry') return 1;
				if (b === 'rawEntry') return -1;
				if (isObjA && !isObjB) return 1;
				if (!isObjA && isObjB) return -1;
				return 0;
			});

		return (
			<div className='reference-detail'>
				<h4>{selectedItem.title || selectedItem.key}</h4>
				{sortedEntries.map(([key, value]) => {
					if (!value || (Array.isArray(value) && value.length === 0))
						return null;
					const displayKey =
						key.charAt(0).toUpperCase() +
						key.slice(1).replace(/([A-Z])/g, ' $1');
					if (key === 'rawEntry') {
						return (
							<div key={key}>
								<p>
									<strong>{displayKey}:</strong>
								</p>
								<pre className='ui-code-block' data-wrap='true'>
									{String(value)}
								</pre>
							</div>
						);
					}
					if (typeof value === 'object' && !Array.isArray(value)) {
						return (
							<div key={key}>
								<p>
									<strong>{displayKey}:</strong>
								</p>
								<div className='detail-nested'>
									{Object.entries(value as Record<string, unknown>).map(
										([sk, sv]) => (
											<p key={sk}>
												<strong>{sk}:</strong> {String(sv)}
											</p>
										),
									)}
								</div>
							</div>
						);
					}
					return (
						<p key={key}>
							<strong>{displayKey}:</strong>{' '}
							{Array.isArray(value) ? value.join(', ') : String(value)}
						</p>
					);
				})}
			</div>
		);
	};

	const providerTitle =
		selectedProvider === 'local' || selectedProvider === 'all'
			? t('Bibliography')
			: currentProvider?.name ||
				availableProviders.find((provider) => provider.id === selectedProvider)
					?.name ||
				t('Bibliography');

	const footerStats =
		selectedProvider === 'all'
			? t('{count} entries, {sources} sources', {
					count: entries.length,
					sources: availableProviders.filter(
						(p) => p.getConnectionStatus() === 'connected',
					).length,
				})
			: selectedProvider === 'local'
				? t('{count} local entry', { count: localEntries.length })
				: isOnDemand
					? t('{count} result', { count: filteredEntries.length })
					: t('{local} local, {external} external', {
							local: localEntries.length,
							external: externalEntries.filter((e) => !e.isImported).length,
						});

	return (
		<>
			<div
				className={`bib-panel ui-panel ${className}`}
				data-role='bibliography'
			>
				<div
					className='ui-panel-header'
					data-role='bibliography'
					data-shrink='true'
					data-gap='sm'
				>
					<div className='ui-panel-heading'>
						<h3 className='ui-panel-title' data-shrink='true'>
							{providerTitle}
						</h3>
						<button
							type='button'
							ref={providerGroupRef}
							className='ui-icon-button'
							data-variant='ghost'
							data-size='sm'
							onClick={() => setShowDropdown(!showDropdown)}
							title={t('Source')}
							aria-label={t('Source')}
							aria-expanded={showDropdown}
						>
							<ChevronDownIcon />
						</button>
						{renderProviderDropdown()}
					</div>
					<div
						className='ui-tab-list'
						data-role='panel'
						data-variant='switcher'
					>
						<button
							type='button'
							className={`ui-tab ${activeTab === 'list' ? 'active' : ''}`}
							onClick={() => setActiveTab('list')}
						>
							{t('Items')}
						</button>
						<button
							type='button'
							className={`ui-tab ${activeTab === 'detail' ? 'active' : ''}`}
							onClick={() => setActiveTab('detail')}
							disabled={!selectedItem}
						>
							{t('Detail')}
						</button>
					</div>
				</div>

				<div
					className='ui-panel-content'
					data-overflow='hidden'
					data-layout='stack'
				>
					{activeTab === 'list' ? (
						<div className='ui-stack' data-grow='true' data-overflow='hidden'>
							{selectedProvider !== 'all' &&
								selectedProvider !== 'local' &&
								currentProvider?.renderPanel && (
									<div className='provider-panel-container'>
										<currentProvider.renderPanel
											className='provider-panel'
											pluginInstance={currentProvider}
										/>
									</div>
								)}
							{renderSearchBar()}
							<div className='ui-panel-content' data-overflow='y'>
								{renderList()}
							</div>
							<div className='bib-panel-footer'>
								<span className='bib-entry-count ui-note'>{footerStats}</span>
							</div>
						</div>
					) : (
						<div className='ui-stack' data-grow='true' data-overflow='hidden'>
							<div className='ui-panel-header'>
								<button
									type='button'
									className='button'
									onClick={handleBackToList}
								>
									{t('←')} {t('Back to Items')}
								</button>
							</div>
							<div
								className='ui-panel-content'
								data-overflow='y'
								data-padding='sm'
							>
								{renderDetailView()}
							</div>
						</div>
					)}
				</div>
			</div>

			<Modal
				isOpen={pendingDelete !== null}
				onClose={() => {
					if (!isDeleting) setPendingDelete(null);
				}}
				title={
					pendingDelete?.kind === 'selected'
						? t('Delete bibliography items?')
						: t('Delete bibliography item?')
				}
				size='small'
			>
				{pendingDelete && (
					<div>
						<p>
							{pendingDelete.kind === 'entry'
								? t('Delete “{title}” from its bibliography file?', {
										title: getDisplayTitle(pendingDelete.entry),
									})
								: t('Delete {count} selected bibliography items?', {
										count: pendingDelete.count,
									})}
						</p>
						<div className='ui-message' data-tone='warning'>
							{t('This action cannot be undone.')}
						</div>
						<div
							className='ui-actions'
							data-variant='modal'
							data-align='end'
							data-cross='stretch'
						>
							<button
								type='button'
								className='button secondary'
								onClick={() => setPendingDelete(null)}
								disabled={isDeleting}
							>
								{t('Cancel')}
							</button>
							<button
								type='button'
								className='button danger'
								onClick={() => void confirmDelete()}
								disabled={isDeleting}
							>
								{t('Delete')}
							</button>
						</div>
					</div>
				)}
			</Modal>
		</>
	);
};

export default BibliographyPanel;
