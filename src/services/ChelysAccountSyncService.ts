// src/services/ChelysAccountSyncService.ts
import { IndexeddbPersistence } from 'y-indexeddb';
import { Awareness } from 'y-protocols/awareness';
import { WebrtcProvider } from 'y-webrtc';
import * as Y from 'yjs';

import { setAccountControlRoomProvider } from '@chelys/peer/AccountControlRoom';
import {
	getNativeScopeControl,
	hasRemoteTexlyrePeer,
	peerKind,
	scopedPeerOptions,
} from '@chelys/peer/NativeScope';
import type {
	ControlConnection,
	PeerState,
} from '@chelys/peer/SessionContract';
import { waitForProviderPeerId } from '@chelys/peer/TransportChannel';
import { readSignalingServers } from '@chelys/peer/TransportResolution';
import {
	USER_DATA_CHANGED,
	type UserDataChangedDetail,
	type UserDataMutation,
	type UserDataType,
	getForcedUserData,
} from '../utils/userDataUtils';

export const CHELYS_ACCOUNT_COLLECTION = 'chelys_account';
export const CHELYS_ACCOUNT_STORE_CHANGED = 'chelys-account-store-changed';

const LOCAL_ORIGIN = 'chelys-account-local';
const DELETED_ENTRY_KEY = '__chelysDeleted';
const INITIAL_NATIVE_PEER_GRACE_MS = 15_000;
const LOST_NATIVE_PEER_GRACE_MS = 5_000;
const DEFAULT_SIGNALING_SERVERS = ['ws://ywebrtc.localhost:8082/'];

type StoreName = Exclude<UserDataType, 'all'>;
type Entries = Record<string, unknown>;
type ConnectionListener = (connection: ChelysAccountConnection | null) => void;

interface StoreAdapter {
	name: StoreName;
	storageKey(userId: string): string;
	read(raw: string | null): Entries;
	write(entries: Entries, currentRaw: string | null): string;
	merge?(local: unknown, remote: unknown): unknown;
}

interface ConnectionConfig {
	roomId: string;
	roomKey: string;
	userId: string;
	username: string;
	color?: string;
	colorLight?: string;
	key: string;
}

interface ConnectionHealth {
	connectedNativePeers: number;
	hadHealthyPeer: boolean;
}

interface RuntimeIdentity {
	key: string;
	runtimeId: string;
	peerId: string;
}

export interface ChelysAccountConnection extends ControlConnection {
	roomName: string;
	userId: string;
	runtimeId: string;
	nativeScopeId: string | null;
	persistence: IndexeddbPersistence;
}

const versionedAdapter = (name: 'settings' | 'properties'): StoreAdapter => ({
	name,
	storageKey: (userId) => `texlyre-user-${userId}-${name}`,
	read: (raw) => {
		if (!raw) return {};
		try {
			const { _version, ...entries } = JSON.parse(raw);
			return entries;
		} catch {
			return {};
		}
	},
	write: (entries, currentRaw) => {
		let version: unknown;
		try {
			version = currentRaw ? JSON.parse(currentRaw)._version : undefined;
		} catch {
			version = undefined;
		}
		return JSON.stringify(
			version === undefined ? entries : { ...entries, _version: version },
		);
	},
});

const adapters: StoreAdapter[] = [
	versionedAdapter('settings'),
	versionedAdapter('properties'),
	{
		name: 'secrets',
		storageKey: (userId) => `texlyre-user-${userId}-secrets`,
		read: (raw) => {
			if (!raw) return {};
			try {
				const entries: Entries = {};
				for (const secret of JSON.parse(raw)) {
					const key =
						secret.scope === 'project' && secret.projectId
							? `${secret.pluginId}:${secret.scope}:${secret.projectId}:${secret.secretKey}`
							: `${secret.pluginId}:${secret.scope}:${secret.secretKey}`;
					entries[key] = secret;
				}
				return entries;
			} catch {
				return {};
			}
		},
		write: (entries) => JSON.stringify(Object.values(entries)),
	},
	{
		name: 'records',
		storageKey: (userId) => `texlyre-user-${userId}-records`,
		read: (raw) => {
			if (!raw) return {};
			try {
				const value = JSON.parse(raw);
				return value && typeof value === 'object' && !Array.isArray(value)
					? value
					: {};
			} catch {
				return {};
			}
		},
		write: (entries) => JSON.stringify(entries),
	},
];

