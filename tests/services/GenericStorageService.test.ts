import type {
	ClientTransport,
	TransportPayload,
} from '@chelys/types/transport';
import { openTransport } from '@chelys/peer/TransportFactory';
import { GenericStorageService } from '../../src/services/GenericStorageService';
import type { StorageConfigBlock } from '../../src/types/storage';
import { normalizeStorageConfig } from '../../src/utils/toolConfigUtils';

jest.mock('@chelys/peer/TransportFactory', () => ({ openTransport: jest.fn() }));

interface UploadState {
	id: string;
	op: string;
	size: number;
	fields: Record<string, unknown>;
	chunks: Uint8Array[];
	length: number;
}

class StorageBridgeTransport implements ClientTransport {
	isOpen = true;
	readonly uploadChunkSizes: number[] = [];
	requestWhileUploading = false;

	private readonly messageHandlers = new Set<
		(payload: TransportPayload) => void
	>();
	private readonly closeHandlers = new Set<() => void>();
	private readonly errorHandlers = new Set<(error: Error) => void>();
	private readonly objects = new Map<string, Uint8Array>();
	private readonly revisions = new Map<string, Uint8Array>();
	private readonly heads = new Map<string, string>();
	private upload: UploadState | null = null;

	send(payload: TransportPayload): void {
		if (!this.isOpen) throw new Error('Transport closed');
		if (typeof payload !== 'string') {
			if (!this.upload) throw new Error('Unexpected binary upload');
			const copy = new Uint8Array(payload.byteLength);
			copy.set(payload);
			this.upload.chunks.push(copy);
			this.upload.length += copy.byteLength;
			this.uploadChunkSizes.push(copy.byteLength);
			return;
		}

		const request = JSON.parse(payload) as Record<string, unknown>;
		const id = String(request.id ?? '');
		if (request.type === 'binaryEnd') {
			this.finishUpload(id);
			return;
		}

		if (this.upload) {
			this.requestWhileUploading = true;
			this.emitJson({
				id,
				type: 'result',
				ok: false,
				error: {
					code: 'request-failed',
					message: 'Finish the active binary upload first',
				},
			});
			return;
		}

		switch (request.op) {
			case 'hello':
				this.emitJson({
					id,
					type: 'result',
					ok: true,
					protocol: 'texlyre-storage',
					version: 1,
					chunkSize: 64 * 1024,
					maxBufferedSize: 16 * 1024 * 1024,
				});
				return;
			case 'getHead': {
				const projectId = String(request.projectId);
				this.emitJson({
					id,
					type: 'result',
					ok: true,
					head: this.heads.get(projectId) ?? null,
				});
				return;
			}
			case 'getObject': {
				const key = `${String(request.projectId)}/${String(request.objectId)}`;
				this.emitBinary(id, this.objects.get(key) ?? null);
				return;
			}
			case 'getRevision': {
				const key = `${String(request.projectId)}/${String(request.revisionId)}`;
				this.emitBinary(id, this.revisions.get(key) ?? null);
				return;
			}
			case 'putObject':
			case 'commitHead':
				this.upload = {
					id,
					op: String(request.op),
					size: Number(request.size),
					fields: request,
					chunks: [],
					length: 0,
				};
				this.emitJson({ id, type: 'ready', ok: true });
				return;
			default:
				this.emitJson({
					id,
					type: 'result',
					ok: false,
					error: { code: 'unsupported-operation', message: 'Unsupported' },
				});
		}
	}

	close(): void {
		if (!this.isOpen) return;
		this.isOpen = false;
		for (const handler of this.closeHandlers) handler();
	}

	onMessage(handler: (payload: TransportPayload) => void): () => void {
		this.messageHandlers.add(handler);
		return () => this.messageHandlers.delete(handler);
	}

	onClose(handler: () => void): () => void {
		this.closeHandlers.add(handler);
		return () => this.closeHandlers.delete(handler);
	}

	onError(handler: (error: Error) => void): () => void {
		this.errorHandlers.add(handler);
		return () => this.errorHandlers.delete(handler);
	}

	private finishUpload(id: string): void {
		const upload = this.upload;
		if (!upload || upload.id !== id) throw new Error('No matching upload');
		this.upload = null;
		if (upload.length !== upload.size) throw new Error('Upload size mismatch');

		const bytes = concat(upload.chunks, upload.length);
		if (upload.op === 'putObject') {
			const key = `${String(upload.fields.projectId)}/${String(upload.fields.objectId)}`;
			this.objects.set(key, bytes);
			this.emitJson({ id, type: 'result', ok: true });
			return;
		}

		const projectId = String(upload.fields.projectId);
		const expectedHead = upload.fields.expectedHead ?? null;
		const currentHead = this.heads.get(projectId) ?? null;
		if (currentHead !== expectedHead) {
			this.emitJson({
				id,
				type: 'result',
				ok: false,
				error: {
					code: 'stale-head',
					message: 'Remote HEAD changed',
					head: currentHead,
				},
			});
			return;
		}

		const revision = String(upload.fields.newRevision);
		this.revisions.set(`${projectId}/${revision}`, bytes);
		this.heads.set(projectId, revision);
		this.emitJson({ id, type: 'result', ok: true, head: revision });
	}

	private emitBinary(id: string, bytes: Uint8Array | null): void {
		if (!bytes) {
			this.emitJson({
				id,
				type: 'result',
				ok: false,
				error: { code: 'not-found', message: 'Stored value not found' },
			});
			return;
		}

		queueMicrotask(() => {
			this.emit({
				id,
				type: 'binaryStart',
				ok: true,
				size: bytes.byteLength,
			});
			for (let offset = 0; offset < bytes.byteLength; offset += 17 * 1024) {
				this.emit(bytes.subarray(offset, offset + 17 * 1024));
			}
			this.emit({ id, type: 'binaryEnd', ok: true });
		});
	}

