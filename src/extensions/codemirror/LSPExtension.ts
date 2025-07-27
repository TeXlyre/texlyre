// src/extensions/codemirror/LSPExtension.ts
import { type CompletionContext, type CompletionResult, type CompletionSource } from "@codemirror/autocomplete";
import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { ViewPlugin, type EditorView } from "@codemirror/view";
import { type LSPRequest, type LSPResponse, type LSPCompletionItem } from "../../types/lsp";
import type { LSPPlugin } from "../../plugins/PluginInterface";
import { fileStorageService } from "../../services/FileStorageService";
import { BibtexParser } from "../../../extras/viewers/bibtex/BibtexParser";

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

interface CompletionEntry {
	key: string;
	title: string;
	authors: string[];
	year: string;
	source: 'local' | 'lsp';
	pluginId?: string;
	bibEntry?: any;
	journal?: string;
	originalData?: any;
}

interface ServerConnection {
	type: 'tcp' | 'websocket';
	client?: any;
	process?: any;
	requestId: number;
	pendingRequests: Map<number, { resolve: Function; reject: Function }>;
}

class LSPProcessor {
	private view: EditorView;
	private plugins: LSPPlugin[] = [];
	private connections = new Map<string, ServerConnection>();
	private localBibCache = new Map<string, CompletionEntry[]>();
	private currentFilePath: string = '';

	constructor(view: EditorView) {
		this.view = view;
		this.initializeLocalBibCache();
	}

	private async initializeLocalBibCache() {
		try {
			const allFiles = await fileStorageService.getAllFiles();
			const bibFiles = allFiles.filter(file =>
				file.name.endsWith('.bib') &&
				!file.isDeleted &&
				file.content
			);

			for (const bibFile of bibFiles) {
				await this.updateLocalBibCache(bibFile.path);
			}
		} catch (error) {
			console.error('[LSPExtension] Error initializing local bib cache:', error);
		}
	}

	private async updateLocalBibCache(bibFilePath: string) {
		try {
			const bibFile = await fileStorageService.getFileByPath(bibFilePath);
			if (!bibFile?.content) return;

			const content = typeof bibFile.content === 'string'
				? bibFile.content
				: new TextDecoder().decode(bibFile.content);

			const entries = BibtexParser.parse(content);
			const completionEntries: CompletionEntry[] = entries.map(entry => ({
				key: entry.id,
				title: entry.fields.title || '',
				authors: entry.fields.author ? [entry.fields.author] : [],
				year: entry.fields.year || '',
				source: 'local' as const,
				journal: entry.fields.journal || entry.fields.booktitle || '',
				originalData: entry
			}));

			this.localBibCache.set(bibFilePath, completionEntries);
		} catch (error) {
			console.error(`[LSPExtension] Error updating cache for ${bibFilePath}:`, error);
		}
	}

	updatePlugins(plugins: LSPPlugin[]) {
		this.plugins = plugins;
		this.plugins.forEach(plugin => {
			if (plugin.isEnabled() && !this.connections.has(plugin.id)) {
				this.initializePlugin(plugin);
			}
		});
	}

	setCurrentFilePath(filePath: string) {
		this.currentFilePath = filePath;
	}

	private async initializePlugin(plugin: LSPPlugin) {
		try {
			if (plugin.setLSPRequestHandler) {
				plugin.setLSPRequestHandler(async (request: LSPRequest) => {
					const connection = this.connections.get(plugin.id);
					if (connection && connection.type === 'websocket') {
						return await this.sendWebSocketRequest(plugin.id, request);
					} else if (connection && connection.type === 'tcp') {
						return await this.sendTCPRequest(plugin.id, request);
					} else {
						throw new Error('No active connection available');
					}
				});
			}

			const configResult = plugin.getServerConfig?.();
			const config = configResult instanceof Promise ? await configResult : configResult;

			if (config?.transport === 'websocket') {
				await this.connectWebSocket(plugin.id, config);
			} else if (config?.transport === 'tcp') {
				await this.connectTCP(plugin.id, config);
			} else {
				await plugin.initialize();
			}

			console.log(`[LSPExtension] Initialized plugin: ${plugin.name}`);
		} catch (error) {
			console.warn(`[LSPExtension] Failed to initialize plugin ${plugin.name}:`, error);
		}
	}

