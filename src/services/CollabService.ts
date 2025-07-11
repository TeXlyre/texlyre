import { IndexeddbPersistence } from "y-indexeddb";
import { removeAwarenessStates } from "y-protocols/awareness";
// src/services/CollabService.ts
import type { WebrtcProvider } from "y-webrtc";
import * as Y from "yjs";

import * as random from "lib0/random";
import { collabWebrtc } from "../extensions/yjs/CollabWebrtc.ts";
import type { User } from "../types/auth";
import type { CollabConnectOptions, DocContainer } from "../types/collab";
import type { YjsDocUrl } from "../types/yjs";
import { parseUrlFragments } from "../types/yjs";
import { offlineService } from "./OfflineService";

// Define offline connection interface
interface OfflineDocContainer {
	doc: Y.Doc;
	persistence: IndexeddbPersistence;
	provider: null;
	refCount: number;
	isOffline: true;
}

// Union type for online and offline containers
type AnyDocContainer = DocContainer | OfflineDocContainer;

class CollabService {
	private docContainers: Map<string, AnyDocContainer> = new Map();
	private offlineStatusUnsubscribe: (() => void) | null = null;

	constructor() {
		// Listen to offline status changes
		this.offlineStatusUnsubscribe = offlineService.addStatusListener(
			(status) => {
				this.handleNetworkChange(status.isOnline);
			},
		);
	}

	private isOfflineMode(): boolean {
		return !offlineService.getStatus().isOnline;
	}

	public connect(
		docId: string,
		collectionName: string,
		options?: CollabConnectOptions,
	): { doc: Y.Doc; provider: WebrtcProvider | null } {
		const containerId = `${docId}-${collectionName}`;

		if (this.docContainers.has(containerId)) {
			const container = this.docContainers.get(containerId)!;
			container.refCount++;
			return {
				doc: container.doc,
				provider: "provider" in container ? container.provider : null,
			};
		}

		console.log(
			`[CollabService] Creating new connection for: ${containerId} (offline: ${this.isOfflineMode()})`,
		);

		if (this.isOfflineMode()) {
			return this.createOfflineConnection(docId, collectionName, containerId);
		}
		return this.createOnlineConnection(
			docId,
			collectionName,
			containerId,
			options,
		);
	}

	private createOfflineConnection(
		docId: string,
		collectionName: string,
		containerId: string,
	): { doc: Y.Doc; provider: null } {
		const doc = new Y.Doc();
		const dbName = `texlyre-project-${docId}`;
		const persistenceName = `${dbName}-${collectionName}`;

		const persistence = new IndexeddbPersistence(persistenceName, doc);

		const offlineContainer: OfflineDocContainer = {
			doc,
			persistence,
			provider: null,
			refCount: 1,
			isOffline: true,
		};

		this.docContainers.set(containerId, offlineContainer);
		console.log(
			`[CollabService] Created offline connection for: ${containerId}`,
		);

		return { doc, provider: null };
	}

	private createOnlineConnection(
		docId: string,
		collectionName: string,
		containerId: string,
		options?: CollabConnectOptions,
	): { doc: Y.Doc; provider: WebrtcProvider } {
		const doc = new Y.Doc();
		const dbName = `texlyre-project-${docId}`;
		const persistenceName = `${dbName}-${collectionName}`;
		const roomName = `${docId}-${collectionName}`;

		const persistence = new IndexeddbPersistence(persistenceName, doc);
		const provider = collabWebrtc.getProvider(roomName, doc, {
			signaling: options?.signalingServers,
		});

		if (options?.autoReconnect) {
			provider.on("status", (event: { connected: boolean }) => {
				if (!event.connected) {
					console.log(
						`[CollabService] Connection lost for ${containerId}, attempting reconnect...`,
					);
					setTimeout(() => {
						if (this.docContainers.has(containerId)) {
							provider.connect();
						}
					}, 2000);
				}
			});
		}

		const awarenessTimeout = options?.awarenessTimeout ?? 30000;
		if (provider.awareness) {
			provider.awareness.on("update", () => {
				const states = provider.awareness.getStates();
				const now = Date.now();

				states.forEach((state, clientId) => {
					if (clientId !== provider.awareness.clientID && state.lastSeen) {
						if (now - state.lastSeen > awarenessTimeout) {
							removeAwarenessStates(provider.awareness, [clientId], "timeout");
						}
					}
				});
			});
		}

		const onlineContainer: DocContainer = {
			doc,
			persistence,
			provider,
			refCount: 1,
		};

		this.docContainers.set(containerId, onlineContainer);
		return { doc, provider };
	}

