import type React from "react";
import { useEffect, useState, useCallback } from "react";
import { pluginRegistry } from "../../plugins/PluginRegistry";
import type { LSPPlugin } from "../../plugins/PluginInterface";
import { useSettings } from "../../hooks/useSettings";
import { fileStorageService } from "../../services/FileStorageService";
import { bibliographyImportService } from "../../services/BibliographyImportService";
import { SyncIcon, ChevronDownIcon } from "../common/Icons";

interface LSPPanelProps {
	className?: string;
}

interface BibEntry {
	key: string;
	entryType: string;
	fields: Record<string, string>;
	rawEntry: string;
	source?: 'local' | 'external';
	isImported?: boolean;
	filePath?: string;
}

interface BibFile {
	path: string;
	name: string;
	id: string;
}

const LSPPanel: React.FC<LSPPanelProps> = ({ className = "" }) => {
	const { getSetting } = useSettings();

	const [showPanel, setShowPanel] = useState(false);
	const [activeTab, setActiveTab] = useState<"list" | "detail">("list");
	const [selectedProvider, setSelectedProvider] = useState<string | "all">("all");
	const [availableProviders, setAvailableProviders] = useState<LSPPlugin[]>([]);
	const [selectedItem, setSelectedItem] = useState<any>(null);
	const [showDropdown, setShowDropdown] = useState(false);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");

	// Bibliography-specific state
	const [entries, setEntries] = useState<BibEntry[]>([]);
	const [localEntries, setLocalEntries] = useState<BibEntry[]>([]);
	const [externalEntries, setExternalEntries] = useState<BibEntry[]>([]);
	const [filteredEntries, setFilteredEntries] = useState<BibEntry[]>([]);
	const [availableBibFiles, setAvailableBibFiles] = useState<BibFile[]>([]);
	const [targetBibFile, setTargetBibFile] = useState<string>("");
	const [isLoading, setIsLoading] = useState(false);
	const [importingEntries, setImportingEntries] = useState<Set<string>>(new Set());

	useEffect(() => {
		const providers = pluginRegistry.getAllLSPPlugins();
		setAvailableProviders(providers);

		if (providers.length > 0 && selectedProvider === "all") {
			setSelectedProvider(providers[0].id);
		}
	}, []);

	useEffect(() => {
		const handleToggleLSPPanel = (event: Event) => {
			const customEvent = event as CustomEvent;
			const { show, pluginId } = customEvent.detail;

			setShowPanel(show);
			if (show && pluginId) {
				setSelectedProvider(pluginId);
			}
		};

		document.addEventListener("toggle-lsp-panel", handleToggleLSPPanel);

		return () => {
			document.removeEventListener("toggle-lsp-panel", handleToggleLSPPanel);
		};
	}, []);

	const currentProvider = availableProviders.find(p => p.id === selectedProvider);
	const isBibliographyProvider = currentProvider && 'getBibliographyEntries' in currentProvider;

	// Get provider-specific settings and update server URL
	const getProviderSetting = (settingName: string) => {
		if (!currentProvider) return undefined;
		return getSetting(`${currentProvider.id}-${settingName}`)?.value;
	};

	const citationStyle = (getProviderSetting("citation-style") as string) ?? "numeric";
	const maxCompletions = (getProviderSetting("max-completions") as number) ?? 20;
	const autoImport = (getProviderSetting("auto-import") as boolean) ?? true;
	const duplicateHandling = (getProviderSetting("merge-duplicates") as string) ?? "keep-local";
	const serverUrl = (getProviderSetting("server-url") as string) ?? "ws://localhost:2087/";

	// Update server URL when it changes
	useEffect(() => {
		if (currentProvider && 'updateServerUrl' in currentProvider) {
			(currentProvider as any).updateServerUrl(serverUrl);
		}
	}, [currentProvider, serverUrl]);

	const parser = bibliographyImportService.getParser();

	const refreshAvailableFiles = useCallback(async () => {
		try {
			const allFiles = await fileStorageService.getAllFiles();
			const bibFiles = allFiles
				.filter(file =>
					(file.name.endsWith('.bib') || file.name.endsWith('.bibtex')) &&
					!file.isDeleted
				)
				.map(file => ({
					path: file.path,
					name: file.name,
					id: file.id
				}));

			setAvailableBibFiles(bibFiles);
		} catch (error) {
			console.error('[LSPPanel] Error refreshing available files:', error);
			setAvailableBibFiles([]);
		}
	}, []);

	const fetchLocalEntries = useCallback(async () => {
		try {
			const allFiles = await fileStorageService.getAllFiles();
			const bibFiles = allFiles.filter(file =>
				file.name.endsWith('.bib') &&
				!file.isDeleted &&
				file.content
			);

			const allLocalEntries: BibEntry[] = [];

			for (const bibFile of bibFiles) {
				try {
					const content = typeof bibFile.content === 'string'
						? bibFile.content
						: new TextDecoder().decode(bibFile.content);

					const parsedEntries = parser.parse(content);
					const bibEntries: BibEntry[] = parsedEntries.map(entry => ({
						key: entry.key,
						entryType: entry.type,
						fields: entry.fields,
						rawEntry: entry.rawEntry,
						source: 'local' as const,
						filePath: bibFile.path
					}));

					allLocalEntries.push(...bibEntries);
				} catch (parseError) {
					console.error(`[LSPPanel] Error parsing ${bibFile.path}:`, parseError);
				}
			}

			setLocalEntries(allLocalEntries);
		} catch (error) {
			console.error('[LSPPanel] Error fetching local entries:', error);
			setLocalEntries([]);
		}
	}, [parser]);

	const fetchExternalEntries = useCallback(async () => {
		if (!currentProvider || !isBibliographyProvider) {
			setExternalEntries([]);
			return;
		}

		const connectionStatus = currentProvider.getConnectionStatus();
		if (connectionStatus !== 'connected') {
			console.log(`[LSPPanel] Provider ${currentProvider.name} not connected:`, connectionStatus);
			setExternalEntries([]);
			return;
		}

		setIsLoading(true);
		try {
			console.log(`[LSPPanel] Fetching external entries from ${currentProvider.name}...`);
			const bibEntries = await (currentProvider as any).getBibliographyEntries();
			console.log(`[LSPPanel] Retrieved ${bibEntries.length} external entries`);

			const externalBibEntries: BibEntry[] = bibEntries.map((entry: any) => ({
				...entry,
				source: 'external' as const,
				isImported: false
			}));
			setExternalEntries(externalBibEntries);
		} catch (error) {
			console.error(`[LSPPanel] Error fetching external entries from ${currentProvider.name}:`, error);
			setExternalEntries([]);
		} finally {
			setIsLoading(false);
		}
	}, [currentProvider, isBibliographyProvider]);

	const createNewBibFile = useCallback(async (fileName: string = 'bibliography.bib'): Promise<string | null> => {
		try {
			const filePath = `/${fileName}`;

			const existingFile = await fileStorageService.getFileByPath(filePath);
			if (existingFile && !existingFile.isDeleted) {
				return filePath;
			}

			const fileNode = {
				id: crypto.randomUUID(),
				name: fileName,
				path: filePath,
				type: 'file' as const,
				content: '% Bibliography file created by TeXlyre\n% Add your BibTeX entries here\n\n',
				lastModified: Date.now(),
				size: 0,
				mimeType: 'text/x-bibtex',
				isBinary: false,
				isDeleted: false
			};

			await fileStorageService.storeFile(fileNode, { showConflictDialog: false });
			await refreshAvailableFiles();

			return filePath;
		} catch (error) {
			console.error('[LSPPanel] Error creating new bib file:', error);
			return null;
		}
	}, [refreshAvailableFiles]);

	const handleTargetFileChange = async (newValue: string) => {
		if (newValue === "CREATE_NEW") {
			const createdFile = await createNewBibFile();
			if (createdFile) {
				setTargetBibFile(createdFile);
				document.dispatchEvent(new CustomEvent('refresh-file-tree'));
			}
		} else {
			setTargetBibFile(newValue);
		}
	};

	const handleImportEntry = async (entry: BibEntry) => {
		if (!targetBibFile) {
			console.error('[LSPPanel] No target file selected');
			return;
		}

		if (importingEntries.has(entry.key)) {
			return;
		}

		setImportingEntries(prev => new Set(prev).add(entry.key));

		try {
			const targetFile = await fileStorageService.getFileByPath(targetBibFile);
			if (!targetFile) {
				console.error('[LSPPanel] Target file not found:', targetBibFile);
				return;
			}

			if (duplicateHandling === 'keep-local') {
				const isDuplicate = localEntries.some(local =>
					local.key === entry.key && local.filePath === targetBibFile
				);
				if (isDuplicate) {
					return;
				}
			}

			let currentContent = '';
			if (targetFile.content) {
				currentContent = typeof targetFile.content === 'string'
					? targetFile.content
					: new TextDecoder().decode(targetFile.content);
			}

			const newContent = currentContent.trim()
				? `${currentContent.trim()}\n\n${entry.rawEntry}\n`
				: `${entry.rawEntry}\n`;

			await fileStorageService.updateFileContent(targetFile.id, newContent);

			await fetchLocalEntries();

			document.dispatchEvent(new CustomEvent('refresh-file-tree'));
		} catch (error) {
			console.error('[LSPPanel] Error importing entry:', error);
		} finally {
			setImportingEntries(prev => {
				const newSet = new Set(prev);
				newSet.delete(entry.key);
				return newSet;
			});
		}
	};

	const mergeEntries = useCallback(() => {
		const localKeys = new Set(localEntries.map(entry => entry.key));

		const updatedExternalEntries = externalEntries.map(entry => ({
			...entry,
			isImported: localKeys.has(entry.key)
		}));

		const combined = [
			...localEntries,
			...updatedExternalEntries.filter(entry => !entry.isImported)
		];

		setEntries(combined);
	}, [localEntries, externalEntries]);

	useEffect(() => {
		if (searchQuery.trim() === "") {
			setFilteredEntries(entries.slice(0, maxCompletions));
		} else {
			const query = searchQuery.toLowerCase();
			const filtered = entries.filter(entry => {
				if (entry.key.toLowerCase().includes(query)) return true;
				if (entry.entryType.toLowerCase().includes(query)) return true;
				return Object.values(entry.fields).some(value =>
					value.toLowerCase().includes(query)
				);
			}).slice(0, maxCompletions);
			setFilteredEntries(filtered);
		}
	}, [searchQuery, entries, maxCompletions]);

	useEffect(() => {
		mergeEntries();
	}, [mergeEntries]);

	useEffect(() => {
		if (!isBibliographyProvider || !currentProvider) return;

		console.log(`[LSPPanel] Initializing bibliography provider: ${currentProvider.name}`);

		// Initialize the LSP plugin if it has initialization
		const initializeProvider = async () => {
			try {
				await currentProvider.initialize();
				console.log(`[LSPPanel] Provider ${currentProvider.name} initialized`);
			} catch (error) {
				console.error(`[LSPPanel] Failed to initialize provider ${currentProvider.name}:`, error);
			}
		};

		initializeProvider();
		refreshAvailableFiles();
		fetchLocalEntries();

		// Wait a bit more for the LSP connection to be established
		setTimeout(() => {
			fetchExternalEntries();
		}, 2000);

		let retryCount = 0;
		const maxRetries = 30; // Increased retries

		const retryInterval = setInterval(() => {
			if (!currentProvider) return;

			const connectionStatus = currentProvider.getConnectionStatus();
			console.log(`[LSPPanel] Provider ${currentProvider.name} status: ${connectionStatus} (retry ${retryCount}/${maxRetries})`);

			if (connectionStatus === 'connected') {
				console.log(`[LSPPanel] Provider ${currentProvider.name} connected, fetching external entries`);
				fetchExternalEntries();
				clearInterval(retryInterval);
			} else if (retryCount >= maxRetries) {
				console.warn(`[LSPPanel] Provider ${currentProvider.name} connection timeout after ${maxRetries} retries`);
				clearInterval(retryInterval);
			}
			retryCount++;
		}, 1000); // Increased interval

		return () => clearInterval(retryInterval);
	}, [currentProvider, isBibliographyProvider, fetchLocalEntries, fetchExternalEntries, refreshAvailableFiles]);

	useEffect(() => {
		const handleFileTreeRefresh = () => {
			if (isBibliographyProvider) {
				refreshAvailableFiles();
				fetchLocalEntries();
			}
		};

		document.addEventListener('refresh-file-tree', handleFileTreeRefresh);

		return () => {
			document.removeEventListener('refresh-file-tree', handleFileTreeRefresh);
		};
	}, [isBibliographyProvider, refreshAvailableFiles, fetchLocalEntries]);

	const handleItemSelect = (item: any) => {
		setSelectedItem(item);
		setActiveTab("detail");
	};

	const handleBackToList = () => {
		setActiveTab("list");
		setSelectedItem(null);
	};

	const handleProviderSelect = (providerId: string | "all") => {
		setSelectedProvider(providerId);
		setShowDropdown(false);
		setActiveTab("list");
		setSelectedItem(null);
		setSearchQuery("");

		// Reset bibliography state when switching providers
		setEntries([]);
		setLocalEntries([]);
		setExternalEntries([]);
		setFilteredEntries([]);
		setTargetBibFile("");
	};

	const handleRefresh = async () => {
		setIsRefreshing(true);
		try {
			if (selectedProvider === "all") {
				for (const provider of availableProviders) {
					await provider.initialize?.();
				}
			} else if (currentProvider) {
				await currentProvider.initialize?.();
			}

			if (isBibliographyProvider) {
				await refreshAvailableFiles();
				await fetchLocalEntries();
				await fetchExternalEntries();
			}
		} catch (error) {
			console.error("Error refreshing LSP provider:", error);
		} finally {
			setIsRefreshing(false);
		}
	};

	const handleEntryClick = (entry: BibEntry) => {
		if (entry.source === 'external' && !entry.isImported) {
			if (autoImport) {
				handleImportEntry(entry);
			}
			return;
		}

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

		if (currentProvider) {
			document.dispatchEvent(
				new CustomEvent(`${currentProvider.id}-citation-selected`, {
					detail: { citationKey: entry.key }
				})
			);
		}
	};

	const getConnectionStatus = () => {
		if (selectedProvider === "all") {
			const connectedCount = availableProviders.filter(p =>
				p.getConnectionStatus() === "connected"
			).length;
			if (connectedCount === availableProviders.length) return "connected";
			if (connectedCount > 0) return "connecting";
			return "disconnected";
		}
		return currentProvider?.getConnectionStatus() || "disconnected";
	};

	const getStatusColor = () => {
		const status = getConnectionStatus();
		switch (status) {
			case "connected": return "#28a745";
			case "connecting": return "#ffc107";
			case "error": return "#dc3545";
			default: return "#666";
		}
	};

	// Bibliography rendering helpers
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

	const getDisplayTitle = (entry: BibEntry): string => {
		return entry.fields.title || entry.fields.booktitle || 'Untitled';
	};

	const getDisplayAuthors = (entry: BibEntry): string => {
		const author = entry.fields.author || entry.fields.editor;
		if (!author) return 'Unknown author';

		const authors = author.split(' and ').map(a => a.trim());
		if (authors.length === 1) return authors[0];
		if (authors.length === 2) return `${authors[0]} and ${authors[1]}`;
		return `${authors[0]} et al.`;
	};

	const getDisplayYear = (entry: BibEntry): string => {
		return entry.fields.year || entry.fields.date || '';
	};

	const getDisplayVenue = (entry: BibEntry): string => {
		return entry.fields.journal ||
			   entry.fields.booktitle ||
			   entry.fields.publisher ||
			   entry.fields.school ||
			   entry.fields.institution || '';
	};

	const getCitationPreview = (entry: BibEntry): string => {
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

	const getSourceIndicator = (entry: BibEntry) => {
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

	const getUniqueKey = (entry: BibEntry, index: number): string => {
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
									<div style={{ marginLeft: '20px' }}>
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
									<pre
										style={{
											whiteSpace: 'pre-wrap',
											fontSize: '0.55em',
											background: '#f5f5f5',
											padding: '8px',
											borderRadius: '4px'
										}}
									>
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
						placeholder="Search bibliography..."
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

				<div className="target-file-selector" style={{ padding: '0.75rem', borderBottom: '1px solid var(--accent-border)' }}>
					<label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.75rem' }}>
						Bib File:
					</label>
					<select
						value={targetBibFile}
						onChange={(e) => handleTargetFileChange(e.target.value)}
						style={{ width: '100%', padding: '0.4rem', fontSize: '0.75rem' }}
					>
						<option value="">Select target file...</option>
						{targetFileOptions.map(option => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
					{availableBibFiles.length === 0 && (
						<div style={{ fontSize: '0.65rem', color: 'var(--pico-secondary)', marginTop: '0.25rem' }}>
							No .bib files found. Create one to start importing entries.
						</div>
					)}
				</div>

				<div className="lsp-panel-content">
					{!currentProvider ? (
						<div className="lsp-loading-indicator">Initializing LSP...</div>
					) : currentProvider.getConnectionStatus() !== 'connected' ? (
						<div className="lsp-loading-indicator">
							Connecting to LSP server... ({currentProvider.getConnectionStatus()})
						</div>
					) : isLoading ? (
						<div className="lsp-loading-indicator">Loading bibliography...</div>
					) : filteredEntries.length === 0 ? (
						<div className="lsp-no-entries">
							{searchQuery
								? "No entries found matching the search criteria"
								: "No bibliography entries available"
							}
							{localEntries.length === 0 && (
								<div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--pico-secondary)' }}>
									Add .bib files to your project or connect to an external bibliography source.
								</div>
							)}
						</div>
					) : (
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
										<span className="lsp-citation-preview">{getCitationPreview(entry)}</span>
										{getDisplayYear(entry) && (
											<span className="lsp-entry-year">{getDisplayYear(entry)}</span>
										)}
									</div>
									<div className="lsp-entry-type-badge">
										<span className="lsp-entry-type-icon">
											{getEntryTypeIcon(entry.entryType)}
										</span>
										<span className="lsp-entry-type-text">
											{entry.entryType.toUpperCase()}
										</span>
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
					)}
				</div>

				<div className="lsp-panel-footer">
					<div className="lsp-footer-stats">
						{entries.length > 0 && (
							<div>
								<span className="lsp-entry-count">
									{localEntries.length} local, {externalEntries.filter(e => !e.isImported).length} external
									{citationStyle !== "numeric" && ` (${citationStyle} style)`}
								</span>
								{targetBibFile && (
									<div style={{ fontSize: '0.65rem', color: 'var(--pico-secondary)', marginTop: '0.25rem' }}>
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

	const renderGenericList = () => {
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
				{selectedProvider === "all"
					? "Select a specific LSP provider"
					: "No LSP provider available"}
			</div>
		);
	};

	if (!showPanel) {
		return null;
	}

	return (
		<div className={`lsp-panel ${className}`}>
			<div className="lsp-panel-header">
				<h3>LSP</h3>

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
								<>
									<span className="lsp-label">All LSP</span>
								</>
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
								<div
									className="lsp-dropdown-item"
									onClick={() => handleProviderSelect("all")}
								>
									All LSP
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
						title={selectedProvider === "all" ? "Refresh all LSP providers" : `Refresh ${currentProvider?.name || "LSP"}`}
					>
						<SyncIcon />
					</button>
				</div>

				{activeTab === "list" ? (
					isBibliographyProvider ? renderBibliographyList() : renderGenericList()
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