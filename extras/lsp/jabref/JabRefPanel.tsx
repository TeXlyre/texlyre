// extras/lsp/jabref/JabRefPanel.tsx
import type React from "react";
import { useEffect, useState, useCallback } from "react";
import type { LSPPanelProps } from "../../../src/plugins/PluginInterface";
import { useSettings } from "../../../src/hooks/useSettings";
import { useBibliography } from "../../../src/hooks/useBibliography";
import { fileStorageService } from "../../../src/services/FileStorageService";

interface BibEntry {
	key: string;
	entryType: string;
	fields: Record<string, string>;
	rawEntry: string;
	source?: 'local' | 'external';
	isImported?: boolean;
	filePath?: string;
}

const JabRefPanel: React.FC<LSPPanelProps> = ({
	className = "",
	onItemSelect,
	searchQuery = "",
	onSearchChange,
	pluginInstance,
}) => {
	const { getSetting } = useSettings();
	const {
		getTargetFile,
		setTargetFile,
		getAvailableFiles,
		createBibFile,
		refreshAvailableFiles,
		getLocalEntries,
		importEntry,
		isImporting
	} = useBibliography();

	const [entries, setEntries] = useState<BibEntry[]>([]);
	const [localEntries, setLocalEntries] = useState<BibEntry[]>([]);
	const [externalEntries, setExternalEntries] = useState<BibEntry[]>([]);
	const [filteredEntries, setFilteredEntries] = useState<BibEntry[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

	const lspEnabled = (getSetting("jabref-lsp-enabled")?.value as boolean) ?? true;
	const showPanel = (getSetting("jabref-lsp-show-panel")?.value as boolean) ?? true;
	const citationStyle = (getSetting("jabref-lsp-citation-style")?.value as string) ?? "numeric";
	const maxCompletions = (getSetting("jabref-lsp-max-completions")?.value as number) ?? 20;
	const serverUrl = (getSetting("jabref-lsp-server-url")?.value as string) ?? "ws://localhost:2087/";
	const autoImport = (getSetting("jabref-lsp-auto-import")?.value as boolean) ?? true;
	const duplicateHandling = (getSetting("jabref-lsp-merge-duplicates")?.value as string) ?? "keep-local";

	// Get current project ID
	useEffect(() => {
		const getProjectId = () => {
			try {
				const currentProjectId = fileStorageService.getCurrentProjectId();
				setCurrentProjectId(currentProjectId || null);
			} catch (error) {
				console.error('[JabRefPanel] Error getting current project ID:', error);
				setCurrentProjectId(null);
			}
		};

		getProjectId();
		const interval = setInterval(getProjectId, 1000);
		return () => clearInterval(interval);
	}, []);

	const targetBibFile = getTargetFile("jabref-lsp", currentProjectId) || "";
	const availableBibFiles = getAvailableFiles();

	const fetchLocalEntries = useCallback(async () => {
		try {
			const entries = await getLocalEntries();
			setLocalEntries(entries);
		} catch (error) {
			console.error('[JabRefPanel] Error fetching local entries:', error);
			setLocalEntries([]);
		}
	}, [getLocalEntries]);

	const fetchExternalEntries = useCallback(async () => {
		if (!pluginInstance) return;

		const connectionStatus = pluginInstance.getConnectionStatus();
		if (connectionStatus !== 'connected') {
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
		if (pluginInstance && 'updateServerUrl' in pluginInstance) {
			(pluginInstance as any).updateServerUrl(serverUrl);
		}
	}, [pluginInstance, serverUrl]);

	useEffect(() => {
		if (!lspEnabled || !showPanel) {
			return;
		}

		fetchLocalEntries();
		fetchExternalEntries();
		refreshAvailableFiles();

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

	// Listen for file tree changes to refresh local entries
	useEffect(() => {
		const handleFileTreeRefresh = () => {
			fetchLocalEntries();
		};

		document.addEventListener('refresh-file-tree', handleFileTreeRefresh);
		return () => {
			document.removeEventListener('refresh-file-tree', handleFileTreeRefresh);
		};
	}, [fetchLocalEntries]);

	const handleTargetFileChange = async (newValue: string) => {
		if (newValue === "CREATE_NEW") {
			const createdFile = await createBibFile();
			if (createdFile) {
				setTargetFile("jabref-lsp", createdFile, currentProjectId);
				await refreshAvailableFiles();
				document.dispatchEvent(new CustomEvent('refresh-file-tree'));
			}
		} else {
			setTargetFile("jabref-lsp", newValue, currentProjectId);
		}
	};

	const handleImportEntry = async (entry: BibEntry) => {
		const success = await importEntry(entry, "jabref-lsp", currentProjectId, duplicateHandling);
		if (success) {
			// Refresh local entries to show the newly imported entry
			await fetchLocalEntries();
		}
	};

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

	// Helper functions (same as before)
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
		} else if (isImporting(entry.key)) {
			return <span className="entry-source importing" title="Importing...">⏳</span>;
		} else {
			return <span className="entry-source external" title="Click to import">⬇️</span>;
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
					Target Bibliography File:
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
											disabled={isImporting(entry.key)}
										>
											{isImporting(entry.key) ? 'Importing...' : 'Import'}
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
							fetchLocalEntries();
							fetchExternalEntries();
							refreshAvailableFiles();
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