	private async connectWebSocket(pluginId: string, config: any) {
		const connection: ServerConnection = {
			type: 'websocket',
			requestId: 0,
			pendingRequests: new Map()
		};

		try {
			const wsUrl = `${config.protocol}://${config.host}:${config.port}`;
			console.log(`[LSPExtension] Connecting to WebSocket at ${wsUrl}`);
			connection.client = new WebSocket(wsUrl);

			connection.client.onmessage = (event: MessageEvent) => {
				try {
					const message = JSON.parse(event.data);
					this.handleWebSocketMessage(pluginId, message);
				} catch (error) {
					console.error('[LSPExtension] Error parsing WebSocket message:', error);
				}
			};

			await new Promise((resolve, reject) => {
				connection.client.onopen = () => {
					resolve(void 0);
				};
				connection.client.onerror = (error) => {
					reject(new Error(`Failed to connect to citation server at ${wsUrl}`));
				};

				setTimeout(() => {
					if (connection.client?.readyState === WebSocket.CONNECTING) {
						reject(new Error('WebSocket connection timeout'));
					}
				}, 5000);
			});

			this.connections.set(pluginId, connection);
			await this.sendWebSocketInitialize(pluginId);

		} catch (error) {
			throw error;
		}
	}

	private async connectTCP(pluginId: string, config: any) {
		throw new Error('TCP transport not supported in browser environment. Use WebSocket instead.');
	}

	private async sendWebSocketInitialize(pluginId: string) {
		const plugin = this.plugins.find(p => p.id === pluginId);
		const configResult = plugin?.getServerConfig?.();
		const config = configResult instanceof Promise ? await configResult : configResult;
		const settings = config?.settings || {};

		const initializeRequest = {
			method: 'initialize',
			params: {
				processId: null,
				clientInfo: {
					name: 'TeXlyre',
					version: '0.3.0'
				},
				capabilities: {
					textDocument: {
						completion: {
							completionItem: {
								snippetSupport: true,
								commitCharactersSupport: true,
								documentationFormat: ['markdown', 'plaintext']
							},
							contextSupport: true
						},
						hover: {},
						definition: {},
						references: {}
					},
					workspace: {
						configuration: true
					}
				},
				initializationOptions: settings,
				workspaceFolders: null
			}
		};

		await this.sendWebSocketRequest(pluginId, initializeRequest);
		this.sendWebSocketNotification(pluginId, { method: 'initialized', params: {} });

		if (Object.keys(settings).length > 0) {
			this.sendWebSocketNotification(pluginId, {
				method: 'workspace/didChangeConfiguration',
				params: {
					settings: settings
				}
			});
		}
	}

	private async sendWebSocketRequest(pluginId: string, request: LSPRequest): Promise<LSPResponse> {
		const connection = this.connections.get(pluginId);
		if (!connection || connection.type !== 'websocket' || !connection.client) {
			throw new Error('WebSocket connection not available');
		}

		return new Promise((resolve, reject) => {
			const id = ++connection.requestId;
			const messageWithId = { ...request, id };

			connection.pendingRequests.set(id, { resolve, reject });
			connection.client.send(JSON.stringify(messageWithId));

			setTimeout(() => {
				if (connection.pendingRequests.has(id)) {
					connection.pendingRequests.delete(id);
					reject(new Error('Request timeout'));
				}
			}, 10000);
		});
	}

	private sendWebSocketNotification(pluginId: string, notification: any) {
		const connection = this.connections.get(pluginId);
		if (connection && connection.client) {
			connection.client.send(JSON.stringify(notification));
		}
	}

