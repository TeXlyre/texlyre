// src/services/GenericTypesetterService.ts
import { nanoid } from 'nanoid';
import type { ClientTransport, TransportConfig } from '@chelys/types/transport';

import { toArrayBuffer } from '../utils/fileUtils';
import type {
	CompileArtifact,
	TypesetterInputFile,
	TypesetterOutputFormat,
	TypesetterUISchema,
} from '../types/compilation';
import {
	ExternalServiceBase,
	type ExternalServiceConfig,
} from './ExternalServiceBase';

export interface TypesetterServerConfig extends ExternalServiceConfig {
	incrementalSync?: boolean;
	compileTimeoutMs?: number;
	projectType: string;
	projectGroup?: string;
	inputExtensions: string[];
	inputFiles?: TypesetterInputFile[];
	outputFormats: TypesetterOutputFormat[];
	transportConfig: TransportConfig;
	capabilities: { outline?: boolean; formatter?: string };
	ui?: TypesetterUISchema;
}

export interface TypesetterFile {
	path: string;
	content: Uint8Array;
	lastModified?: number;
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

interface ManifestEntry {
	path: string;
	hash: string;
}

interface HashCacheEntry {
	lastModified?: number;
	hash: string;
}

interface PendingRequest {
	resolve: (result: TypesetterCompileResult) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

interface Connection {
	transport: ClientTransport;
	pending: Map<string, PendingRequest>;
}

interface WireArtifact {
	id: string;
	name: string;
	mimeType?: string;
	data: string;
}

interface WireCompileResult {
	requestId: string;
	status: number;
	log: string;
	format: string;
	mimeType?: string;
	output?: string;
	artifacts?: WireArtifact[];
}

const MISSING_FILES_STATUS = -2;
const DEFAULT_COMPILE_TIMEOUT_MS = 10 * 60 * 1000;
const BASE64_CHUNK_SIZE = 0x8000;

class GenericTypesetterService extends ExternalServiceBase<TypesetterServerConfig> {
	protected readonly transportLabel = 'typesetter';

	private readonly connections = new Map<string, Connection>();
	private readonly connecting = new Map<string, Promise<Connection>>();
	private readonly compiling = new Map<
		string,
		Promise<TypesetterCompileResult>
	>();
	private readonly hashCaches = new Map<string, Map<string, HashCacheEntry>>();
	private readonly sentHashes = new Map<string, Map<string, string>>();

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
		this.clearConnectionStatus(configId);
		this.hashCaches.delete(configId);
	}

	resetSyncState(configId: string): void {
		this.sentHashes.delete(configId);
	}

	async compile(
		configId: string,
		request: TypesetterCompileRequest,
	): Promise<TypesetterCompileResult> {
		const pending = this.compiling.get(configId);
		if (pending) return pending;

		const attempt = this.performCompile(configId, request);
		this.compiling.set(configId, attempt);
		try {
			return await attempt;
		} finally {
			if (this.compiling.get(configId) === attempt) {
				this.compiling.delete(configId);
			}
		}
	}

	private async performCompile(
		configId: string,
		request: TypesetterCompileRequest,
	): Promise<TypesetterCompileResult> {
		const config = this.configs.get(configId);
		if (!config) throw new Error(`Typesetter config not found: ${configId}`);

		const connection = await this.ensureConnection(config);
		if (!config.incrementalSync) {
			return this.send(configId, config, connection, request, request.files);
		}

		const manifest = await this.buildManifest(configId, request.files);
		const sent = this.sentHashes.get(configId);
		const changed = request.files.filter(
			(file) => sent?.get(file.path) !== manifest.get(file.path),
		);
		const result = await this.send(
			configId,
			config,
			connection,
			request,
			changed,
			manifest,
		);

		if (result.status === MISSING_FILES_STATUS) {
			this.sentHashes.delete(configId);
			return this.send(
				configId,
				config,
				connection,
				request,
				request.files,
				manifest,
			);
		}

		this.sentHashes.set(configId, manifest);
		return result;
	}

	private send(
		configId: string,
		config: TypesetterServerConfig,
		connection: Connection,
		request: TypesetterCompileRequest,
		files: TypesetterFile[],
		manifest?: Map<string, string>,
	): Promise<TypesetterCompileResult> {
		const requestId = nanoid();
		const timeoutMs = Math.max(
			1_000,
			config.compileTimeoutMs ?? DEFAULT_COMPILE_TIMEOUT_MS,
		);

		return new Promise((resolve, reject) => {
			const timer = setTimeout(
				() =>
					this.handleRequestTimeout(configId, config, connection, timeoutMs),
				timeoutMs,
			);
			connection.pending.set(requestId, { resolve, reject, timer });

			try {
				connection.transport.send(
					JSON.stringify({
						requestId,
						mainFile: request.mainFile,
						format: request.format,
						options: request.options ?? {},
						...(manifest ? { manifest: this.serializeManifest(manifest) } : {}),
						files: files.map((file) => ({
							path: file.path,
							content: this.encodeBytes(file.content),
						})),
					}),
				);
			} catch (error) {
				clearTimeout(timer);
				connection.pending.delete(requestId);
				reject(error instanceof Error ? error : new Error(String(error)));
			}
		});
	}

