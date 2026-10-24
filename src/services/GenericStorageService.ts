// src/services/GenericStorageService.ts
import { nanoid } from 'nanoid';

import type {
	ClientTransport,
	TransportPayload,
} from '@chelys/types/transport';
import {
	STORAGE_PROTOCOL,
	STORAGE_PROTOCOL_VERSION,
	type StorageCommitHeadResult,
	type StorageConfigBlock,
	type StorageHelloResult,
	type StorageProtocolFailure,
} from '../types/storage';
import { concatBytes } from '../utils/fileUtils';
import { ExternalServiceBase } from './ExternalServiceBase';

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const SEND_YIELD_BYTES = 4 * 1024 * 1024;

type JsonRecord = Record<string, unknown>;

interface WireResponse extends JsonRecord {
	id: string;
	type: string;
	ok: boolean;
	error?: StorageProtocolFailure;
}

interface PendingResponse {
	resolve: (response: WireResponse) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

interface ActiveDownload {
	id: string;
	expectedSize: number | null;
	chunks: Uint8Array[];
	received: number;
	resolve: (bytes: Uint8Array | null) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}

interface StorageConnection {
	configId: string;
	transport: ClientTransport;
	pending: Map<string, PendingResponse>;
	download: ActiveDownload | null;
	hello: StorageHelloResult | null;
}

export class StorageProtocolError extends Error {
	readonly code: string;
	readonly head?: string | null;

	constructor(failure: StorageProtocolFailure) {
		super(failure.message);
		this.name = 'StorageProtocolError';
		this.code = failure.code;
		this.head = failure.head;
	}
}

const isRecord = (value: unknown): value is JsonRecord =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const toError = (error: unknown): Error =>
	error instanceof Error ? error : new Error(String(error));

const responseError = (response: WireResponse): StorageProtocolError =>
	new StorageProtocolError(
		response.error ?? {
			code: 'request-failed',
			message: 'Storage request failed',
		},
	);

export class GenericStorageService extends ExternalServiceBase<StorageConfigBlock> {
	protected readonly transportLabel = 'storage';

	private readonly connections = new Map<string, StorageConnection>();
	private readonly connecting = new Map<string, Promise<StorageConnection>>();
	private readonly operationQueues = new Map<string, Promise<void>>();

	registerConfig(config: StorageConfigBlock): void {
		this.configs.set(config.id, config);
		this.setConnectionStatus(config.id, 'disconnected');
	}

	updateConfig(configId: string, config: StorageConfigBlock): void {
		this.disconnect(configId);
		this.configs.set(configId, config);
		this.setConnectionStatus(config.id, 'disconnected');
	}

	unregisterConfig(configId: string): void {
		this.disconnect(configId);
		this.configs.delete(configId);
		this.clearConnectionStatus(configId);
	}

	async hello(configId: string): Promise<StorageHelloResult> {
		const connection = await this.ensureConnection(configId);
		return connection.hello!;
	}

	getCatalogue(configId: string): Promise<Uint8Array | null> {
		return this.enqueue(configId, (connection) =>
			this.getBinary(connection, 'getCatalogue'),
		);
	}

	putCatalogue(configId: string, catalogue: Uint8Array): Promise<void> {
		return this.enqueue(configId, async (connection) => {
			await this.putBinary(connection, 'putCatalogue', catalogue);
		});
	}

	getHead(configId: string, projectId: string): Promise<string | null> {
		return this.enqueue(configId, async (connection) => {
			const response = await this.request(connection, 'getHead', { projectId });
			const head = response.head;
			if (head !== null && typeof head !== 'string') {
				throw new Error('Invalid storage HEAD response');
			}
			return head as string | null;
		});
	}

	getRevision(
		configId: string,
		projectId: string,
		revisionId: string,
	): Promise<Uint8Array | null> {
		return this.enqueue(configId, (connection) =>
			this.getBinary(connection, 'getRevision', { projectId, revisionId }),
		);
	}

	getObject(
		configId: string,
		projectId: string,
		objectId: string,
	): Promise<Uint8Array | null> {
		return this.enqueue(configId, (connection) =>
			this.getBinary(connection, 'getObject', { projectId, objectId }),
		);
	}

