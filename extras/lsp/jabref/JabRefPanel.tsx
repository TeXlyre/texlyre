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
		// Filter entries based on search query
		if (searchQuery.trim() === "") {
			setFilteredEntries(entries);
		} else {
			const query = searchQuery.toLowerCase();
			setFilteredEntries(
				entries.filter(entry => {
					// Search in key
					if (entry.key.toLowerCase().includes(query)) return true;

					// Search in entry type
					if (entry.entryType.toLowerCase().includes(query)) return true;

					// Search in all field values
					return Object.values(entry.fields).some(value =>
						value.toLowerCase().includes(query)
					);
				})
			);
		}
	}, [searchQuery, entries]);

	const parseBibEntry = (bibText: string): BibEntry[] => {
		const entries: BibEntry[] = [];
		const entryRegex = /@(\w+)\s*{\s*([^,\s]+)\s*,([\s\S]*?)(?=@\w+\s*{|$)/g;

		let match;
		while ((match = entryRegex.exec(bibText)) !== null) {
			const [fullMatch, entryType, key, fieldsText] = match;
			const fields: Record<string, string> = {};

			// Parse fields - handle nested braces and quotes
			const fieldRegex = /(\w+)\s*=\s*(?:{([^{}]*(?:{[^{}]*}[^{}]*)*)}|"([^"]*)"|(\w+))\s*,?/g;
			let fieldMatch;

			while ((fieldMatch = fieldRegex.exec(fieldsText)) !== null) {
				const [, fieldName, bracedValue, quotedValue, plainValue] = fieldMatch;
				const value = bracedValue || quotedValue || plainValue || '';
				fields[fieldName.toLowerCase()] = value.trim();
			}

			entries.push({
				key: key.trim(),
				entryType: entryType.toLowerCase(),
				fields,
				rawEntry: fullMatch
			});
		}

		return entries;
	};

	const fetchEntries = async () => {
		setIsLoading(true);
		try {
			// Mock bibliography data - in real implementation, this would come from JabRef LSP
			const mockBibText = `
@article{smith2023,
	title={Advanced LaTeX Techniques for Academic Writing},
	author={John Smith and Jane Doe},
	journal={Journal of Academic Publishing},
	volume={15},
	number={3},
	pages={123--145},
	year={2023},
	publisher={Academic Press},
	doi={10.1234/jap.2023.15.3.123}
}

@book{johnson2023book,
	title={Modern Research Methodologies},
	author={Alice Johnson and Bob Wilson},
	publisher={University Press},
	address={New York},
	year={2023},
	isbn={978-0123456789},
	edition={2nd}
}

@inproceedings{doe2022,
	title={Bibliography Management Systems: A Comprehensive Review},
	author={Jane Doe},
	booktitle={Proceedings of the International Conference on Digital Libraries},
	pages={45--52},
	year={2022},
	organization={IEEE},
	address={San Francisco, CA}
}

@phdthesis{brown2021,
	title={Collaborative Writing Tools in Academic Environments},
	author={Michael Brown},
	school={Massachusetts Institute of Technology},
	year={2021},
	type={PhD thesis}
}

@misc{wilson2023web,
	title={Online Citation Management: Best Practices},
	author={Sarah Wilson},
	howpublished={\\url{https://example.com/citations}},
	year={2023},
	note={Accessed: 2023-12-01}
}
			`;

			const parsedEntries = parseBibEntry(mockBibText);
			setEntries(parsedEntries);
		} catch (error) {
			console.error('Error fetching bibliography entries:', error);
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
				entryType: entry.entryType,
				fields: entry.fields,
				rawEntry: entry.rawEntry,
				// Legacy fields for backward compatibility
				title: entry.fields.title || '',
				authors: entry.fields.author ? [entry.fields.author] : [],
				year: entry.fields.year || '',
				journal: entry.fields.journal || entry.fields.booktitle || '',
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

		// Simple author formatting - split by 'and' and take first few
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
									<div className="lsp-entry-type-badge">
										<span className="lsp-entry-type-icon">
											{getEntryTypeIcon(entry.entryType)}
										</span>
										<span className="lsp-entry-type-text">
											{entry.entryType.toUpperCase()}
										</span>
									</div>
									<span className="lsp-entry-key">{entry.key}</span>
									{getDisplayYear(entry) && (
										<span className="lsp-entry-year">{getDisplayYear(entry)}</span>
									)}
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