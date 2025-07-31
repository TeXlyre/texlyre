// src/extensions/codemirror/PathAndBibAutocompleteExtension.ts - Enhanced with Bibliography Support
import { type CompletionContext, type CompletionResult, type CompletionSource } from "@codemirror/autocomplete";
import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { ViewPlugin, type EditorView } from "@codemirror/view";

import type { FileNode, FilePathCache } from "../../types/files";
import { filePathCacheService } from "../../services/FilePathCacheService";
import { fileStorageService } from "../../services/FileStorageService";
import { BibtexParser } from "../../../extras/viewers/bibtex/BibtexParser";

export const updateFileCache = StateEffect.define<FileNode[]>();

interface BibliographyEntry {
	key: string;
	title: string;
	authors: string[];
	year: string;
	source: 'local';
	journal?: string;
	rawEntry?: string;
	filePath?: string;
	entryType?: string;
}

const filePathCacheField = StateField.define<FilePathCache>({
	create() {
		return {
			files: [],
			imageFiles: [],
			bibFiles: [],
			texFiles: [],
			allFiles: [],
			lastUpdate: 0,
		};
	},
	update(cache, tr) {
		for (const effect of tr.effects) {
			if (effect.is(updateFileCache)) {
				return filePathCacheService.buildCacheFromFiles(effect.value);
			}
		}
		return cache;
	},
});

const bibliographyCacheField = StateField.define<BibliographyEntry[]>({
	create() {
		return [];
	},
	update(cache, tr) {
		return cache;
	},
});

const latexCommandPatterns = [
	{
		commands: ['includegraphics', 'includesvg'],
		pattern: /\\(includegraphics|includesvg)(?:\[[^\]]*\])?\{([^}]*)/,
		fileTypes: 'images' as const,
	},
	{
		commands: ['input', 'include', 'subfile'],
		pattern: /\\(input|include|subfile)\{([^}]*)/,
		fileTypes: 'tex' as const,
	},
	{
		commands: ['bibliography', 'addbibresource'],
		pattern: /\\(bibliography|addbibresource)(?:\[[^\]]*\])?\{([^}]*)/,
		fileTypes: 'bib' as const,
	},
	{
		commands: ['lstinputlisting', 'verbatiminput'],
		pattern: /\\(lstinputlisting|verbatiminput)(?:\[[^\]]*\])?\{([^}]*)/,
		fileTypes: 'all' as const,
	},
];

const citationCommandPatterns = [
	{
		commands: ['cite', 'citep', 'citet', 'autocite', 'textcite', 'parencite', 'footcite', 'fullcite'],
		pattern: /\\(cite|citep|citet|autocite|textcite|parencite|footcite|fullcite)\w*(?:\[[^\]]*\])?(?:\[[^\]]*\])?\{([^}]*)/,
		type: 'citation' as const,
	},
];

const bibtexEntryPatterns = [
	{
		pattern: /@([a-zA-Z]*)\{([^,}]*)/,
		type: 'bibtex-entry' as const,
	},
];

class EnhancedAutocompleteProcessor {
	private view: EditorView;
	private currentFilePath: string = '';
	private bibliographyCache: BibliographyEntry[] = [];

	constructor(view: EditorView) {
		this.view = view;

		setTimeout(() => {
			filePathCacheService.onCacheUpdate(this.handleCacheUpdate);
			filePathCacheService.onFilePathUpdate(this.handleFilePathUpdate);
			this.initializeBibliographyCache();
		}, 0);
	}

	destroy() {
		filePathCacheService.offCacheUpdate(this.handleCacheUpdate);
		filePathCacheService.offFilePathUpdate(this.handleFilePathUpdate);
	}

	private handleCacheUpdate = (files: FileNode[]) => {
		this.view.dispatch({
			effects: updateFileCache.of(files)
		});
		this.updateBibliographyCache();
	};

