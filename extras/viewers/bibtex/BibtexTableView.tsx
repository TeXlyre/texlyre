import type React from "react";
import { useState, useMemo, useEffect, useRef } from "react";
import type { BibtexEntry } from "./BibtexParser";

interface BibtexTableViewProps {
	entries: BibtexEntry[];
	onEntriesChange: (entries: BibtexEntry[]) => void;
	onSingleEntryChange?: (updatedEntry: BibtexEntry) => void;
}

interface SortConfig {
	key: string | null;
	direction: 'asc' | 'desc';
}

export const BibtexTableView: React.FC<BibtexTableViewProps> = ({
	entries,
	onEntriesChange,
	onSingleEntryChange,
}) => {
	const [editingCell, setEditingCell] = useState<{ entryIndex: number; field: string } | null>(null);
	const [editValue, setEditValue] = useState("");
	const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: 'asc' });
	const tableRef = useRef<HTMLTableElement>(null);

	const allFields = useMemo(() => {
		const fieldSet = new Set<string>();
		fieldSet.add('type');
		entries.forEach(entry => {
			Object.keys(entry.fields).forEach(field => fieldSet.add(field));
		});
		const otherFields = Array.from(fieldSet).sort();
		return ['id', ...otherFields]; // id first, then others
	}, [entries]);

	// Set initial column widths after first render
	useEffect(() => {
		if (tableRef.current) {
			const headers = tableRef.current.querySelectorAll('th');
			headers.forEach((th, index) => {
				const field = allFields[index];
				// Calculate width based on header text + some padding
				const minWidth = Math.max(120, field.length * 12 + 60);
				(th as HTMLElement).style.width = `${minWidth}px`;
			});
			// Switch to fixed layout after setting widths
			tableRef.current.style.tableLayout = 'fixed';
		}
	}, [allFields]);

	const displayEntries = useMemo(() => {
		if (!sortConfig.key) {
			return entries.slice().sort((a, b) => a.originalIndex - b.originalIndex);
		}

		return [...entries].sort((a, b) => {
			let aVal: string;
			let bVal: string;

			if (sortConfig.key === 'id') {
				aVal = a.id;
				bVal = b.id;
			} else if (sortConfig.key === 'type') {
				aVal = a.type;
				bVal = b.type;
			} else {
				aVal = a.fields[sortConfig.key!] || '';
				bVal = b.fields[sortConfig.key!] || '';
			}

			const result = aVal.localeCompare(bVal);
			return sortConfig.direction === 'asc' ? result : -result;
		});
	}, [entries, sortConfig]);

	const handleSort = (field: string) => {
		setSortConfig(prev => ({
			key: field,
			direction: prev.key === field && prev.direction === 'asc' ? 'desc' : 'asc'
		}));
	};

	const startEdit = (entryIndex: number, field: string) => {
		if (field === 'id') return; // Can't edit id field

		const actualIndex = entries.findIndex(e => e.originalIndex === displayEntries[entryIndex].originalIndex);
		const entry = entries[actualIndex];
		let currentValue = '';

		if (field === 'type') {
			currentValue = entry.type;
		} else {
			currentValue = entry.fields[field] || '';
		}

		setEditingCell({ entryIndex: actualIndex, field });
		setEditValue(currentValue);
	};

	const saveEdit = () => {
		if (!editingCell) return;

		const updatedEntries = [...entries];
		const entry = updatedEntries[editingCell.entryIndex];

		if (editingCell.field === 'type') {
			entry.type = editValue.trim().toLowerCase();
		} else {
			if (editValue.trim()) {
				entry.fields[editingCell.field] = editValue.trim();
			} else {
				delete entry.fields[editingCell.field];
			}
		}

		if (onSingleEntryChange) {
			onSingleEntryChange(entry);
		} else {
			onEntriesChange(updatedEntries);
		}

		setEditingCell(null);
		setEditValue("");
	};

	const cancelEdit = () => {
		setEditingCell(null);
		setEditValue("");
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			saveEdit();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			cancelEdit();
		}
	};

	const getCellValue = (entry: BibtexEntry, field: string) => {
		if (field === 'id') return entry.id;
		if (field === 'type') return entry.type;
		return entry.fields[field] || '';
	};

	return (
		<div className="bibtex-table-container">
			<table ref={tableRef} className="bibtex-table resizable-table">
				<thead>
					<tr>
						{allFields.map(field => (
							<th
								key={field}
								onClick={() => handleSort(field)}
								className={sortConfig.key === field ? `sorted-${sortConfig.direction}` : ''}
							>
								{field}
								{sortConfig.key === field && (
									<span className="sort-indicator">
										{sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}
									</span>
								)}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{displayEntries.map((entry, displayIndex) => {
						const actualIndex = entries.findIndex(e => e.originalIndex === entry.originalIndex);
						return (
							<tr key={entry.originalIndex}>
								{allFields.map(field => {
									const isEditing = editingCell?.entryIndex === actualIndex && editingCell?.field === field;
									const value = getCellValue(entry, field);

									return (
										<td
											key={field}
											onClick={() => !isEditing && startEdit(displayIndex, field)}
											className={`${isEditing ? 'editing' : field === 'id' ? 'non-editable' : 'editable'}`}
										>
											{isEditing ? (
												<input
													type="text"
													value={editValue}
													onChange={(e) => setEditValue(e.target.value)}
													onBlur={saveEdit}
													onKeyDown={handleKeyDown}
													autoFocus
													className="cell-input"
												/>
											) : (
												<span className="cell-content">
													{value || <em className="empty-field">—</em>}
												</span>
											)}
										</td>
									);
								})}
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
};