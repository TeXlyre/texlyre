// src/services/GenericTypesetterService.ts
import { nanoid } from 'nanoid';

import type {
	CompileArtifact,
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
	incrementalSync?: boolean;
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
	lastModified?: number;
}

interface ManifestEntry {
	path: string;
	hash: string;
}

interface HashCacheEntry {
	lastModified?: number;
	hash: string;
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
	artifacts?: CompileArtifact[];
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

const MISSING_FILES_STATUS = -2;

class GenericTypesetterService {
	private configs: Map<string, TypesetterServerConfig> = new Map();
	private connections: Map<string, Connection> = new Map();
	private connectionStatuses: Map<string, ConnectionStatus> = new Map();
	private statusListeners: Set<StatusListener> = new Set();
	private hashCaches: Map<string, Map<string, HashCacheEntry>> = new Map();
	private sentHashes: Map<string, Map<string, string>> = new Map();

	registerConfig(config: TypesetterServerConfig): void {
		this.configs.set(config.id, config);
		this.setConnectionStatus(config.id, 'disconnected');
	}

	updateConfig(configId: string, config: TypesetterServerConfig): void {
		this.disconnect(configId);
		this.configs.set(configId, config);
		this.setConnectionStatus(config.id, 'disconnected');
	}

	unregisterConfig(configId: string): void {
		this.disconnect(configId);
		this.configs.delete(configId);
		this.connectionStatuses.delete(configId);
		this.hashCaches.delete(configId);
	}

	resetSyncState(configId: string): void {
		this.sentHashes.delete(configId);
	}

	getConfig(configId: string): TypesetterServerConfig | undefined {
		return this.configs.get(configId);
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

		if (!config.incrementalSync) {
			return this.send(connection, request, request.files);
		}

		const manifest = await this.buildManifest(configId, request.files);
		const sent = this.sentHashes.get(configId) ?? new Map<string, string>();
		const changed = request.files.filter(
			(file) => sent.get(file.path) !== manifest.get(file.path),
		);

		const result = await this.send(connection, request, changed, manifest);

		if (result.status === MISSING_FILES_STATUS) {
			this.sentHashes.delete(configId);
			return this.send(connection, request, request.files, manifest);
		}

		this.sentHashes.set(configId, manifest);
		return result;
	}

	private send(
		connection: Connection,
		request: TypesetterCompileRequest,
		files: TypesetterFile[],
		manifest?: Map<string, string>,
	): Promise<TypesetterCompileResult> {
		const requestId = nanoid();

		return new Promise<TypesetterCompileResult>((resolve, reject) => {
			connection.pending.set(requestId, { resolve, reject });
			connection.socket.send(
				JSON.stringify({
					requestId,
					mainFile: request.mainFile,
					format: request.format,
					options: request.options ?? {},
					...(manifest
						? {
								manifest: Array.from(
									manifest,
									([path, hash]): ManifestEntry => ({
										path,
										hash,
									}),
								),
							}
						: {}),
					files: files.map((file) => ({
						path: file.path,
						content: this.encodeBytes(file.content),
					})),
				}),
			);
		});
	}

	private async buildManifest(
		configId: string,
		files: TypesetterFile[],
	): Promise<Map<string, string>> {
		const cache =
			this.hashCaches.get(configId) ?? new Map<string, HashCacheEntry>();
		const nextCache = new Map<string, HashCacheEntry>();
		const manifest = new Map<string, string>();

		for (const file of files) {
			const cached = cache.get(file.path);
			const reusable =
				cached !== undefined &&
				file.lastModified !== undefined &&
				cached.lastModified === file.lastModified;

			const hash = reusable
				? cached.hash
				: await this.hashContent(file.content);

			nextCache.set(file.path, { lastModified: file.lastModified, hash });
			manifest.set(file.path, hash);
		}

		this.hashCaches.set(configId, nextCache);
		return manifest;
	}

	private async hashContent(content: Uint8Array): Promise<string> {
		const buffer = content.buffer.slice(
			content.byteOffset,
			content.byteOffset + content.byteLength,
		) as ArrayBuffer;
		const digest = await crypto.subtle.digest('SHA-256', buffer);
		return Array.from(new Uint8Array(digest))
			.map((byte) => byte.toString(16).padStart(2, '0'))
			.join('');
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
			this.sentHashes.delete(config.id);
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
			artifacts?: Array<{
				id: string;
				name: string;
				mimeType?: string;
				data: string;
			}>;
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
			artifacts: payload.artifacts?.map((artifact) => ({
				id: artifact.id,
				name: artifact.name,
				mimeType: artifact.mimeType,
				data: this.decodeBytes(artifact.data),
			})),
		});
	}

	private disconnect(configId: string): void {
		this.sentHashes.delete(configId);
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
		const chunkSize = 0x8000;
		const chunks: string[] = [];
		for (let i = 0; i < bytes.length; i += chunkSize) {
			chunks.push(
				String.fromCharCode.apply(
					null,
					bytes.subarray(i, i + chunkSize) as unknown as number[],
				),
			);
		}
		return btoa(chunks.join(''));
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