const adapterByName = new Map(
	adapters.map((adapter) => [adapter.name, adapter]),
);
const mutationMapName = (name: StoreName): string => name;
const SYNC_META_MAP = 'chelys_account_sync_meta';
const SYNC_SCHEMA_KEY = 'mutationSchema';
const SYNC_SCHEMA_VERSION = 2;
const SYNC_FORCED_KEY = 'forcedDefaults:texlyre';
const toPlain = (value: unknown): unknown =>
	value === undefined ? null : JSON.parse(JSON.stringify(value));
const equal = (a: unknown, b: unknown): boolean =>
	JSON.stringify(a) === JSON.stringify(b);

const waitForPersistence = (
	persistence: IndexeddbPersistence,
): Promise<void> => {
	if (persistence.synced) return Promise.resolve();
	return new Promise((resolve) => persistence.once('synced', resolve));
};

class ChelysAccountSyncService {
	private connection: ChelysAccountConnection | null = null;
	private connectionKey: string | null = null;
	private desired: ConnectionConfig | null = null;
	private readonly listeners = new Set<ConnectionListener>();
	private readonly disposers: Array<() => void> = [];
	private readonly health = new WeakMap<
		ChelysAccountConnection,
		ConnectionHealth
	>();
	private readonly localSnapshots = new WeakMap<
		ChelysAccountConnection,
		Map<StoreName, Entries>
	>();
	private operation: Promise<void> = Promise.resolve();
	private recoveryTimer: ReturnType<typeof setTimeout> | null = null;
	private restartQueued = false;
	private runtimeIdentity: RuntimeIdentity | null = null;

	constructor() {
		window.addEventListener(USER_DATA_CHANGED, this.handleLocalStoreEvent);
		window.addEventListener('storage', this.handleStorageEvent);
	}

	getRoomId(): string | null {
		return this.connection?.roomId ?? null;
	}

	getConnection(): ChelysAccountConnection | null {
		return this.connection;
	}

	subscribe(listener: ConnectionListener): () => void {
		this.listeners.add(listener);
		listener(this.connection);
		return () => this.listeners.delete(listener);
	}

	async whenConnected(): Promise<ChelysAccountConnection> {
		const existing = this.connection;
		if (existing) {
			await existing.ready;
			return existing;
		}

		return new Promise((resolve) => {
			const unsubscribe = this.subscribe((connection) => {
				if (!connection) return;
				unsubscribe();
				void connection.ready.then(() => resolve(connection));
			});
		});
	}

	start(
		roomId: string,
		roomKey: string,
		userId: string,
		username: string,
		color?: string,
		colorLight?: string,
	): Promise<void> {
		const config: ConnectionConfig = {
			roomId,
			roomKey,
			userId,
			username,
			color,
			colorLight,
			key: `${roomId}\n${roomKey}\n${userId}`,
		};
		this.desired = config;
		return this.enqueue(() => this.openIfNeeded(config));
	}

	stop(): void {
		this.desired = null;
		this.runtimeIdentity = null;
		this.cancelRecovery();
		void this.enqueue(() => this.closeCurrent(true, true));
	}

	clearSyncState(_userId: string): void {
		// Runtime snapshots are scoped to each connection and discarded on close.
	}

	publishStore(name: StoreName, mutation?: UserDataMutation): void {
		const connection = this.connection;
		const adapter = adapterByName.get(name);
		if (!connection || !adapter) return;
		if (mutation) this.writeLocalMutation(connection, adapter, mutation);
		else this.writeLocalStore(connection, adapter);
	}

	private enqueue(task: () => Promise<void>): Promise<void> {
		const next = this.operation.then(task);
		this.operation = next.catch(() => undefined);
		return next;
	}

	private async openIfNeeded(config: ConnectionConfig): Promise<void> {
		if (this.connection && this.connectionKey === config.key) {
			this.updateLocalPresence(this.connection, config);
			await this.connection.ready;
			return;
		}

		await this.closeCurrent(true, true);
		if (this.desired?.key !== config.key) return;
		await this.openRuntime(config);
	}

