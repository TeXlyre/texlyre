// src/services/GenericACPService.ts
import { createNamedLogger } from '@/logging';
import type {
	ClientTransport,
	TransportPayload,
} from '@chelys/types/transport';
import {
	ACP_PROTOCOL_VERSION,
	type ACPClientCapabilities,
	type ACPContentBlock,
	type ACPInitializeResponse,
	type ACPLoadSessionResponse,
	type ACPMcpServer,
	type ACPNewSessionResponse,
	type ACPPermissionOutcome,
	type ACPPromptResponse,
	type ACPReadTextFileRequest,
	type ACPRequestPermissionRequest,
	type ACPServerConfig,
	type ACPSessionId,
	type ACPSessionNotification,
	type ACPWriteTextFileRequest,
} from '../types/acp';
import { ExternalServiceBase } from './ExternalServiceBase';
import { DocumentEventCompiler, type ProjectCompiler } from './ProjectCompiler';
import {
	type ProjectFileSystem,
	YjsProjectFileSystem,
} from './ProjectFileSystem';
import { ProjectMCPServer } from './ProjectMCPServer';

const moduleLog = createNamedLogger('GenericACPService');
const textDecoder = new TextDecoder();

// Session cwd sent when the recipe sets none. Agents that insist on a real
// directory sit behind texlyre-acp-bridge, which substitutes its workspace and
// reports it back as _meta.texlyre.cwd on the session/new result. ACP fs/*
// paths are mapped beneath whichever cwd the session ends up with.
export const DEFAULT_ACP_CWD = '/texlyre';

// Extension method the bridge uses to tunnel MCP messages from the agent's
// HTTP MCP client to the project tools served here.
export const TEXLYRE_MCP_METHOD = '_texlyre/mcp';

const CLIENT_INFO = { name: 'texlyre', title: 'TeXlyre', version: '1' };

const CLIENT_CAPABILITIES: ACPClientCapabilities = {
	fs: { readTextFile: true, writeTextFile: true },
	terminal: false,
};

const JSON_RPC_METHOD_NOT_FOUND = -32601;
const JSON_RPC_INVALID_PARAMS = -32602;
const JSON_RPC_INTERNAL_ERROR = -32603;

type JsonRpcId = string | number;

interface JsonRpcMessage {
	jsonrpc: '2.0';
	id?: JsonRpcId;
	method?: string;
	params?: unknown;
	result?: unknown;
	error?: { code: number; message: string; data?: unknown };
}

interface PendingRequest {
	method: string;
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
}

interface AgentConnection {
	transport: ClientTransport;
	nextId: number;
	buffer: string;
	pending: Map<JsonRpcId, PendingRequest>;
	// Session id -> cwd the agent resolves paths against.
	sessions: Map<ACPSessionId, string>;
	initialized: ACPInitializeResponse | null;
	unsubscribe: () => void;
}

class RpcError extends Error {
	constructor(
		readonly code: number,
		message: string,
	) {
		super(message);
	}
}

export type SessionUpdateListener = (
	configId: string,
	notification: ACPSessionNotification,
) => void;

export type PermissionHandler = (
	configId: string,
	request: ACPRequestPermissionRequest,
) => Promise<ACPPermissionOutcome>;

const denyAllPermissions: PermissionHandler = async () => ({
	outcome: 'cancelled',
});

// Maps an absolute agent path beneath cwd onto a project path. Anything outside
// cwd or containing traversal segments is refused rather than normalised.
export const toProjectPath = (cwd: string, agentPath: string): string => {
	const root = cwd.replace(/\/+$/, '');
	if (!agentPath.startsWith(`${root}/`)) {
		throw new RpcError(
			JSON_RPC_INVALID_PARAMS,
			`Path is outside the project: ${agentPath}`,
		);
	}

	const segments = agentPath.slice(root.length + 1).split('/');
	if (segments.some((part) => part === '..' || part === '.' || part === '')) {
		throw new RpcError(
			JSON_RPC_INVALID_PARAMS,
			`Path must be normalised: ${agentPath}`,
		);
	}

	return `/${segments.join('/')}`;
};

export const sliceLines = (
	content: string,
	line?: number | null,
	limit?: number | null,
): string => {
	if (!line && !limit) return content;
	const lines = content.split('\n');
	const start = Math.max((line ?? 1) - 1, 0);
	const end = limit ? start + limit : undefined;
	return lines.slice(start, end).join('\n');
};

export class GenericACPService extends ExternalServiceBase<ACPServerConfig> {
	protected readonly transportLabel = 'acp';

