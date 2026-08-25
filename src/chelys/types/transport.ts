// src/chelys/types/transport.ts
export type TransportType = 'websocket' | 'webrtc' | 'worker';

export type RemoteTransportType = Exclude<TransportType, 'worker'>;
export type ControlMode = 'account' | 'dedicated';

export interface TransportConfig {
	type: TransportType;
	url?: string;
	workerPath?: string;
	signaling?: string[];
	/** Stable service identity, not a second WebRTC data room. */
	roomId?: string;
	/** Awareness/Yjs room whose existing WebRTC peer connection carries data. */
	controlRoomId?: string;
	controlMode?: ControlMode;
	contentLength?: boolean;
}

export type TransportPayload = string | Uint8Array;

export type TransportStatus =
	| 'connected'
	| 'connecting'
	| 'disconnected'
	| 'error';

export interface ClientTransport {
	readonly isOpen: boolean;
	send(payload: TransportPayload): void;
	abort?(): void;
	close(): void;
	onMessage(handler: (payload: TransportPayload) => void): () => void;
	onClose(handler: () => void): () => void;
	onError(handler: (error: Error) => void): () => void;
}

export interface HostTransport {
	readonly peerId: string;
	readonly isOpen: boolean;
	send(payload: TransportPayload): void;
	closeWhenDrained(): void;
	close(): void;
	onMessage(handler: (payload: TransportPayload) => void): () => void;
	onClose(handler: () => void): () => void;
}

export interface TransportOpenOptions {
	label: string;
	timeoutMs?: number;
}
