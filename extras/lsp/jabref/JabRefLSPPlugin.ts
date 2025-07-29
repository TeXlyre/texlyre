// extras/lsp/jabref/JabRefLSPPlugin.ts
import type { LSPPlugin, LSPPanelProps } from "../../../src/plugins/PluginInterface";
import type { LSPRequest, LSPResponse, LSPNotification } from "../../../src/types/lsp";
// import JabRefPanel from "./JabRefPanel";
import { JabRefIcon } from "./Icon";
import { jabrefLSPSettings } from "./settings";
import { bibliographyImportService } from "../../../src/services/BibliographyImportService";

export const PLUGIN_NAME = "JabRef LSP";
export const PLUGIN_VERSION = "0.1.0";

interface BibEntry {
	key: string;
	entryType: string;
	fields: Record<string, string>;
	rawEntry: string;
}

class JabRefLSPPlugin implements LSPPlugin {
	id = "jabref-lsp";
	name = PLUGIN_NAME;
	version = PLUGIN_VERSION;
	type = "lsp" as const;
	icon = JabRefIcon;
	settings = jabrefLSPSettings;

	private connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error' = 'disconnected';
	private statusMessage = '';
	private lspRequestHandler?: (request: LSPRequest) => Promise<LSPResponse>;
	private currentServerUrl = 'ws://localhost:2087/';
	private settingsReady = false;
	private settingsPromise?: Promise<void>;
	private settingsResolver?: () => void;

	constructor() {
		this.setupBibtexParser();
		this.initializeDynamicSettings();
	}

	private setupBibtexParser() {
		try {
			const { BibtexParser } = require('../../viewers/bibtex/BibtexParser');
			if (BibtexParser) {
				bibliographyImportService.setParser({
					parse: (content: string) => BibtexParser.parse(content),
					serialize: (entries: any[]) => BibtexParser.serialize(entries),
					serializeEntry: (entry: any) => BibtexParser.serializeEntry(entry),
					findEntryPosition: (content: string, entry: any) => BibtexParser.findEntryPosition(content, entry),
					updateEntryInContent: (content: string, entry: any) => BibtexParser.updateEntryInContent(content, entry)
				});
			}
		} catch (error) {
			console.log('[JabRefLSP] Using default BibTeX parser - BibtexParser not available');
		}
	}

	private initializeDynamicSettings() {
		setTimeout(() => {
			try {
				const event = new CustomEvent('register-bibliography-plugin', {
					detail: {
						pluginId: this.id,
						pluginName: 'JabRef',
						registerTargetFile: true
					}
				});
				document.dispatchEvent(event);

				document.addEventListener('jabref-entry-imported', (e) => {
					const customEvent = e as CustomEvent;
					console.log(`[JabRefLSP] Entry imported: ${customEvent.detail.entryKey} to ${customEvent.detail.targetFile}`);
				});
			} catch (error) {
				console.error('[JabRefLSP] Error registering bibliography plugin:', error);
			}
		}, 100);
	}

	setLSPRequestHandler(handler: (request: LSPRequest) => Promise<LSPResponse>): void {
		this.lspRequestHandler = handler;
	}

	updateServerUrl(url: string): void {
		this.currentServerUrl = url;
		if (!this.settingsReady) {
			this.settingsReady = true;
			this.settingsResolver?.();
		}
	}

	private parseServerUrl(url: string): { protocol: string; host: string; port: number } {
		try {
			const urlObj = new URL(url);
			const protocol = urlObj.protocol === 'wss:' ? 'wss' : 'ws';
			const host = urlObj.hostname || 'localhost';
			const port = urlObj.port ? parseInt(urlObj.port, 10) : 2087;

			return { protocol, host, port };
		} catch (error) {
			console.warn('[JabRefLSP] Invalid server URL, using defaults:', error);
			return { protocol: 'ws', host: 'localhost', port: 2087 };
		}
	}

	async getServerConfig() {
		if (!this.settingsReady) {
			this.settingsPromise = new Promise(resolve => {
				this.settingsResolver = resolve;
			});
			await this.settingsPromise;
		}

		const { protocol, host, port } = this.parseServerUrl(this.currentServerUrl);

		return {
			transport: 'websocket' as const,
			protocol,
			host,
			port,
			settings: {
				citation: {
					bibliographies: [
						"~/Documents/*.bib",
					]
				}
			}
		};
	}