	public setUserInfo(docId: string, collectionName: string, user: User): void {
		const containerId = `${docId}-${collectionName}`;
		const container = this.docContainers.get(containerId);

		// Only set user info if we have a provider (online mode)
		if (container && "provider" in container && container.provider?.awareness) {
			const awareness = container.provider.awareness;

			// Try multiple formats that different libraries might expect
			awareness.setLocalStateField("user", {
				id: user.id,
				username: user.username,
				name: user.username,
				color: user.color,
				colorLight: user.colorLight,
			});

			awareness.setLocalStateField("name", user.username);
			awareness.setLocalStateField("username", user.username);

			console.log("Set awareness fields for user:", user.username);
		} else if (container && "isOffline" in container) {
			console.log(
				"[CollabService] Skipping user awareness in offline mode for:",
				user.username,
			);
		}
	}

	public disconnect(docId: string, collectionName: string): void {
		const containerId = `${docId}-${collectionName}`;
		if (!this.docContainers.has(containerId)) {
			return;
		}

		const container = this.docContainers.get(containerId)!;
		container.refCount--;

		if (container.refCount <= 0) {
			console.log(`[CollabService] Destroying connection for: ${containerId}`);

			if ("provider" in container && container.provider) {
				// Online connection cleanup
				const roomName = `${docId}-${collectionName}`;
				container.provider.disconnect();
				collabWebrtc.releaseProvider(roomName);
			}

			// Common cleanup for both online and offline
			container.persistence.destroy();
			container.doc.destroy();
			this.docContainers.delete(containerId);
		}
	}

	public getAwareness(docId: string, collectionName: string) {
		const containerId = `${docId}-${collectionName}`;
		const container = this.docContainers.get(containerId);

		if (container && "provider" in container && container.provider) {
			return container.provider.awareness || null;
		}

		return null; // No awareness in offline mode
	}

	public getDocContainer(
		docId: string,
		collectionName: string,
	): AnyDocContainer | undefined {
		const containerId = `${docId}-${collectionName}`;
		return this.docContainers.get(containerId);
	}

	public isConnectionOnline(docId: string, collectionName: string): boolean {
		const containerId = `${docId}-${collectionName}`;
		const container = this.docContainers.get(containerId);

		if (!container) return false;

		return "provider" in container && container.provider !== null;
	}

	public async getDocumentMetadata(
		url: YjsDocUrl,
	): Promise<{ name: string; description: string } | null> {
		const fragments = parseUrlFragments(url);
		const yjsUrl = fragments.yjsUrl;

		const projectId = yjsUrl.startsWith("yjs:")
			? yjsUrl.slice(4)
			: yjsUrl.replace(/[^a-zA-Z0-9]/g, "-");

		const doc = new Y.Doc();
		const persistenceName = `texlyre-project-${projectId}-yjs_metadata`;
		const persistence = new IndexeddbPersistence(persistenceName, doc);

		try {
			await new Promise<void>((resolve) => {
				persistence.once("synced", () => {
					resolve();
				});
				setTimeout(resolve, 1000);
			});

			const ymap = doc.getMap("data");
			const docData = ymap.toJSON();

			return (docData?.projectMetadata as any) ?? null;
		} catch (error) {
			console.error("Error checking document metadata:", error);
			return null;
		} finally {
			persistence.destroy();
			doc.destroy();
		}
	}

	private syncConnections: Map<
		string,
		{
			connections: Array<{ docId: string; collectionName: string }>;
			timeoutId: NodeJS.Timeout;
		}
	> = new Map();

