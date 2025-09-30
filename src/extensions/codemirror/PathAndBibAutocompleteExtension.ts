// src/extensions/codemirror/PathAndBibAutocompleteExtension.ts
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
			typstFiles: [],
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

const typstCommandPatterns = [
	{
		commands: ['include'],
		pattern: /#include\s+"/,
		fileTypes: 'typst' as const,
	},
	{
		commands: ['image'],
		pattern: /\bimage\s*\(\s*"/,
		fileTypes: 'images' as const,
	},
	{
		commands: ['read'],
		pattern: /\bread\s*\(\s*"/,
		fileTypes: 'all' as const,
	},
	{
		commands: ['csv'],
		pattern: /\bcsv\s*\(\s*"/,
		fileTypes: 'data' as const,
	},
	{
		commands: ['json', 'yaml', 'toml'],
		pattern: /\b(json|yaml|toml)\s*\(\s*"/,
		fileTypes: 'data' as const,
	},
	{
		commands: ['bibliography'],
		pattern: /#bibliography\("/,
		fileTypes: 'bib' as const,
	}
];

const typstCitationPatterns = [
	{
		commands: ['cite'],
		pattern: /#cite\s*\(\s*</,
		type: 'citation' as const,
	},
	{
		commands: ['cite-label'],
		pattern: /#cite\s*\(\s*label\s*\(\s*"/,
		type: 'citation' as const,
	},
];

const citationCommandPatterns = [
	{
		commands: ['cite', 'citep', 'citet', 'autocite', 'textcite', 'parencite', 'footcite', 'fullcite'],
		pattern: /\\(cite|citep|citet|autocite|textcite|parencite|footcite|fullcite)\w*(?:\[[^\]]*\])?(?:\[[^\]]*\])?\{([^}]*)/,
		type: 'citation' as const,
	},
	...typstCitationPatterns,
];

const bibtexEntryPatterns = [
	{
		pattern: /@([a-zA-Z]*)\{([^,}]*)/,
		type: 'bibtex-entry' as const,
	},
];

class AutocompleteProcessor {
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
			console.error('Error updating bibliography cache:', error);
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
			console.error('Error getting local bibliography entries:', error);
			return [];
		}
	}

	setCurrentFilePath(filePath: string) {
		this.currentFilePath = filePath;
	}

	update(update: any) {
		// No need to update bibliography cache from state field
	}

	private findLatexCommand(context: CompletionContext): { command: string; partial: string; fileTypes: string } | null {
		const line = context.state.doc.lineAt(context.pos);
		const lineText = line.text;
		const posInLine = context.pos - line.from;

		for (const { pattern, fileTypes } of latexCommandPatterns) {
			const matches = Array.from(lineText.matchAll(new RegExp(pattern.source, 'g')));

			for (const match of matches) {
				const matchStart = match.index!;
				const braceStart = lineText.indexOf('{', matchStart);
				const braceEnd = lineText.indexOf('}', braceStart);

				if (braceStart !== -1 && posInLine > braceStart && (braceEnd === -1 || posInLine <= braceEnd)) {
					const partial = lineText.substring(braceStart + 1, posInLine);
					return { command: match[1], partial, fileTypes };
				}
			}
		}

		return null;
	}

	private findTypstCommand(context: CompletionContext): { command: string; partial: string; fileTypes: string } | null {
		const line = context.state.doc.lineAt(context.pos);
		const lineText = line.text.substring(0, context.pos - line.from);

		for (const { pattern, fileTypes, commands } of typstCommandPatterns) {
			const match = lineText.match(pattern);

			if (match) {
				const quoteStart = match.index! + match[0].length - 1;
				const partial = lineText.substring(quoteStart + 1);
				return { command: commands[0], partial, fileTypes };
			}
		}

		return null;
	}

	private findCitationCommand(context: CompletionContext): { command: string; partial: string; type: 'citation' } | null {
		const line = context.state.doc.lineAt(context.pos);
		const lineText = line.text;
		const posInLine = context.pos - line.from;
		const textBeforeCursor = lineText.substring(0, posInLine);

		for (const { pattern, type } of citationCommandPatterns) {
			const isTypstCitation = pattern.source.includes('#cite');

			if (isTypstCitation) {
				const match = textBeforeCursor.match(pattern);

				if (match) {
					const delimiter = match[0].endsWith('<') ? '<' : '"';
					const delimiterPos = match.index! + match[0].length - 1;
					const partial = textBeforeCursor.substring(delimiterPos + 1).trim();
					return { command: 'cite', partial, type };
				}
			} else {
				const matches = Array.from(lineText.matchAll(new RegExp(pattern.source, 'g')));

				for (const match of matches) {
					const matchStart = match.index!;
					const braceStart = lineText.indexOf('{', matchStart);
					const braceEnd = lineText.indexOf('}', braceStart);

					if (braceStart !== -1 && posInLine > braceStart && (braceEnd === -1 || posInLine <= braceEnd)) {
						const textInBraces = lineText.substring(braceStart + 1, posInLine);
						const lastCommaPos = textInBraces.lastIndexOf(',');

						const partial = lastCommaPos !== -1
							? textInBraces.substring(lastCommaPos + 1).trim()
							: textInBraces.trim();

						return { command: match[1], partial, type };
					}
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

	private isInTypstFile(): boolean {
		return this.currentFilePath?.endsWith('.typ') ||
			this.currentFilePath?.endsWith('.typst') || false;
	}

	private isInBibFile(): boolean {
		return this.currentFilePath.endsWith('.bib') || this.currentFilePath.endsWith('.bibtex');
	}

	private async getExternalBibliographyEntries(): Promise<BibliographyEntry[]> {
		const allEntries: BibliographyEntry[] = [];

		try {
			const { pluginRegistry } = await import('../../plugins/PluginRegistry');
			const lspPlugins = pluginRegistry.getEnabledLSPPlugins();

			for (const plugin of lspPlugins) {
				if (plugin.getConnectionStatus() !== 'connected') continue;

				if ('getBibliographyEntries' in plugin) {
					try {
						const bibEntries = await (plugin as any).getBibliographyEntries();
						const entries: BibliographyEntry[] = bibEntries.map((entry: any) => ({
							key: entry.key,
							title: entry.fields?.title || entry.title || '',
							authors: entry.fields?.author ? [entry.fields.author] : entry.authors || [],
							year: entry.fields?.year || entry.year || '',
							source: 'external' as const,
							journal: entry.fields?.journal || entry.fields.booktitle || entry.journal || '',
							rawEntry: entry.rawEntry || this.formatBibEntry(entry),
							entryType: entry.entryType || entry.type || 'article'
						}));
						allEntries.push(...entries);
					} catch (error) {
						console.error(`Error getting bibliography entries from ${plugin.name}:`, error);
					}
				}
			}
		} catch (error) {
			console.error('Error getting external bibliography entries:', error);
		}

		return allEntries;
	}

	private formatBibEntry(entry: any): string {
		const fields: string[] = [];
		if (entry.title || entry.fields?.title) fields.push(`  title = {${entry.title || entry.fields.title}}`);
		if (entry.authors?.length > 0) fields.push(`  author = {${entry.authors.join(' and ')}}`);
		if (entry.fields?.author) fields.push(`  author = {${entry.fields.author}}`);
		if (entry.year || entry.fields?.year) fields.push(`  year = {${entry.year || entry.fields.year}}`);
		if (entry.journal || entry.fields?.journal) fields.push(`  journal = {${entry.journal || entry.fields.journal}}`);

		const entryType = entry.entryType || entry.type || 'article';
		return `@${entryType}{${entry.key},\n${fields.join(',\n')}\n}`;
	}

	getBibliographyCompletions = async (context: CompletionContext): Promise<CompletionResult | null> => {
		const cache = this.bibliographyCache;
		const citationInfo = this.findCitationCommand(context);
		const bibtexInfo = this.findBibtexEntry(context);

		const isCurrentlyInBibFile = this.isInBibFile();
		const isCurrentlyInLatexFile = this.isInLatexFile();
		const isCurrentlyInTypstFile = this.isInTypstFile();

		if (isCurrentlyInLatexFile && citationInfo) {
			return this.handleLatexCitationCompletion(context, citationInfo, cache);
		}

		if (isCurrentlyInTypstFile && citationInfo) {
			return this.handleTypstCitationCompletion(context, citationInfo, cache);
		}

		if (isCurrentlyInBibFile && bibtexInfo) {
			return await this.handleBibtexEntryCompletion(context, bibtexInfo, cache);
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

	private handleTypstCitationCompletion(context: CompletionContext, citationInfo: any, cache: BibliographyEntry[]): CompletionResult {
		const partial = citationInfo.partial;
		const filteredEntries = cache.filter(entry =>
			!partial ||
			entry.key.toLowerCase().includes(partial.toLowerCase()) ||
			entry.title.toLowerCase().includes(partial.toLowerCase()) ||
			entry.authors.some(author => author.toLowerCase().includes(partial.toLowerCase()))
		);

		const options = this.createCitationOptions(filteredEntries, partial);
		if (options.length === 0) return null;

		const partialStart = this.getCitationCompletionStart(context, typstCitationPatterns);

		return {
			from: partialStart,
			options,
			validFor: /^[^>\">]*$/,
		};
	}

	private async handleBibtexEntryCompletion(context: CompletionContext, bibtexInfo: any, _localCache: BibliographyEntry[]): Promise<CompletionResult | null> {
		const partial = bibtexInfo.partial;
		const entryType = bibtexInfo.entryType.toLowerCase();

		const externalEntries = await this.getExternalBibliographyEntries();

		let filteredEntries = externalEntries;
		if (entryType) {
			filteredEntries = externalEntries.filter(entry =>
				entry.entryType?.toLowerCase() === entryType &&
				(!partial || entry.key.toLowerCase().includes(partial.toLowerCase()))
			);
		} else {
			filteredEntries = externalEntries.filter(entry =>
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
						const insertText = entry.key;
						view.dispatch({
							changes: { from, to, insert: insertText },
							selection: { anchor: from + insertText.length }
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
					detail: `${displayTitle} ⬇️`,
					info: `External | ${authors} (${entry.year})\n${entry.journal}`,
					apply: async (view: EditorView, completion: any, from: number, to: number) => {
						const fullEntry = entry.rawEntry;

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

		for (const { pattern } of patterns) {
			const match = lineText.match(pattern);
			if (match && match.index !== undefined) {
				const isTypstCitation = match[0].startsWith('#cite');

				if (isTypstCitation) {
					const anglePos = lineText.indexOf('<', match.index);
					const quotePos = lineText.indexOf('"', match.index);

					if (anglePos !== -1 && posInLine > anglePos) {
						return line.from + anglePos + 1;
					}
					if (quotePos !== -1 && posInLine > quotePos) {
						return line.from + quotePos + 1;
					}
				} else {
					const bracePos = lineText.indexOf('{', match.index);
					if (bracePos !== -1 && posInLine > bracePos) {
						const textInBraces = lineText.substring(bracePos + 1, posInLine);
						const lastCommaPos = textInBraces.lastIndexOf(',');

						if (lastCommaPos !== -1) {
							return line.from + bracePos + 1 + lastCommaPos + 1;
						} else {
							return line.from + bracePos + 1;
						}
					}
				}
			}
		}
		return posInLine;
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
		const isCurrentlyInTypstFile = this.isInTypstFile();
		const commandInfo = isCurrentlyInTypstFile
			? this.findTypstCommand(context)
			: this.findLatexCommand(context);

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
			case 'typst':
				candidates = cache.typstFiles || [];
				break;
			case 'bib':
				candidates = cache.bibFiles;
				break;
			case 'data':
				candidates = cache.allFiles.filter(path =>
					/\.(csv|json|yaml|yml|toml)$/i.test(path)
				);
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
		const patterns = isCurrentlyInTypstFile ? typstCommandPatterns : latexCommandPatterns;

		for (const { pattern } of patterns) {
			const match = lineText.match(pattern);
			if (match && match.index !== undefined) {
				const openChar = isCurrentlyInTypstFile ? '"' : '{';
				const openPos = lineText.indexOf(openChar, match.index);
				if (openPos !== -1 && posInLine > openPos) {
					partialStart = line.from + openPos + 1;
					break;
				}
			}
		}

		return {
			from: partialStart,
			options,
			validFor: isCurrentlyInTypstFile ? /^[^\"]*/ : /^[^}]*/,
		};
	};

	getCompletions = async (context: CompletionContext): Promise<CompletionResult | null> => {
		const bibResult = await this.getBibliographyCompletions(context);
		if (bibResult) return bibResult;

		const fileResult = this.getFilePathCompletions(context);
		if (fileResult) return fileResult;

		return null;
	};
}

let globalProcessor: AutocompleteProcessor | null = null;

export function createFilePathAutocompleteExtension(currentFilePath: string = ''): [Extension, Extension, CompletionSource] {
	const plugin = ViewPlugin.fromClass(
		class {
			processor: AutocompleteProcessor;

			constructor(view: EditorView) {
				this.processor = new AutocompleteProcessor(view);
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

	const completionSource: CompletionSource = async (context: CompletionContext) => {
		return await globalProcessor?.getCompletions(context) || null;
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