	private handleFilePathUpdate = (filePath: string) => {
		this.currentFilePath = filePath;
	};

	private async initializeBibliographyCache() {
		await this.updateBibliographyCache();
	}

	private async updateBibliographyCache() {
		try {
			const localEntries = await this.getLocalBibliographyEntries();
			this.bibliographyCache = localEntries;
		} catch (error) {
			console.error('[EnhancedAutocomplete] Error updating bibliography cache:', error);
		}
	}

	private async getLocalBibliographyEntries(): Promise<BibliographyEntry[]> {
		try {
			const allFiles = await fileStorageService.getAllFiles();
			const bibFiles = allFiles.filter(file =>
				file.name.endsWith('.bib') &&
				!file.isDeleted &&
				file.content
			);

			const allEntries: BibliographyEntry[] = [];

			for (const bibFile of bibFiles) {
				const content = typeof bibFile.content === 'string'
					? bibFile.content
					: new TextDecoder().decode(bibFile.content);

				const parsedEntries = BibtexParser.parse(content);
				const entries: BibliographyEntry[] = parsedEntries.map(entry => ({
					key: entry.id,
					title: entry.fields.title || '',
					authors: entry.fields.author ? [entry.fields.author] : [],
					year: entry.fields.year || '',
					source: 'local' as const,
					journal: entry.fields.journal || entry.fields.booktitle || '',
					rawEntry: BibtexParser.serializeEntry(entry),
					filePath: bibFile.path,
					entryType: entry.type
				}));

				allEntries.push(...entries);
			}

			return allEntries;
		} catch (error) {
			console.error('[EnhancedAutocomplete] Error getting local bibliography entries:', error);
			return [];
		}
	}

	setCurrentFilePath(filePath: string) {
		this.currentFilePath = filePath;
	}

	update(update: any) {
		// No need to update bibliography cache from state field
	}

	private findLatexCommand(context: CompletionContext): { command: string; partial: string; fileTypes: 'images' | 'tex' | 'bib' | 'all' } | null {
		const line = context.state.doc.lineAt(context.pos);
		const lineText = line.text;
		const posInLine = context.pos - line.from;

		for (const { pattern, fileTypes } of latexCommandPatterns) {
			const matches = Array.from(lineText.matchAll(new RegExp(pattern.source, 'g')));

			for (const match of matches) {
				const matchStart = match.index!;
				const commandEnd = matchStart + match[0].length;

				if (posInLine >= matchStart && posInLine <= commandEnd + 1) {
					return {
						command: match[1],
						partial: match[2] || '',
						fileTypes,
					};
				}
			}
		}

		return null;
	}

	private findCitationCommand(context: CompletionContext): { command: string; partial: string; type: 'citation' } | null {
		const line = context.state.doc.lineAt(context.pos);
		const lineText = line.text;
		const posInLine = context.pos - line.from;

		for (const { pattern, type } of citationCommandPatterns) {
			const matches = Array.from(lineText.matchAll(new RegExp(pattern.source, 'g')));

			for (const match of matches) {
				const matchStart = match.index!;
				const commandEnd = matchStart + match[0].length;

				if (posInLine >= matchStart && posInLine <= commandEnd + 1) {
					return {
						command: match[1],
						partial: match[2] || '',
						type,
					};
				}
			}
		}

		return null;
	}
	private findBibtexEntry(context: CompletionContext): { entryType: string; partial: string; type: 'bibtex-entry' } | null {
		const line = context.state.doc.lineAt(context.pos);
		const lineText = line.text;
		const posInLine = context.pos - line.from;

		for (const { pattern, type } of bibtexEntryPatterns) {
			const matches = Array.from(lineText.matchAll(new RegExp(pattern.source, 'g')));

			for (const match of matches) {
				const matchStart = match.index!;
				const commandEnd = matchStart + match[0].length;

				if (posInLine >= matchStart && posInLine <= commandEnd + 1) {
					return {
						entryType: match[1] || '',
						partial: match[2] || '',
						type,
					};
				}
			}
		}

		return null;
	}