	public async syncAllDocuments(
		projectId: string,
		onProgress?: (current: number, total: number) => void,
		collabOptions?: CollabConnectOptions,
	): Promise<string> {
		console.log(
			`[CollabService] Starting bulk sync for project: ${projectId} (offline: ${this.isOfflineMode()})`,
		);

		if (this.isOfflineMode()) {
			console.log("[CollabService] Offline mode detected - local sync only");
			onProgress?.(0, 0);
			return "offline-sync";
		}

		// Rest of the existing syncAllDocuments implementation...
		try {
			const metadataCollection = `texlyre-project-${projectId}-yjs_metadata`;
			const metadataDoc = new Y.Doc();
			const metadataPersistence = new IndexeddbPersistence(
				metadataCollection,
				metadataDoc,
			);

			await new Promise<void>((resolve) => {
				const timeout = setTimeout(() => resolve(), 2000);
				metadataPersistence.once("synced", () => {
					clearTimeout(timeout);
					resolve();
				});
			});

			const dataMap = metadataDoc.getMap("data");
			const documents = dataMap.get("documents") || [];

			metadataPersistence.destroy();
			metadataDoc.destroy();

			if (!Array.isArray(documents) || documents.length === 0) {
				console.log(
					`[CollabService] No documents found for project: ${projectId}`,
				);
				onProgress?.(0, 0);
				return "";
			}

			const documentsToSync = documents.filter((doc) => {
				const collectionName = `yjs_${doc.id}`;
				const containerId = `${projectId}-${collectionName}`;
				const isCurrentlyConnected = this.docContainers.has(containerId);

				if (isCurrentlyConnected) {
					console.log(
						`[CollabService] Skipping document ${doc.name} (currently open for editing)`,
					);
				}

				return !isCurrentlyConnected;
			});

			console.log(
				`[CollabService] Opening ${documentsToSync.length} documents for sync (${documents.length} total, ${documents.length - documentsToSync.length} currently being edited)`,
			);
			onProgress?.(0, documentsToSync.length);

			const connections: Array<{ docId: string; collectionName: string }> = [];

			for (const doc of documentsToSync) {
				const collectionName = `yjs_${doc.id}`;

				try {
					console.log(`[CollabService] Connecting to document: ${doc.name}`);
					this.connect(projectId, collectionName, collabOptions);
					connections.push({ docId: projectId, collectionName });
				} catch (error) {
					console.error(
						`[CollabService] Error connecting to document ${doc.name}:`,
						error,
					);
				}
			}

			onProgress?.(documentsToSync.length, documentsToSync.length);
			console.log(
				`[CollabService] All ${connections.length} documents connected for sync. Real-time collaboration active.`,
			);

			const syncId = `sync-${projectId}-${Date.now()}`;
			const timeoutId = setTimeout(() => {
				this.stopSyncAllDocuments(syncId);
			}, 60000);

			this.syncConnections.set(syncId, { connections, timeoutId });

			console.log(
				`[CollabService] Sync session ${syncId} active. All documents will auto-disconnect in 60 seconds.`,
			);
			return syncId;
		} catch (error) {
			console.error("[CollabService] Error during bulk sync:", error);
			throw error;
		}
	}

	public stopSyncAllDocuments(syncId: string): void {
		if (syncId === "offline-sync") {
			console.log(
				"[CollabService] Offline sync session - no connections to stop",
			);
			return;
		}

		const syncSession = this.syncConnections.get(syncId);
		if (!syncSession) {
			console.log(
				`[CollabService] Sync session ${syncId} not found or already stopped`,
			);
			return;
		}

		console.log(
			`[CollabService] Stopping sync session ${syncId}, disconnecting ${syncSession.connections.length} documents`,
		);

		clearTimeout(syncSession.timeoutId);

		for (const connection of syncSession.connections) {
			try {
				this.disconnect(connection.docId, connection.collectionName);
			} catch (error) {
				console.error(
					`[CollabService] Error disconnecting ${connection.collectionName}:`,
					error,
				);
			}
		}

		this.syncConnections.delete(syncId);
		console.log(`[CollabService] Sync session ${syncId} stopped successfully`);
	}

	public getSyncSessions(): string[] {
		return Array.from(this.syncConnections.keys());
	}

	// New method to check if the service is operating in offline mode
	public getConnectionStatus(): {
		isOnline: boolean;
		hasActiveConnections: boolean;
	} {
		const status = offlineService.getStatus();
		const hasActiveConnections = this.docContainers.size > 0;
		return {
			isOnline: status.isOnline,
			hasActiveConnections,
		};
	}

	// Handle network status changes from OfflineService
	private handleNetworkChange(isOnline: boolean): void {
		console.log(
			`[CollabService] Network status changed: ${isOnline ? "online" : "offline"}`,
		);

		if (!isOnline) {
			// When going offline, we keep existing connections but they'll naturally
			// lose WebRTC connectivity. IndexedDB persistence continues to work.
			console.log(
				"[CollabService] Network offline - collaboration features disabled",
			);
		} else {
			// When coming back online, existing connections will naturally reconnect
			// if they have autoReconnect enabled
			console.log(
				"[CollabService] Network online - collaboration features enabled",
			);
		}
	}

	// Cleanup method
	public cleanup(): void {
		if (this.offlineStatusUnsubscribe) {
			this.offlineStatusUnsubscribe();
			this.offlineStatusUnsubscribe = null;
		}
	}
}

export const collabService = new CollabService();