	private readonly connections = new Map<string, AgentConnection>();
	private readonly sessionUpdateListeners = new Set<SessionUpdateListener>();
	private permissionHandler: PermissionHandler = denyAllPermissions;
	private fileSystem: ProjectFileSystem = new YjsProjectFileSystem();
	private compiler: ProjectCompiler | null = new DocumentEventCompiler();
	private mcpServer = new ProjectMCPServer(this.fileSystem, this.compiler);

	registerConfig(config: ACPServerConfig): void {
		this.configs.set(config.id, config);
	}

	updateConfig(configId: string, config: ACPServerConfig): void {
		const current = this.configs.get(configId);
		this.configs.set(configId, config);
		if (
			current &&
			this.transportChanged(current.transportConfig, config.transportConfig)
		) {
			this.disconnect(configId);
		}
	}

	unregisterConfig(configId: string): void {
		this.disconnect(configId);
		this.configs.delete(configId);
		this.clearConnectionStatus(configId);
	}

	onSessionUpdate(listener: SessionUpdateListener): () => void {
		this.sessionUpdateListeners.add(listener);
		return () => this.sessionUpdateListeners.delete(listener);
	}

	setPermissionHandler(handler: PermissionHandler | null): void {
		this.permissionHandler = handler ?? denyAllPermissions;
	}

	setFileSystem(fileSystem: ProjectFileSystem): void {
		this.fileSystem = fileSystem;
		this.mcpServer = new ProjectMCPServer(fileSystem, this.compiler);
	}

	setCompiler(compiler: ProjectCompiler | null): void {
		this.compiler = compiler;
		this.mcpServer = new ProjectMCPServer(this.fileSystem, compiler);
	}

	getAgentInfo(configId: string): ACPInitializeResponse | null {
		return this.connections.get(configId)?.initialized ?? null;
	}

	async connect(configId: string): Promise<ACPInitializeResponse> {
		const existing = this.connections.get(configId);
		if (existing?.initialized && existing.transport.isOpen) {
			return existing.initialized;
		}

		const config = this.requireConfig(configId);
		const transport = await this.openTransport(config);
		const connection = this.attach(configId, transport);

		const response = (await this.request(configId, 'initialize', {
			protocolVersion: ACP_PROTOCOL_VERSION,
			clientCapabilities: CLIENT_CAPABILITIES,
			clientInfo: CLIENT_INFO,
		})) as ACPInitializeResponse;

		if (response.protocolVersion !== ACP_PROTOCOL_VERSION) {
			this.disconnect(configId);
			throw new Error(
				`${config.name} speaks ACP v${response.protocolVersion}, TeXlyre needs v${ACP_PROTOCOL_VERSION}`,
			);
		}

		connection.initialized = response;
		return response;
	}

	async newSession(configId: string): Promise<ACPSessionId> {
		await this.connect(configId);
		const config = this.requireConfig(configId);

		const sessionMeta = this.sessionMetaOf(config);
		const response = (await this.request(configId, 'session/new', {
			cwd: this.cwdOf(config),
			mcpServers: this.mcpServersOf(config),
			...(sessionMeta ? { _meta: sessionMeta } : {}),
		})) as ACPNewSessionResponse;

		this.recordSession(configId, config, response.sessionId, response);
		return response.sessionId;
	}

	canLoadSession(configId: string): boolean {
		return Boolean(
			this.connections.get(configId)?.initialized?.agentCapabilities
				?.loadSession,
		);
	}

	// Resumes an earlier session. The agent replays its history as
	// session/update notifications before answering; callers that already hold
	// the transcript ignore them by only listening once this resolves.
	async loadSession(configId: string, sessionId: ACPSessionId): Promise<void> {
		await this.connect(configId);
		const config = this.requireConfig(configId);
		if (!this.canLoadSession(configId)) {
			throw new Error(`${config.name} cannot resume earlier sessions`);
		}

		const sessionMeta = this.sessionMetaOf(config);
		const response = (await this.request(configId, 'session/load', {
			sessionId,
			cwd: this.cwdOf(config),
			mcpServers: this.mcpServersOf(config),
			...(sessionMeta ? { _meta: sessionMeta } : {}),
		})) as ACPLoadSessionResponse | null;

		this.recordSession(configId, config, sessionId, response);
	}

	async prompt(
		configId: string,
		sessionId: ACPSessionId,
		prompt: ACPContentBlock[],
	): Promise<ACPPromptResponse> {
		this.requireSession(configId, sessionId);
		return (await this.request(configId, 'session/prompt', {
			sessionId,
			prompt,
		})) as ACPPromptResponse;
	}

