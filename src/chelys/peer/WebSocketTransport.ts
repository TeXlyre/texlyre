// src/chelys/peer/WebSocketTransport.ts
import { createNamedLogger } from '@/logging';
import type { ClientTransport, TransportPayload } from '../types/transport';

const moduleLog = createNamedLogger('WebSocketTransport');

class WebSocketClientTransport implements ClientTransport {
	private readonly messageHandlers = new Set<
		(payload: TransportPayload) => void
	>();
	private readonly closeHandlers = new Set<() => void>();
	private readonly errorHandlers = new Set<(error: Error) => void>();
	private closed = false;
	private lastError: Error | null = null;

	constructor(private readonly socket: WebSocket) {
		socket.addEventListener('message', (event) => {
			const payload =
				typeof event.data === 'string'
					? event.data
					: new Uint8Array(event.data as ArrayBuffer);
			for (const handler of this.messageHandlers) handler(payload);
		});
		socket.addEventListener('close', () => {
			if (this.closed) return;
			this.closed = true;
			for (const handler of this.closeHandlers) handler();
		});
		socket.addEventListener('error', () => {
			this.lastError = new Error('WebSocket transport error');
			for (const handler of this.errorHandlers) handler(this.lastError!);
		});
	}

	get isOpen(): boolean {
		return !this.closed && this.socket.readyState === WebSocket.OPEN;
	}

	send(payload: TransportPayload): void {
		if (!this.isOpen) return;
		if (typeof payload === 'string') {
			this.socket.send(payload);
			return;
		}
		const buffer = new ArrayBuffer(payload.byteLength);
		new Uint8Array(buffer).set(payload);
		this.socket.send(buffer);
	}

	close(): void {
		try {
			this.socket.close();
		} catch (error) {
			moduleLog.warn('Error closing socket:', error);
		}
	}

	onMessage(handler: (payload: TransportPayload) => void): () => void {
		this.messageHandlers.add(handler);
		return () => this.messageHandlers.delete(handler);
	}

	onClose(handler: () => void): () => void {
		if (this.closed) {
			queueMicrotask(handler);
			return () => {};
		}
		this.closeHandlers.add(handler);
		return () => this.closeHandlers.delete(handler);
	}

	onError(handler: (error: Error) => void): () => void {
		if (this.lastError) queueMicrotask(() => handler(this.lastError!));
		this.errorHandlers.add(handler);
		return () => this.errorHandlers.delete(handler);
	}
}

export function openWebSocketTransport(url: string): Promise<ClientTransport> {
	return new Promise((resolve, reject) => {
		const socket = new WebSocket(url);
		socket.binaryType = 'arraybuffer';

		const cleanup = (): void => {
			socket.removeEventListener('open', onOpen);
			socket.removeEventListener('error', onError);
		};
		const onOpen = (): void => {
			cleanup();
			resolve(new WebSocketClientTransport(socket));
		};
		const onError = (): void => {
			cleanup();
			socket.close();
			reject(new Error(`Failed to connect to ${url}`));
		};

		socket.addEventListener('open', onOpen, { once: true });
		socket.addEventListener('error', onError, { once: true });
	});
}