	private handleWebSocketMessage(pluginId: string, message: any) {
		const connection = this.connections.get(pluginId);
		if (!connection) return;

		if (message.id !== undefined) {
			const pending = connection.pendingRequests.get(message.id);
			if (pending) {
				connection.pendingRequests.delete(message.id);
				if (message.error) {
					console.error('[LSPExtension] LSP Error:', message.error);
					pending.reject(new Error(message.error.message || 'LSP Error'));
				} else {
					pending.resolve(message);
				}
			}
		}
	}

	private async sendTCPRequest(pluginId: string, request: LSPRequest): Promise<LSPResponse> {
		const connection = this.connections.get(pluginId);
		if (!connection || connection.type !== 'tcp' || !connection.client) {
			throw new Error('TCP connection not available');
		}

		return new Promise((resolve, reject) => {
			const id = ++connection.requestId;
			const messageWithId = { ...request, id };
			const message = JSON.stringify(messageWithId);

			connection.pendingRequests.set(id, { resolve, reject });

			if (connection.client.send) {
				connection.client.send(message);
			} else {
				connection.client.write(message + '\n');
			}

			setTimeout(() => {
				if (connection.pendingRequests.has(id)) {
					connection.pendingRequests.delete(id);
					reject(new Error('Request timeout'));
				}
			}, 10000);
		});
	}

	private async getTargetBibFile(pluginId: string): Promise<string | null> {
		// Get the configured target bib file for this plugin
		// For now, use the first .bib file found
		try {
			const allFiles = await fileStorageService.getAllFiles();
			const bibFile = allFiles.find(file =>
				file.name.endsWith('.bib') &&
				!file.isDeleted
			);
			return bibFile?.path || null;
		} catch (error) {
			console.error('[LSPExtension] Error finding target bib file:', error);
			return null;
		}
	}

	private async importBibEntry(pluginId: string, entryKey: string): Promise<boolean> {
		try {
			const plugin = this.plugins.find(p => p.id === pluginId);
			if (!plugin) return false;

			// Get full entry from LSP
			const request: LSPRequest = {
				method: 'textDocument/completion',
				params: {
					textDocument: { uri: this.getDocumentUri() },
					position: { line: 0, character: 0 }
				}
			};

			const response = await this.sendRequest(plugin, request);
			const items = response.result?.items || [];
			const targetItem = items.find((item: any) =>
				item.label === entryKey || item.insertText === entryKey
			);

			if (!targetItem) {
				console.warn(`[LSPExtension] Entry ${entryKey} not found in LSP response`);
				return false;
			}

			// Get target bib file
			const targetBibPath = await this.getTargetBibFile(pluginId);
			if (!targetBibPath) {
				console.error('[LSPExtension] No target bib file configured');
				return false;
			}

			// Parse the raw entry from LSP
			const rawEntry = targetItem.documentation || '';
			const bibEntry = this.parseLSPEntryToBibTeX(targetItem, rawEntry);

			if (!bibEntry) {
				console.error('[LSPExtension] Failed to parse bib entry');
				return false;
			}

			// Check for duplicates
			const localEntries = this.localBibCache.get(targetBibPath) || [];
			if (localEntries.some(entry => entry.key === entryKey)) {
				console.log(`[LSPExtension] Entry ${entryKey} already exists locally`);
				return true; // Already exists, consider it successful
			}

			// Append to target file
			await this.appendToBibFile(targetBibPath, bibEntry);

			// Update local cache
			await this.updateLocalBibCache(targetBibPath);

			console.log(`[LSPExtension] Successfully imported ${entryKey} to ${targetBibPath}`);
			return true;

		} catch (error) {
			console.error(`[LSPExtension] Error importing entry ${entryKey}:`, error);
			return false;
		}
	}

