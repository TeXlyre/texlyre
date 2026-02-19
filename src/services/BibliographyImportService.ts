// src/services/BibliographyImportService.ts
import { t } from '@/i18n';
import { isBibFile } from '../utils/fileUtils';
import { parseUrlFragments } from '../utils/urlUtils';
import { fileStorageService } from './FileStorageService';
import { collabService } from './CollabService';
import type { BibEntry } from '../types/bibliography';

export interface ImportResult {
	success: boolean;
	entryKey: string;
	filePath?: string;
	error?: string;
	isDuplicate?: boolean;
	action?: 'imported' | 'skipped' | 'replaced' | 'renamed';
}

export interface ImportOptions {
	targetFile?: string;
	duplicateHandling?: 'keep-local' | 'replace' | 'rename' | 'ask';
	showPreview?: boolean;
	autoImport?: boolean;
	action?: 'import' | 'delete' | 'update';
	remoteId?: string;
}

export interface BibTexParser {
	parse(content: string): BibEntry[];
	serialize(entries: BibEntry[]): string;
	serializeEntry(entry: BibEntry): string;
	findEntryPosition(content: string, entry: BibEntry): { start: number; end: number } | null;
	updateEntryInContent(content: string, entry: BibEntry): string;
}

class DefaultBibTexParser implements BibTexParser {
	parse(content: string): BibEntry[] {
		const entries: BibEntry[] = [];

		// Remove comments and clean content
		const cleanContent = content
			.split('\n')
			.map(line => line.replace(/%.*$/, '').trim())
			.join('\n');

		let pos = 0;
		while (pos < cleanContent.length) {
			// Find next @ symbol
			const atPos = cleanContent.indexOf('@', pos);
			if (atPos === -1) break;

			// Find entry type and opening brace
			const typeMatch = cleanContent.slice(atPos).match(/^@(\w+)\s*\{\s*([^,\s]+)\s*,/);
			if (!typeMatch) {
				pos = atPos + 1;
				continue;
			}

			const [, type, key] = typeMatch;
			const entryStart = atPos;
			const contentStart = atPos + typeMatch[0].length;

			// Find matching closing brace
			let braceCount = 1;
			let currentPos = contentStart;
			let entryEnd = -1;

			while (currentPos < cleanContent.length && braceCount > 0) {
				const char = cleanContent[currentPos];
				if (char === '{') {
					braceCount++;
				} else if (char === '}') {
					braceCount--;
					if (braceCount === 0) {
						entryEnd = currentPos;
						break;
					}
				}
				currentPos++;
			}

			if (entryEnd === -1) {
				pos = atPos + 1;
				continue;
			}

			// Extract the full entry and field content
			const fullEntry = cleanContent.slice(entryStart, entryEnd + 1);
			const fieldsContent = cleanContent.slice(contentStart, entryEnd);

			// Parse fields
			const fields: Record<string, string> = {};
			let fieldPos = 0;

			while (fieldPos < fieldsContent.length) {
				// Skip whitespace and commas
				while (fieldPos < fieldsContent.length && /[\s,]/.test(fieldsContent[fieldPos])) {
					fieldPos++;
				}

				if (fieldPos >= fieldsContent.length) break;

				// Find field name
				const fieldNameMatch = fieldsContent.slice(fieldPos).match(/^([\w-]+)\s*=/);
				if (!fieldNameMatch) {
					fieldPos++;
					continue;
				}

				const fieldName = fieldNameMatch[1].toLowerCase();
				fieldPos += fieldNameMatch[0].length;

				// Skip whitespace after =
				while (fieldPos < fieldsContent.length && /\s/.test(fieldsContent[fieldPos])) {
					fieldPos++;
				}

				if (fieldPos >= fieldsContent.length) break;

				let fieldValue = '';
				const startChar = fieldsContent[fieldPos];

				if (startChar === '{') {
					// Brace-delimited value
					let bracesCount = 1;
					fieldPos++; // Skip opening brace
					const valueStart = fieldPos;

					while (fieldPos < fieldsContent.length && bracesCount > 0) {
						const char = fieldsContent[fieldPos];
						if (char === '{') {
							bracesCount++;
						} else if (char === '}') {
							bracesCount--;
						}
						if (bracesCount > 0) {
							fieldPos++;
						}
					}

					fieldValue = fieldsContent.slice(valueStart, fieldPos).trim();
					fieldPos++; // Skip closing brace
				} else if (startChar === '"') {
					// Quote-delimited value
					fieldPos++; // Skip opening quote
					const valueStart = fieldPos;

					while (fieldPos < fieldsContent.length && fieldsContent[fieldPos] !== '"') {
						if (fieldsContent[fieldPos] === '\\') {
							fieldPos += 2; // Skip escaped character
						} else {
							fieldPos++;
						}
					}

					fieldValue = fieldsContent.slice(valueStart, fieldPos).trim();
					fieldPos++; // Skip closing quote
				} else {
					// Unquoted value (until comma or end)
					const valueStart = fieldPos;
					while (fieldPos < fieldsContent.length &&
						fieldsContent[fieldPos] !== ',' &&
						fieldsContent[fieldPos] !== '}') {
						fieldPos++;
					}
					fieldValue = fieldsContent.slice(valueStart, fieldPos).trim();
				}

				if (fieldValue) {
					// Clean up field value - remove extra braces and normalize whitespace
					fieldValue = fieldValue
						.replace(/^\{+|\}+$/g, '') // Remove outer braces
						.replace(/\s+/g, ' ') // Normalize whitespace
						.trim();

					fields[fieldName] = fieldValue;
				}
			}

			entries.push({
				key: key.trim(),
				entryType: type.toLowerCase(),
				fields,
				rawEntry: fullEntry,
				remoteId: fields['remote-id'] || fields['external-id'] || undefined
			});

			pos = entryEnd + 1;
		}

		return entries;
	}

	serialize(entries: BibEntry[]): string {
		return entries.map(entry => this.serializeEntry(entry)).join('\n\n');
	}

	serializeEntry(entry: BibEntry): string {
		const fieldsString = Object.entries(entry.fields)
			.map(([key, value]) => `  ${key} = {${value}}`)
			.join(',\n');

		return `@${entry.entryType}{${entry.key},\n${fieldsString}\n}`;
	}

	findEntryPosition(content: string, entry: BibEntry): { start: number; end: number } | null {
		// Try exact rawEntry match first
		const index = content.indexOf(entry.rawEntry);
		if (index !== -1) {
			return { start: index, end: index + entry.rawEntry.length };
		}

		// Fallback: find by entry type + key using regex
		const escapedKey = entry.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const entryRegex = new RegExp(`@${entry.entryType}\\s*\\{\\s*${escapedKey}\\s*,`, 'i');
		const match = entryRegex.exec(content);
		if (!match) return null;

		// Find matching closing brace
		let braceCount = 1;
		let pos = match.index + match[0].length;
		while (pos < content.length && braceCount > 0) {
			if (content[pos] === '{') braceCount++;
			else if (content[pos] === '}') braceCount--;
			pos++;
		}

		return { start: match.index, end: pos };
	}

	updateEntryInContent(content: string, entry: BibEntry): string {
		const position = this.findEntryPosition(content, entry);
		if (!position) return content;

		const newEntryContent = this.serializeEntry(entry);
		return content.substring(0, position.start) +
			newEntryContent +
			content.substring(position.end);
	}
}

export class BibliographyImportService {
	private static instance: BibliographyImportService;
	private importQueue: Map<string, Promise<ImportResult>> = new Map();
	private notificationCallbacks: Array<(result: ImportResult) => void> = [];
	private parser: BibTexParser = new DefaultBibTexParser();
	private openBibFiles: Set<string> = new Set();