	putObject(
		configId: string,
		projectId: string,
		objectId: string,
		bytes: Uint8Array,
	): Promise<void> {
		return this.enqueue(configId, async (connection) => {
			await this.putBinary(connection, 'putObject', bytes, {
				projectId,
				objectId,
			});
		});
	}

	commitHead(
		configId: string,
		projectId: string,
		expectedHead: string | null,
		newRevision: string,
		manifest: Uint8Array,
	): Promise<StorageCommitHeadResult> {
		return this.enqueue(configId, async (connection) => {
			const response = await this.putBinary(
				connection,
				'commitHead',
				manifest,
				{ projectId, expectedHead, newRevision },
			);
			if (typeof response.head !== 'string') {
				throw new Error('Storage commit response did not include HEAD');
			}
			return { head: response.head };
		});
	}

	registerOwner(
		configId: string,
		projectId: string,
		token: string,
	): Promise<void> {
		if (!/^[a-f0-9]{64}$/.test(token))
			throw new Error('Invalid project deletion key');
		return this.enqueue(configId, async (connection) => {
			await this.request(connection, 'registerOwner', { projectId, token });
		});
	}

	deleteProject(
		configId: string,
		projectId: string,
		deleteToken: string,
	): Promise<void> {
		if (!/^[a-f0-9]{64}$/.test(deleteToken)) {
			throw new Error('Invalid project deletion key');
		}
		return this.enqueue(configId, async (connection) => {
			const response = await this.request(connection, 'getDeleteChallenge');
			const nonce = response.nonce;
			if (typeof nonce !== 'string' || !/^[a-f0-9]{64}$/.test(nonce)) {
				throw new Error('Invalid storage deletion challenge');
			}
			const rawToken = new Uint8Array(
				deleteToken.match(/../g)!.map((part) => parseInt(part, 16)),
			);
			const key = await crypto.subtle.importKey(
				'raw',
				rawToken,
				{ name: 'HMAC', hash: 'SHA-256' },
				false,
				['sign'],
			);
			const signature = new Uint8Array(
				await crypto.subtle.sign(
					'HMAC',
					key,
					new TextEncoder().encode(`${projectId}:${nonce}`),
				),
			);
			const proof = Array.from(signature, (byte) =>
				byte.toString(16).padStart(2, '0'),
			).join('');
			await this.request(connection, 'deleteProject', { projectId, proof });
		});
	}

	disconnect(configId: string): void {
		this.connecting.delete(configId);
		this.operationQueues.delete(configId);
		const connection = this.connections.get(configId);
		if (connection) {
			this.connections.delete(configId);
			this.rejectConnection(connection, new Error('Storage connection reset'));
		}
		this.closeTransport(configId);
		if (this.configs.has(configId)) {
			this.setConnectionStatus(configId, 'disconnected');
		}
	}

	protected handleTransportClose(configId: string): void {
		const connection = this.connections.get(configId);
		if (!connection) return;
		this.connections.delete(configId);
		this.rejectConnection(connection, new Error('Storage connection closed'));
	}

	private enqueue<T>(
		configId: string,
		operation: (connection: StorageConnection) => Promise<T>,
	): Promise<T> {
		const previous = this.operationQueues.get(configId) ?? Promise.resolve();
		const run = previous.then(async () => {
			const connection = await this.ensureConnection(configId);
			return operation(connection);
		});
		const tail = run.then(
			() => undefined,
			() => undefined,
		);
		this.operationQueues.set(configId, tail);
		void tail.finally(() => {
			if (this.operationQueues.get(configId) === tail) {
				this.operationQueues.delete(configId);
			}
		});
		return run;
	}

	private async ensureConnection(configId: string): Promise<StorageConnection> {
		const existing = this.connections.get(configId);
		if (existing?.transport.isOpen && existing.hello) return existing;
		if (existing) {
			this.connections.delete(configId);
			this.rejectConnection(existing, new Error('Storage connection closed'));
			this.closeTransport(configId);
		}

		const pending = this.connecting.get(configId);
		if (pending) return pending;

		const config = this.configs.get(configId);
		if (!config) throw new Error(`Storage config not found: ${configId}`);
		if (!config.enabled)
			throw new Error(`Storage config is disabled: ${configId}`);

		const attempt = this.createConnection(config);
		this.connecting.set(configId, attempt);
		try {
			return await attempt;
		} finally {
			if (this.connecting.get(configId) === attempt) {
				this.connecting.delete(configId);
			}
		}
	}

