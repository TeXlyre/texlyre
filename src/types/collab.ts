// src/types/collab.ts
import type { IndexeddbPersistence } from 'y-indexeddb';
import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';

import type { collabService } from '../services/CollabService';

export type CollabProviderType = 'webrtc' | 'websocket';

/**
 * Unified provider interface exposing the shared surface of WebrtcProvider and WebsocketProvider.
 */
export interface CollabProvider {
	awareness: Awareness;
	connect(): void;
	disconnect(): void;
	destroy(): void;
	on(event: string, callback: (...args: any[]) => void): void;
	off?(event: string, callback: (...args: any[]) => void): void;
}

export interface CollabContextType<T = unknown> {
	collabService: typeof collabService;
	doc?: Y.Doc;
	provider?: CollabProvider;
	data: T | undefined;
	changeData: (fn: (data: T) => void) => void;
	isConnected: boolean;
}

export interface DocContainer {
	doc: Y.Doc;
	persistence: IndexeddbPersistence;
	provider: CollabProvider;
	refCount: number;
}

export interface CollabConnectOptions {
	providerType?: CollabProviderType;
	signalingServers?: string | string[];
	websocketServer?: string;
	autoReconnect?: boolean;
	awarenessTimeout?: number;
	websocketParams?: Record<string, string>;
}