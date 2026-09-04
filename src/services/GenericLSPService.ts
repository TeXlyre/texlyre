// src/services/GenericLSPService.ts
import {
	LSPClient,
	type LSPClientConfig,
	type Transport,
} from '@codemirror/lsp-client';

import { createNamedLogger } from '@/logging';
import type { TransportConfig } from '@chelys/types/transport';
import { SEMANTIC_TOKEN_MODIFIERS, SEMANTIC_TOKEN_TYPES } from '../types/lsp';
import {
	ExternalServiceBase,
	type ExternalServiceConfig,
} from './ExternalServiceBase';

const moduleLog = createNamedLogger('GenericLSPService');
const HANDSHAKE_INIT_ID = -10001;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

type DiagnosticListener = (configId: string, params: any) => void;
type ApplyEditListener = (configId: string, edit: any) => void;
type SemanticTokensRefreshListener = (configId: string) => void;
type CapabilitiesListener = (configId: string) => void;
type JsonRecord = Record<string, any>;

interface ExtendedClientConfig extends LSPClientConfig {
	capabilities?: JsonRecord;
	rootUri?: string | null;
	workspaceFolders?: unknown[];
	initializationOptions?: unknown;
}

interface ConfigurationItem {
	section?: string;
}

interface JsonRpcMessage extends JsonRecord {
	id?: string | number;
	method?: string;
	params?: JsonRecord;
	result?: JsonRecord;
}

export interface LSPServerConfig extends ExternalServiceConfig {
	fileExtensions: string[];
	languageIdMap?: Record<string, string>;
	transportConfig: TransportConfig;
	clientConfig: LSPClientConfig;
}

