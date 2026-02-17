// src/services/BibliographyImportService.ts
import { t } from '@/i18n';
import { isBibFile } from '../utils/fileUtils';
import { fileStorageService } from './FileStorageService';
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
				const fieldNameMatch = fieldsContent.slice(fieldPos).match(/^(\w+)\s*=/);
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
		const index = content.indexOf(entry.rawEntry);
		if (index === -1) return null;

		return {
			start: index,
			end: index + entry.rawEntry.length
		};
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

	private async performImport(
		entryKey: string,
		rawEntry: string,
		options: ImportOptions
	): Promise<ImportResult> {
		try {
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
			const existingEntry = existingEntries.find(entry => entry.key === entryKey);

			if (existingEntry) {
				const duplicateResult = await this.handleDuplicate(
					entryKey,
					rawEntry,
					existingEntry,
					options
				);

				if (!duplicateResult.shouldImport) {
					return {
						success: true,
						entryKey,
						filePath: targetFile.path,
						isDuplicate: true,
						action: 'skipped'
					};
				}

				if (duplicateResult.newKey && duplicateResult.newKey !== entryKey) {
					rawEntry = rawEntry.replace(entryKey, duplicateResult.newKey);
					entryKey = duplicateResult.newKey;
				}
			}

			const entryToAppend = this.formatEntryForAppending(rawEntry);
			const newContent = currentContent.trim()
				? `${currentContent.trim()}\n\n${entryToAppend}`
				: entryToAppend;

			await fileStorageService.updateFileContent(targetFile.id, newContent);
			document.dispatchEvent(new CustomEvent('refresh-file-tree'));

			return {
				success: true,
				entryKey,
				filePath: targetFile.path,
				action: existingEntry ? 'replaced' : 'imported'
			};

		} catch (error) {
			console.error(`Error importing entry ${entryKey}:`, error);
			return {
				success: false,
				entryKey,
				error: error instanceof Error ? error.message : t('Import failed')
			};
		}
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