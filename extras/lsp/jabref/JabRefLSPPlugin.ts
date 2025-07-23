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

	private websocket: WebSocket | null = null;
	private connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error' = 'disconnected';
	private statusMessage = '';
	private requestId = 0;
	private pendingRequests = new Map<number, { resolve: Function; reject: Function }>();
	private serverUrl = 'ws://localhost:8080/lsp';

	getSupportedFileTypes(): string[] {
		return ['tex', 'latex', 'bib', 'bibtex'];
	}

	getSupportedLanguages(): string[] {
		return ['latex', 'bibtex'];
	}

	isEnabled(): boolean {
		// Check if user has enabled JabRef LSP in settings
		return true; // This would be controlled by settings
	}

	getConnectionStatus() {
		return this.connectionStatus;
	}

	getStatusMessage() {
		return this.statusMessage;
	}

	async initialize(): Promise<void> {
		try {
			this.connectionStatus = 'connecting';
			this.statusMessage = 'Connecting to JabRef LSP server...';

			this.websocket = new WebSocket(this.serverUrl);

			return new Promise((resolve, reject) => {
				if (!this.websocket) {
					reject(new Error('Failed to create WebSocket'));
					return;
				}

				this.websocket.onopen = () => {
					this.connectionStatus = 'connected';
					this.statusMessage = 'Connected to JabRef LSP server';
					console.log('[JabRefLSP] Connected to server');

					// Send initialize request
					this.sendInitializeRequest().then(() => {
						resolve();
					}).catch(reject);
				};

				this.websocket.onmessage = (event) => {
					try {
						const message = JSON.parse(event.data);
						this.handleMessage(message);
					} catch (error) {
						console.error('[JabRefLSP] Error parsing message:', error);
					}
				};

				this.websocket.onclose = () => {
					this.connectionStatus = 'disconnected';
					this.statusMessage = 'Disconnected from JabRef LSP server';
					console.log('[JabRefLSP] Disconnected from server');
				};

				this.websocket.onerror = (error) => {
					this.connectionStatus = 'error';
					this.statusMessage = 'Failed to connect to JabRef LSP server';
					console.error('[JabRefLSP] WebSocket error:', error);
					reject(new Error('WebSocket connection failed'));
				};

				// Timeout after 5 seconds
				setTimeout(() => {
					if (this.connectionStatus === 'connecting') {
						reject(new Error('Connection timeout'));
					}
				}, 5000);
			});
		} catch (error) {
			this.connectionStatus = 'error';
			this.statusMessage = `Connection error: ${error instanceof Error ? error.message : 'Unknown error'}`;
			throw error;
		}
	}

	private async sendInitializeRequest(): Promise<void> {
		const initializeRequest: LSPRequest = {
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
						}
					}
				},
				workspaceFolders: null
			}
		};

		await this.sendRequest(initializeRequest);

		// Send initialized notification
		this.sendNotification({
			method: 'initialized',
			params: {}
		});
	}

	private sendNotification(notification: LSPNotification): void {
		if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
			this.websocket.send(JSON.stringify(notification));
		}
	}

	private handleMessage(message: any): void {
		if (message.id !== undefined) {
			// This is a response
			const pending = this.pendingRequests.get(message.id);
			if (pending) {
				this.pendingRequests.delete(message.id);
				if (message.error) {
					pending.reject(new Error(message.error.message));
				} else {
					pending.resolve(message);
				}
			}
		} else {
			// This is a notification
			this.onNotification(message);
		}
	}

	shouldTriggerCompletion(document: string, position: number, lineText: string): boolean {
		// Check if we're in a LaTeX citation context
		const citationPatterns = [
			/\\cite\w*\{[^}]*$/,           // \cite{...
			/\\autocite\w*\{[^}]*$/,      // \autocite{...
			/\\textcite\w*\{[^}]*$/,      // \textcite{...
			/\\parencite\w*\{[^}]*$/,     // \parencite{...
			/\\footcite\w*\{[^}]*$/,      // \footcite{...
		];

		return citationPatterns.some(pattern => pattern.test(lineText));
	}

	async sendRequest(request: LSPRequest): Promise<LSPResponse> {
		return new Promise((resolve, reject) => {
			if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
				reject(new Error('WebSocket not connected'));
				return;
			}

			const id = ++this.requestId;
			const messageWithId = { ...request, id };

			this.pendingRequests.set(id, { resolve, reject });
			this.websocket.send(JSON.stringify(messageWithId));

			// Timeout after 10 seconds
			setTimeout(() => {
				if (this.pendingRequests.has(id)) {
					this.pendingRequests.delete(id);
					reject(new Error('Request timeout'));
				}
			}, 10000);
		});
	}

	onNotification(notification: LSPNotification): void {
		console.log('[JabRefLSP] Received notification:', notification);

		// Handle specific notifications from JabRef
		switch (notification.method) {
			case 'window/logMessage':
				console.log('[JabRefLSP] Server log:', notification.params?.message);
				break;
			case 'textDocument/publishDiagnostics':
				// Handle diagnostics if needed
				break;
			default:
				console.log('[JabRefLSP] Unhandled notification:', notification.method);
		}
	}

	async shutdown(): Promise<void> {
		if (this.websocket) {
			// Send shutdown request
			try {
				await this.sendRequest({ method: 'shutdown', params: null });
			} catch (error) {
				console.warn('[JabRefLSP] Error during shutdown request:', error);
			}

			// Send exit notification
			this.sendNotification({ method: 'exit', params: null });

			// Close WebSocket
			this.websocket.close();
			this.websocket = null;
		}

		this.connectionStatus = 'disconnected';
		this.statusMessage = '';
		this.pendingRequests.clear();
	}

	renderPanel = JabRefPanel;
}

const jabrefLSPPlugin = new JabRefLSPPlugin();
export default jabrefLSPPlugin;