	async getBibliographyEntries(): Promise<BibEntry[]> {
		try {
			if (!this.lspRequestHandler) {
				console.warn('[JabRefLSP] LSP request handler not available yet');
				return [];
			}

			if (this.connectionStatus !== 'connected') {
				console.warn('[JabRefLSP] Not connected to LSP server');
				return [];
			}

			const request: LSPRequest = {
				method: 'textDocument/completion',
				params: {
					textDocument: { uri: 'texlyre://bibliography' },
					position: { line: 0, character: 0 }
				}
			};

			const response = await this.lspRequestHandler(request);
			const completionItems = response.result?.items || [];

			console.log(`[JabRefLSP] Retrieved ${completionItems.length} entries from LSP server`);
			return completionItems.map(item => this.parseCompletionItem(item));
		} catch (error) {
			console.error('[JabRefLSP] Error getting bibliography entries:', error);
			return [];
		}
	}

	private parseCompletionItem(item: any): BibEntry {
		const documentation = item.documentation || '';
		const fields = this.parseDocumentationFields(documentation);

		return {
			key: item.label || item.insertText || '',
			entryType: this.extractEntryType(documentation) || 'article',
			fields: fields,
			rawEntry: this.constructRawEntry(item.label || item.insertText || '', fields, this.extractEntryType(documentation) || 'article')
		};
	}

	private parseDocumentationFields(documentation: string): Record<string, string> {
		const fields: Record<string, string> = {};

		const titleMatch = documentation.match(/Title:\s*(.+?)(?:\n|$)/);
		if (titleMatch) {
			fields.title = titleMatch[1].replace(/[{}]/g, '').trim();
		}

		const authorMatch = documentation.match(/Authors?:\s*(.+?)(?:\n|$)/);
		if (authorMatch) {
			fields.author = authorMatch[1].trim();
		}

		const yearMatch = documentation.match(/Year:\s*(\d{4})/);
		if (yearMatch) {
			fields.year = yearMatch[1];
		}

		const journalMatch = documentation.match(/Journal:\s*(.+?)(?:\n|$)/);
		if (journalMatch) {
			fields.journal = journalMatch[1].trim();
		}

		return fields;
	}

	private extractEntryType(documentation: string): string {
		if (documentation.includes('Journal')) return 'article';
		if (documentation.includes('Book')) return 'book';
		if (documentation.includes('Conference') || documentation.includes('Proceedings')) return 'inproceedings';
		if (documentation.includes('Thesis')) return 'phdthesis';
		return 'article';
	}

	private constructRawEntry(key: string, fields: Record<string, string>, entryType: string): string {
		const fieldsString = Object.entries(fields)
			.map(([fieldKey, value]) => `  ${fieldKey} = {${value}}`)
			.join(',\n');

		return `@${entryType}{${key},\n${fieldsString}\n}`;
	}

	getSupportedFileTypes(): string[] {
		return ['tex', 'latex', 'bib', 'bibtex'];
	}

	getSupportedLanguages(): string[] {
		return ['latex', 'bibtex'];
	}

	isEnabled(): boolean {
		return true;
	}

	getConnectionStatus() {
		return this.connectionStatus;
	}

	getStatusMessage() {
		return this.statusMessage;
	}

	private websocket?: WebSocket;
	private requestId = 0;
	private pendingRequests = new Map<number, { resolve: Function; reject: Function }>();

	async initialize(): Promise<void> {
		console.log('[JabRefLSP] Initializing JabRef LSP plugin...');

		try {
			if (!this.settingsReady) {
				await new Promise<void>((resolve) => {
					this.settingsResolver = resolve;
					this.updateServerUrl(this.currentServerUrl);
				});
			}

			if (!this.lspRequestHandler) {
				console.log('[JabRefLSP] Setting up real LSP connection...');
				await this.setupLSPConnection();
			}

			this.connectionStatus = 'connected';
			this.statusMessage = 'Connected to citation language server';
			console.log('[JabRefLSP] Plugin initialized successfully');
		} catch (error) {
			console.error('[JabRefLSP] Failed to initialize:', error);
			this.connectionStatus = 'error';
			this.statusMessage = `Failed to connect: ${error.message}`;
			throw error;
		}
	}

