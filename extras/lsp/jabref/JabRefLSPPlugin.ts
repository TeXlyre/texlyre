// extras/lsp/jabref/JabRefLSPPlugin.ts
import type { LSPPlugin } from "../../../src/plugins/PluginInterface";
import type { LSPRequest, LSPResponse, LSPNotification } from "../../../src/types/lsp";
import JabRefPanel from "./JabRefPanel";
import { JabRefIcon } from "./Icon";
import { jabrefLSPSettings } from "./settings";

export const PLUGIN_NAME = "JabRef LSP";
export const PLUGIN_VERSION = "0.1.0";

class JabRefLSPPlugin implements LSPPlugin {
	id = "texlyre-jabref-lsp";
	name = PLUGIN_NAME;
	version = PLUGIN_VERSION;
	type = "lsp" as const;
	icon = JabRefIcon;
	settings = jabrefLSPSettings;

	private connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error' = 'disconnected';
	private statusMessage = '';

	getSupportedFileTypes(): string[] {
		return ['tex', 'latex', 'bib', 'bibtex'];
	}

	getSupportedLanguages(): string[] {
		return ['latex', 'bibtex'];
	}

	isEnabled(): boolean {
		return true;
	}

	getServerConfig() {
		return {
			transport: 'websocket' as const,
			host: 'localhost',
			port: 2087,
			settings: {
				citation: {
					bibliographies: [
						"~/Documents/*.bib",
						// "./references.bib"
					]
				}
			}
		};
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
		throw new Error('sendRequest should be handled by LSPExtension for TCP connections');
	}

	onNotification(notification: LSPNotification): void {
		console.log('[JabRefLSP] Received notification:', notification);

		switch (notification.method) {
			case 'window/logMessage':
				console.log('[JabRefLSP] Server log:', notification.params?.message);
				break;
			case 'textDocument/publishDiagnostics':
				break;
			default:
				console.log('[JabRefLSP] Unhandled notification:', notification.method);
		}
	}

	async shutdown(): Promise<void> {
		this.connectionStatus = 'disconnected';
		this.statusMessage = '';
	}

	renderPanel = JabRefPanel;
}

const jabrefLSPPlugin = new JabRefLSPPlugin();
export default jabrefLSPPlugin;