	private handleRequestTimeout(
		configId: string,
		config: TypesetterServerConfig,
		connection: Connection,
		timeoutMs: number,
	): void {
		if (connection.pending.size === 0) return;
		this.failConnection(
			configId,
			connection,
			new Error(
				`Compilation timed out after ${Math.ceil(timeoutMs / 1_000)} seconds for ${config.name}`,
			),
		);
	}

	private failConnection(
		configId: string,
		connection: Connection,
		error: Error,
	): void {
		if (this.connections.get(configId) === connection) {
			this.connections.delete(configId);
		}
		this.rejectPending(connection, error);
		this.sentHashes.delete(configId);
		this.abortTransport(configId);
		this.setConnectionStatus(configId, 'error');
	}

	private async ensureConnection(
		config: TypesetterServerConfig,
	): Promise<Connection> {
		const existing = this.connections.get(config.id);
		if (existing?.transport.isOpen) return existing;
		if (existing) {
			this.connections.delete(config.id);
			this.rejectPending(existing, new Error('Connection closed'));
			this.closeTransport(config.id);
		}

		const pending = this.connecting.get(config.id);
		if (pending) return pending;

		const attempt = this.createConnection(config);
		this.connecting.set(config.id, attempt);
		try {
			return await attempt;
		} finally {
			if (this.connecting.get(config.id) === attempt) {
				this.connecting.delete(config.id);
			}
		}
	}

	private async createConnection(
		config: TypesetterServerConfig,
	): Promise<Connection> {
		const transport = await this.openTransport(config);
		if (!transport.isOpen) {
			this.closeTransport(config.id);
			throw new Error(`Connection closed while opening ${config.name}`);
		}

		const connection: Connection = { transport, pending: new Map() };
		this.connections.set(config.id, connection);
		transport.onMessage((payload) => {
			this.handleMessage(
				config.id,
				typeof payload === 'string'
					? payload
					: new TextDecoder().decode(payload),
			);
		});
		return connection;
	}

	private handleMessage(configId: string, data: string): void {
		const connection = this.connections.get(configId);
		if (!connection) return;

		let payload: WireCompileResult;
		try {
			payload = JSON.parse(data) as WireCompileResult;
		} catch {
			return;
		}

		const pending = connection.pending.get(payload.requestId);
		if (!pending) return;
		connection.pending.delete(payload.requestId);
		clearTimeout(pending.timer);
		pending.resolve({
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

	private async buildManifest(
		configId: string,
		files: TypesetterFile[],
	): Promise<Map<string, string>> {
		const cache = this.hashCaches.get(configId);
		const nextCache = new Map<string, HashCacheEntry>();
		const manifest = new Map<string, string>();

		for (const file of files) {
			const cached = cache?.get(file.path);
			const hash =
				cached &&
				file.lastModified !== undefined &&
				cached.lastModified === file.lastModified
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
		);
		const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(buffer));
		return Array.from(new Uint8Array(digest), (byte) =>
			byte.toString(16).padStart(2, '0'),
		).join('');
	}

	private serializeManifest(manifest: Map<string, string>): ManifestEntry[] {
		return Array.from(manifest, ([path, hash]) => ({ path, hash }));
	}

	private disconnect(configId: string): void {
		this.sentHashes.delete(configId);
		this.connecting.delete(configId);
		this.compiling.delete(configId);
		const connection = this.connections.get(configId);
		if (connection) {
			this.connections.delete(configId);
			this.rejectPending(connection, new Error('Connection reset'));
		}
		this.closeTransport(configId);
	}

	protected handleTransportClose(configId: string): void {
		const connection = this.connections.get(configId);
		if (connection) {
			this.rejectPending(connection, new Error('Connection closed'));
			this.connections.delete(configId);
		}
		this.sentHashes.delete(configId);
	}

	private rejectPending(connection: Connection, error: Error): void {
		for (const pending of connection.pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(error);
		}
		connection.pending.clear();
	}

	private encodeBytes(bytes: Uint8Array): string {
		const chunks: string[] = [];
		for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
			chunks.push(
				String.fromCharCode.apply(
					null,
					bytes.subarray(
						offset,
						offset + BASE64_CHUNK_SIZE,
					) as unknown as number[],
				),
			);
		}
		return btoa(chunks.join(''));
	}

	private decodeBytes(encoded: string): Uint8Array {
		const binary = atob(encoded);
		return Uint8Array.from(binary, (character) => character.charCodeAt(0));
	}
}

export const genericTypesetterService = new GenericTypesetterService();