	private isInLatexFile(): boolean {
		return this.currentFilePath.endsWith('.tex') || this.currentFilePath.endsWith('.latex');
	}

	private isInBibFile(): boolean {
		return this.currentFilePath.endsWith('.bib') || this.currentFilePath.endsWith('.bibtex');
	}

	getBibliographyCompletions = (context: CompletionContext): CompletionResult | null => {
		const cache = this.bibliographyCache;
		if (!cache || cache.length === 0) return null;

		const citationInfo = this.findCitationCommand(context);
		const bibtexInfo = this.findBibtexEntry(context);

		const isCurrentlyInBibFile = this.isInBibFile();
		const isCurrentlyInLatexFile = this.isInLatexFile();

		if (isCurrentlyInLatexFile && citationInfo) {
			return this.handleLatexCitationCompletion(context, citationInfo, cache);
		}

		if (isCurrentlyInBibFile && bibtexInfo) {
			return this.handleBibtexEntryCompletion(context, bibtexInfo, cache);
		}

		return null;
	};

	private handleLatexCitationCompletion(context: CompletionContext, citationInfo: any, cache: BibliographyEntry[]): CompletionResult {
		const partial = citationInfo.partial;
		const filteredEntries = cache.filter(entry =>
			!partial ||
			entry.key.toLowerCase().includes(partial.toLowerCase()) ||
			entry.title.toLowerCase().includes(partial.toLowerCase()) ||
			entry.authors.some(author => author.toLowerCase().includes(partial.toLowerCase()))
		);

		const options = this.createCitationOptions(filteredEntries, partial);
		if (options.length === 0) return null;

		const partialStart = this.getCitationCompletionStart(context, citationCommandPatterns);

		return {
			from: partialStart,
			options,
			validFor: /^[^}]*$/,
		};
	}

	private handleBibtexEntryCompletion(context: CompletionContext, bibtexInfo: any, cache: BibliographyEntry[]): CompletionResult {
		const partial = bibtexInfo.partial;
		const entryType = bibtexInfo.entryType.toLowerCase();

		let filteredEntries = cache;
		if (entryType) {
			filteredEntries = cache.filter(entry =>
				entry.entryType?.toLowerCase() === entryType &&
				(!partial || entry.key.toLowerCase().includes(partial.toLowerCase()))
			);
		} else {
			filteredEntries = cache.filter(entry =>
				!partial || entry.key.toLowerCase().includes(partial.toLowerCase())
			);
		}

		const options = this.createBibtexEntryOptions(filteredEntries, partial, context);
		if (options.length === 0) return null;

		const partialStart = this.getBibtexCompletionStart(context, bibtexEntryPatterns);

		return {
			from: partialStart,
			options,
			validFor: /^[^}]*$/,
		};
	}

	private createCitationOptions(entries: BibliographyEntry[], partial: string) {
		return entries
			.sort((a, b) => {
				const aStartsWith = a.key.toLowerCase().startsWith(partial.toLowerCase());
				const bStartsWith = b.key.toLowerCase().startsWith(partial.toLowerCase());
				if (aStartsWith && !bStartsWith) return -1;
				if (!aStartsWith && bStartsWith) return 1;
				return a.key.localeCompare(b.key);
			})
			.slice(0, 20)
			.map(entry => {
				const displayTitle = entry.title.length > 50
					? `${entry.title.substring(0, 47)}...`
					: entry.title;

				const authors = entry.authors.length > 0
					? entry.authors.join(', ')
					: 'Unknown author';

				return {
					label: entry.key,
					detail: `${displayTitle} ✓`,
					info: `Local | ${authors} (${entry.year})\n${entry.journal}`,
					apply: (view: EditorView, completion: any, from: number, to: number) => {
						view.dispatch({
							changes: { from, to, insert: entry.key }
						});
					},
					boost: 10,
				};
			});
	}

	private createBibtexEntryOptions(entries: BibliographyEntry[], partial: string, context: CompletionContext) {
		return entries
			.sort((a, b) => {
				const aStartsWith = a.key.toLowerCase().startsWith(partial.toLowerCase());
				const bStartsWith = b.key.toLowerCase().startsWith(partial.toLowerCase());
				if (aStartsWith && !bStartsWith) return -1;
				if (!aStartsWith && bStartsWith) return 1;
				return a.key.localeCompare(b.key);
			})
			.slice(0, 20)
			.map(entry => {
				const displayTitle = entry.title.length > 50
					? `${entry.title.substring(0, 47)}...`
					: entry.title;

				const authors = entry.authors.length > 0
					? entry.authors.join(', ')
					: 'Unknown author';

				return {
					label: entry.key,
					detail: `${displayTitle} ✓`,
					info: `Local | ${authors} (${entry.year})\n${entry.journal}`,
					apply: async (view: EditorView, completion: any, from: number, to: number) => {
						let fullEntry = entry.rawEntry;
						if (!fullEntry) {
							const fields = [];
							if (entry.title) fields.push(`  title = {${entry.title}}`);
							if (entry.authors.length > 0) fields.push(`  author = {${entry.authors.join(' and ')}}`);
							if (entry.year) fields.push(`  year = {${entry.year}}`);
							if (entry.journal) fields.push(`  journal = {${entry.journal}}`);

							fullEntry = `@${entry.entryType || 'article'}{${entry.key},\n${fields.join(',\n')}\n}`;
						}

						const line = view.state.doc.lineAt(from);
						const lineStart = line.from;
						const currentLine = line.text;

						const atIndex = currentLine.indexOf('@');
						if (atIndex !== -1) {
							const replaceFrom = lineStart + atIndex;
							view.dispatch({
								changes: { from: replaceFrom, to, insert: fullEntry }
							});
						} else {
							view.dispatch({
								changes: { from, to, insert: fullEntry }
							});
						}
					},
					boost: 10,
				};
			});
	}

	private getCitationCompletionStart(context: CompletionContext, patterns: any[]): number {
		const line = context.state.doc.lineAt(context.pos);
		const lineText = line.text;
		const posInLine = context.pos - line.from;

		let partialStart = posInLine;
		for (const { pattern } of patterns) {
			const match = lineText.match(pattern);
			if (match && match.index !== undefined) {
				const bracePos = lineText.indexOf('{', match.index);
				if (bracePos !== -1 && posInLine > bracePos) {
					partialStart = line.from + bracePos + 1;
					break;
				}
			}
		}
		return partialStart;
	}

	private getBibtexCompletionStart(context: CompletionContext, patterns: any[]): number {
		const line = context.state.doc.lineAt(context.pos);
		const lineText = line.text;
		const posInLine = context.pos - line.from;

		let partialStart = posInLine;
		for (const { pattern } of patterns) {
			const match = lineText.match(pattern);
			if (match && match.index !== undefined) {
				const bracePos = lineText.indexOf('{', match.index);
				if (bracePos !== -1 && posInLine > bracePos) {
					partialStart = line.from + bracePos + 1;
					break;
				}
			}
		}
		return partialStart;
	}

	getFilePathCompletions = (context: CompletionContext): CompletionResult | null => {
		const commandInfo = this.findLatexCommand(context);
		if (!commandInfo) return null;

		const cache = context.state.field(filePathCacheField, false);
		if (!cache || cache.files.length === 0) return null;

		const { partial, fileTypes } = commandInfo;

		let candidates: string[];
		switch (fileTypes) {
			case 'images':
				candidates = cache.imageFiles;
				break;
			case 'tex':
				candidates = cache.texFiles;
				break;
			case 'bib':
				candidates = cache.bibFiles;
				break;
			case 'all':
			default:
				candidates = cache.allFiles;
				break;
		}

		const options = candidates
			.map(filePath => {
				const relativePath = filePathCacheService.getRelativePath(this.currentFilePath, filePath);
				const fileName = filePath.substring(filePath.lastIndexOf('/') + 1);

				const displayPath = fileTypes === 'bib' && relativePath.endsWith('.bib')
					? relativePath.slice(0, -4)
					: relativePath;

				return {
					fullPath: filePath,
					relativePath: displayPath,
					fileName,
				};
			})
			.filter(({ relativePath }) =>
				!partial || relativePath.toLowerCase().includes(partial.toLowerCase())
			)
			.sort((a, b) => {
				const aStartsWith = a.relativePath.toLowerCase().startsWith(partial.toLowerCase());
				const bStartsWith = b.relativePath.toLowerCase().startsWith(partial.toLowerCase());
				if (aStartsWith && !bStartsWith) return -1;
				if (!aStartsWith && bStartsWith) return 1;

				const lenDiff = a.relativePath.length - b.relativePath.length;
				if (lenDiff !== 0) return lenDiff;

				return a.relativePath.localeCompare(b.relativePath);
			})
			.slice(0, 20)
			.map(({ relativePath, fileName, fullPath }) => ({
				label: relativePath,
				detail: fileName !== relativePath ? fileName : undefined,
				info: fullPath,
				apply: relativePath,
				boost: partial && relativePath.toLowerCase().startsWith(partial.toLowerCase()) ? 10 : 0,
			}));

		if (options.length === 0) return null;

		const line = context.state.doc.lineAt(context.pos);
		const lineText = line.text;
		const posInLine = context.pos - line.from;

		let partialStart = posInLine;
		for (const { pattern } of latexCommandPatterns) {
			const match = lineText.match(pattern);
			if (match && match.index !== undefined) {
				const bracePos = lineText.indexOf('{', match.index);
				if (bracePos !== -1 && posInLine > bracePos) {
					partialStart = line.from + bracePos + 1;
					break;
				}
			}
		}

		return {
			from: partialStart,
			options,
			validFor: /^[^}]*$/,
		};
	};

	getCompletions = (context: CompletionContext): CompletionResult | null => {
		const bibResult = this.getBibliographyCompletions(context);
		if (bibResult) return bibResult;

		const fileResult = this.getFilePathCompletions(context);
		if (fileResult) return fileResult;

		return null;
	};
}