	private async createConnection(
		config: StorageConfigBlock,
	): Promise<StorageConnection> {
		const transport = await this.openTransport(config);
		const connection: StorageConnection = {
			configId: config.id,
			transport,
			pending: new Map(),
			download: null,
			hello: null,
		};
		this.connections.set(config.id, connection);
		transport.onMessage((payload) => this.handleMessage(config.id, payload));

		try {
			const response = await this.request(connection, 'hello');
			const hello = this.parseHello(response);
			connection.hello = hello;
			return connection;
		} catch (error) {
			if (this.connections.get(config.id) === connection) {
				this.connections.delete(config.id);
			}
			this.rejectConnection(connection, toError(error));
			this.abortTransport(config.id);
			this.setConnectionStatus(config.id, 'error');
			throw error;
		}
	}

	private parseHello(response: WireResponse): StorageHelloResult {
		if (
			response.protocol !== STORAGE_PROTOCOL ||
			response.version !== STORAGE_PROTOCOL_VERSION ||
			typeof response.chunkSize !== 'number' ||
			!Number.isSafeInteger(response.chunkSize) ||
			response.chunkSize <= 0 ||
			typeof response.maxBufferedSize !== 'number' ||
			!Number.isSafeInteger(response.maxBufferedSize) ||
			response.maxBufferedSize < 0
		) {
			throw new Error('Unsupported storage protocol');
		}

		return {
			protocol: STORAGE_PROTOCOL,
			version: STORAGE_PROTOCOL_VERSION,
			chunkSize: response.chunkSize,
			maxBufferedSize: response.maxBufferedSize,
		};
	}

	private request(
		connection: StorageConnection,
		op: string,
		fields: JsonRecord = {},
	): Promise<WireResponse> {
		const id = nanoid();
		const response = this.waitForResponse(connection, id);
		try {
			connection.transport.send(JSON.stringify({ id, op, ...fields }));
		} catch (error) {
			this.failConnection(connection, toError(error));
		}
		return response;
	}

