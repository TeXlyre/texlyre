// extras/lsp/jabref/JabRefPanel.tsx
import type React from "react";
import { useEffect, useState, useCallback } from "react";
import type { LSPPanelProps } from "../../../src/plugins/PluginInterface";
import { useSettings } from "../../../src/hooks/useSettings";
import { fileStorageService } from "../../../src/services/FileStorageService";
import { BibtexParser } from "../../viewers/bibtex/BibtexParser";

interface BibEntry {
	key: string;
	entryType: string;
	fields: Record<string, string>;
	rawEntry: string;
	source?: 'local' | 'external';
	isImported?: boolean;
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
	const [isLoading, setIsLoading] = useState(false);
	const [importingEntries, setImportingEntries] = useState<Set<string>>(new Set());
	const [availableBibFiles, setAvailableBibFiles] = useState<Array<{path: string, name: string}>>([]);

	const lspEnabled = (getSetting("jabref-lsp-enabled")?.value as boolean) ?? true;
	const showPanel = (getSetting("jabref-lsp-show-panel")?.value as boolean) ?? true;
	const citationStyle = (getSetting("jabref-lsp-citation-style")?.value as string) ?? "numeric";
	const maxCompletions = (getSetting("jabref-lsp-max-completions")?.value as number) ?? 20;
	const serverUrl = (getSetting("jabref-lsp-server-url")?.value as string) ?? "ws://localhost:2087/";
	const autoImport = (getSetting("jabref-lsp-auto-import")?.value as boolean) ?? true;
	const showPreview = (getSetting("jabref-lsp-show-import-preview")?.value as boolean) ?? false;
	const targetBibFile = (getSetting("jabref-lsp-target-bib-file")?.value as string) ?? "";
	const duplicateHandling = (getSetting("jabref-lsp-merge-duplicates")?.value as string) ?? "keep-local";

	const fetchLocalEntries = useCallback(async () => {
		try {
			const allFiles = await fileStorageService.getAllFiles();
			const bibFiles = allFiles.filter(file =>
				file.name.endsWith('.bib') &&
				!file.isDeleted &&
				file.content
			);

			setAvailableBibFiles(bibFiles.map(file => ({
				path: file.path,
				name: file.name
			})));

			const allLocalEntries: BibEntry[] = [];

			for (const bibFile of bibFiles) {
				const content = typeof bibFile.content === 'string'
					? bibFile.content
					: new TextDecoder().decode(bibFile.content);

				const parsedEntries = BibtexParser.parse(content);
				const bibEntries: BibEntry[] = parsedEntries.map(entry => ({
					key: entry.id,
					entryType: entry.type,
					fields: entry.fields,
					rawEntry: BibtexParser.serializeEntry(entry),
					source: 'local' as const,
					isImported: false
				}));

				allLocalEntries.push(...bibEntries);
			}

			setLocalEntries(allLocalEntries);
		} catch (error) {
			console.error('Error fetching local bibliography entries:', error);
			setLocalEntries([]);
		}
	}, []);

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
			console.error('Error fetching external bibliography entries:', error);
			setExternalEntries([]);
		} finally {
			setIsLoading(false);
		}
	}, [pluginInstance]);

	const mergeEntries = useCallback(() => {
		const localKeys = new Set(localEntries.map(entry => entry.key));

		// Mark external entries that exist locally
		const updatedExternalEntries = externalEntries.map(entry => ({
			...entry,
			isImported: localKeys.has(entry.key)
		}));

		// Combine all entries: local first, then external
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
	}, [lspEnabled, showPanel, fetchLocalEntries, fetchExternalEntries, pluginInstance]);

	const handleImportEntry = async (entry: BibEntry) => {
		if (entry.source === 'local' || importingEntries.has(entry.key)) {
			return;
		}

		setImportingEntries(prev => new Set(prev).add(entry.key));

		try {
			const targetFile = targetBibFile || availableBibFiles[0]?.path;
			if (!targetFile) {
				console.error('No target bibliography file available');
				return;
			}

			// Check for duplicates based on user preference
			const existingEntry = localEntries.find(local => local.key === entry.key);
			if (existingEntry && duplicateHandling === 'keep-local') {
				console.log(`Entry ${entry.key} already exists locally, keeping local version`);
				return;
			}

			// Get target file
			const bibFile = await fileStorageService.getFileByPath(targetFile);
			if (!bibFile) {
				console.error(`Target file not found: ${targetFile}`);
				return;
			}

			// Prepare the new entry
			let entryToImport = entry.rawEntry;
			if (duplicateHandling === 'rename' && existingEntry) {
				// Generate a unique key
				let counter = 1;
				let newKey = `${entry.key}_${counter}`;
				while (localEntries.some(local => local.key === newKey)) {
					counter++;
					newKey = `${entry.key}_${counter}`;
				}
				entryToImport = entryToImport.replace(entry.key, newKey);
			}

			// Get current file content
			let currentContent = '';
			if (bibFile.content) {
				currentContent = typeof bibFile.content === 'string'
					? bibFile.content
					: new TextDecoder().decode(bibFile.content);
			}

			// Append the new entry
			const newContent = currentContent.trim()
				? `${currentContent.trim()}\n\n${entryToImport}\n`
				: `${entryToImport}\n`;

			// Update the file
			await fileStorageService.updateFileContent(bibFile.id, newContent);

			// Refresh local entries
			await fetchLocalEntries();

			console.log(`Successfully imported ${entry.key} to ${targetFile}`);

		} catch (error) {
			console.error(`Error importing entry ${entry.key}:`, error);
		} finally {
			setImportingEntries(prev => {
				const newSet = new Set(prev);
				newSet.delete(entry.key);
				return newSet;
			});
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

	const getEntryTypeIcon = (entryType: string) => {
		switch (entryType.toLowerCase()) {
			case 'article':
				return '📄';
			case 'book':
				return '📚';
			case 'inproceedings':
			case 'conference':
				return '📋';
			case 'phdthesis':
			case 'mastersthesis':
			case 'thesis':
				return '🎓';
			case 'techreport':
				return '📊';
			case 'misc':
			case 'online':
				return '🌐';
			case 'inbook':
			case 'incollection':
				return '📖';
			default:
				return '📄';
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
			return <span className="entry-source external" title="Click to import">⬇️</span>;
		}
	};

	if (!lspEnabled || !showPanel) {
		return null;
	}

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
						{filteredEntries.map((entry) => (
							<div
								key={`${entry.source}-${entry.key}`}
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
						<span className="lsp-entry-count">
							{localEntries.length} local, {externalEntries.filter(e => !e.isImported).length} external
							{citationStyle !== "numeric" && ` (${citationStyle} style)`}
						</span>
					)}
				</div>
				<div className="lsp-footer-actions">
					<button
						className="lsp-refresh-button"
						onClick={() => {
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