	private async openRuntime(config: ConnectionConfig): Promise<void> {
		const roomName = `${config.roomId}-${CHELYS_ACCOUNT_COLLECTION}`;
		const identity = this.getRuntimeIdentity(config);
		const runtimeId = identity.runtimeId;
		const kind = peerKind();
		const nativeScopeId = kind === 'chelys' ? runtimeId : null;
		const configuredSignaling = readSignalingServers(config.userId);
		const doc = new Y.Doc();
		const awareness = new Awareness(doc);
		const persistence = new IndexeddbPersistence(
			`texlyre-project-${config.roomId}-${CHELYS_ACCOUNT_COLLECTION}`,
			doc,
		);
		const provider = new WebrtcProvider(roomName, doc, {
			signaling: configuredSignaling.length
				? configuredSignaling
				: DEFAULT_SIGNALING_SERVERS,
			password: config.roomKey,
			awareness,
			maxConns: Number.POSITIVE_INFINITY,
			filterBcConns: false,
			...(nativeScopeId ? { peerOpts: scopedPeerOptions(nativeScopeId) } : {}),
		});

		const peer: PeerState = {
			id: identity.peerId,
			instanceId: runtimeId,
			kind,
			userId: config.userId,
			username: config.username,
		};

		const connection: ChelysAccountConnection = {
			roomId: config.roomId,
			roomName,
			userId: config.userId,
			runtimeId,
			nativeScopeId,
			doc,
			provider,
			awareness,
			persistence,
			peer,
			ready: Promise.resolve(),
		};

		connection.ready = Promise.all([
			waitForPersistence(persistence),
			waitForProviderPeerId(provider),
		]).then(([, transportPeerId]) => {
			if (this.connection !== connection) return;
			connection.peer.transportPeerId = transportPeerId;
			this.updateLocalPresence(connection, config);
			this.migrateMutationSchema(connection);
			this.applyForcedDefaults(connection);
			for (const adapter of adapters) {
				this.initializeStore(connection, adapter);
			}
		});

		this.connection = connection;
		this.connectionKey = config.key;
		this.health.set(connection, {
			connectedNativePeers: 0,
			hadHealthyPeer: false,
		});
		this.localSnapshots.set(connection, new Map());
		this.updateLocalPresence(connection, config);
		this.observeStores(connection);
		this.observeNativeScope(connection);
		this.emitConnection();
		await connection.ready;
	}

	private getRuntimeIdentity(config: ConnectionConfig): RuntimeIdentity {
		if (!this.runtimeIdentity || this.runtimeIdentity.key !== config.key) {
			this.runtimeIdentity = {
				key: config.key,
				runtimeId: crypto.randomUUID(),
				peerId: crypto.randomUUID(),
			};
		}
		return this.runtimeIdentity;
	}

	private observeNativeScope(connection: ChelysAccountConnection): void {
		if (!connection.nativeScopeId) return;
		const control = getNativeScopeControl();
		if (!control) {
			console.warn(
				'[ChelysAccountSyncService] Native WebRTC scope control is unavailable',
			);
			return;
		}

		const update = (connectedPeers: number): void => {
			if (this.connection !== connection) return;
			const state = this.health.get(connection);
			if (!state) return;
			state.connectedNativePeers = connectedPeers;
			this.evaluateHealth(connection);
		};

		const unsubscribe = control.subscribe(connection.nativeScopeId, update);
		const awarenessUpdate = (): void => {
			if (this.connection !== connection) return;
			this.evaluateHealth(connection);
		};
		connection.awareness.on('change', awarenessUpdate);

		this.disposers.push(unsubscribe);
		this.disposers.push(() =>
			connection.awareness.off('change', awarenessUpdate),
		);
		update(control.getConnectedCount(connection.nativeScopeId));
	}

	private evaluateHealth(connection: ChelysAccountConnection): void {
		if (this.connection !== connection) return;
		const state = this.health.get(connection);
		if (!state) return;

		const healthy =
			state.connectedNativePeers > 0 ||
			hasRemoteTexlyrePeer(connection.awareness);
		if (healthy) {
			state.hadHealthyPeer = true;
			this.cancelRecovery();
			return;
		}

		this.scheduleRecovery(
			connection,
			state.hadHealthyPeer
				? LOST_NATIVE_PEER_GRACE_MS
				: INITIAL_NATIVE_PEER_GRACE_MS,
		);
	}

	private scheduleRecovery(
		connection: ChelysAccountConnection,
		delayMs: number,
	): void {
		if (
			this.recoveryTimer ||
			this.restartQueued ||
			this.connection !== connection ||
			!connection.nativeScopeId
		) {
			return;
		}

		this.recoveryTimer = setTimeout(() => {
			this.recoveryTimer = null;
			const current = this.connection;
			const state = current ? this.health.get(current) : null;
			if (
				current !== connection ||
				!state ||
				state.connectedNativePeers > 0 ||
				hasRemoteTexlyrePeer(connection.awareness) ||
				!this.desired
			) {
				return;
			}
			this.queueHeadlessRestart(connection);
		}, delayMs);
	}