	isFileOpen(filePath: string): boolean {
		return this.openBibFiles.has(filePath);
	}

	static getInstance(): BibliographyImportService {
		if (!BibliographyImportService.instance) {
			BibliographyImportService.instance = new BibliographyImportService();
		}
		return BibliographyImportService.instance;
	}

	setParser(parser: BibTexParser): void {
		this.parser = parser;
	}

	getParser(): BibTexParser {
		return this.parser;
	}

	addNotificationCallback(callback: (result: ImportResult) => void): () => void {
		this.notificationCallbacks.push(callback);
		return () => {
			const index = this.notificationCallbacks.indexOf(callback);
			if (index > -1) {
				this.notificationCallbacks.splice(index, 1);
			}
		};
	}

	private notifyCallbacks(result: ImportResult): void {
		this.notificationCallbacks.forEach(callback => {
			try {
				callback(result);
			} catch (error) {
				console.error('Error in import notification callback:', error);
			}
		});
	}

	private async dispatchFileReload(filePath: string): Promise<void> {
		const file = await fileStorageService.getFileByPath(filePath);
		if (!file) return;
		document.dispatchEvent(new CustomEvent('file-reloaded', {
			detail: { filePath, fileId: file.id }
		}));
	}

	async batchImport(
		filePath: string,
		entries: Array<{ entryKey: string; rawEntry: string; remoteId?: string }>,
		duplicateHandling: 'keep-local' | 'replace' | 'rename' | 'ask' = 'keep-local'
	): Promise<void> {
		await this.updateContent(filePath, (content) => {
			let current = content;
			const allKeys = new Set(this.parser.parse(current).map(e => e.key));

			for (let { entryKey, rawEntry, remoteId } of entries) {
				const existing = this.parser.parse(current).find(e =>
					e.key === entryKey ||
					(remoteId && (e.remoteId || e.fields['remote-id'] || e.fields['external-id']) === remoteId)
				);

				if (existing) {
					if (duplicateHandling === 'keep-local' || duplicateHandling === 'ask') continue;

					if (duplicateHandling === 'replace') {
						const position = this.parser.findEntryPosition(current, existing);
						if (position) {
							current = current.substring(0, position.start) +
								this.formatEntryForAppending(rawEntry).trim() +
								current.substring(position.end);
						}
						continue;
					}

					if (duplicateHandling === 'rename') {
						let counter = 1;
						let newKey = `${entryKey}_${counter}`;
						while (allKeys.has(newKey)) { counter++; newKey = `${entryKey}_${counter}`; }
						rawEntry = rawEntry.replace(entryKey, newKey);
						entryKey = newKey;
						allKeys.add(newKey);
					}
				}

				const formatted = this.formatEntryForAppending(rawEntry);
				current = current.trim() ? `${current.trim()}\n\n${formatted}` : formatted;
			}
			return current;
		});
		document.dispatchEvent(new CustomEvent('refresh-file-tree'));
		if (this.openBibFiles.has(filePath)) await this.dispatchFileReload(filePath);
	}