const defaultClientCapabilities: JsonRecord = {
	textDocument: {
		synchronization: {
			didSave: true,
			willSave: false,
			willSaveWaitUntil: false,
		},
		publishDiagnostics: { relatedInformation: true },
		hover: { contentFormat: ['markdown', 'plaintext'] },
		completion: {
			contextSupport: true,
			completionItem: {
				snippetSupport: true,
				insertReplaceSupport: true,
				documentationFormat: ['markdown', 'plaintext'],
			},
		},
		declaration: { dynamicRegistration: false, linkSupport: true },
		definition: { dynamicRegistration: false, linkSupport: true },
		typeDefinition: { dynamicRegistration: false, linkSupport: true },
		implementation: { dynamicRegistration: false, linkSupport: true },
		documentHighlight: { dynamicRegistration: false },
		documentSymbol: {
			dynamicRegistration: false,
			hierarchicalDocumentSymbolSupport: true,
			tagSupport: { valueSet: [1] },
		},
		signatureHelp: {
			dynamicRegistration: false,
			contextSupport: false,
			signatureInformation: {
				documentationFormat: ['plaintext'],
				parameterInformation: { labelOffsetSupport: true },
				activeParameterSupport: true,
			},
		},
		codeAction: {
			codeActionLiteralSupport: {
				codeActionKind: { valueSet: ['quickfix'] },
			},
		},
		semanticTokens: {
			dynamicRegistration: false,
			requests: { full: true, range: false },
			tokenTypes: SEMANTIC_TOKEN_TYPES,
			tokenModifiers: SEMANTIC_TOKEN_MODIFIERS,
			formats: ['relative'],
			overlappingTokenSupport: false,
			multilineTokenSupport: false,
			augmentsSyntaxTokens: true,
		},
	},
	workspace: { workspaceFolders: true, configuration: true, applyEdit: true },
	window: { workDoneProgress: false },
};

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseMessage(message: string): JsonRpcMessage | null {
	try {
		const parsed: unknown = JSON.parse(message);
		return isRecord(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function mergeRecords(
	defaults: JsonRecord,
	overrides?: JsonRecord,
): JsonRecord {
	if (!overrides) return defaults;

	const result: JsonRecord = { ...defaults };
	for (const [key, value] of Object.entries(overrides)) {
		const current = result[key];
		result[key] =
			isRecord(current) && isRecord(value)
				? mergeRecords(current, value)
				: value;
	}
	return result;
}

function resolveConfigurationSection(
	settings: unknown,
	section?: string,
): unknown {
	if (!isRecord(settings)) return {};
	if (!section) return settings;
	if (Object.hasOwn(settings, section)) return settings[section];

	let nested: unknown = settings;
	for (const key of section.split('.')) {
		nested = isRecord(nested) ? nested[key] : undefined;
	}
	if (nested !== undefined) return nested;

	const prefix = `${section}.`;
	const collected: JsonRecord = {};
	let found = false;
	for (const [key, value] of Object.entries(settings)) {
		if (!key.startsWith(prefix)) continue;
		const parts = key.slice(prefix.length).split('.');
		let cursor = collected;
		for (let index = 0; index < parts.length - 1; index++) {
			const part = parts[index];
			if (!isRecord(cursor[part])) cursor[part] = {};
			cursor = cursor[part];
		}
		cursor[parts.at(-1)!] = value;
		found = true;
	}
	return found ? collected : {};
}

function logServerMessage(configId: string, params?: JsonRecord): void {
	const text = typeof params?.message === 'string' ? params.message : '';
	if (!text) return;

	const label = `[${configId}] ${text}`;
	switch (params?.type) {
		case 1:
			moduleLog.error(label);
			break;
		case 2:
			moduleLog.warn(label);
			break;
		case 3:
			moduleLog.info(label);
			break;
		default:
			moduleLog.debug(label);
	}
}

class GenericLSPService extends ExternalServiceBase<LSPServerConfig> {
	protected readonly transportLabel = 'lsp';

	private readonly clients = new Map<string, LSPClient>();
	private readonly clientIds = new WeakMap<LSPClient, string>();
	private readonly initializing = new Map<string, Promise<void>>();
	private readonly diagnosticListeners = new Set<DiagnosticListener>();
	private readonly applyEditListeners = new Set<ApplyEditListener>();
	private readonly semanticTokensRefreshListeners =
		new Set<SemanticTokensRefreshListener>();
	private readonly capabilitiesListeners = new Set<CapabilitiesListener>();
	private readonly lastDiagnostics = new Map<string, string>();

	registerConfig(config: LSPServerConfig): void {
		this.configs.set(config.id, config);
		this.setConnectionStatus(config.id, 'disconnected');
		if (config.enabled && config.clientConfig) {
			moduleLog.info(`Registering LSP server: ${config.name} (${config.id})`);
			void this.initializeClient(config);
		}
	}

	unregisterConfig(configId: string): void {
		this.disconnectClient(configId);
		this.configs.delete(configId);
		this.clearConnectionStatus(configId);
	}

	onDiagnostics(listener: DiagnosticListener): () => void {
		this.diagnosticListeners.add(listener);
		return () => this.diagnosticListeners.delete(listener);
	}

	onApplyEdit(listener: ApplyEditListener): () => void {
		this.applyEditListeners.add(listener);
		return () => this.applyEditListeners.delete(listener);
	}

	onSemanticTokensRefresh(listener: SemanticTokensRefreshListener): () => void {
		this.semanticTokensRefreshListeners.add(listener);
		return () => this.semanticTokensRefreshListeners.delete(listener);
	}

	onCapabilitiesChange(listener: CapabilitiesListener): () => void {
		this.capabilitiesListeners.add(listener);
		return () => this.capabilitiesListeners.delete(listener);
	}

	getLanguageIdMap(configId: string): Record<string, string> | undefined {
		return this.configs.get(configId)?.languageIdMap;
	}

	getConfigId(client: LSPClient): string | undefined {
		return this.clientIds.get(client);
	}

	getClient(configId: string): LSPClient | null {
		return this.clients.get(configId) ?? null;
	}

	reconnect(configId: string): void {
		const config = this.configs.get(configId);
		if (!config) return;
		this.disconnectClient(configId);
		if (config.enabled && config.clientConfig) {
			void this.initializeClient(config);
		}
	}

	getAllClientsForFile(fileName: string): LSPClient[] {
		const extension = fileName.split('.').pop()?.toLowerCase();
		if (!extension) return [];

		const clients: LSPClient[] = [];
		for (const [configId, config] of this.configs) {
			if (!config.enabled || !config.fileExtensions.includes(extension)) {
				continue;
			}
			const client = this.clients.get(configId);
			if (client) clients.push(client);
		}
		return clients;
	}

	updateConfig(configId: string, updates: Partial<LSPServerConfig>): void {
		const current = this.configs.get(configId);
		if (!current) return;

		const updated = { ...current, ...updates };
		this.configs.set(configId, updated);
		const transportChanged =
			updates.transportConfig !== undefined &&
			this.transportChanged(current.transportConfig, updates.transportConfig);
		const clientConfigChanged =
			updates.clientConfig !== undefined &&
			JSON.stringify(updates.clientConfig) !==
				JSON.stringify(current.clientConfig);

		if (!updated.enabled) {
			if (current.enabled) this.disconnectClient(configId);
			return;
		}
		if (!current.enabled || transportChanged || clientConfigChanged) {
			if (current.enabled) this.disconnectClient(configId);
			if (updated.clientConfig) void this.initializeClient(updated);
		}
	}

	cleanup(): void {
		moduleLog.info(`Cleaning up ${this.clients.size} LSP connections`);
		for (const configId of Array.from(this.clients.keys())) {
			this.disconnectClient(configId);
		}
		this.cleanupTransports();
		this.diagnosticListeners.clear();
		this.applyEditListeners.clear();
		this.semanticTokensRefreshListeners.clear();
		this.capabilitiesListeners.clear();
		this.lastDiagnostics.clear();
	}

	private async initializeClient(config: LSPServerConfig): Promise<void> {
		const pending = this.initializing.get(config.id);
		if (pending) return pending;

		const attempt = this.doInitializeClient(config);
		this.initializing.set(config.id, attempt);
		try {
			await attempt;
		} finally {
			if (this.initializing.get(config.id) === attempt) {
				this.initializing.delete(config.id);
			}
		}
	}

	private async doInitializeClient(config: LSPServerConfig): Promise<void> {
		try {
			const clientConfig = config.clientConfig as ExtendedClientConfig;
			const { capabilities, ...rest } = clientConfig;
			const client = new LSPClient({ ...rest, extensions: [] });
			const transport = await this.createTransport(config);
			client.connect(
				this.wrapTransport(config.id, transport, capabilities, rest),
			);
			this.clients.set(config.id, client);
			this.clientIds.set(client, config.id);
			moduleLog.info(`Connected to LSP server: ${config.name}`);
		} catch (error) {
			moduleLog.error(`Failed to connect to ${config.name}:`, error);
			this.closeTransport(config.id);
			this.setConnectionStatus(config.id, 'error');
		}
	}

	private wrapTransport(
		configId: string,
		transport: Transport,
		userCapabilities: JsonRecord | undefined,
		clientConfig: ExtendedClientConfig,
	): Transport {
		let handshakeComplete = false;
		let downstreamHandler: ((value: string) => void) | null = null;
		const outgoingQueue: string[] = [];
		const capabilities = mergeRecords(
			defaultClientCapabilities,
			userCapabilities,
		);

		const completeHandshake = (serverCapabilities: unknown): void => {
			transport.send(
				JSON.stringify({
					jsonrpc: '2.0',
					method: 'initialized',
					params: {},
				}),
			);
			handshakeComplete = true;

			const client = this.clients.get(configId);
			if (client) {
				(
					client as LSPClient & { serverCapabilities?: unknown }
				).serverCapabilities = serverCapabilities ?? {};
			}
			for (const listener of this.capabilitiesListeners) {
				try {
					listener(configId);
				} catch (error) {
					moduleLog.error('Capabilities listener error:', error);
				}
			}
			for (const message of outgoingQueue.splice(0)) {
				transport.send(message);
			}
		};

		transport.subscribe((message: string) => {
			const parsed = parseMessage(message);
			if (parsed) {
				if (
					!handshakeComplete &&
					parsed.id === HANDSHAKE_INIT_ID &&
					parsed.result
				) {
					completeHandshake(parsed.result.capabilities);
					return;
				}

				if (
					parsed.method === 'workspace/configuration' &&
					parsed.id !== undefined
				) {
					const items = Array.isArray(parsed.params?.items)
						? (parsed.params.items as ConfigurationItem[])
						: [];
					const result = items.map((item) =>
						resolveConfigurationSection(
							clientConfig.initializationOptions,
							item.section,
						),
					);
					transport.send(
						JSON.stringify({ jsonrpc: '2.0', id: parsed.id, result }),
					);
					return;
				}

				this.handleServerNotification(configId, parsed, transport);
			}
			downstreamHandler?.(message);
		});

		transport.send(
			JSON.stringify({
				jsonrpc: '2.0',
				id: HANDSHAKE_INIT_ID,
				method: 'initialize',
				params: {
					processId: null,
					clientInfo: { name: 'TeXlyre' },
					rootUri: clientConfig.rootUri ?? null,
					workspaceFolders: clientConfig.workspaceFolders ?? [],
					capabilities,
					initializationOptions: clientConfig.initializationOptions,
				},
			}),
		);

		return {
			send: (message: string) => {
				const parsed = parseMessage(message);
				if (parsed?.method === 'initialize' && parsed.id !== undefined) {
					const response = JSON.stringify({
						jsonrpc: '2.0',
						id: parsed.id,
						result: { capabilities },
					});
					setTimeout(() => downstreamHandler?.(response), 0);
					return;
				}
				if (parsed?.method === 'initialized') return;

				if (handshakeComplete) transport.send(message);
				else outgoingQueue.push(message);
			},
			subscribe: (handler: (value: string) => void) => {
				downstreamHandler = handler;
			},
			unsubscribe: () => {
				downstreamHandler = null;
			},
		};
	}

	private handleServerNotification(
		configId: string,
		message: JsonRpcMessage,
		transport: Transport,
	): void {
		if (
			message.method === 'textDocument/publishDiagnostics' &&
			message.params
		) {
			const key = `${configId}:${String(message.params.uri)}`;
			const fingerprint = JSON.stringify(message.params.diagnostics ?? []);
			if (this.lastDiagnostics.get(key) !== fingerprint) {
				this.lastDiagnostics.set(key, fingerprint);
				for (const listener of this.diagnosticListeners) {
					try {
						listener(configId, message.params);
					} catch (error) {
						moduleLog.error('Diagnostic listener error:', error);
					}
				}
			}
		}

		if (message.method === 'workspace/applyEdit' && message.id !== undefined) {
			for (const listener of this.applyEditListeners) {
				try {
					listener(configId, message.params?.edit);
				} catch (error) {
					moduleLog.error('Apply edit listener error:', error);
				}
			}
			transport.send(
				JSON.stringify({
					jsonrpc: '2.0',
					id: message.id,
					result: { applied: true },
				}),
			);
		}

		if (
			message.method === 'workspace/semanticTokens/refresh' &&
			message.id !== undefined
		) {
			for (const listener of this.semanticTokensRefreshListeners) {
				try {
					listener(configId);
				} catch (error) {
					moduleLog.error('Semantic tokens listener error:', error);
				}
			}
			transport.send(
				JSON.stringify({ jsonrpc: '2.0', id: message.id, result: null }),
			);
		}

		if (
			message.method === 'window/logMessage' ||
			message.method === 'window/showMessage'
		) {
			logServerMessage(configId, message.params);
		}

		if (
			message.method === 'window/showMessageRequest' &&
			message.id !== undefined
		) {
			logServerMessage(configId, message.params);
			transport.send(
				JSON.stringify({ jsonrpc: '2.0', id: message.id, result: null }),
			);
		}
	}

	private async createTransport(config: LSPServerConfig): Promise<Transport> {
		const transport = await this.openTransport(config);
		const handlers = new Set<(value: string) => void>();
		const pendingMessages: string[] = [];
		const useContentLength = config.transportConfig.contentLength ?? false;
		let buffer = '';

		const dispatch = (message: string): void => {
			if (handlers.size === 0) {
				pendingMessages.push(message);
				return;
			}
			for (const handler of handlers) handler(message);
		};

		const processBuffer = (): void => {
			while (buffer.length > 0) {
				const headerEnd = buffer.indexOf('\r\n\r\n');
				if (headerEnd === -1) return;
				const match = buffer
					.slice(0, headerEnd)
					.match(/Content-Length:\s*(\d+)/i);
				if (!match) return;

				const contentLength = Number.parseInt(match[1], 10);
				const bodyStart = headerEnd + 4;
				if (buffer.length < bodyStart + contentLength) return;

				dispatch(buffer.slice(bodyStart, bodyStart + contentLength));
				buffer = buffer.slice(bodyStart + contentLength);
			}
		};

		transport.onMessage((payload) => {
			const data =
				typeof payload === 'string' ? payload : textDecoder.decode(payload);
			if (!useContentLength) {
				dispatch(data);
				return;
			}
			buffer += data;
			processBuffer();
		});
		transport.onClose(() => {
			buffer = '';
		});

		return {
			send: (message: string) => {
				transport.send(
					useContentLength
						? `Content-Length: ${textEncoder.encode(message).byteLength}\r\n\r\n${message}`
						: message,
				);
			},
			subscribe: (handler: (value: string) => void) => {
				handlers.add(handler);
				for (const message of pendingMessages.splice(0)) handler(message);
			},
			unsubscribe: (handler: (value: string) => void) => {
				handlers.delete(handler);
			},
		};
	}

	private disconnectClient(configId: string): void {
		this.initializing.delete(configId);
		const client = this.clients.get(configId);
		if (client) {
			try {
				client.disconnect();
				moduleLog.info(`Disconnecting from LSP server: ${configId}`);
			} catch (error) {
				moduleLog.error(`Error disconnecting LSP client ${configId}:`, error);
			}
			this.clients.delete(configId);
		}
		this.closeTransport(configId);
		this.clearDiagnostics(configId);
		this.setConnectionStatus(configId, 'disconnected');
	}

	protected handleTransportClose(configId: string): void {
		const client = this.clients.get(configId);
		if (client) {
			try {
				client.disconnect();
			} catch (error) {
				moduleLog.error(`Error disconnecting LSP client ${configId}:`, error);
			}
			this.clients.delete(configId);
		}
		this.clearDiagnostics(configId);
	}

	private clearDiagnostics(configId: string): void {
		const prefix = `${configId}:`;
		for (const key of this.lastDiagnostics.keys()) {
			if (key.startsWith(prefix)) this.lastDiagnostics.delete(key);
		}
	}
}

export const genericLSPService = new GenericLSPService();