	private queueHeadlessRestart(connection: ChelysAccountConnection): void {
		if (this.restartQueued || this.connection !== connection) return;
		this.restartQueued = true;
		void this.enqueue(async () => {
			try {
				if (this.connection !== connection) return;
				const config = this.desired;
				if (!config || config.key !== this.connectionKey) return;

				console.info(
					'[ChelysAccountSyncService] Restarting peerless account collaboration runtime',
				);
				await this.closeCurrent(true, false);
				if (this.desired?.key === config.key) {
					try {
						await this.openRuntime(this.desired);
					} catch (error) {
						this.emitConnection();
						throw error;
					}
				}
			} finally {
				this.restartQueued = false;
				const current = this.connection;
				if (current) this.evaluateHealth(current);
			}
		});
	}

	private cancelRecovery(): void {
		if (!this.recoveryTimer) return;
		clearTimeout(this.recoveryTimer);
		this.recoveryTimer = null;
	}

	private updateLocalPresence(
		connection: ChelysAccountConnection,
		config: ConnectionConfig,
	): void {
		connection.peer.username = config.username;

		const existingUser = connection.awareness.getLocalState()?.user as
			| {
					color?: string;
					colorLight?: string;
			  }
			| undefined;
		const color = config.color ?? existingUser?.color;
		const colorLight = config.colorLight ?? existingUser?.colorLight;

		connection.awareness.setLocalStateField('accountPeer', connection.peer);
		connection.awareness.setLocalStateField('user', {
			id: connection.userId,
			username: config.username,
			name: config.username,
			color,
			colorLight,
		});
		connection.awareness.setLocalStateField('name', config.username);
		connection.awareness.setLocalStateField('username', config.username);
	}

	private async closeCurrent(
		resetNativeScope: boolean,
		emitDisconnected: boolean,
	): Promise<void> {
		const connection = this.connection;
		if (!connection) return;

		this.cancelRecovery();
		for (const dispose of this.disposers.splice(0)) dispose();
		this.connection = null;
		this.connectionKey = null;
		if (emitDisconnected) this.emitConnection();

		try {
			connection.awareness.setLocalState(null);
			connection.provider.destroy();

			if (resetNativeScope && connection.nativeScopeId) {
				const control = getNativeScopeControl();
				if (control) await control.reset(connection.nativeScopeId);
			}

			await Promise.resolve(connection.persistence.destroy());
			connection.awareness.destroy();
			connection.doc.destroy();
		} catch (error) {
			console.warn(
				'[ChelysAccountSyncService] Failed to close account collaboration',
				error,
			);
		}
	}

	private applyForcedDefaults(connection: ChelysAccountConnection): void {
		const forced = getForcedUserData();
		if (!forced) return;

		const meta = connection.doc.getMap<unknown>(SYNC_META_MAP);
		if (meta.get(SYNC_FORCED_KEY) === forced.version) return;

		const { version, ...stores } = forced;
		connection.doc.transact(() => {
			for (const [name, entries] of Object.entries(stores)) {
				if (!adapterByName.has(name as StoreName)) continue;
				const map = connection.doc.getMap<unknown>(
					mutationMapName(name as StoreName),
				);
				for (const [key, value] of Object.entries(entries)) {
					map.set(key, toPlain(value));
				}
			}
			meta.set(SYNC_FORCED_KEY, version);
		}, LOCAL_ORIGIN);
	}

	private migrateMutationSchema(connection: ChelysAccountConnection): void {
		const meta = connection.doc.getMap<number>(SYNC_META_MAP);
		if (meta.get(SYNC_SCHEMA_KEY) === SYNC_SCHEMA_VERSION) return;

		connection.doc.transact(() => {
			for (const adapter of adapters) {
				connection.doc.getMap<unknown>(mutationMapName(adapter.name)).clear();
			}
			meta.set(SYNC_SCHEMA_KEY, SYNC_SCHEMA_VERSION);
		}, LOCAL_ORIGIN);
	}

	private observeStores(connection: ChelysAccountConnection): void {
		for (const adapter of adapters) {
			const map = connection.doc.getMap<unknown>(mutationMapName(adapter.name));
			const observer = (
				_event: Y.YMapEvent<unknown>,
				transaction: Y.Transaction,
			): void => {
				if (transaction.origin === LOCAL_ORIGIN) return;
				this.writeRemoteStore(connection, adapter, map);
			};
			map.observe(observer);
			this.disposers.push(() => map.unobserve(observer));
		}
	}

	private initializeStore(
		connection: ChelysAccountConnection,
		adapter: StoreAdapter,
	): void {
		const map = connection.doc.getMap<unknown>(mutationMapName(adapter.name));
		const raw = localStorage.getItem(adapter.storageKey(connection.userId));
		const local = adapter.read(raw);
		const effective = this.applyRemoteEntries(local, this.readMap(map));
		if (!equal(local, effective))
			this.flushLocal(adapter, connection.userId, effective, raw);
		this.setLocalSnapshot(connection, adapter.name, effective);
	}

