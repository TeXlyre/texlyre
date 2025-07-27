// src/services/BibliographyImportService.ts
import { fileStorageService } from './FileStorageService';
import { BibtexParser } from '../../extras/viewers/bibtex/BibtexParser';

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

export class BibliographyImportService {
	private static instance: BibliographyImportService;
	private importQueue: Map<string, Promise<ImportResult>> = new Map();
	private notificationCallbacks: Array<(result: ImportResult) => void> = [];

	static getInstance(): BibliographyImportService {
		if (!BibliographyImportService.instance) {
			BibliographyImportService.instance = new BibliographyImportService();
		}
		return BibliographyImportService.instance;
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
			const existingEntries = BibtexParser.parse(currentContent);
			const existingEntry = existingEntries.find(entry => entry.id === entryKey);

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

			// Update file
			await fileStorageService.updateFileContent(targetFile.id, newContent);

			// Dispatch file tree refresh event
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
				file.name.endsWith('.bib') &&
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
		existingEntry: any,
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
				if (file.name.endsWith('.bib') && !file.isDeleted && file.content) {
					const content = typeof file.content === 'string'
						? file.content
						: new TextDecoder().decode(file.content);

					const entries = BibtexParser.parse(content);
					entries.forEach(entry => allKeys.add(entry.id));
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