	cancel(configId: string, sessionId: ACPSessionId): void {
		this.requireSession(configId, sessionId);
		this.notify(configId, 'session/cancel', { sessionId });
	}

	disconnect(configId: string): void {
		this.detach(configId, new Error('Agent disconnected'));
		this.closeTransport(configId);
	}

	cleanup(): void {
		for (const configId of [...this.connections.keys()]) {
			this.detach(configId, new Error('ACP service cleaned up'));
		}
		this.sessionUpdateListeners.clear();
		this.permissionHandler = denyAllPermissions;
		this.cleanupTransports();
	}

	protected handleTransportClose(configId: string): void {
		this.detach(configId, new Error('Agent connection closed'));
	}

	private requireConfig(configId: string): ACPServerConfig {
		const config = this.configs.get(configId);
		if (!config) throw new Error(`Unknown agent: ${configId}`);
		if (!config.enabled) throw new Error(`Agent is disabled: ${config.name}`);
		return config;
	}

	private requireSession(configId: string, sessionId: ACPSessionId): void {
		if (!this.connections.get(configId)?.sessions.has(sessionId)) {
			throw new Error(`Unknown session ${sessionId} for agent ${configId}`);
		}
	}

	private recordSession(
		configId: string,
		config: ACPServerConfig,
		sessionId: ACPSessionId,
		response: ACPLoadSessionResponse | null,
	): void {
		const bridgedCwd = response?._meta?.texlyre?.cwd;
		this.connections
			.get(configId)
			?.sessions.set(
				sessionId,
				typeof bridgedCwd === 'string' && bridgedCwd
					? bridgedCwd
					: this.cwdOf(config),
			);
	}

	private cwdOf(config: ACPServerConfig): string {
		return config.cwd?.trim() || DEFAULT_ACP_CWD;
	}

	private mcpServersOf(config: ACPServerConfig): ACPMcpServer[] {
		if (!config.mcpServers?.trim()) return [];
		try {
			const parsed = JSON.parse(config.mcpServers);
			return Array.isArray(parsed) ? parsed : [];
		} catch (error) {
			moduleLog.warn(`Ignoring invalid mcpServers for ${config.name}:`, error);
			return [];
		}
	}

	private sessionMetaOf(
		config: ACPServerConfig,
	): Record<string, unknown> | null {
		if (!config.sessionMeta?.trim()) return null;
		try {
			const parsed = JSON.parse(config.sessionMeta);
			return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
				? parsed
				: null;
		} catch (error) {
			moduleLog.warn(`Ignoring invalid sessionMeta for ${config.name}:`, error);
			return null;
		}
	}

	private attach(
		configId: string,
		transport: ClientTransport,
	): AgentConnection {
		const current = this.connections.get(configId);
		if (current?.transport === transport) return current;
		if (current) this.detach(configId, new Error('Agent reconnected'));

		const connection: AgentConnection = {
			transport,
			nextId: 1,
			buffer: '',
			pending: new Map(),
			sessions: new Map(),
			initialized: null,
			unsubscribe: () => undefined,
		};
		connection.unsubscribe = transport.onMessage((payload) =>
			this.receive(configId, connection, payload),
		);
		this.connections.set(configId, connection);
		return connection;
	}

	private detach(configId: string, reason: Error): void {
		const connection = this.connections.get(configId);
		if (!connection) return;
		this.connections.delete(configId);
		connection.unsubscribe();
		for (const pending of connection.pending.values()) pending.reject(reason);
		connection.pending.clear();
	}

	// Proxies such as websocat deliver one line per frame with the newline
	// stripped, while raw stream bridges may split or batch lines. Accept both.
	private receive(
		configId: string,
		connection: AgentConnection,
		payload: TransportPayload,
	): void {
		const data =
			typeof payload === 'string' ? payload : textDecoder.decode(payload);
		connection.buffer += data;

		const lines = connection.buffer.split('\n');
		connection.buffer = lines.pop() ?? '';

		const tail = connection.buffer.trim();
		if (tail) {
			try {
				JSON.parse(tail);
				lines.push(tail);
				connection.buffer = '';
			} catch {
				// Incomplete message; wait for the rest of the line.
			}
		}

		for (const line of lines) {
			if (!line.trim()) continue;
			let message: JsonRpcMessage;
			try {
				message = JSON.parse(line);
			} catch (error) {
				moduleLog.warn(
					`Dropping malformed ACP message from ${configId}:`,
					error,
				);
				continue;
			}
			this.dispatch(configId, connection, message);
		}
	}