	private writeLocalMutation(
		connection: ChelysAccountConnection,
		adapter: StoreAdapter,
		mutation: UserDataMutation,
	): void {
		const map = connection.doc.getMap<unknown>(mutationMapName(adapter.name));
		connection.doc.transact(() => {
			if (mutation.deleted)
				map.set(mutation.key, { [DELETED_ENTRY_KEY]: true });
			else map.set(mutation.key, toPlain(mutation.value));
		}, LOCAL_ORIGIN);
		const raw = localStorage.getItem(adapter.storageKey(connection.userId));
		this.setLocalSnapshot(connection, adapter.name, adapter.read(raw));
	}

	private writeLocalStore(
		connection: ChelysAccountConnection,
		adapter: StoreAdapter,
	): void {
		const map = connection.doc.getMap<unknown>(mutationMapName(adapter.name));
		const raw = localStorage.getItem(adapter.storageKey(connection.userId));
		const current = adapter.read(raw);
		const previous =
			this.localSnapshots.get(connection)?.get(adapter.name) ?? {};
		connection.doc.transact(() => {
			const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
			for (const key of keys) {
				if (!(key in current)) map.set(key, { [DELETED_ENTRY_KEY]: true });
				else if (!(key in previous) || !equal(previous[key], current[key]))
					map.set(key, toPlain(current[key]));
			}
		}, LOCAL_ORIGIN);
		this.setLocalSnapshot(connection, adapter.name, current);
	}

	private writeRemoteStore(
		connection: ChelysAccountConnection,
		adapter: StoreAdapter,
		map: Y.Map<unknown>,
	): void {
		if (this.connection !== connection) return;

		const raw = localStorage.getItem(adapter.storageKey(connection.userId));
		const local = adapter.read(raw);
		const effective = this.applyRemoteEntries(local, this.readMap(map));

		if (!equal(local, effective)) {
			localStorage.setItem(
				adapter.storageKey(connection.userId),
				adapter.write(effective, raw),
			);
		}

		this.setLocalSnapshot(connection, adapter.name, effective);
		this.notifyStoreChanged(adapter.name);
	}

	private applyRemoteEntries(local: Entries, remote: Entries): Entries {
		const effective = { ...local };
		for (const [key, remoteValue] of Object.entries(remote)) {
			if (this.isDeletedEntry(remoteValue)) delete effective[key];
			else effective[key] = remoteValue;
		}
		return effective;
	}

	private isDeletedEntry(value: unknown): boolean {
		return (
			value !== null &&
			typeof value === 'object' &&
			(value as Record<string, unknown>)[DELETED_ENTRY_KEY] === true
		);
	}

	private setLocalSnapshot(
		connection: ChelysAccountConnection,
		name: StoreName,
		entries: Entries,
	): void {
		this.localSnapshots
			.get(connection)
			?.set(name, JSON.parse(JSON.stringify(entries)) as Entries);
	}

	private readMap(map: Y.Map<unknown>): Entries {
		const entries: Entries = {};
		map.forEach((value, key) => {
			entries[key] = value;
		});
		return entries;
	}

	private flushLocal(
		adapter: StoreAdapter,
		userId: string,
		entries: Entries,
		currentRaw: string | null,
	): void {
		localStorage.setItem(
			adapter.storageKey(userId),
			adapter.write(entries, currentRaw),
		);
		this.notifyStoreChanged(adapter.name);
	}

	private notifyStoreChanged(store: StoreName): void {
		window.dispatchEvent(
			new CustomEvent(CHELYS_ACCOUNT_STORE_CHANGED, {
				detail: { store },
			}),
		);
	}

	private readonly handleLocalStoreEvent = (event: Event): void => {
		const detail = (event as CustomEvent<UserDataChangedDetail>).detail;
		const connection = this.connection;
		if (!connection || detail?.userId !== connection.userId || !detail.type)
			return;
		this.publishStore(detail.type, detail.mutation);
	};

	private readonly handleStorageEvent = (event: StorageEvent): void => {
		const connection = this.connection;
		if (!connection || !event.key) return;

		for (const adapter of adapters) {
			if (event.key !== adapter.storageKey(connection.userId)) continue;

			const raw = localStorage.getItem(event.key);
			this.setLocalSnapshot(connection, adapter.name, adapter.read(raw));
			this.notifyStoreChanged(adapter.name);
			return;
		}
	};

	private emitConnection(): void {
		for (const listener of this.listeners) listener(this.connection);
	}
}

export const chelysAccountSyncService = new ChelysAccountSyncService();

setAccountControlRoomProvider(chelysAccountSyncService);
