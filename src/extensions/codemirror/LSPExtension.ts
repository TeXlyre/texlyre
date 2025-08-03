// src/extensions/codemirror/LSPExtension.ts
import { type CompletionContext, type CompletionResult, type CompletionSource } from "@codemirror/autocomplete";
import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { ViewPlugin, type EditorView } from "@codemirror/view";
import { type LSPRequest, type LSPResponse } from "../../types/lsp";
import type { LSPPlugin } from "../../plugins/PluginInterface";
import { fileStorageService } from "../../services/FileStorageService";

export const updateLSPPlugins = StateEffect.define<LSPPlugin[]>();

const lspPluginsField = StateField.define<LSPPlugin[]>({
	create() {
		return [];
	},
	update(plugins, tr) {
		for (const effect of tr.effects) {
			if (effect.is(updateLSPPlugins)) {
				return effect.value;
			}
		}
		return plugins;
	},
});

interface ExternalBibEntry {
	key: string;
	title: string;
	authors: string[];
	year: string;
	journal: string;
	pluginId: string;
	rawData: any;
}

class LSPProcessor {
	private view: EditorView;
	private plugins: LSPPlugin[] = [];
	private currentFilePath: string = '';

	constructor(view: EditorView) {
		this.view = view;
	}

	updatePlugins(plugins: LSPPlugin[]) {
		this.plugins = plugins;
	}

	setCurrentFilePath(filePath: string) {
		this.currentFilePath = filePath;
	}

	async getCompletions(context: CompletionContext): Promise<ExternalBibEntry[]> {
		if (!this.shouldTriggerCitationCompletion(context)) {
			return [];
		}

		const [allEntries, localKeys] = await Promise.all([
			this.getAllExternalEntries(context),
			this.getLocalBibKeys()
		]);

		// Filter out entries that already exist locally
		return allEntries.filter(entry => !localKeys.has(entry.key));
	}

	private async getAllExternalEntries(context: CompletionContext): Promise<ExternalBibEntry[]> {
		const allEntries: ExternalBibEntry[] = [];

		for (const plugin of this.plugins) {
			if (!plugin.isEnabled() || plugin.getConnectionStatus() !== 'connected') {
				continue;
			}

			try {
				const entries = await this.getEntriesFromPlugin(plugin, context);
				allEntries.push(...entries);
			} catch (error) {
				console.error(`[LSPExtension] Error getting entries from ${plugin.name}:`, error);
			}
		}

		return allEntries;
	}

	private async getLocalBibKeys(): Promise<Set<string>> {
		try {
			const allFiles = await fileStorageService.getAllFiles();
			const bibFiles = allFiles.filter(file =>
				file.name.endsWith('.bib') &&
				!file.isDeleted &&
				file.content
			);

			const localKeys = new Set<string>();

			for (const bibFile of bibFiles) {
				const content = typeof bibFile.content === 'string'
					? bibFile.content
					: new TextDecoder().decode(bibFile.content);

				// Simple regex to extract BibTeX keys
				const keyMatches = content.match(/@\w+\{([^,\s}]+)/g);
				if (keyMatches) {
					keyMatches.forEach(match => {
						const key = match.split('{')[1];
						if (key) {
							localKeys.add(key);
						}
					});
				}
			}

			return localKeys;
		} catch (error) {
			console.error('[LSPExtension] Error getting local bib keys:', error);
			return new Set();
		}
	}

	private shouldTriggerCitationCompletion(context: CompletionContext): boolean {
		if (!this.isLatexFile()) {
			return false;
		}

		const line = context.state.doc.lineAt(context.pos);
		const lineText = line.text;
		const posInLine = context.pos - line.from;
		const beforeCursor = lineText.substring(0, posInLine);

		const citationPatterns = [
			/\\cite\w*\{[^}]*$/,
			/\\autocite\w*\{[^}]*$/,
			/\\textcite\w*\{[^}]*$/,
			/\\parencite\w*\{[^}]*$/,
			/\\footcite\w*\{[^}]*$/,
		];

		return citationPatterns.some(pattern => pattern.test(beforeCursor));
	}

	private isLatexFile(): boolean {
		return this.currentFilePath?.endsWith('.tex') || this.currentFilePath?.endsWith('.latex') || false;
	}

	private async getEntriesFromPlugin(plugin: LSPPlugin, context: CompletionContext): Promise<ExternalBibEntry[]> {
		if (!('getBibliographyEntries' in plugin)) {
			return [];
		}

		try {
			const bibEntries = await (plugin as any).getBibliographyEntries();
			return bibEntries.map((entry: any) => ({
				key: entry.key,
				title: entry.fields?.title || entry.title || '',
				authors: entry.fields?.author ? [entry.fields.author] : entry.authors || [],
				year: entry.fields?.year || entry.year || '',
				journal: entry.fields?.journal || entry.journal || '',
				pluginId: plugin.id,
				rawData: entry
			}));
		} catch (error) {
			console.error(`[LSPExtension] Error getting bibliography entries from ${plugin.name}:`, error);
			return [];
		}
	}

