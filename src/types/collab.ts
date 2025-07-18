// src/types/collab.ts
import type { IndexeddbPersistence } from "y-indexeddb";
import type { WebrtcProvider } from "y-webrtc";
import type * as Y from "yjs";

import type { collabService } from "../services/CollabService";

export interface CollabContextType<T = unknown> {
	collabService: typeof collabService;
	doc?: Y.Doc;
	provider?: WebrtcProvider;
	data: T | undefined;
	changeData: (fn: (data: T) => void) => void;
	isConnected: boolean;
}

export interface DocContainer {
	doc: Y.Doc;
	persistence: IndexeddbPersistence;
	provider: WebrtcProvider;
	refCount: number;
}

export interface CollabConnectOptions {
	signalingServers?: string | string[];
	autoReconnect?: boolean;
	awarenessTimeout?: number;
}