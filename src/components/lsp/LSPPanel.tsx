// src/components/lsp/LSPPanel.tsx
import type React from "react";
import { useLSP } from "../../hooks/useLSP";
import { SyncIcon, ChevronDownIcon, BibliographyIcon } from "../common/Icons";

interface LSPPanelProps {
	className?: string;
}

const LSPPanel: React.FC<LSPPanelProps> = ({ className = "" }) => {
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
		isBibliographyProvider,
		citationStyle,
		autoImport,
		handleRefresh,
		handleProviderSelect,
		handleItemSelect,
		handleBackToList,
		handleEntryClick,
		handleImportEntry,
		handleTargetFileChange,
		getConnectionStatus,
		getStatusColor,
	} = useLSP();

	const getEntryTypeIcon = (entryType: string) => {
		switch (entryType.toLowerCase()) {
			case 'article': return '📄';
			case 'book': return '📚';
			case 'inproceedings':
			case 'conference': return '📋';
			case 'phdthesis':
			case 'mastersthesis':
			case 'thesis': return '🎓';
			case 'techreport': return '📊';
			case 'misc':
			case 'online': return '🌐';
			case 'inbook':
			case 'incollection': return '📖';
			default: return '📄';
		}
	};

	const getDisplayTitle = (entry: any): string => {
		return entry.fields.title || entry.fields.booktitle || 'Untitled';
	};

	const getDisplayAuthors = (entry: any): string => {
		const author = entry.fields.author || entry.fields.editor;
		if (!author) return 'Unknown author';

		const authors = author.split(' and ').map((a: string) => a.trim());
		if (authors.length === 1) return authors[0];
		if (authors.length === 2) return `${authors[0]} and ${authors[1]}`;
		return `${authors[0]} et al.`;
	};

	const getDisplayYear = (entry: any): string => {
		return entry.fields.year || entry.fields.date || '';
	};

	const getDisplayVenue = (entry: any): string => {
		return entry.fields.journal ||
			   entry.fields.booktitle ||
			   entry.fields.publisher ||
			   entry.fields.school ||
			   entry.fields.institution || '';
	};

	const getCitationPreview = (entry: any): string => {
		switch (citationStyle) {
			case "author-year":
				const authors = getDisplayAuthors(entry);
				const year = getDisplayYear(entry);
				return `(${authors}, ${year})`;
			case "alphabetic":
				return `[${entry.key.substring(0, 6)}]`;
			case "numeric":
			default:
				const localEntryIndex = localEntries.findIndex(e => e.key === entry.key);
				const index = localEntryIndex >= 0 ? localEntryIndex + 1 : entries.indexOf(entry) + 1;
				return `[${index}]`;
		}
	};

	const getSourceIndicator = (entry: any) => {
		if (entry.source === 'local') {
			return <span className="entry-source local" title="Local">✓</span>;
		} else if (entry.isImported) {
			return <span className="entry-source imported" title="Already imported">✓</span>;
		} else if (importingEntries.has(entry.key)) {
			return <span className="entry-source importing" title="Importing...">⏳</span>;
		} else {
			return <span className="entry-source external" title="Click to import">⬇</span>;
		}
	};

	const getUniqueKey = (entry: any, index: number): string => {
		const baseKey = `${entry.source}-${entry.key}`;
		if (entry.source === 'local' && entry.filePath) {
			return `${baseKey}-${entry.filePath.replace(/[^a-zA-Z0-9]/g, '_')}-${index}`;
		}
		return `${baseKey}-${index}`;
	};

	const renderDetailView = () => {
		if (!selectedItem) {
			return (
				<div className="no-selection">
					Select an item from the Items tab to view details
				</div>
			);
		}

		return (
			<div className="reference-detail">
				<h4>{selectedItem.title || selectedItem.label || selectedItem.key}</h4>
				{Object.entries(selectedItem)
					.filter(([key]) => key !== 'title' && key !== 'label')
					.sort(([keyA], [keyB]) => {
						const isObjectA = typeof selectedItem[keyA] === 'object' && !Array.isArray(selectedItem[keyA]);
						const isObjectB = typeof selectedItem[keyB] === 'object' && !Array.isArray(selectedItem[keyB]);
						const isRawA = keyA === 'rawEntry';
						const isRawB = keyB === 'rawEntry';

						if ((isObjectA || isRawA) && !(isObjectB || isRawB)) return 1;
						if (!(isObjectA || isRawA) && (isObjectB || isRawB)) return -1;
						if (isRawA && !isRawB) return 1;
						if (!isRawA && isRawB) return -1;
						return 0;
					})
					.map(([key, value]) => {
						if (!value || (Array.isArray(value) && value.length === 0)) return null;

						if (typeof value === 'object' && !Array.isArray(value)) {
							return (
								<div key={key}>
									<p><strong>{key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')}:</strong></p>
									<div className="detail-nested">
										{Object.entries(value).map(([subKey, subValue]) => (
											<p key={subKey}>
												<strong>{subKey}:</strong> {String(subValue)}
											</p>
										))}
									</div>
								</div>
							);
						}

						const displayValue = Array.isArray(value) ? value.join(', ') : String(value);
						const displayKey = key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1');

						if (key === 'rawEntry') {
							return (
								<div key={key}>
									<p><strong>{displayKey}:</strong></p>
									<pre className="raw-entry">
										{displayValue}
									</pre>
								</div>
							);
						}

						return (
							<p key={key}>
								<strong>{displayKey}:</strong> {displayValue}
							</p>
						);
					})
				}
			</div>
		);
	};

	const renderBibliographyList = () => {
		const targetFileOptions = [
			{ label: "Create new bibliography.bib", value: "CREATE_NEW" },
			...availableBibFiles.map(file => ({
				label: file.name,
				value: file.path
			}))
		];

		return (
			<div className="lsp-provider-panel">
				<div className="lsp-panel-search">
					<input
						type="text"
						placeholder={
							selectedProvider === "all" ? "Search all bibliography sources..." :
							selectedProvider === "local" ? "Search local bibliography..." :
							"Search bibliography..."
						}
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="lsp-search-input"
					/>
					{searchQuery && (
						<button
							className="lsp-clear-search-button"
							onClick={() => setSearchQuery("")}
						>
							×
						</button>
					)}
				</div>

				{selectedProvider !== "all" && selectedProvider !== "local" && (
					<div className="target-file-selector">
						<label className="target-file-label">
							Bib File:
						</label>
						<select
							value={targetBibFile}
							onChange={(e) => handleTargetFileChange(e.target.value)}
							className="target-file-select"
						>
							<option value="">Select target file...</option>
							{targetFileOptions.map(option => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
						{availableBibFiles.length === 0 && (
							<div className="target-file-hint">
								No .bib files found. Create one to start importing entries.
							</div>
						)}
						{currentProvider && targetBibFile && (
							<div className="target-file-hint">
								Target set for {currentProvider.name}: {availableBibFiles.find(f => f.path === targetBibFile)?.name || 'Unknown file'}
							</div>
						)}
					</div>
				)}

				<div className="lsp-panel-content">
					{selectedProvider === "all" ? renderAggregatedContent() : renderSingleProviderContent()}
				</div>

				<div className="lsp-panel-footer">
					<div className="lsp-footer-stats">
						{entries.length > 0 && (
							<div>
								<span className="lsp-entry-count">
									{selectedProvider === "all"
										? `${entries.length} entries from ${availableProviders.filter(p => p.getConnectionStatus() === 'connected').length} providers`
										: selectedProvider === "local"
										? `${localEntries.length} local entries`
										: `${localEntries.length} local, ${externalEntries.filter(e => !e.isImported).length} external`
									}
									{citationStyle !== "numeric" && ` (${citationStyle} style)`}
								</span>
								{targetBibFile && selectedProvider !== "all" && selectedProvider !== "local" && (
									<div className="lsp-footer-target">
										Target: {availableBibFiles.find(f => f.path === targetBibFile)?.name || 'Unknown file'}
									</div>
								)}
							</div>
						)}
					</div>
					<div className="lsp-footer-actions">
						<button
							className="lsp-refresh-button"
							onClick={handleRefresh}
							disabled={isLoading}
						>
							{isLoading ? 'Refreshing...' : 'Refresh'}
						</button>
					</div>
				</div>
			</div>
		);
	};

	const renderAggregatedContent = () => {
		if (!availableProviders.some(p => p.getConnectionStatus() === 'connected')) {
			return <div className="lsp-loading-indicator">No LSP providers are currently connected.</div>;
		}

		if (isLoading) {
			return <div className="lsp-loading-indicator">Loading from all providers...</div>;
		}

		if (filteredEntries.length === 0) {
			return (
				<div className="lsp-no-entries">
					{searchQuery
						? "No entries found matching the search criteria across all providers"
						: "No entries available from any connected provider"
					}
				</div>
			);
		}

		return (
			<div className="lsp-entries-list">
				{filteredEntries.map((entry, index) => (
					<div
						key={getUniqueKey(entry, index)}
						className={`lsp-entry-item ${entry.source === 'external' && !entry.isImported ? 'external-entry' : ''}`}
						onClick={() => handleEntryClick(entry)}
					>
						<div className="lsp-entry-header">
							<span className="lsp-entry-key">{entry.key}</span>
							{entry.providerName && (
								<span className="lsp-entry-provider" title={`From ${entry.providerName}`}>
									[{entry.providerName}]
								</span>
							)}
							{getSourceIndicator(entry)}
							{/*<span className="lsp-citation-preview">{getCitationPreview(entry)}</span>*/}
						</div>
						<div className="lsp-entry-type-badge">
							<div className="lsp-entry-type-content">
								<span className="lsp-entry-type-icon">
									{getEntryTypeIcon(entry.entryType)}
								</span>
								<span className="lsp-entry-type-text">
									{entry.entryType.toUpperCase()}
								</span>
							</div>
							{getDisplayYear(entry) && (
								<span className="lsp-entry-year">{getDisplayYear(entry)}</span>
							)}
						</div>
						<div className="lsp-entry-title">
							{getDisplayTitle(entry)}
						</div>
						<div className="lsp-entry-authors">{getDisplayAuthors(entry)}</div>
						{getDisplayVenue(entry) && (
							<div className="lsp-entry-venue">
								<em>{getDisplayVenue(entry)}</em>
							</div>
						)}
						{entry.fields.volume && entry.fields.pages && (
							<div className="lsp-entry-details">
								Vol. {entry.fields.volume}
								{entry.fields.number && `, No. ${entry.fields.number}`}
								, pp. {entry.fields.pages}
							</div>
						)}
						{entry.fields.doi && (
							<div className="lsp-entry-identifier">
								DOI: {entry.fields.doi}
							</div>
						)}
					</div>
				))}
			</div>
		);
	};

	const renderSingleProviderContent = () => {
		if (selectedProvider === "local") {
			if (isLoading) {
				return <div className="lsp-loading-indicator">Loading local bibliography...</div>;
			}

			if (filteredEntries.length === 0) {
				return (
					<div className="lsp-no-entries">
						{searchQuery
							? "No local entries found matching the search criteria"
							: "No local bibliography entries available"
						}
						{localEntries.length === 0 && (
							<div className="lsp-no-entries-hint">
								Add .bib files to your project to see local bibliography entries.
							</div>
						)}
					</div>
				);
			}
		} else {
			if (!currentProvider) {
				return <div className="lsp-loading-indicator">Initializing LSP...</div>;
			}

			if (currentProvider.getConnectionStatus() !== 'connected') {
				return (
					<div className="lsp-loading-indicator">
						Connecting to LSP server... ({currentProvider.getConnectionStatus()})
					</div>
				);
			}

			if (isLoading) {
				return <div className="lsp-loading-indicator">Loading bibliography...</div>;
			}

			if (filteredEntries.length === 0) {
				return (
					<div className="lsp-no-entries">
						{searchQuery
							? "No entries found matching the search criteria"
							: "No bibliography entries available"
						}
						{localEntries.length === 0 && (
							<div className="lsp-no-entries-hint">
								Add .bib files to your project or connect to an external bibliography source.
							</div>
						)}
					</div>
				);
			}
		}

		return (
			<div className="lsp-entries-list">
				{filteredEntries.map((entry, index) => (
					<div
						key={getUniqueKey(entry, index)}
						className={`lsp-entry-item ${entry.source === 'external' && !entry.isImported ? 'external-entry' : ''}`}
						onClick={() => handleEntryClick(entry)}
					>
						<div className="lsp-entry-header">
							<span className="lsp-entry-key">{entry.key}</span>
							{getSourceIndicator(entry)}
							{/*<span className="lsp-citation-preview">{getCitationPreview(entry)}</span>*/}

						</div>
						<div className="lsp-entry-type-badge">
							<div className="lsp-entry-type-content">
								<span className="lsp-entry-type-icon">
									{getEntryTypeIcon(entry.entryType)}
								</span>
								<span className="lsp-entry-type-text">
									{entry.entryType.toUpperCase()}
								</span>
							</div>
							{getDisplayYear(entry) && (
								<span className="lsp-entry-year">{getDisplayYear(entry)}</span>
							)}
						</div>
						<div className="lsp-entry-title">
							{getDisplayTitle(entry)}
						</div>
						<div className="lsp-entry-authors">{getDisplayAuthors(entry)}</div>
						{getDisplayVenue(entry) && (
							<div className="lsp-entry-venue">
								<em>{getDisplayVenue(entry)}</em>
							</div>
						)}
						{entry.fields.volume && entry.fields.pages && (
							<div className="lsp-entry-details">
								Vol. {entry.fields.volume}
								{entry.fields.number && `, No. ${entry.fields.number}`}
								, pp. {entry.fields.pages}
							</div>
						)}
						{entry.fields.doi && (
							<div className="lsp-entry-identifier">
								DOI: {entry.fields.doi}
							</div>
						)}
						{entry.source === 'external' && !entry.isImported && !autoImport && (
							<div className="lsp-entry-actions">
								<button
									className="import-button"
									onClick={(e) => {
										e.stopPropagation();
										handleImportEntry(entry);
									}}
									disabled={importingEntries.has(entry.key)}
								>
									{importingEntries.has(entry.key) ? 'Importing...' : 'Import'}
								</button>
							</div>
						)}
					</div>
				))}
			</div>
		);
	};

	const renderGenericList = () => {
		if (selectedProvider === "all") {
			const allProviders = availableProviders.filter(provider =>
				provider.getConnectionStatus() === 'connected' && !('getBibliographyEntries' in provider)
			);

			if (allProviders.length === 0) {
				return (
					<div className="lsp-provider-panel">
						<div className="lsp-panel-search">
							<input
								type="text"
								placeholder="Search all LSP providers..."
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								className="lsp-search-input"
							/>
							{searchQuery && (
								<button
									className="lsp-clear-search-button"
									onClick={() => setSearchQuery("")}
								>
									×
								</button>
							)}
						</div>
						<div className="no-provider">
							No LSP providers are currently connected.
							{availableProviders.length > 0 && (
								<div>
									Available providers: {availableProviders.map(p => p.name).join(', ')}
								</div>
							)}
						</div>
					</div>
				);
			}

			return (
				<div className="lsp-provider-panel">
					<div className="lsp-panel-search">
						<input
							type="text"
							placeholder="Search all LSP providers..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="lsp-search-input"
						/>
						{searchQuery && (
							<button
								className="lsp-clear-search-button"
								onClick={() => setSearchQuery("")}
							>
								×
							</button>
						)}
					</div>
					<div className="lsp-panel-content">
						<div className="lsp-loading-indicator">
							All LSP aggregation view - {allProviders.length} provider(s) connected
							<div>
								Connected: {allProviders.map(p => p.name).join(', ')}
							</div>
							<div className="lsp-no-entries-hint">
								Individual provider panels can be accessed by selecting a specific provider from the dropdown.
							</div>
						</div>
					</div>
				</div>
			);
		}

		const PanelComponent = currentProvider?.renderPanel;

		if (PanelComponent) {
			return (
				<PanelComponent
					className="lsp-provider-panel"
					onItemSelect={handleItemSelect}
					searchQuery={searchQuery}
					onSearchChange={setSearchQuery}
					pluginInstance={currentProvider}
				/>
			);
		}

		return (
			<div className="no-provider">
				No LSP provider available
			</div>
		);
	};

	if (!showPanel) {
		return null;
	}

	return (
		<div className={`lsp-panel ${className}`}>
			<div className="lsp-panel-header">
				<h3>Bibliography</h3>

				<div className="view-tabs">
					<button
						className={`tab-button ${activeTab === "list" ? "active" : ""}`}
						onClick={() => setActiveTab("list")}
						disabled={!selectedItem}
					>
						Items
					</button>
					<button
						className={`tab-button ${activeTab === "detail" ? "active" : ""}`}
						onClick={() => setActiveTab("detail")}
						disabled={!selectedItem}
					>
						Detail
					</button>
				</div>
			</div>
			<div className="lsp-panel-content">
				<div className="lsp-controls">
					<div className="lsp-indicator-group">
						<div
							className={`lsp-status-indicator main-button ${getConnectionStatus()}`}
							onClick={() => setShowDropdown(!showDropdown)}
						>
							<div
								className="status-dot"
								style={{ backgroundColor: getStatusColor() }}
							/>
							{selectedProvider === "all" ? (
								<span className="lsp-label">All LSP</span>
							) : selectedProvider === "local" ? (
								<span className="lsp-label"><BibliographyIcon/> Local Bibliography</span>
							) : currentProvider ? (
								<>
									<currentProvider.icon />
									<span className="lsp-label">{currentProvider.name}</span>
								</>
							) : (
								<span className="lsp-label">No LSP</span>
							)}
						</div>

						<button
							className={`lsp-dropdown-toggle ${getConnectionStatus()}`}
							onClick={() => setShowDropdown(!showDropdown)}
						>
							<ChevronDownIcon />
						</button>

						{showDropdown && (
							<div className="lsp-dropdown">
								{availableProviders.length > 1 && (
									<div
										className="lsp-dropdown-item"
										onClick={() => handleProviderSelect("all")}
									>
										All LSP
									</div>
								)}

								<div
									className="lsp-dropdown-item"
									onClick={() => handleProviderSelect("local")}
								>
									<BibliographyIcon/> Local Bibliography
								</div>

								{availableProviders.map((provider) => {
									const IconComponent = provider.icon;
									const status = provider.getConnectionStatus();
									return (
										<div
											key={provider.id}
											className="lsp-dropdown-item"
											onClick={() => handleProviderSelect(provider.id)}
										>
											<span className="service-indicator">
												{status === "connected" ? "🟢" : ""}
											</span>
											<IconComponent /> {provider.name}
										</div>
									);
								})}
							</div>
						)}
					</div>

					<button
						className="lsp-refresh-button"
						onClick={handleRefresh}
						disabled={isRefreshing}
						title={
							selectedProvider === "all" ? "Refresh all LSP providers" :
							selectedProvider === "local" ? "Refresh local bibliography" :
							`Refresh ${currentProvider?.name || "LSP"}`
						}
					>
						<SyncIcon />
					</button>
				</div>

				{activeTab === "list" ? (
					(isBibliographyProvider || entries.length > 0) ?
						renderBibliographyList() : renderGenericList()
				) : (
					<div className="lsp-detail-view">
						<div className="detail-header">
							<button
								className="back-button"
								onClick={handleBackToList}
							>
								← Back to Items
							</button>
						</div>

						<div className="detail-content">
							{renderDetailView()}
						</div>
					</div>
				)}
			</div>

			{showDropdown && (
				<div
					className="dropdown-overlay"
					onClick={() => setShowDropdown(false)}
				/>
			)}
		</div>
	);
};

export default LSPPanel;