	private parseLSPEntryToBibTeX(item: any, documentation: string): string | null {
		try {
			// If documentation contains a complete BibTeX entry, use it
			if (documentation.includes('@')) {
				return documentation;
			}

			// Otherwise, construct from metadata
			const key = item.label || item.insertText;
			const fields: string[] = [];

			// Extract fields from documentation
			const titleMatch = documentation.match(/Title:\s*(.+?)(?:\n|$)/);
			if (titleMatch) {
				fields.push(`  title = {${titleMatch[1].replace(/[{}]/g, '').trim()}}`);
			}

			const authorMatch = documentation.match(/Authors?:\s*(.+?)(?:\n|$)/);
			if (authorMatch) {
				fields.push(`  author = {${authorMatch[1].trim()}}`);
			}

			const yearMatch = documentation.match(/Year:\s*(\d{4})/);
			if (yearMatch) {
				fields.push(`  year = {${yearMatch[1]}}`);
			}

			// Determine entry type
			let entryType = 'article';
			if (documentation.includes('Book')) entryType = 'book';
			else if (documentation.includes('Conference') || documentation.includes('Proceedings')) entryType = 'inproceedings';
			else if (documentation.includes('Thesis')) entryType = 'phdthesis';

			if (fields.length === 0) {
				return null;
			}

			return `@${entryType}{${key},\n${fields.join(',\n')}\n}`;

		} catch (error) {
			console.error('[LSPExtension] Error parsing LSP entry:', error);
			return null;
		}
	}

	private async appendToBibFile(bibFilePath: string, bibEntry: string): Promise<void> {
		try {
			const bibFile = await fileStorageService.getFileByPath(bibFilePath);
			if (!bibFile) {
				throw new Error(`Bib file not found: ${bibFilePath}`);
			}

			let currentContent = '';
			if (bibFile.content) {
				currentContent = typeof bibFile.content === 'string'
					? bibFile.content
					: new TextDecoder().decode(bibFile.content);
			}

			// Ensure proper spacing
			const newContent = currentContent.trim()
				? `${currentContent.trim()}\n\n${bibEntry}\n`
				: `${bibEntry}\n`;

			await fileStorageService.updateFileContent(bibFile.id, newContent);

		} catch (error) {
			console.error('[LSPExtension] Error appending to bib file:', error);
			throw error;
		}
	}

	private async sendRequest(plugin: LSPPlugin, request: LSPRequest): Promise<LSPResponse> {
		const connection = this.connections.get(plugin.id);
		if (connection && connection.type === 'websocket') {
			return await this.sendWebSocketRequest(plugin.id, request);
		} else if (connection && connection.type === 'tcp') {
			return await this.sendTCPRequest(plugin.id, request);
		} else {
			return await plugin.sendRequest(request);
		}
	}

	async getCompletions(context: CompletionContext): Promise<CompletionEntry[]> {
		const document = context.state.doc.toString();
		const position = context.pos;
		const line = context.state.doc.lineAt(position);
		const character = position - line.from;

		// Check if we're in a citation context
		if (!this.shouldTriggerCompletion(document, position, line.text)) {
			return [];
		}

		const allCompletions: CompletionEntry[] = [];

		// Add local completions
		for (const [bibPath, entries] of this.localBibCache) {
			allCompletions.push(...entries);
		}

		// Add LSP completions
		for (const plugin of this.plugins) {
			if (!plugin.isEnabled()) {
				continue;
			}

			try {
				if (plugin.shouldTriggerCompletion(document, position, line.text)) {
					const request: LSPRequest = {
						method: 'textDocument/completion',
						params: {
							textDocument: { uri: this.getDocumentUri() },
							position: { line: line.number - 1, character }
						}
					};

					const response = await this.sendRequest(plugin, request);

					if (response.result && Array.isArray(response.result.items)) {
						const lspEntries: CompletionEntry[] = response.result.items.map((item: any) => ({
							key: item.label || item.insertText || '',
							title: this.extractTitle(item) || '',
							authors: this.extractAuthors(item),
							year: this.extractYear(item) || '',
							source: 'lsp' as const,
							pluginId: plugin.id,
							journal: this.extractJournal(item) || '',
							bibEntry: item,
							originalData: item
						}));

						// Filter out entries that already exist locally
						const localKeys = new Set(allCompletions.filter(e => e.source === 'local').map(e => e.key));
						const uniqueLspEntries = lspEntries.filter(entry => !localKeys.has(entry.key));

						allCompletions.push(...uniqueLspEntries);
					}
				}
			} catch (error) {
				console.error(`[LSPExtension] Error getting completions from ${plugin.name}:`, error);
			}
		}

		return allCompletions;
	}

