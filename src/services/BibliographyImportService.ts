// src/services/BibliographyImportService.ts
import { fileStorageService } from './FileStorageService';

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

export interface BibEntry {
	key: string;
	type: string;
	fields: Record<string, string>;
	rawEntry: string;
}

// Simple BibTeX parser interface - plugins can provide their own implementation
export interface BibTexParser {
	parse(content: string): BibEntry[];
	serialize(entries: BibEntry[]): string;
	serializeEntry(entry: BibEntry): string;
	findEntryPosition(content: string, entry: BibEntry): { start: number; end: number } | null;
	updateEntryInContent(content: string, entry: BibEntry): string;
}

// Default simple parser implementation
class SimpleBibTexParser implements BibTexParser {
	parse(content: string): BibEntry[] {
		const entries: BibEntry[] = [];
		const entryRegex = /@(\w+)\s*\{\s*([^,\s]+)\s*,?\s*([\s\S]*?)\n\s*\}/g;
		let match;

		while ((match = entryRegex.exec(content)) !== null) {
			const [fullMatch, type, key, fieldsString] = match;
			const fields: Record<string, string> = {};

			// Simple field parsing
			const fieldRegex = /(\w+)\s*=\s*\{([^}]*)\}/g;
			let fieldMatch;
			while ((fieldMatch = fieldRegex.exec(fieldsString)) !== null) {
				fields[fieldMatch[1].toLowerCase()] = fieldMatch[2];
			}

			entries.push({
				key: key.trim(),
				type: type.toLowerCase(),
				fields,
				rawEntry: fullMatch
			});
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

		return `@${entry.type}{${entry.key},\n${fieldsString}\n}`;
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
	private parser: BibTexParser = new SimpleBibTexParser();

	static getInstance(): BibliographyImportService {
		if (!BibliographyImportService.instance) {
			BibliographyImportService.instance = new BibliographyImportService();
		}
		return BibliographyImportService.instance;
	}

	// Allow plugins to provide their own parser
	setParser(parser: BibTexParser): void {
		this.parser = parser;
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
		// Check if already importing this entry
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
			// Find target file
			const targetFile = await this.getTargetFile(options.targetFile);
			if (!targetFile) {
				return {
					success: false,
					entryKey,
					error: 'No target bibliography file available'
				};
			}

			// Get current file content
			let currentContent = '';
			if (targetFile.content) {
				currentContent = typeof targetFile.content === 'string'
					? targetFile.content
					: new TextDecoder().decode(targetFile.content);
			}

			// Parse existing entries
			const existingEntries = this.parser.parse(currentContent);
			const existingEntry = existingEntries.find(entry => entry.key === entryKey);

			// Handle duplicates
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

			// Prepare content to append
			const entryToAppend = this.formatEntryForAppending(rawEntry);
			const newContent = currentContent.trim()
				? `${currentContent.trim()}\n\n${entryToAppend}\n`
				: `${entryToAppend}\n`;

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
				error: error instanceof Error ? error.message : 'Unknown error'
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

			// Find first available .bib file
			const allFiles = await fileStorageService.getAllFiles();
			const bibFile = allFiles.find(file =>
				(file.name.endsWith('.bib') || file.name.endsWith('.bibtex')) &&
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
				// For now, default to keep-local
				// In a full implementation, this would show a dialog
				return { shouldImport: false };

			default:
				return { shouldImport: false };
		}
	}

	private async generateUniqueKey(baseKey: string): Promise<string> {
		try {
			const allFiles = await fileStorageService.getAllFiles();
			const allKeys = new Set<string>();

			// Collect all existing keys
			for (const file of allFiles) {
				if ((file.name.endsWith('.bib') || file.name.endsWith('.bibtex')) &&
					!file.isDeleted && file.content) {
					const content = typeof file.content === 'string'
						? file.content
						: new TextDecoder().decode(file.content);

					const entries = this.parser.parse(content);
					entries.forEach(entry => allKeys.add(entry.key));
				}
			}

			// Generate unique key
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
		// Ensure proper formatting
		let formatted = rawEntry.trim();

		// Add newline at end if not present
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
					error: error instanceof Error ? error.message : 'Unknown error'
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