	private waitForResponse(
		connection: StorageConnection,
		id: string,
	): Promise<WireResponse> {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(
				() =>
					this.failConnection(
						connection,
						new Error(`Storage request timed out: ${id}`),
					),
				DEFAULT_REQUEST_TIMEOUT_MS,
			);
			connection.pending.set(id, { resolve, reject, timer });
		});
	}

	private async putBinary(
		connection: StorageConnection,
		op: string,
		bytes: Uint8Array,
		fields: JsonRecord = {},
	): Promise<WireResponse> {
		const id = nanoid();
		const ready = this.waitForResponse(connection, id);
		try {
			connection.transport.send(
				JSON.stringify({ id, op, size: bytes.byteLength, ...fields }),
			);
		} catch (error) {
			this.failConnection(connection, toError(error));
		}

		const readyResponse = await ready;
		if (readyResponse.type !== 'ready') {
			const error = new Error(`Storage upload did not become ready: ${op}`);
			this.failConnection(connection, error);
			throw error;
		}

		const hello = connection.hello;
		if (!hello) throw new Error('Storage protocol handshake is incomplete');
		const { chunkSize } = hello;
		const yieldBytes = Math.max(
			chunkSize,
			Math.min(SEND_YIELD_BYTES, hello.maxBufferedSize),
		);
		let bytesSinceYield = 0;
		try {
			for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
				connection.transport.send(bytes.subarray(offset, offset + chunkSize));
				bytesSinceYield += Math.min(chunkSize, bytes.byteLength - offset);
				if (bytesSinceYield >= yieldBytes) {
					bytesSinceYield = 0;
					await new Promise<void>((resolve) => setTimeout(resolve, 0));
				}
			}
		} catch (error) {
			const failure = toError(error);
			this.failConnection(connection, failure);
			throw failure;
		}

		const result = this.waitForResponse(connection, id);
		try {
			connection.transport.send(JSON.stringify({ id, type: 'binaryEnd' }));
		} catch (error) {
			this.failConnection(connection, toError(error));
		}
		return result;
	}

	private getBinary(
		connection: StorageConnection,
		op: string,
		fields: JsonRecord = {},
	): Promise<Uint8Array | null> {
		if (connection.download) {
			return Promise.reject(new Error('A storage download is already active'));
		}

		const id = nanoid();
		const result = new Promise<Uint8Array | null>((resolve, reject) => {
			const timer = setTimeout(
				() =>
					this.failConnection(
						connection,
						new Error(`Storage download timed out: ${id}`),
					),
				DEFAULT_REQUEST_TIMEOUT_MS,
			);
			connection.download = {
				id,
				expectedSize: null,
				chunks: [],
				received: 0,
				resolve,
				reject,
				timer,
			};
		});

		try {
			connection.transport.send(JSON.stringify({ id, op, ...fields }));
		} catch (error) {
			this.failConnection(connection, toError(error));
		}
		return result;
	}

	private handleMessage(configId: string, payload: TransportPayload): void {
		const connection = this.connections.get(configId);
		if (!connection) return;

		if (typeof payload !== 'string') {
			this.handleBinaryChunk(connection, payload);
			return;
		}

		let response: WireResponse;
		try {
			const parsed: unknown = JSON.parse(payload);
			if (!isRecord(parsed) || typeof parsed.id !== 'string') return;
			response = parsed as WireResponse;
		} catch {
			return;
		}

		const download = connection.download;
		if (download?.id === response.id) {
			this.handleDownloadResponse(connection, download, response);
			return;
		}

		const pending = connection.pending.get(response.id);
		if (!pending) return;
		connection.pending.delete(response.id);
		clearTimeout(pending.timer);
		if (!response.ok) pending.reject(responseError(response));
		else pending.resolve(response);
	}

	private handleBinaryChunk(
		connection: StorageConnection,
		chunk: Uint8Array,
	): void {
		const download = connection.download;
		if (!download || download.expectedSize === null) {
			this.failConnection(
				connection,
				new Error('Unexpected storage binary payload'),
			);
			return;
		}
		if (download.received + chunk.byteLength > download.expectedSize) {
			this.rejectDownload(
				connection,
				new Error('Storage download exceeded its declared size'),
			);
			return;
		}

		const copy = new Uint8Array(chunk.byteLength);
		copy.set(chunk);
		download.chunks.push(copy);
		download.received += copy.byteLength;
	}

	private handleDownloadResponse(
		connection: StorageConnection,
		download: ActiveDownload,
		response: WireResponse,
	): void {
		if (!response.ok) {
			if (response.error?.code === 'not-found') {
				this.finishDownload(connection, null);
				return;
			}
			this.rejectDownload(connection, responseError(response));
			return;
		}

		if (response.type === 'binaryStart') {
			if (
				typeof response.size !== 'number' ||
				!Number.isSafeInteger(response.size) ||
				response.size < 0
			) {
				this.rejectDownload(
					connection,
					new Error('Invalid storage binary size'),
				);
				return;
			}
			download.expectedSize = response.size;
			return;
		}

		if (response.type !== 'binaryEnd') return;
		if (
			download.expectedSize === null ||
			download.received !== download.expectedSize
		) {
			this.rejectDownload(connection, new Error('Incomplete storage download'));
			return;
		}
		this.finishDownload(connection, concatBytes(...download.chunks));
	}

	private finishDownload(
		connection: StorageConnection,
		bytes: Uint8Array | null,
	): void {
		const download = connection.download;
		if (!download) return;
		connection.download = null;
		clearTimeout(download.timer);
		download.resolve(bytes);
	}

	private rejectDownload(connection: StorageConnection, error: Error): void {
		const download = connection.download;
		if (!download) return;
		connection.download = null;
		clearTimeout(download.timer);
		download.reject(error);
	}

	private rejectPending(
		connection: StorageConnection,
		id: string,
		error: Error,
	): void {
		const pending = connection.pending.get(id);
		if (!pending) return;
		connection.pending.delete(id);
		clearTimeout(pending.timer);
		pending.reject(error);
	}

	private failConnection(connection: StorageConnection, error: Error): void {
		if (this.connections.get(connection.configId) === connection) {
			this.connections.delete(connection.configId);
		}
		this.rejectConnection(connection, error);
		this.abortTransport(connection.configId);
		this.setConnectionStatus(connection.configId, 'error');
	}

	private rejectConnection(connection: StorageConnection, error: Error): void {
		for (const [id] of connection.pending) {
			this.rejectPending(connection, id, error);
		}
		this.rejectDownload(connection, error);
	}
}

export const genericStorageService = new GenericStorageService();