	private shouldTriggerCompletion(document: string, position: number, lineText: string): boolean {
		const citationPatterns = [
			/\\cite\w*\{[^}]*$/,
			/\\autocite\w*\{[^}]*$/,
			/\\textcite\w*\{[^}]*$/,
			/\\parencite\w*\{[^}]*$/,
			/\\footcite\w*\{[^}]*$/,
		];

		const beforeCursor = lineText.substring(0, position - lineText.length + lineText.length);
		return citationPatterns.some(pattern => pattern.test(beforeCursor));
	}

	private extractTitle(item: any): string {
		const doc = item.documentation || '';
		const titleMatch = doc.match(/Title:\s*(.+?)(?:\n|$)/);
		return titleMatch ? titleMatch[1].replace(/[{}]/g, '').trim() : '';
	}

	private extractAuthors(item: any): string[] {
		const doc = item.documentation || '';
		const authorMatch = doc.match(/Authors?:\s*(.+?)(?:\n|$)/);
		return authorMatch ? [authorMatch[1].trim()] : [];
	}

	private extractYear(item: any): string {
		const doc = item.documentation || '';
		const yearMatch = doc.match(/Year:\s*(\d{4})/);
		return yearMatch ? yearMatch[1] : '';
	}

	private extractJournal(item: any): string {
		const doc = item.documentation || '';
		const journalMatch = doc.match(/Journal:\s*(.+?)(?:\n|$)/);
		if (journalMatch) return journalMatch[1].trim();

		const booktitleMatch = doc.match(/Booktitle:\s*(.+?)(?:\n|$)/);
		return booktitleMatch ? booktitleMatch[1].trim() : '';
	}

	private getDocumentUri(): string {
		return `texlyre://${this.currentFilePath}`;
	}

	async handleImportRequest(entryKey: string, pluginId: string): Promise<boolean> {
		return await this.importBibEntry(pluginId, entryKey);
	}

	destroy() {
		this.plugins.forEach(plugin => {
			try {
				const connection = this.connections.get(plugin.id);
				if (connection) {
					if (connection.type === 'tcp') {
						if (connection.client) {
							connection.client.destroy();
						}
						if (connection.process) {
							connection.process.kill();
						}
					} else {
						plugin.shutdown();
					}
				}
			} catch (error) {
				console.error(`[LSPExtension] Error shutting down plugin ${plugin.name}:`, error);
			}
		});
		this.connections.clear();
	}

	update(update: any) {
		const plugins = update.state.field(lspPluginsField, false);
		if (plugins && plugins !== this.plugins) {
			this.updatePlugins(plugins);
		}
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

		const completions = await globalProcessor.getCompletions(context);
		if (completions.length === 0) return null;

		const options = completions.map(entry => {
			const isLocal = entry.source === 'local';
			const icon = isLocal ? ' ✓' : ' ⬇️';
			const sourceLabel = isLocal ? 'Local' : (entry.pluginId || 'External');

			return {
				label: entry.key,
				detail: `${entry.title || 'No title'}${icon}`,
				info: `${sourceLabel} | ${entry.authors.join(', ')} (${entry.year})\n${entry.journal}`,
				apply: async (view: EditorView, completion: any, from: number, to: number) => {
					if (!isLocal && entry.pluginId) {
						// Import the entry first
						const success = await globalProcessor!.handleImportRequest(entry.key, entry.pluginId);
						if (!success) {
							console.error(`Failed to import entry: ${entry.key}`);
							return;
						}
					}

					// Insert the citation key
					view.dispatch({
						changes: { from, to, insert: entry.key }
					});
				},
				boost: isLocal ? 10 : 5,
			};
		});

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