	private emitJson(value: Record<string, unknown>): void {
		queueMicrotask(() => this.emit(value));
	}

	private emit(value: Record<string, unknown> | Uint8Array): void {
		const payload = value instanceof Uint8Array ? value : JSON.stringify(value);
		for (const handler of this.messageHandlers) handler(payload);
	}
}

class TestStorageService extends GenericStorageService {
	constructor(private readonly transport: ClientTransport) {
		super();
	}

	transportIdentity(config: StorageConfigBlock): string {
		return this.getTransportId(config);
	}

	protected async openTransport(config: StorageConfigBlock): Promise<ClientTransport> {
		this.setConnectionStatus(config.id, 'connected');
		return this.transport;
	}
}

const config: StorageConfigBlock = {
	id: 'garage',
	name: 'Garage',
	enabled: true,
	transportConfig: { type: 'websocket', url: 'ws://localhost:7060' },
};

const concat = (chunks: Uint8Array[], length: number): Uint8Array => {
	const result = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return result;
};

describe('GenericStorageService', () => {
	it('negotiates the protocol and round-trips chunked binary objects', async () => {
		const transport = new StorageBridgeTransport();
		const service = new TestStorageService(transport);
		service.registerConfig(config);

		const bytes = new Uint8Array(700_123);
		for (let index = 0; index < bytes.length; index++) bytes[index] = index % 251;

		const hello = await service.hello(config.id);
		expect(hello.chunkSize).toBe(64 * 1024);

		await service.putObject(config.id, 'project_a', 'object_a', bytes);
		const restored = await service.getObject(
			config.id,
			'project_a',
			'object_a',
		);

		expect(restored).toEqual(bytes);
		expect(Math.max(...transport.uploadChunkSizes)).toBeLessThanOrEqual(
			hello.chunkSize,
		);
	});

	it('serializes operations around binary uploads', async () => {
		const transport = new StorageBridgeTransport();
		const service = new TestStorageService(transport);
		service.registerConfig(config);

		await Promise.all([
			service.putObject(
				config.id,
				'project_a',
				'object_a',
				new Uint8Array(512 * 1024),
			),
			service.getHead(config.id, 'project_a'),
		]);

		expect(transport.requestWhileUploading).toBe(false);
	});

	it('preserves not-found and stale-head protocol semantics', async () => {
		const transport = new StorageBridgeTransport();
		const service = new TestStorageService(transport);
		service.registerConfig(config);

		expect(
			await service.getObject(config.id, 'project_a', 'missing'),
		).toBeNull();

		await expect(
			service.commitHead(
				config.id,
				'project_a',
				null,
				'revision_1',
				new TextEncoder().encode('manifest-1'),
			),
		).resolves.toEqual({ head: 'revision_1' });

		await expect(
			service.commitHead(
				config.id,
				'project_a',
				null,
				'revision_2',
				new TextEncoder().encode('manifest-2'),
			),
		).rejects.toMatchObject({
			name: 'StorageProtocolError',
			code: 'stale-head',
			head: 'revision_1',
		});
	});

	it('connects an aliased received provider using the advertised Chelys service', async () => {
		const received = normalizeStorageConfig({
			...config,
			id: 'receiver-local-id',
			transportId: 'garage',
			transportConfig: {
				type: 'webrtc',
				roomId: 'shared-garage',
				signaling: ['wss://signal.example'],
			},
		});
		expect(received).not.toBeNull();
		jest.mocked(openTransport).mockResolvedValueOnce(new StorageBridgeTransport());
		const service = new GenericStorageService();
		service.registerConfig(received!);
		try {
			await expect(service.hello(received!.id)).resolves.toMatchObject({
				protocol: 'texlyre-storage',
				version: 1,
			});
			expect(openTransport).toHaveBeenCalledWith(
				expect.objectContaining({
					type: 'webrtc',
					roomId: 'shared-garage',
					controlRoomId: 'shared-garage',
				}),
				{ label: 'storage:garage' },
			);
		} finally {
			service.unregisterConfig(received!.id);
			jest.mocked(openTransport).mockReset();
		}
	});

	it('preserves Chelys service identity when a received storage uses a local alias', () => {
		const received = normalizeStorageConfig({
			...config,
			id: 'receiver-local-id',
			transportId: config.id,
		});
		expect(received?.transportId).toBe('garage');
		const service = new TestStorageService(new StorageBridgeTransport());
		expect(service.transportIdentity(received!)).toBe('garage');
		expect(service.transportIdentity(config)).toBe('garage');
	});

	it('normalizes the minimal Chelys storage config and rejects worker transport', () => {
		expect(
			normalizeStorageConfig({
				id: 'garage',
				name: 'Garage Desktop',
				enabled: true,
				transportConfig: {
					type: 'webrtc',
					roomId: 'shared-room',
					signaling: ['wss://signal.example'],
				},
			}),
		).toEqual({
			id: 'garage',
			name: 'Garage Desktop',
			enabled: true,
			transportConfig: {
				type: 'webrtc',
				roomId: 'shared-room',
				signaling: ['wss://signal.example'],
			},
		});
		expect(
			normalizeStorageConfig({
				id: 'invalid',
				transportConfig: { type: 'worker', workerPath: '/worker.js' },
			}),
		).toBeNull();
	});
});
