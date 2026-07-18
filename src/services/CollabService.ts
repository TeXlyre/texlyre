// src/services/CollabService.ts
import { IndexeddbPersistence } from 'y-indexeddb';
import { removeAwarenessStates } from 'y-protocols/awareness';
import * as Y from 'yjs';

import { collabWebrtc } from '../extensions/yjs/CollabWebrtc';
import { collabWebsocket } from '../extensions/yjs/CollabWebsocket';
import type { User } from '../types/auth';
import type {
	CollabConnectOptions,
	CollabProvider,
	CollabProviderType,
	DocContainer,
} from '../types/collab';
import type { YjsDocUrl } from '../types/yjs';
import { parseUrlFragments } from '../utils/urlUtils';
import { offlineService } from './OfflineService';
import { createNamedLogger } from '@/logging';

const moduleLog = createNamedLogger('CollabService');

interface OfflineDocContainer {
	doc: Y.Doc;
	persistence: IndexeddbPersistence;
	provider: null;
	refCount: number;
	isOffline: true;
}

interface OnlineDocContainer extends DocContainer {
	providerType: CollabProviderType;
}

type AnyDocContainer = OnlineDocContainer | OfflineDocContainer;

class CollabService {
	private docContainers: Map<string, AnyDocContainer> = new Map();
	private offlineStatusUnsubscribe: (() => void) | null = null;

	private forceLocalConnections = false;

	constructor() {
		this.offlineStatusUnsubscribe = offlineService.addStatusListener(
			(status) => {
				this.handleNetworkChange(status.isOnline);
			},
		);
	}

	public setForceLocalConnections(forceLocalConnections: boolean): void {
		this.forceLocalConnections = forceLocalConnections;
	}

	private isOfflineMode(): boolean {
		return !offlineService.getStatus().isOnline;
	}

	private validateSignalingServers(
		signalingServers: string | string[],
	): string[] {
		const isValidWebSocketUrl = (url: string): boolean => {
			try {
				const u = new URL(url);
				return (
					(u.protocol === 'ws:' || u.protocol === 'wss:') &&
					u.hostname.length > 0
				);
			} catch (_e) {
				return false;
			}
		};

		const inputServers = Array.isArray(signalingServers)
			? signalingServers
			: signalingServers.split(',').map((s) => s.trim());

		const validSignalingServers: string[] = [];

		for (const serverUrl of inputServers) {
			if (serverUrl.length === 0) continue;

			try {
				const urlObj = new URL(serverUrl);
				if (
					window.location.protocol === 'https:' &&
					urlObj.protocol === 'ws:'
				) {
					continue;
				}
				if (isValidWebSocketUrl(serverUrl)) {
					validSignalingServers.push(serverUrl);
				}
			} catch (_e) {
				// Invalid URL, skip
			}
		}

		return validSignalingServers;
	}

