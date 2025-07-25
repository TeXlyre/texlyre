// extras/lsp/jabref/JabRefPanel.tsx
import type React from "react";
import { useEffect, useState } from "react";
import type { LSPPanelProps } from "../../../src/plugins/PluginInterface";

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
}) => {
	const [entries, setEntries] = useState<BibEntry[]>([]);
	const [filteredEntries, setFilteredEntries] = useState<BibEntry[]>([]);
	const [isLoading, setIsLoading] = useState(false);

	useEffect(() => {
		if (searchQuery.trim() === "") {
			setFilteredEntries(entries);
		} else {
			const query = searchQuery.toLowerCase();
			setFilteredEntries(
				entries.filter(entry => {
					if (entry.key.toLowerCase().includes(query)) return true;
					if (entry.entryType.toLowerCase().includes(query)) return true;
					return Object.values(entry.fields).some(value =>
						value.toLowerCase().includes(query)
					);
				})
			);
		}
	}, [searchQuery, entries]);

	const parseCompletionItem = (item: any): BibEntry => {
		const documentation = item.documentation || '';
		const fields = parseDocumentationFields(documentation);

		return {
			key: item.label || item.insertText || '',
			entryType: extractEntryType(documentation) || 'article',
			fields: fields,
			rawEntry: documentation
		};
	};

	const parseDocumentationFields = (documentation: string): Record<string, string> => {
		const fields: Record<string, string> = {};

		const titleMatch = documentation.match(/Title:\s*(.+?)(?:\n|$)/);
		if (titleMatch) {
			fields.title = titleMatch[1].replace(/[{}]/g, '').trim();
		}

		const authorMatch = documentation.match(/Authors?:\s*(.+?)(?:\n|$)/);
		if (authorMatch) {
			fields.author = authorMatch[1].trim();
		}

		const yearMatch = documentation.match(/Year:\s*(\d{4})/);
		if (yearMatch) {
			fields.year = yearMatch[1];
		}

		return fields;
	};

	const extractEntryType = (documentation: string): string => {
		if (documentation.includes('Journal')) return 'article';
		if (documentation.includes('Book')) return 'book';
		if (documentation.includes('Conference') || documentation.includes('Proceedings')) return 'inproceedings';
		if (documentation.includes('Thesis')) return 'phdthesis';
		return 'article';
	};

	const fetchEntries = async () => {
		setIsLoading(true);
		try {
			const event = new CustomEvent('jabref-request-entries', {
				detail: {
					callback: (bibEntries: BibEntry[]) => {
						setEntries(bibEntries);
						setIsLoading(false);
					}
				}
			});
			document.dispatchEvent(event);
		} catch (error) {
			console.error('Error fetching bibliography entries:', error);
			setEntries([]);
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
				{isLoading ? (
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
								onClick={() => handleEntryClick(entry)}
							>
								<div className="lsp-entry-header">
									<span className="lsp-entry-key">{entry.key}</span>
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
								<div className="lsp-entry-title">{getDisplayTitle(entry)}</div>

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