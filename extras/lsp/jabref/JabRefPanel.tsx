// extras/lsp/jabref/JabRefPanel.tsx
import type React from "react";
import { useEffect, useState, useCallback } from "react";
import type { LSPPanelProps } from "../../../src/plugins/PluginInterface";
import { useSettings } from "../../../src/hooks/useSettings";

interface BibEntry {
	key: string;
	entryType: string;
	fields: Record<string, string>;
	rawEntry: string;
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
	const [filteredEntries, setFilteredEntries] = useState<BibEntry[]>([]);
	const [isLoading, setIsLoading] = useState(false);

	const lspEnabled = (getSetting("jabref-lsp-enabled")?.value as boolean) ?? true;
	const showPanel = (getSetting("jabref-lsp-show-panel")?.value as boolean) ?? true;
	const citationStyle = (getSetting("jabref-lsp-citation-style")?.value as string) ?? "numeric";
	const maxCompletions = (getSetting("jabref-lsp-max-completions")?.value as number) ?? 20;
	const serverUrl = (getSetting("jabref-lsp-server-url")?.value as string) ?? "ws://localhost:2087/";

	const fetchEntries = useCallback(async () => {
		if (!pluginInstance) return;

		const connectionStatus = pluginInstance.getConnectionStatus();
		if (connectionStatus !== 'connected') {
			console.log('[JabRefPanel] LSP not connected yet, status:', connectionStatus);
			setEntries([]);
			return;
		}

		setIsLoading(true);
		try {
			if ('getBibliographyEntries' in pluginInstance) {
				const bibEntries = await (pluginInstance as any).getBibliographyEntries();
				setEntries(bibEntries);
			} else {
				setEntries([]);
			}
		} catch (error) {
			console.error('Error fetching bibliography entries:', error);
			setEntries([]);
		} finally {
			setIsLoading(false);
		}
	}, [pluginInstance]);

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
		if (pluginInstance && 'updateServerUrl' in pluginInstance) {
			(pluginInstance as any).updateServerUrl(serverUrl);
		}
	}, [pluginInstance, serverUrl]);

	useEffect(() => {
		if (!lspEnabled || !showPanel || !pluginInstance) {
			return;
		}

		fetchEntries();

		let retryCount = 0;
		const maxRetries = 20;

		const retryInterval = setInterval(() => {
			if (!pluginInstance) return;

			const connectionStatus = pluginInstance.getConnectionStatus();
			if (connectionStatus === 'connected') {
				fetchEntries();
				clearInterval(retryInterval);
			} else if (retryCount >= maxRetries) {
				console.warn('[JabRefPanel] LSP connection timeout after 10 seconds');
				clearInterval(retryInterval);
			}
			retryCount++;
		}, 500);

		return () => clearInterval(retryInterval);
	}, [lspEnabled, showPanel, fetchEntries, pluginInstance]);

	const handleEntryClick = (entry: BibEntry) => {
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
				return `[${entries.indexOf(entry) + 1}]`;
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
								key={entry.key}
								className="lsp-entry-item"
							>
								<div className="lsp-entry-header">
									<span className="lsp-entry-key">{entry.key}</span>
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
								<div className="lsp-entry-title"
									 onClick={() => handleEntryClick(entry)}
								>
									{getDisplayTitle(entry)}</div>
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
				)}
			</div>

			<div className="lsp-panel-footer">
				<div className="lsp-footer-stats">
					{entries.length > 0 && (
						<span className="lsp-entry-count">
							{filteredEntries.length} of {entries.length} entries
							{citationStyle !== "numeric" && ` (${citationStyle} style)`}
						</span>
					)}
				</div>
				<button
					className="lsp-refresh-button"
					onClick={fetchEntries}
					disabled={isLoading}
				>
					{isLoading ? 'Refreshing...' : 'Refresh'}
				</button>
			</div>
		</div>
	);
};

export default JabRefPanel;