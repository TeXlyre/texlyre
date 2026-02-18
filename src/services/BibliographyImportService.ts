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

	async importEntry(
		entryKey: string,
		rawEntry: string,
		options: ImportOptions = {}
	): Promise<ImportResult> {
		const existingImport = this.importQueue.get(entryKey);
		if (existingImport) {
			return existingImport;
		}

		const importPromise = this.performImport(entryKey, rawEntry, options);
		this.importQueue.set(entryKey, importPromise);

		try {
			const result = await importPromise;
			this.notifyCallbacks(result);
			return result;
		} finally {
			this.importQueue.delete(entryKey);
		}
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

	private async performDelete(
		entryKey: string,
		existingEntry: BibEntry,
		targetFile: any,
		isFileOpen: boolean
	): Promise<ImportResult> {
		const computeDelete = (content: string): string => {
			const position = this.parser.findEntryPosition(content, existingEntry);
			if (!position) return content;
			let end = position.end;
			while (end < content.length && /[\r\n\s]/.test(content[end])) end++;
			return content.substring(0, position.start) + content.substring(end);
		};

		if (isFileOpen) {
			document.dispatchEvent(new CustomEvent('bib-entry-imported', {
				detail: { entry: { key: existingEntry.key, action: 'delete' }, filePath: targetFile.path }
			}));
		} else {
			await this.updateContent(targetFile.path, computeDelete);
			document.dispatchEvent(new CustomEvent('refresh-file-tree'));
		}

		return { success: true, entryKey, filePath: targetFile.path, action: 'replaced' };
	}

	private async performUpdate(
		entryKey: string,
		rawEntry: string,
		existingEntry: BibEntry,
		targetFile: any,
		isFileOpen: boolean,
		remoteId?: string
	): Promise<ImportResult> {
		const incomingParsed = this.parser.parse(rawEntry);
		const remoteFieldKey = existingEntry.fields['external-id'] ? 'external-id' : 'remote-id';
		const resolvedRemoteId = remoteId || existingEntry.remoteId || existingEntry.fields[remoteFieldKey];

		const updatedFields = { ...incomingParsed[0]?.fields };
		if (resolvedRemoteId) {
			updatedFields[remoteFieldKey] = resolvedRemoteId;
		}

		const updatedEntry: BibEntry = {
			key: existingEntry.key,
			entryType: incomingParsed[0]?.entryType || existingEntry.entryType,
			fields: updatedFields,
			rawEntry,
			remoteId: resolvedRemoteId
		};

		const computeUpdate = (content: string): string => {
			const position = this.parser.findEntryPosition(content, existingEntry);
			if (!position) return content;
			return content.substring(0, position.start) +
				this.parser.serializeEntry(updatedEntry) +
				content.substring(position.end);
		};

		if (isFileOpen) {
			document.dispatchEvent(new CustomEvent('bib-entry-imported', {
				detail: {
					entry: {
						key: updatedEntry.key,
						rawEntry: this.parser.serializeEntry(updatedEntry),
						action: 'update',
						oldKey: existingEntry.key
					},
					filePath: targetFile.path
				}
			}));
		} else {
			await this.updateContent(targetFile.path, computeUpdate);
			document.dispatchEvent(new CustomEvent('refresh-file-tree'));
		}

		return { success: true, entryKey, filePath: targetFile.path, action: 'replaced' };
	}

	private async performInsert(
		entryKey: string,
		rawEntry: string,
		targetFile: any,
		isFileOpen: boolean,
		isDuplicate: boolean
	): Promise<ImportResult> {
		const entryToAppend = this.formatEntryForAppending(rawEntry);

		if (isFileOpen) {
			document.dispatchEvent(new CustomEvent('bib-entry-imported', {
				detail: { entry: { key: entryKey, rawEntry: entryToAppend }, filePath: targetFile.path }
			}));
		} else {
			await this.updateContent(targetFile.path, (currentContent) =>
				currentContent.trim() ? `${currentContent.trim()}\n\n${entryToAppend}` : entryToAppend
			);
			document.dispatchEvent(new CustomEvent('refresh-file-tree'));
		}

		return { success: true, entryKey, filePath: targetFile.path, action: isDuplicate ? 'replaced' : 'imported' };
	}

	private async performImport(
		entryKey: string,
		rawEntry: string,
		options: ImportOptions
	): Promise<ImportResult> {
		try {
			const action = options.action || 'import';
			const targetFile = await this.getTargetFile(options.targetFile);
			if (!targetFile) {
				return {
					success: false,
					entryKey,
					error: 'No target bibliography file selected. Please select a target file in the JabRef panel.'
				};
			}

			let currentContent = '';
			if (targetFile.content) {
				currentContent = typeof targetFile.content === 'string'
					? targetFile.content
					: new TextDecoder().decode(targetFile.content);
			}

			const existingEntries = this.parser.parse(currentContent);
			const remoteId = options.remoteId;

			const existingEntry = existingEntries.find(entry => {
				if (entry.key === entryKey) return true;
				if (remoteId) {
					const localRemoteId = entry.remoteId
						|| entry.fields?.['remote-id']
						|| entry.fields?.['external-id'];
					if (localRemoteId && localRemoteId === remoteId) return true;
				}
				return false;
			});

			const isFileOpen = this.openBibFiles.has(targetFile.path);

			if (action === 'delete') {
				if (!existingEntry) return { success: false, entryKey, error: 'Entry not found' };
				return this.performDelete(entryKey, existingEntry, targetFile, isFileOpen);
			}

			if (action === 'update') {
				if (!existingEntry) return { success: false, entryKey, error: 'Entry not found' };
				return this.performUpdate(entryKey, rawEntry, existingEntry, targetFile, isFileOpen, remoteId);
			}

			if (existingEntry && existingEntry.key !== entryKey && remoteId) {
				return this.performImport(entryKey, rawEntry, { ...options, action: 'update' });
			}

			if (existingEntry) {
				const duplicateResult = await this.handleDuplicate(entryKey, rawEntry, existingEntry, options);
				if (!duplicateResult.shouldImport) {
					return { success: true, entryKey, filePath: targetFile.path, isDuplicate: true, action: 'skipped' };
				}
				if (duplicateResult.newKey && duplicateResult.newKey !== entryKey) {
					rawEntry = rawEntry.replace(entryKey, duplicateResult.newKey);
					entryKey = duplicateResult.newKey;
				}
			}

			return this.performInsert(entryKey, rawEntry, targetFile, isFileOpen, !!existingEntry);

		} catch (error) {
			console.error(`[BibliographyImportService] Error importing entry ${entryKey}:`, error);
			return {
				success: false,
				entryKey,
				error: error instanceof Error ? error.message : t('Import failed')
			};
		}
	}

	registerOpenFile(filePath: string): void {
		this.openBibFiles.add(filePath);
	}

	unregisterOpenFile(filePath: string): void {
		this.openBibFiles.delete(filePath);
	}

	private async getTargetFile(targetPath?: string) {
		try {
			if (targetPath) {
				const file = await fileStorageService.getFileByPath(targetPath);
				if (file && !file.isDeleted) {
					return file;
				}
			}

			const allFiles = await fileStorageService.getAllFiles();
			const bibFile = allFiles.find(file =>
				isBibFile(file.name) &&
				!file.isDeleted
			);

			return bibFile || null;
		} catch (error) {
			console.error('Error finding target file:', error);
			return null;
		}
	}

	private async handleDuplicate(
		entryKey: string,
		rawEntry: string,
		existingEntry: BibEntry,
		options: ImportOptions
	): Promise<{ shouldImport: boolean; newKey?: string }> {
		const duplicateHandling = options.duplicateHandling || 'keep-local';

		switch (duplicateHandling) {
			case 'keep-local':
				return { shouldImport: false };

			case 'replace':
				return { shouldImport: true };

			case 'rename':
				const newKey = await this.generateUniqueKey(entryKey);
				return { shouldImport: true, newKey };

			case 'ask':
				return { shouldImport: false };

			default:
				return { shouldImport: false };
		}
	}

	private async generateUniqueKey(baseKey: string): Promise<string> {
		try {
			const allFiles = await fileStorageService.getAllFiles();
			const allKeys = new Set<string>();

			for (const file of allFiles) {
				if (isBibFile(file.name) && !file.isDeleted && file.content) {
					const content = typeof file.content === 'string'
						? file.content
						: new TextDecoder().decode(file.content);

					const entries = this.parser.parse(content);
					entries.forEach(entry => allKeys.add(entry.key));
				}
			}

			let counter = 1;
			let newKey = `${baseKey}_${counter}`;
			while (allKeys.has(newKey)) {
				counter++;
				newKey = `${baseKey}_${counter}`;
			}

			return newKey;
		} catch (error) {
			console.error('Error generating unique key:', error);
			return `${baseKey}_${Date.now()}`;
		}
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