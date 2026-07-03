// src/services/GenericTypesetterService.ts
import { nanoid } from 'nanoid';

import type {
	CompilerInputFile,
	CompilerOutputFormat,
	CompilerTransportConfig,
	CompilerUISchema,
} from '../types/compilation';

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';
type StatusListener = (configId: string, status: ConnectionStatus) => void;

export interface TypesetterServerConfig {
	id: string;
	name: string;
	enabled: boolean;
	projectType: string;
	inputExtensions: string[];
	inputFiles?: CompilerInputFile[];
	outputFormats: CompilerOutputFormat[];
	transportConfig: CompilerTransportConfig;
	capabilities: { outline?: boolean; formatter?: string };
	ui?: CompilerUISchema;
}

export interface TypesetterFile {
	path: string;
	content: Uint8Array;
}

export interface TypesetterCompileRequest {
	mainFile: string;
	format: string;
	files: TypesetterFile[];
	options?: Record<string, string | number | boolean>;
}

export interface TypesetterCompileResult {
	status: number;
	log: string;
	format: string;
	mimeType?: string;
	output?: Uint8Array;
}

interface Connection {
	socket: WebSocket;
	pending: Map<
		string,
		{
			resolve: (result: TypesetterCompileResult) => void;
			reject: (error: Error) => void;
		}
	>;
}

class GenericTypesetterService {
	private configs: Map<string, TypesetterServerConfig> = new Map();
	private connections: Map<string, Connection> = new Map();
	private connectionStatuses: Map<string, ConnectionStatus> = new Map();
	private statusListeners: Set<StatusListener> = new Set();

	registerConfig(config: TypesetterServerConfig): void {
		this.configs.set(config.id, config);
		this.setConnectionStatus(config.id, 'disconnected');
	}

	updateConfig(configId: string, config: TypesetterServerConfig): void {
		this.disconnect(configId);
		this.configs.set(configId, config);
		this.setConnectionStatus(configId, 'disconnected');
	}

	unregisterConfig(configId: string): void {
		this.disconnect(configId);
		this.configs.delete(configId);
		this.connectionStatuses.delete(configId);
	}

	getConfig(configId: string): TypesetterServerConfig | undefined {
		return this.configs.get(configId);
	}

	getConfigForProjectType(
		projectType: string,
	): TypesetterServerConfig | undefined {
		return Array.from(this.configs.values()).find(
			(config) => config.enabled && config.projectType === projectType,
		);
	}

	getConnectionStatus(configId: string): ConnectionStatus {
		return this.connectionStatuses.get(configId) ?? 'disconnected';
	}

	onStatusChange(listener: StatusListener): () => void {
		this.statusListeners.add(listener);
		return () => this.statusListeners.delete(listener);
	}

	async compile(
		configId: string,
		request: TypesetterCompileRequest,
	): Promise<TypesetterCompileResult> {
		const config = this.configs.get(configId);
		if (!config) {
			throw new Error(`Typesetter config not found: ${configId}`);
		}

		const connection = await this.ensureConnection(config);
		const requestId = nanoid();

		return new Promise<TypesetterCompileResult>((resolve, reject) => {
			connection.pending.set(requestId, { resolve, reject });
			connection.socket.send(
				JSON.stringify({
					requestId,
					mainFile: request.mainFile,
					format: request.format,
					options: request.options ?? {},
					files: request.files.map((file) => ({
						path: file.path,
						content: this.encodeBytes(file.content),
					})),
				}),
			);
		});
	}

	private async ensureConnection(
		config: TypesetterServerConfig,
	): Promise<Connection> {
		const existing = this.connections.get(config.id);
		if (existing && existing.socket.readyState === WebSocket.OPEN) {
			return existing;
		}

		if (config.transportConfig.type !== 'websocket') {
			throw new Error(
				`Unsupported typesetter transport: ${config.transportConfig.type}`,
			);
		}

		const url = config.transportConfig.url;
		if (!url) throw new Error('Typesetter transport URL is missing');

		this.setConnectionStatus(config.id, 'connecting');
		const socket = new WebSocket(url);
		socket.binaryType = 'arraybuffer';
		const connection: Connection = { socket, pending: new Map() };
		this.connections.set(config.id, connection);

		socket.addEventListener('message', (event) => {
			this.handleMessage(config.id, event.data);
		});
		socket.addEventListener('close', () => {
			this.failPending(config.id, new Error('Connection closed'));
			this.setConnectionStatus(config.id, 'disconnected');
			this.connections.delete(config.id);
		});
		socket.addEventListener('error', () => {
			this.setConnectionStatus(config.id, 'error');
		});

		await new Promise<void>((resolve, reject) => {
			socket.addEventListener('open', () => {
				this.setConnectionStatus(config.id, 'connected');
				resolve();
			});
			socket.addEventListener('error', () =>
				reject(new Error('Failed to connect to typesetter')),
			);
		});

		return connection;
	}

	private handleMessage(configId: string, data: unknown): void {
		const connection = this.connections.get(configId);
		if (!connection || typeof data !== 'string') return;

		let payload: {
			requestId: string;
			status: number;
			log: string;
			format: string;
			mimeType?: string;
			output?: string;
		};
		try {
			payload = JSON.parse(data);
		} catch {
			return;
		}

		const handler = connection.pending.get(payload.requestId);
		if (!handler) return;
		connection.pending.delete(payload.requestId);

		handler.resolve({
			status: payload.status,
			log: payload.log,
			format: payload.format,
			mimeType: payload.mimeType,
			output: payload.output ? this.decodeBytes(payload.output) : undefined,
		});
	}

	private disconnect(configId: string): void {
		const connection = this.connections.get(configId);
		if (!connection) return;
		this.failPending(configId, new Error('Connection reset'));
		connection.socket.close();
		this.connections.delete(configId);
	}

	private failPending(configId: string, error: Error): void {
		const connection = this.connections.get(configId);
		if (!connection) return;
		connection.pending.forEach((handler) => {
			handler.reject(error);
		});
		connection.pending.clear();
	}

	private setConnectionStatus(
		configId: string,
		status: ConnectionStatus,
	): void {
		this.connectionStatuses.set(configId, status);
		this.statusListeners.forEach((listener) => {
			try {
				listener(configId, status);
			} catch (error) {
				console.error(
					'[GenericTypesetterService] Status listener error:',
					error,
				);
			}
		});
	}

	private encodeBytes(bytes: Uint8Array): string {
		let binary = '';
		bytes.forEach((byte) => {
			binary += String.fromCharCode(byte);
		});
		return btoa(binary);
	}

	private decodeBytes(encoded: string): Uint8Array {
		const binary = atob(encoded);
		const bytes = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) {
			bytes[i] = binary.charCodeAt(i);
		}
		return bytes;
	}
}

export const genericTypesetterService = new GenericTypesetterService();
