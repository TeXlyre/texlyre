// extras/lsp/jabref/JabRefPanel.tsx
import type React from "react";
import { useEffect, useState, useCallback } from "react";
import type { LSPPanelProps } from "../../../src/plugins/PluginInterface";
import { useSettings } from "../../../src/hooks/useSettings";
import { fileStorageService } from "../../../src/services/FileStorageService";
import { bibliographyImportService } from "../../../src/services/BibliographyImportService";

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

const JabRefPanel: React.FC<LSPPanelProps> = ({
	className = "",
	onItemSelect,
	searchQuery = "",
	onSearchChange,
	pluginInstance,
}) => {
	const { getSetting } = useSettings();

	const [entries, setEntries] = useState<BibEntry[]>([]);
	const [localEntries, setLocalEntries] = useState<BibEntry[]>([]);
	const [externalEntries, setExternalEntries] = useState<BibEntry[]>([]);
	const [filteredEntries, setFilteredEntries] = useState<BibEntry[]>([]);
	const [availableBibFiles, setAvailableBibFiles] = useState<BibFile[]>([]);
	const [targetBibFile, setTargetBibFile] = useState<string>("");
	const [isLoading, setIsLoading] = useState(false);
	const [importingEntries, setImportingEntries] = useState<Set<string>>(new Set());

	const lspEnabled = (getSetting("jabref-lsp-enabled")?.value as boolean) ?? true;
	const showPanel = (getSetting("jabref-lsp-show-panel")?.value as boolean) ?? true;
	const citationStyle = (getSetting("jabref-lsp-citation-style")?.value as string) ?? "numeric";
	const maxCompletions = (getSetting("jabref-lsp-max-completions")?.value as number) ?? 20;
	const serverUrl = (getSetting("jabref-lsp-server-url")?.value as string) ?? "ws://localhost:2087/";
	const autoImport = (getSetting("jabref-lsp-auto-import")?.value as boolean) ?? true;
	const duplicateHandling = (getSetting("jabref-lsp-merge-duplicates")?.value as string) ?? "keep-local";

	// Get the parser from the service
	const parser = bibliographyImportService.getParser();

	// Fetch available bib files
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

			console.log('[JabRefPanel] Found bib files:', bibFiles);
			setAvailableBibFiles(bibFiles);
		} catch (error) {
			console.error('[JabRefPanel] Error refreshing available files:', error);
			setAvailableBibFiles([]);
		}
	}, []);

	// Fetch local entries from all bib files
	const fetchLocalEntries = useCallback(async () => {
		try {
			console.log('[JabRefPanel] Fetching local entries...');
			const allFiles = await fileStorageService.getAllFiles();
			const bibFiles = allFiles.filter(file =>
				file.name.endsWith('.bib') &&
				!file.isDeleted &&
				file.content
			);

			console.log('[JabRefPanel] Found local bib files:', bibFiles.length);

			const allLocalEntries: BibEntry[] = [];

			for (const bibFile of bibFiles) {
				try {
					const content = typeof bibFile.content === 'string'
						? bibFile.content
						: new TextDecoder().decode(bibFile.content);

					// Use the parser from the service
					const parsedEntries = parser.parse(content);
					const bibEntries: BibEntry[] = parsedEntries.map(entry => ({
						key: entry.key,
						entryType: entry.type,
						fields: entry.fields,
						rawEntry: entry.rawEntry,
						source: 'local' as const,
						filePath: bibFile.path
					}));

					console.log(`[JabRefPanel] Parsed ${bibEntries.length} entries from ${bibFile.name}`);
					allLocalEntries.push(...bibEntries);
				} catch (parseError) {
					console.error(`[JabRefPanel] Error parsing ${bibFile.path}:`, parseError);
				}
			}

			console.log('[JabRefPanel] Total local entries:', allLocalEntries.length);
			setLocalEntries(allLocalEntries);
		} catch (error) {
			console.error('[JabRefPanel] Error fetching local entries:', error);
			setLocalEntries([]);
		}
	}, [parser]);

	// Fetch external entries from LSP
	const fetchExternalEntries = useCallback(async () => {
		if (!pluginInstance) {
			console.log('[JabRefPanel] No plugin instance available');
			return;
		}

		const connectionStatus = pluginInstance.getConnectionStatus();
		if (connectionStatus !== 'connected') {
			console.log('[JabRefPanel] LSP not connected:', connectionStatus);
			setExternalEntries([]);
			return;
		}

		setIsLoading(true);
		try {
			if ('getBibliographyEntries' in pluginInstance) {
				const bibEntries = await (pluginInstance as any).getBibliographyEntries();
				const externalBibEntries: BibEntry[] = bibEntries.map((entry: any) => ({
					...entry,
					source: 'external' as const,
					isImported: false
				}));
				console.log('[JabRefPanel] Fetched external entries:', externalBibEntries.length);
				setExternalEntries(externalBibEntries);
			} else {
				setExternalEntries([]);
			}
		} catch (error) {
			console.error('[JabRefPanel] Error fetching external entries:', error);
			setExternalEntries([]);
		} finally {
			setIsLoading(false);
		}
	}, [pluginInstance]);

	// Create new bib file
	const createNewBibFile = useCallback(async (fileName: string = 'bibliography.bib'): Promise<string | null> => {
		try {
			console.log('[JabRefPanel] Creating new bib file:', fileName);
			const filePath = `/${fileName}`;

			// Check if file already exists
			const existingFile = await fileStorageService.getFileByPath(filePath);
			if (existingFile && !existingFile.isDeleted) {
				console.log('[JabRefPanel] File already exists:', filePath);
				return filePath;
			}

			// Create new file
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

			console.log('[JabRefPanel] Successfully created file:', filePath);
			return filePath;
		} catch (error) {
			console.error('[JabRefPanel] Error creating new bib file:', error);
			return null;
		}
	}, [refreshAvailableFiles]);

	// Handle target file change
	const handleTargetFileChange = async (newValue: string) => {
		console.log('[JabRefPanel] Target file change:', newValue);

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

	// Import entry to target file
	const handleImportEntry = async (entry: BibEntry) => {
		if (!targetBibFile) {
			console.error('[JabRefPanel] No target file selected');
			return;
		}

		if (importingEntries.has(entry.key)) {
			console.log('[JabRefPanel] Entry already being imported:', entry.key);
			return;
		}

		setImportingEntries(prev => new Set(prev).add(entry.key));

		try {
			console.log('[JabRefPanel] Importing entry to:', targetBibFile);

			// Get target file
			const targetFile = await fileStorageService.getFileByPath(targetBibFile);
			if (!targetFile) {
				console.error('[JabRefPanel] Target file not found:', targetBibFile);
				return;
			}

			// Check for duplicates
			if (duplicateHandling === 'keep-local') {
				const isDuplicate = localEntries.some(local =>
					local.key === entry.key && local.filePath === targetBibFile
				);
				if (isDuplicate) {
					console.log('[JabRefPanel] Entry already exists, keeping local version');
					return;
				}
			}

			// Get current content
			let currentContent = '';
			if (targetFile.content) {
				currentContent = typeof targetFile.content === 'string'
					? targetFile.content
					: new TextDecoder().decode(targetFile.content);
			}

			// Append new entry
			const newContent = currentContent.trim()
				? `${currentContent.trim()}\n\n${entry.rawEntry}\n`
				: `${entry.rawEntry}\n`;

			// Save to file
			await fileStorageService.updateFileContent(targetFile.id, newContent);

			console.log('[JabRefPanel] Successfully imported entry:', entry.key);

			// Refresh local entries
			await fetchLocalEntries();

			// Dispatch events
			document.dispatchEvent(new CustomEvent('refresh-file-tree'));
		} catch (error) {
			console.error('[JabRefPanel] Error importing entry:', error);
		} finally {
			setImportingEntries(prev => {
				const newSet = new Set(prev);
				newSet.delete(entry.key);
				return newSet;
			});
		}
	};

	// Merge local and external entries
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

	// Filter entries based on search
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

	// Update merged entries when local or external change
	useEffect(() => {
		mergeEntries();
	}, [mergeEntries]);

	// Update server URL when changed
	useEffect(() => {
		if (pluginInstance && 'updateServerUrl' in pluginInstance) {
			(pluginInstance as any).updateServerUrl(serverUrl);
		}
	}, [pluginInstance, serverUrl]);

	// Initial data fetch
	useEffect(() => {
		if (!lspEnabled || !showPanel) {
			return;
		}

		console.log('[JabRefPanel] Initializing...');
		refreshAvailableFiles();
		fetchLocalEntries();
		fetchExternalEntries();

		// Set up retry for LSP connection
		let retryCount = 0;
		const maxRetries = 20;

		const retryInterval = setInterval(() => {
			if (!pluginInstance) return;

			const connectionStatus = pluginInstance.getConnectionStatus();
			if (connectionStatus === 'connected') {
				fetchExternalEntries();
				clearInterval(retryInterval);
			} else if (retryCount >= maxRetries) {
				console.warn('[JabRefPanel] LSP connection timeout after 10 seconds');
				clearInterval(retryInterval);
			}
			retryCount++;
		}, 500);

		return () => clearInterval(retryInterval);
	}, [lspEnabled, showPanel, fetchLocalEntries, fetchExternalEntries, pluginInstance, refreshAvailableFiles]);

	// Listen for file changes
	useEffect(() => {
		const handleFileTreeRefresh = () => {
			console.log('[JabRefPanel] File tree refreshed, updating data...');
			refreshAvailableFiles();
			fetchLocalEntries();
		};

		document.addEventListener('refresh-file-tree', handleFileTreeRefresh);

		return () => {
			document.removeEventListener('refresh-file-tree', handleFileTreeRefresh);
		};
	}, [refreshAvailableFiles, fetchLocalEntries]);

	// Handle entry clicks
	const handleEntryClick = (entry: BibEntry) => {
		if (entry.source === 'external' && !entry.isImported) {
			if (autoImport) {
				handleImportEntry(entry);
			}
			return;
		}

		if (onItemSelect) {
			onItemSelect({
				key: entry.key,
				entryType: entry.entryType,
				fields: entry.fields,
				rawEntry: entry.rawEntry,
				title: entry.fields.title || '',
				authors: entry.fields.author ? [entry.fields.author] : [],
				year: entry.fields.year || '',
				journal: entry.fields.journal || entry.fields.booktitle || '',
			});
		}

		document.dispatchEvent(
			new CustomEvent("jabref-citation-selected", {
				detail: { citationKey: entry.key }
			})
		);
	};

	// Helper functions
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

	if (!lspEnabled || !showPanel) {
		return null;
	}

	const targetFileOptions = [
		{ label: "Create new bibliography.bib", value: "CREATE_NEW" },
		...availableBibFiles.map(file => ({
			label: file.name,
			value: file.path
		}))
	];

	return (
		<div className={`lsp-provider-panel ${className}`}>
			<div className="lsp-panel-search">
				<input
					type="text"
					placeholder="Search bibliography..."
					value={searchQuery}
					onChange={(e) => onSearchChange?.(e.target.value)}
					className="lsp-search-input"
				/>
				{searchQuery && (
					<button
						className="lsp-clear-search-button"
						onClick={() => onSearchChange?.("")}
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
				{!pluginInstance ? (
					<div className="lsp-loading-indicator">Initializing LSP...</div>
				) : pluginInstance.getConnectionStatus() !== 'connected' ? (
					<div className="lsp-loading-indicator">
						Connecting to LSP server... ({pluginInstance.getConnectionStatus()})
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
						onClick={() => {
							refreshAvailableFiles();
							fetchLocalEntries();
							fetchExternalEntries();
						}}
						disabled={isLoading}
					>
						{isLoading ? 'Refreshing...' : 'Refresh'}
					</button>
				</div>
			</div>
		</div>
	);
};

export default JabRefPanel;