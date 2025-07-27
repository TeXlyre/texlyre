// extras/lsp/jabref/JabRefLSPPlugin.ts
import type { LSPPlugin, LSPPanelProps } from "../../../src/plugins/PluginInterface";
import type { LSPRequest, LSPResponse, LSPNotification } from "../../../src/types/lsp";
import JabRefPanel from "./JabRefPanel";
import { JabRefIcon } from "./Icon";
import { jabrefLSPSettings } from "./settings";
import { useDynamicBibSettings } from "../../../src/hooks/useDynamicBibSettings";
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
	private dynamicBibSettings?: ReturnType<typeof useDynamicBibSettings>;

	constructor() {
		// Initialize the import service with BibtexParser if available
		this.setupBibtexParser();
		this.initializeDynamicSettings();
	}

	private setupBibtexParser() {
		try {
			// Try to import BibtexParser from the extras plugin if available
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
			// BibtexParser not available, use the default simple parser
			console.log('[JabRefLSP] Using default BibTeX parser - BibtexParser not available');
		}
	}

	private initializeDynamicSettings() {
		// Register the target-bib-file setting dynamically
		// This should be called from a React component that uses the hook
		setTimeout(() => {
			// Dispatch event to register the dynamic setting
			document.dispatchEvent(new CustomEvent('register-lsp-bib-setting', {
				detail: { pluginId: this.id, pluginName: 'JabRef' }
			}));
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
				throw new Error('LSP request handler not available');
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

	async initialize(): Promise<void> {
		this.connectionStatus = 'connected';
		this.statusMessage = 'Connected to citation language server';
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
	}

	renderPanel = (props: LSPPanelProps) => JabRefPanel({ ...props, pluginInstance: this });
}

const jabrefLSPPlugin = new JabRefLSPPlugin();
export default jabrefLSPPlugin;