	private async setupLSPConnection(): Promise<void> {
		const config = await this.getServerConfig();
		console.log('[JabRefLSP] Connecting to server:', `${config.protocol}://${config.host}:${config.port}`);

		this.connectionStatus = 'connecting';

		return new Promise((resolve, reject) => {
			try {
				const wsUrl = `${config.protocol}://${config.host}:${config.port}`;
				this.websocket = new WebSocket(wsUrl);

				this.websocket.onopen = async () => {
					console.log('[JabRefLSP] WebSocket connected');

					this.lspRequestHandler = async (request: LSPRequest): Promise<LSPResponse> => {
						return this.sendWebSocketRequest(request);
					};

					await this.sendInitializeRequest(config);
					resolve();
				};

				this.websocket.onmessage = (event) => {
					try {
						const message = JSON.parse(event.data);
						this.handleWebSocketMessage(message);
					} catch (error) {
						console.error('[JabRefLSP] Error parsing WebSocket message:', error);
					}
				};

				this.websocket.onerror = (error) => {
					console.error('[JabRefLSP] WebSocket error:', error);
					this.connectionStatus = 'error';
					reject(new Error(`Failed to connect to JabRef LSP server at ${wsUrl}`));
				};

				this.websocket.onclose = () => {
					console.log('[JabRefLSP] WebSocket disconnected');
					this.connectionStatus = 'disconnected';
				};

				setTimeout(() => {
					if (this.websocket?.readyState === WebSocket.CONNECTING) {
						this.websocket.close();
						reject(new Error('Connection timeout'));
					}
				}, 5000);

			} catch (error) {
				reject(error);
			}
		});
	}

	private async sendInitializeRequest(config: any): Promise<void> {
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
				initializationOptions: config.settings,
				workspaceFolders: null
			}
		};

		await this.sendWebSocketRequest(initializeRequest);
		this.sendWebSocketNotification({ method: 'initialized', params: {} });

		if (Object.keys(config.settings).length > 0) {
			this.sendWebSocketNotification({
				method: 'workspace/didChangeConfiguration',
				params: {
					settings: config.settings
				}
			});
		}
	}

	private async sendWebSocketRequest(request: LSPRequest): Promise<LSPResponse> {
		if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
			throw new Error('WebSocket not connected');
		}

		return new Promise((resolve, reject) => {
			const id = ++this.requestId;
			const messageWithId = { ...request, id };

			this.pendingRequests.set(id, { resolve, reject });
			this.websocket!.send(JSON.stringify(messageWithId));

			setTimeout(() => {
				if (this.pendingRequests.has(id)) {
					this.pendingRequests.delete(id);
					reject(new Error('Request timeout'));
				}
			}, 10000);
		});
	}

	private sendWebSocketNotification(notification: any): void {
		if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
			this.websocket.send(JSON.stringify(notification));
		}
	}

	private handleWebSocketMessage(message: any): void {
		if (message.id !== undefined) {
			const pending = this.pendingRequests.get(message.id);
			if (pending) {
				this.pendingRequests.delete(message.id);
				if (message.error) {
					console.error('[JabRefLSP] LSP Error:', message.error);
					pending.reject(new Error(message.error.message || 'LSP Error'));
				} else {
					pending.resolve(message);
				}
			}
		}
	}

	shouldTriggerCompletion(document: string, position: number, lineText: string): boolean {
		const citationPatterns = [
			/\\cite\w*\{[^}]*$/,
			/\\autocite\w*\{[^}]*$/,
			/\\textcite\w*\{[^}]*$/,
			/\\parencite\w*\{[^}]*$/,
			/\\footcite\w*\{[^}]*$/,
			/@[a-zA-Z_][\w]*$/
		];

		const beforeCursor = lineText.substring(0, position - lineText.length + lineText.length);
		return citationPatterns.some(pattern => pattern.test(beforeCursor));
	}

	async sendRequest(request: LSPRequest): Promise<LSPResponse> {
		if (this.lspRequestHandler) {
			return this.lspRequestHandler(request);
		}
		throw new Error('LSP request handler not available');
	}

	onNotification(notification: LSPNotification): void {
		switch (notification.method) {
			case 'window/logMessage':
				break;
			case 'textDocument/publishDiagnostics':
				break;
			default:
				break;
		}
	}

	async shutdown(): Promise<void> {
		this.connectionStatus = 'disconnected';
		this.statusMessage = '';

		if (this.websocket) {
			this.websocket.close();
			this.websocket = undefined;
		}

		this.pendingRequests.clear();
		this.lspRequestHandler = undefined;
	}

	renderPanel = (props: LSPPanelProps) => {
		// JabRef now relies on the main LSP panel for bibliography functionality
		// The panel automatically detects bibliography providers and renders appropriately
		return null;
	};
}

const jabrefLSPPlugin = new JabRefLSPPlugin();
export default jabrefLSPPlugin;