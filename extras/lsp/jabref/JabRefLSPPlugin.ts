// extras/lsp/jabref/JabRefLSPPlugin.ts
import type { LSPPlugin, LSPPanelProps, BibEntry, LSPPluginTransportConfig } from '@/plugins/PluginInterface';
import { JabRefIcon } from './Icon';
import { getJabrefLSPSettings } from './settings';
import { genericLSPService } from '@/services/GenericLSPService';
import { bibliographyImportService } from '@/services/BibliographyImportService';

export const PLUGIN_NAME = 'JabRef LSP';
export const PLUGIN_VERSION = '0.1.0';

class JabRefLSPPlugin implements LSPPlugin {
	id = 'jabref-lsp';
	name = PLUGIN_NAME;
	version = PLUGIN_VERSION;
	type = 'lsp' as const;
	icon = JabRefIcon;
	get settings() {
		return getJabrefLSPSettings();
	};

	private currentServerUrl = 'ws://localhost:2087/';
	private registered = false;

	constructor() {
		this.setupBibtexParser();
		// TODO (fabawi): This will trigger whether JabRef is enabled or not. Not good
		this.ensureRegistered();
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

	private ensureRegistered() {
		if (this.registered) return;
		this.registered = true;

		genericLSPService.registerConfig({
			id: this.id,
			name: this.name,
			enabled: true,
			fileExtensions: this.getSupportedFileTypes(),
			transportConfig: this.getTransportConfig(),
			clientConfig: {
				rootUri: 'texlyre://bibliography',
			},
		});
	}

	updateServerUrl(url: string): void {
		this.currentServerUrl = url;

		if (this.registered) {
			genericLSPService.updateConfig(this.id, {
				transportConfig: this.getTransportConfig(),
			});
		}
	}

	getTransportConfig(): LSPPluginTransportConfig {
		return {
			type: 'websocket',
			url: this.currentServerUrl,
		};
	}

	async getBibliographyEntries(): Promise<BibEntry[]> {
		const status = this.getConnectionStatus();
		if (status !== 'connected') {
			console.warn('[JabRefLSP] Not connected to LSP server');
			return [];
		}

		const client = genericLSPService.getClient(this.id);
		if (!client) {
			console.warn('[JabRefLSP] LSP client not available');
			return [];
		}

		try {
			const response = await (client as any).request('textDocument/completion', {
				textDocument: { uri: 'texlyre://bibliography' },
				position: { line: 0, character: 0 }
			});

			const completionItems = response?.items || [];
			console.log(`[JabRefLSP] Retrieved ${completionItems.length} entries from LSP server`);
			return completionItems.map((item: any) => this.parseCompletionItem(item));
		} catch (error) {
			console.error('[JabRefLSP] Error getting bibliography entries:', error);
			return [];
		}
	}

	private parseCompletionItem(item: any): BibEntry {
		const documentation = item.documentation || '';
		const fields = this.parseDocumentationFields(documentation);
		const entryType = this.extractEntryType(documentation) || 'article';
		const key = item.label || item.insertText || '';

		return {
			key,
			entryType,
			fields,
			rawEntry: this.constructRawEntry(key, fields, entryType)
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
		return ['tex', 'latex', 'typ', 'bib', 'bibtex'];
	}

	getSupportedLanguages(): string[] {
		return ['latex', 'typst', 'bibtex'];
	}

	isEnabled(): boolean {
		return true;
	}

	getConnectionStatus(): 'connected' | 'connecting' | 'disconnected' | 'error' {
		return genericLSPService.getConnectionStatus(this.id);
	}

	getStatusMessage(): string {
		const status = this.getConnectionStatus();
		switch (status) {
			case 'connected': return 'Connected to citation language server';
			case 'connecting': return 'Connecting to citation language server...';
			case 'error': return 'Failed to connect to citation language server';
			default: return '';
		}
	}

	renderPanel = (props: LSPPanelProps) => {
		return null;
	};
}

const jabrefLSPPlugin = new JabRefLSPPlugin();
export default jabrefLSPPlugin;