	public connect(
		docId: string,
		collectionName: string,
		options?: CollabConnectOptions,
	): { doc: Y.Doc; provider: CollabProvider | null } {
		const containerId = `${docId}-${collectionName}`;

		if (this.docContainers.has(containerId)) {
			const container = this.docContainers.get(containerId)!;
			container.refCount++;
			return {
				doc: container.doc,
				provider: 'provider' in container ? container.provider : null,
			};
		}

		moduleLog.info(
			`Creating new connection for: ${containerId} (offline: ${this.isOfflineMode()})`,
		);

		if (this.forceLocalConnections || this.isOfflineMode()) {
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
		moduleLog.info(`Created offline connection for: ${containerId}`);

		return { doc, provider: null };
	}

	private createOnlineConnection(
		docId: string,
		collectionName: string,
		containerId: string,
		options?: CollabConnectOptions,
	): { doc: Y.Doc; provider: CollabProvider } {
		const doc = new Y.Doc();
		const dbName = `texlyre-project-${docId}`;
		const persistenceName = `${dbName}-${collectionName}`;
		const roomName = `${docId}-${collectionName}`;

		const persistence = new IndexeddbPersistence(persistenceName, doc);

		const providerType = options?.providerType ?? 'webrtc';
		let provider: CollabProvider;

		if (providerType === 'websocket') {
			provider = this.createWebsocketProvider(roomName, doc, options);
		} else {
			provider = this.createWebrtcProvider(roomName, doc, options);
		}

		if (options?.autoReconnect) {
			provider.on(
				'status',
				(event: { connected?: boolean; status?: string }) => {
					const isDisconnected =
						event.connected === false || event.status === 'disconnected';
					if (isDisconnected) {
						moduleLog.info(
							`Connection lost for ${containerId}, attempting reconnect...`,
						);
						setTimeout(() => {
							if (this.docContainers.has(containerId)) {
								provider.connect();
							}
						}, 2000);
					}
				},
			);
		}

		const awarenessTimeout = options?.awarenessTimeout ?? 30000;
		if (provider.awareness) {
			provider.awareness.on('update', () => {
				const states = provider.awareness.getStates();
				const now = Date.now();

				states.forEach((state, clientId) => {
					if (clientId !== provider.awareness.clientID && state.lastSeen) {
						if (now - state.lastSeen > awarenessTimeout) {
							removeAwarenessStates(provider.awareness, [clientId], 'timeout');
						}
					}
				});
			});
		}

		const onlineContainer: OnlineDocContainer = {
			doc,
			persistence,
			provider,
			providerType,
			refCount: 1,
		};

		this.docContainers.set(containerId, onlineContainer);
		return { doc, provider };
	}

	private createWebrtcProvider(
		roomName: string,
		doc: Y.Doc,
		options?: CollabConnectOptions,
	): CollabProvider {
		let finalSignalingServers: string[] = [];
		if (options?.signalingServers) {
			finalSignalingServers = this.validateSignalingServers(
				options.signalingServers,
			);
		}

		return collabWebrtc.getProvider(roomName, doc, {
			signaling:
				finalSignalingServers.length > 0 ? finalSignalingServers : undefined,
			password: options?.password,
		});
	}

	private createWebsocketProvider(
		roomName: string,
		doc: Y.Doc,
		options?: CollabConnectOptions,
	): CollabProvider {
		const serverUrl = options?.websocketServer || 'ws://localhost:1234';

		return collabWebsocket.getProvider(roomName, doc, {
			serverUrl,
			params: options?.websocketParams,
		});
	}

	public setUserInfo(docId: string, collectionName: string, user: User): void {
		const containerId = `${docId}-${collectionName}`;
		const container = this.docContainers.get(containerId);

		if (container && 'provider' in container && container.provider?.awareness) {
			const awareness = container.provider.awareness;

			awareness.setLocalStateField('user', {
				id: user.id,
				username: user.username,
				name: user.username,
				color: user.color,
				colorLight: user.colorLight,
			});

			awareness.setLocalStateField('name', user.username);
			awareness.setLocalStateField('username', user.username);

			moduleLog.info('Set awareness fields for user:', user.username);
		} else if (container && 'isOffline' in container) {
			moduleLog.info(
				'Skipping user awareness in offline mode for:',
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
			moduleLog.info(`Destroying connection for: ${containerId}`);

			if ('provider' in container && container.provider) {
				const roomName = `${docId}-${collectionName}`;
				container.provider.disconnect();

				if ('providerType' in container) {
					if (container.providerType === 'websocket') {
						collabWebsocket.releaseProvider(roomName);
					} else {
						collabWebrtc.releaseProvider(roomName);
					}
				} else {
					collabWebrtc.releaseProvider(roomName);
				}
			}

			container.persistence.destroy();
			container.doc.destroy();
			this.docContainers.delete(containerId);
		}
	}

	public getAwareness(docId: string, collectionName: string) {
		const containerId = `${docId}-${collectionName}`;
		const container = this.docContainers.get(containerId);

		if (container && 'provider' in container && container.provider) {
			return container.provider.awareness || null;
		}

		return null;
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

		return 'provider' in container && container.provider !== null;
	}

	public async getDocumentMetadata(
		url: YjsDocUrl,
	): Promise<{ name: string; description: string; type: string } | null> {
		const fragments = parseUrlFragments(url);
		const yjsUrl = fragments.yjsUrl;

		const projectId = yjsUrl.startsWith('yjs:')
			? yjsUrl.slice(4)
			: yjsUrl.replace(/[^a-zA-Z0-9]/g, '-');

		const doc = new Y.Doc();
		const persistenceName = `texlyre-project-${projectId}-yjs_metadata`;
		const persistence = new IndexeddbPersistence(persistenceName, doc);

		try {
			await new Promise<void>((resolve) => {
				persistence.once('synced', () => {
					resolve();
				});
				setTimeout(resolve, 1000);
			});

			const ymap = doc.getMap('data');
			const docData = ymap.toJSON();

			return (docData?.projectMetadata as any) ?? null;
		} catch (error) {
			moduleLog.error('Error checking document metadata:', error);
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
		moduleLog.info(
			`Starting bulk sync for project: ${projectId} (offline: ${this.isOfflineMode()})`,
		);

		if (this.isOfflineMode()) {
			moduleLog.info('Offline mode detected - local sync only');
			onProgress?.(0, 0);
			return 'offline-sync';
		}

		try {
			const metadataCollection = `texlyre-project-${projectId}-yjs_metadata`;
			const metadataDoc = new Y.Doc();
			const metadataPersistence = new IndexeddbPersistence(
				metadataCollection,
				metadataDoc,
			);

			await new Promise<void>((resolve) => {
				const timeout = setTimeout(() => resolve(), 2000);
				metadataPersistence.once('synced', () => {
					clearTimeout(timeout);
					resolve();
				});
			});

			const dataMap = metadataDoc.getMap('data');
			const documents = dataMap.get('documents') || [];

			metadataPersistence.destroy();
			metadataDoc.destroy();

			if (!Array.isArray(documents) || documents.length === 0) {
				moduleLog.info(`No documents found for project: ${projectId}`);
				onProgress?.(0, 0);
				return '';
			}

			const documentsToSync = documents.filter((doc) => {
				const collectionName = `yjs_${doc.id}`;
				const containerId = `${projectId}-${collectionName}`;
				const isCurrentlyConnected = this.docContainers.has(containerId);

				if (isCurrentlyConnected) {
					moduleLog.info(
						`Skipping document ${doc.name} (currently open for editing)`,
					);
				}

				return !isCurrentlyConnected;
			});

			moduleLog.info(
				`Opening ${documentsToSync.length} documents for sync (${documents.length} total, ${documents.length - documentsToSync.length} currently being edited)`,
			);
			onProgress?.(0, documentsToSync.length);

			const connections: Array<{ docId: string; collectionName: string }> = [];

			for (const doc of documentsToSync) {
				const collectionName = `yjs_${doc.id}`;

				try {
					moduleLog.info(`Connecting to document: ${doc.name}`);
					this.connect(projectId, collectionName, collabOptions);
					connections.push({ docId: projectId, collectionName });
				} catch (error) {
					moduleLog.error(`Error connecting to document ${doc.name}:`, error);
				}
			}

			onProgress?.(documentsToSync.length, documentsToSync.length);
			moduleLog.info(
				`All ${connections.length} documents connected for sync. Real-time collaboration active.`,
			);

			const syncId = `sync-${projectId}-${Date.now()}`;
			const timeoutId = setTimeout(() => {
				this.stopSyncAllDocuments(syncId);
			}, 60000);

			this.syncConnections.set(syncId, { connections, timeoutId });

			moduleLog.info(
				`Sync session ${syncId} active. All documents will auto-disconnect in 60 seconds.`,
			);
			return syncId;
		} catch (error) {
			moduleLog.error('Error during bulk sync:', error);
			throw error;
		}
	}

	public stopSyncAllDocuments(syncId: string): void {
		if (syncId === 'offline-sync') {
			moduleLog.info('Offline sync session - no connections to stop');
			return;
		}

		const syncSession = this.syncConnections.get(syncId);
		if (!syncSession) {
			moduleLog.info(`Sync session ${syncId} not found or already stopped`);
			return;
		}

		moduleLog.info(
			`Stopping sync session ${syncId}, disconnecting ${syncSession.connections.length} documents`,
		);

		clearTimeout(syncSession.timeoutId);

		for (const connection of syncSession.connections) {
			try {
				this.disconnect(connection.docId, connection.collectionName);
			} catch (error) {
				moduleLog.error(
					`Error disconnecting ${connection.collectionName}:`,
					error,
				);
			}
		}

		this.syncConnections.delete(syncId);
		moduleLog.info(`Sync session ${syncId} stopped successfully`);
	}

	public getSyncSessions(): string[] {
		return Array.from(this.syncConnections.keys());
	}

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

	public async updateDocumentContent(
		projectId: string,
		documentId: string,
		updater: (currentContent: string) => string,
	): Promise<void> {
		const collectionName = `yjs_${documentId}`;
		const containerId = `${projectId}-${collectionName}`;

		const wasConnected = this.docContainers.has(containerId);
		let container: AnyDocContainer | undefined;

		if (!wasConnected) {
			const { doc, provider } = this.connect(projectId, collectionName);
			container = this.getDocContainer(projectId, collectionName);

			if (container?.persistence) {
				await new Promise<void>((resolve) => {
					const timeout = setTimeout(resolve, 2000);

					const handleSynced = () => {
						clearTimeout(timeout);
						container!.persistence.off('synced', handleSynced);
						resolve();
					};

					container.persistence.on('synced', handleSynced);

					if (container.persistence.synced) {
						clearTimeout(timeout);
						container.persistence.off('synced', handleSynced);
						resolve();
					}
				});
			}

			if (provider && !this.isOfflineMode()) {
				await new Promise((resolve) => setTimeout(resolve, 500));
			}
		} else {
			container = this.getDocContainer(projectId, collectionName);
		}

		if (!container) throw new Error('Could not access document');

		const ytext = container.doc.getText('codemirror');
		const currentContent = ytext.toString();
		const newContent = updater(currentContent);

		container.doc.transact(() => {
			ytext.delete(0, ytext.length);
			ytext.insert(0, newContent);
		});

		if (!wasConnected) {
			await new Promise((resolve) => setTimeout(resolve, 500));
			this.disconnect(projectId, collectionName);
		}
	}

	private handleNetworkChange(isOnline: boolean): void {
		moduleLog.info(
			`Network status changed: ${isOnline ? 'online' : 'offline'}`,
		);

		if (!isOnline) {
			moduleLog.info('Network offline - collaboration features disabled');
		} else {
			moduleLog.info('Network online - collaboration features enabled');
		}
	}

	public cleanup(): void {
		if (this.offlineStatusUnsubscribe) {
			this.offlineStatusUnsubscribe();
			this.offlineStatusUnsubscribe = null;
		}
	}
}

export const collabService = new CollabService();