	async batchUpdate(
		filePath: string,
		updates: Array<{ entryKey: string; rawEntry: string; remoteId?: string }>
	): Promise<void> {
		await this.updateContent(filePath, (content) => {
			let current = content;
			for (const { entryKey, rawEntry, remoteId } of updates) {
				const existing = this.parser.parse(current).find(e =>
					e.key === entryKey ||
					(remoteId && (e.remoteId || e.fields['remote-id'] || e.fields['external-id']) === remoteId)
				);
				if (!existing) continue;
				const remoteFieldKey = existing.fields['external-id'] ? 'external-id' : 'remote-id';
				const resolvedRemoteId = remoteId || existing.remoteId || existing.fields[remoteFieldKey];
				const incoming = this.parser.parse(rawEntry)[0];
				const updatedEntry: BibEntry = {
					key: existing.key,
					entryType: incoming?.entryType || existing.entryType,
					fields: { ...incoming?.fields, ...(resolvedRemoteId ? { [remoteFieldKey]: resolvedRemoteId } : {}) },
					rawEntry,
					remoteId: resolvedRemoteId
				};
				const position = this.parser.findEntryPosition(current, existing);
				if (position) {
					current = current.substring(0, position.start) +
						this.parser.serializeEntry(updatedEntry) +
						current.substring(position.end);
				}
			}
			return current;
		});
		document.dispatchEvent(new CustomEvent('refresh-file-tree'));
		if (this.openBibFiles.has(filePath)) await this.dispatchFileReload(filePath);
	}

	async batchDelete(
		filePath: string,
		entries: Array<{ entryKey: string; remoteId?: string }>
	): Promise<void> {
		await this.updateContent(filePath, (content) => {
			let current = content;
			for (const { entryKey, remoteId } of entries) {
				const existing = this.parser.parse(current).find(e =>
					e.key === entryKey ||
					(remoteId && (e.remoteId || e.fields['remote-id'] || e.fields['external-id']) === remoteId)
				);
				if (!existing) continue;
				const position = this.parser.findEntryPosition(current, existing);
				if (!position) continue;
				let end = position.end;
				while (end < current.length && /[\r\n\s]/.test(current[end])) end++;
				current = current.substring(0, position.start) + current.substring(end);
			}
			return current;
		});
		document.dispatchEvent(new CustomEvent('refresh-file-tree'));
		if (this.openBibFiles.has(filePath)) await this.dispatchFileReload(filePath);
	}

	private async updateContent(
		filePath: string,
		updater: (currentContent: string) => string
	): Promise<void> {
		const file = await fileStorageService.getFileByPath(filePath);
		if (!file) throw new Error('File not found');

		if (file.documentId) {
			const currentFragment = parseUrlFragments(window.location.hash.substring(1));
			const projectId = currentFragment.yjsUrl?.slice(4);

			if (projectId) {
				await collabService.updateDocumentContent(
					projectId,
					file.documentId,
					updater
				);
			}
		}

		let currentContent = '';
		if (file.content) {
			currentContent = typeof file.content === 'string'
				? file.content
				: new TextDecoder().decode(file.content);
		}

		const newContent = updater(currentContent);
		await fileStorageService.updateFileContent(file.id, newContent);
	}

	registerOpenFile(filePath: string): void {
		this.openBibFiles.add(filePath);
	}

	unregisterOpenFile(filePath: string): void {
		this.openBibFiles.delete(filePath);
	}

	private formatEntryForAppending(rawEntry: string): string {
		let formatted = rawEntry.trim();

		if (!formatted.endsWith('\n')) {
			formatted += '\n';
		}

		return formatted;
	}

	isImporting(entryKey: string): boolean {
		return this.importQueue.has(entryKey);
	}

	async getImportStatus(entryKey: string): Promise<ImportResult | null> {
		const importPromise = this.importQueue.get(entryKey);
		if (importPromise) {
			try {
				return await importPromise;
			} catch (error) {
				return {
					success: false,
					entryKey,
					error: error instanceof Error ? error.message : t('Unknown error')
				};
			}
		}
		return null;
	}

	clearQueue(): void {
		this.importQueue.clear();
	}
}

export const bibliographyImportService = BibliographyImportService.getInstance();