let globalProcessor: EnhancedAutocompleteProcessor | null = null;

export function createFilePathAutocompleteExtension(currentFilePath: string = ''): [Extension, Extension, CompletionSource] {
	const plugin = ViewPlugin.fromClass(
		class {
			processor: EnhancedAutocompleteProcessor;

			constructor(view: EditorView) {
				this.processor = new EnhancedAutocompleteProcessor(view);
				this.processor.setCurrentFilePath(currentFilePath);
				globalProcessor = this.processor;
			}

			update(update: any) {
				this.processor?.update(update);
			}

			destroy() {
				this.processor?.destroy();
				if (globalProcessor === this.processor) {
					globalProcessor = null;
				}
			}
		}
	);

	const completionSource: CompletionSource = (context: CompletionContext) => {
		return globalProcessor?.getCompletions(context) || null;
	};

	const stateExtensions = [filePathCacheField, bibliographyCacheField];

	return [
		stateExtensions,
		plugin,
		completionSource,
	];
}

export function setCurrentFilePath(view: EditorView, filePath: string) {
	if (globalProcessor && typeof globalProcessor.setCurrentFilePath === 'function') {
		globalProcessor.setCurrentFilePath(filePath);
	}
}

export function refreshBibliographyCache(view: EditorView) {
	if (globalProcessor) {
		globalProcessor['updateBibliographyCache']();
	}
}