// src/extensions/codemirror/LSPExtension.ts
import { type CompletionContext, type CompletionResult, type CompletionSource } from "@codemirror/autocomplete";
import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { ViewPlugin, type EditorView } from "@codemirror/view";
import { type LSPRequest, type LSPResponse, type LSPCompletionItem } from "../../types/lsp";
import type { LSPPlugin } from "../../plugins/PluginInterface";

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

	constructor(view: EditorView) {
		this.view = view;
	}

	updatePlugins(plugins: LSPPlugin[]) {
		this.plugins = plugins;
		this.plugins.forEach(plugin => {
			if (plugin.isEnabled() && !this.connections.has(plugin.id)) {
				this.initializePlugin(plugin);
			}
		});
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
					console.log('[LSPExtension] Raw WebSocket message:', event.data);
					this.handleWebSocketMessage(pluginId, message);
				} catch (error) {
					console.error('[LSPExtension] Error parsing WebSocket message:', error);
				}
			};

			await new Promise((resolve, reject) => {
				connection.client.onopen = () => {
					console.log('[LSPExtension] WebSocket connected successfully');
					resolve(void 0);
				};
				connection.client.onerror = (error) => {
					console.error('[LSPExtension] WebSocket connection failed:', error);
					reject(new Error(`Failed to connect to citation server at ${wsUrl}`));
				};

				// Add timeout
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

		console.log('[LSPExtension] Sending initialize request:', initializeRequest);
		await this.sendWebSocketRequest(pluginId, initializeRequest);

		console.log('[LSPExtension] Sending initialized notification');
		this.sendWebSocketNotification(pluginId, { method: 'initialized', params: {} });

		if (Object.keys(settings).length > 0) {
			console.log('[LSPExtension] Sending configuration change:', settings);
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
		console.log('[LSPExtension] Received WebSocket message:', message);

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

			// Handle both WebSocket and TCP clients
			if (connection.client.send) {
				// WebSocket client
				connection.client.send(message);
			} else {
				// TCP client
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

	async getCompletions(context: CompletionContext): Promise<LSPCompletionItem[]> {
		const document = context.state.doc.toString();
		const position = context.pos;
		const line = context.state.doc.lineAt(position);
		const character = position - line.from;

		const allCompletions: LSPCompletionItem[] = [];

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

					let response;
					const connection = this.connections.get(plugin.id);

					if (connection && connection.type === 'websocket') {
						response = await this.sendWebSocketRequest(plugin.id, request);
					} else if (connection && connection.type === 'tcp') {
						response = await this.sendTCPRequest(plugin.id, request);
					} else {
						response = await plugin.sendRequest(request);
					}

					if (response.result && Array.isArray(response.result.items)) {
						allCompletions.push(...response.result.items);
					}
				}
			} catch (error) {
				console.error(`[LSPExtension] Error getting completions from ${plugin.name}:`, error);
			}
		}

		return allCompletions;
	}

	private getDocumentUri(): string {
		const currentUrl = window.location.hash;
		return `texlyre://${currentUrl}`;
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

		const options = completions.map(item => ({
			label: item.label,
			detail: item.detail,
			info: item.documentation,
			apply: item.insertText || item.label,
			boost: item.sortText ? parseInt(item.sortText) : 0,
		}));

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