	private dispatch(
		configId: string,
		connection: AgentConnection,
		message: JsonRpcMessage,
	): void {
		if (message.method === undefined) {
			this.settle(connection, message);
			return;
		}

		if (message.id === undefined) {
			this.handleNotification(configId, message.method, message.params);
			return;
		}

		const id = message.id;
		void this.handleRequest(configId, message.method, message.params).then(
			(result) => this.reply(configId, { jsonrpc: '2.0', id, result }),
			(error: unknown) =>
				this.reply(configId, {
					jsonrpc: '2.0',
					id,
					error: {
						code:
							error instanceof RpcError ? error.code : JSON_RPC_INTERNAL_ERROR,
						message: error instanceof Error ? error.message : String(error),
					},
				}),
		);
	}

	private reply(configId: string, message: JsonRpcMessage): void {
		try {
			this.send(configId, message);
		} catch (error) {
			moduleLog.warn(`Could not answer ACP request from ${configId}:`, error);
		}
	}

	private settle(connection: AgentConnection, message: JsonRpcMessage): void {
		if (message.id === undefined) return;
		const pending = connection.pending.get(message.id);
		if (!pending) return;
		connection.pending.delete(message.id);

		if (message.error) {
			pending.reject(
				new Error(`${pending.method} failed: ${message.error.message}`),
			);
		} else {
			pending.resolve(message.result ?? null);
		}
	}

	private handleNotification(
		configId: string,
		method: string,
		params: unknown,
	): void {
		if (method !== 'session/update') {
			moduleLog.debug(`Ignoring ACP notification ${method} from ${configId}`);
			return;
		}

		const notification = params as ACPSessionNotification;
		for (const listener of this.sessionUpdateListeners) {
			try {
				listener(configId, notification);
			} catch (error) {
				moduleLog.error('Session update listener error:', error);
			}
		}
	}

	private async handleRequest(
		configId: string,
		method: string,
		params: unknown,
	): Promise<unknown> {
		switch (method) {
			case 'fs/read_text_file': {
				const request = params as ACPReadTextFileRequest;
				const cwd = this.requireKnownSession(configId, request.sessionId);
				const path = toProjectPath(cwd, request.path);
				const content = await this.fileSystem.readTextFile(path);
				return { content: sliceLines(content, request.line, request.limit) };
			}
			case 'fs/write_text_file': {
				const request = params as ACPWriteTextFileRequest;
				const cwd = this.requireKnownSession(configId, request.sessionId);
				const path = toProjectPath(cwd, request.path);
				await this.fileSystem.writeTextFile(path, request.content);
				return null;
			}
			case 'session/request_permission': {
				const request = params as ACPRequestPermissionRequest;
				this.requireKnownSession(configId, request.sessionId);
				const outcome = await this.permissionHandler(configId, request);
				return { outcome };
			}
			case TEXLYRE_MCP_METHOD: {
				// Only a bridge on this connection can send this, and it is scoped
				// to the project tools; it carries no session id.
				const message = (params as { message?: unknown } | null)?.message;
				return { message: await this.mcpServer.handle(message) };
			}
			default:
				throw new RpcError(
					JSON_RPC_METHOD_NOT_FOUND,
					`TeXlyre does not implement ${method}`,
				);
		}
	}

	private requireKnownSession(configId: string, sessionId: unknown): string {
		const cwd =
			typeof sessionId === 'string'
				? this.connections.get(configId)?.sessions.get(sessionId)
				: undefined;
		if (cwd === undefined) {
			throw new RpcError(JSON_RPC_INVALID_PARAMS, 'Unknown session');
		}
		return cwd;
	}

	private request(
		configId: string,
		method: string,
		params: unknown,
	): Promise<unknown> {
		const connection = this.connections.get(configId);
		if (!connection) {
			return Promise.reject(new Error(`Agent ${configId} is not connected`));
		}

		const id = connection.nextId++;
		return new Promise((resolve, reject) => {
			connection.pending.set(id, { method, resolve, reject });
			try {
				this.send(configId, { jsonrpc: '2.0', id, method, params });
			} catch (error) {
				connection.pending.delete(id);
				reject(error as Error);
			}
		});
	}

	private notify(configId: string, method: string, params: unknown): void {
		this.send(configId, { jsonrpc: '2.0', method, params });
	}

	private send(configId: string, message: JsonRpcMessage): void {
		const connection = this.connections.get(configId);
		if (!connection?.transport.isOpen) {
			throw new Error(`Agent ${configId} is not connected`);
		}
		connection.transport.send(`${JSON.stringify(message)}\n`);
	}
}

export const genericACPService = new GenericACPService();