	async importEntry(entry: ExternalBibEntry): Promise<boolean> {
		try {
			const targetBibFile = await this.findTargetBibFile();
			if (!targetBibFile) {
				console.error('[LSPExtension] No .bib file found for import');
				return false;
			}

			const bibEntry = this.formatBibEntry(entry);
			await this.appendToBibFile(targetBibFile, bibEntry);

			document.dispatchEvent(new CustomEvent('refresh-file-tree'));
			console.log(`[LSPExtension] Imported ${entry.key} to ${targetBibFile.path}`);
			return true;
		} catch (error) {
			console.error(`[LSPExtension] Failed to import ${entry.key}:`, error);
			return false;
		}
	}

	private async findTargetBibFile() {
		const allFiles = await fileStorageService.getAllFiles();
		return allFiles.find(file =>
			file.name.endsWith('.bib') &&
			!file.isDeleted
		);
	}

	private formatBibEntry(entry: ExternalBibEntry): string {
		if (entry.rawData?.rawEntry) {
			return entry.rawData.rawEntry;
		}

		const fields: string[] = [];
		if (entry.title) fields.push(`  title = {${entry.title}}`);
		if (entry.authors.length > 0) fields.push(`  author = {${entry.authors.join(' and ')}}`);
		if (entry.year) fields.push(`  year = {${entry.year}}`);
		if (entry.journal) fields.push(`  journal = {${entry.journal}}`);

		const entryType = entry.rawData?.entryType || 'article';
		return `@${entryType}{${entry.key},\n${fields.join(',\n')}\n}`;
	}

	private async appendToBibFile(bibFile: any, bibEntry: string): Promise<void> {
		let currentContent = '';
		if (bibFile.content) {
			currentContent = typeof bibFile.content === 'string'
				? bibFile.content
				: new TextDecoder().decode(bibFile.content);
		}

		const newContent = currentContent.trim()
			? `${currentContent.trim()}\n\n${bibEntry}\n`
			: `${bibEntry}\n`;

		await fileStorageService.updateFileContent(bibFile.id, newContent);
	}

	getPluginName(pluginId: string): string | null {
		const plugin = this.plugins.find(p => p.id === pluginId);
		return plugin?.name || null;
	}

	update(update: any) {
		const plugins = update.state.field(lspPluginsField, false);
		if (plugins && plugins !== this.plugins) {
			this.updatePlugins(plugins);
		}
	}

	destroy() {
		// Clean shutdown handled by individual plugins
	}
}

let globalProcessor: LSPProcessor | null = null;

export function createLSPExtension(): [Extension, Extension, CompletionSource] {
	const plugin = ViewPlugin.fromClass(
		class {
			processor: LSPProcessor;

			constructor(view: EditorView) {
				this.processor = new LSPProcessor(view);
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
		if (!globalProcessor) return null;

		const entries = await globalProcessor.getCompletions(context);
		if (entries.length === 0) return null;

		const options = entries.map(entry => {
			const displayTitle = entry.title.length > 50
				? `${entry.title.substring(0, 47)}...`
				: entry.title;

			const authors = entry.authors.length > 0
				? entry.authors.join(', ')
				: 'Unknown author';

			const pluginName = globalProcessor!.getPluginName(entry.pluginId) || 'External';

			return {
				label: entry.key,
				detail: `${displayTitle} ⬇️`,
				info: `${pluginName} | ${authors} (${entry.year})\n${entry.journal}`,
				apply: async (view: EditorView, completion: any, from: number, to: number) => {
					const success = await globalProcessor!.importEntry(entry);
					if (!success) {
						console.error(`Failed to import entry: ${entry.key}`);
					}

					view.dispatch({
						changes: { from, to, insert: entry.key }
					});
				},
				boost: 5,
			};
		});

		// Calculate the correct start position for citation completions
		const line = context.state.doc.lineAt(context.pos);
		const lineText = line.text;
		const posInLine = context.pos - line.from;
		const beforeCursor = lineText.substring(0, posInLine);

		// Find the opening brace of the citation command
		const citationMatch = beforeCursor.match(/\\(?:cite|autocite|textcite|parencite|footcite)\w*(?:\[[^\]]*\])?(?:\[[^\]]*\])?\{([^}]*)$/);
		if (citationMatch) {
			const bracePos = beforeCursor.lastIndexOf('{');
			const textInBraces = beforeCursor.substring(bracePos + 1);
			const lastCommaPos = textInBraces.lastIndexOf(',');

			const startPos = lastCommaPos !== -1
				? line.from + bracePos + 1 + lastCommaPos + 1
				: line.from + bracePos + 1;

			return {
				from: startPos,
				options,
				validFor: /^[a-zA-Z_][\w]*$/,
			} as CompletionResult;
		}

		return {
			from: context.pos,
			options,
			validFor: /^[a-zA-Z_][\w]*$/,
		} as CompletionResult;
	};

	return [
		lspPluginsField,
		plugin,
		completionSource,
	];
}

export function updateLSPPluginsInView(view: EditorView, plugins: LSPPlugin[]) {
	view.dispatch({
		effects: updateLSPPlugins.of(plugins)
	});
}

export function setCurrentFilePathInLSP(view: EditorView, filePath: string) {
	if (globalProcessor) {
		globalProcessor.setCurrentFilePath(filePath);
	}
}