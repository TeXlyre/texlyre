// extras/lsp/jabref/JabRefPanel.tsx
import type React from "react";
import { useEffect, useState } from "react";
import type { LSPPanelProps } from "../../../src/plugins/PluginInterface";

interface BibEntry {
	key: string;
	title: string;
	authors: string[];
	year: string;
	journal?: string;
	entryType: string;
}

const JabRefPanel: React.FC<LSPPanelProps> = ({
	className = "",
	onItemSelect,
	searchQuery = "",
	onSearchChange,
}) => {
	const [entries, setEntries] = useState<BibEntry[]>([]);
	const [filteredEntries, setFilteredEntries] = useState<BibEntry[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [connectionStatus, setConnectionStatus] = useState<'connected' | 'connecting' | 'disconnected' | 'error'>('disconnected');

	useEffect(() => {
		// Filter entries based on search query
		if (searchQuery.trim() === "") {
			setFilteredEntries(entries);
		} else {
			const query = searchQuery.toLowerCase();
			setFilteredEntries(
				entries.filter(entry =>
					entry.key.toLowerCase().includes(query) ||
					entry.title.toLowerCase().includes(query) ||
					entry.authors.some(author => author.toLowerCase().includes(query)) ||
					entry.year.includes(query) ||
					entry.journal?.toLowerCase().includes(query)
				)
			);
		}
	}, [searchQuery, entries]);

	const fetchEntries = async () => {
		setIsLoading(true);
		try {
			// This would be replaced with actual LSP request to JabRef
			// For now, using mock data
			const mockEntries: BibEntry[] = [
				{
					key: "smith2023",
					title: "Advanced LaTeX Techniques for Academic Writing",
					authors: ["John Smith", "Jane Doe"],
					year: "2023",
					journal: "Journal of Academic Publishing",
					entryType: "article"
				},
				{
					key: "doe2022",
					title: "Bibliography Management Systems: A Comprehensive Review",
					authors: ["Jane Doe"],
					year: "2022",
					journal: "Computer Science Review",
					entryType: "article"
				},
				{
					key: "johnson2023book",
					title: "Modern Research Methodologies",
					authors: ["Alice Johnson", "Bob Wilson"],
					year: "2023",
					entryType: "book"
				}
			];

			setEntries(mockEntries);
			setConnectionStatus('connected');
		} catch (error) {
			console.error('Error fetching bibliography entries:', error);
			setConnectionStatus('error');
		} finally {
			setIsLoading(false);
		}
	};

	useEffect(() => {
		fetchEntries();
	}, []);

	const handleEntryClick = (entry: BibEntry) => {
		if (onItemSelect) {
			onItemSelect({
				key: entry.key,
				insertText: entry.key,
				...entry
			});
		}

		// Insert citation into editor
		document.dispatchEvent(
			new CustomEvent("jabref-citation-selected", {
				detail: { citationKey: entry.key }
			})
		);
	};

	const getEntryTypeIcon = (entryType: string) => {
		switch (entryType) {
			case 'article':
				return '📄';
			case 'book':
				return '📚';
			case 'inproceedings':
				return '📋';
			case 'thesis':
				return '🎓';
			default:
				return '📄';
		}
	};

	const formatAuthors = (authors: string[]) => {
		if (authors.length === 1) return authors[0];
		if (authors.length === 2) return `${authors[0]} and ${authors[1]}`;
		return `${authors[0]} et al.`;
	};

	return (
		<div className={`jabref-panel ${className}`}>
			<div className="jabref-panel-header">
				<h3>JabRef Bibliography</h3>
				<div className={`connection-status ${connectionStatus}`}>
					<span className="status-indicator"></span>
					<span className="status-text">
						{connectionStatus === 'connected' && 'Connected'}
						{connectionStatus === 'connecting' && 'Connecting...'}
						{connectionStatus === 'disconnected' && 'Disconnected'}
						{connectionStatus === 'error' && 'Connection Error'}
					</span>
				</div>
			</div>

			<div className="jabref-search">
				<input
					type="text"
					placeholder="Search bibliography..."
					value={searchQuery}
					onChange={(e) => onSearchChange?.(e.target.value)}
					className="search-input"
				/>
				{searchQuery && (
					<button
						className="clear-search-button"
						onClick={() => onSearchChange?.("")}
					>
						×
					</button>
				)}
			</div>

			<div className="jabref-panel-content">
				{isLoading ? (
					<div className="loading-indicator">Loading bibliography...</div>
				) : filteredEntries.length === 0 ? (
					<div className="no-entries">
						{searchQuery
							? "No entries found matching the search criteria"
							: "No bibliography entries available"
						}
					</div>
				) : (
					<div className="entries-list">
						{filteredEntries.map((entry) => (
							<div
								key={entry.key}
								className="entry-item"
								onClick={() => handleEntryClick(entry)}
							>
								<div className="entry-header">
									<span className="entry-type-icon">
										{getEntryTypeIcon(entry.entryType)}
									</span>
									<span className="entry-key">{entry.key}</span>
									<span className="entry-year">{entry.year}</span>
								</div>
								<div className="entry-title">{entry.title}</div>
								<div className="entry-authors">
									{formatAuthors(entry.authors)}
								</div>
								{entry.journal && (
									<div className="entry-journal">
										<em>{entry.journal}</em>
									</div>
								)}
							</div>
						))}
					</div>
				)}
			</div>

			<div className="jabref-panel-footer">
				<button
					className="refresh-button"
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