// src/services/ChelysAccountSyncService.ts
import type * as Y from 'yjs';

import { collabService } from './CollabService';
import type { CollabConnectOptions, CollabProvider } from '../types/collab';

const SYNC_ORIGIN = 'chelys-account-sync';
const COLLECTION_NAME = 'chelys_account';
const POLL_INTERVAL_MS = 3000;
const PERSISTENCE_TIMEOUT_MS = 2000;
const PEER_SETTLE_MS = 500;
const TOMBSTONE_KEY = '__chelys_deleted';
const snapshotKey = (userId: string, store: string): string =>
	`texlyre-user-${userId}-chelys-synced-${store}`;

type Entries = Record<string, unknown>;

interface StoreAdapter {
	name: 'settings' | 'properties' | 'secrets' | 'records';
	storageKey: (userId: string) => string;
	read: (raw: string | null) => Entries;
	write: (entries: Entries, currentRaw: string | null) => string;
	merge?: (local: unknown, remote: unknown) => unknown;
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
		return version === undefined
			? JSON.stringify({ ...entries })
			: JSON.stringify({ ...entries, _version: version });
	},
});

const secretsAdapter: StoreAdapter = {
	name: 'secrets',
	storageKey: (userId) => `texlyre-user-${userId}-secrets`,
	read: (raw) => {
		if (!raw) return {};
		try {
			const entries: Entries = {};
			for (const s of JSON.parse(raw)) {
				const key = `${s.pluginId}:${s.scope}:${s.projectId ?? ''}:${s.secretKey}`;
				entries[key] = s;
			}
			return entries;
		} catch {
			return {};
		}
	},
	write: (entries) => JSON.stringify(Object.values(entries)),
};

const recordsAdapter: StoreAdapter = {
	name: 'records',
	storageKey: (userId) => `texlyre-user-${userId}-records`,
	read: (raw) => {
		if (!raw) return {};
		try {
			const parsed = JSON.parse(raw);
			return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
				? parsed
				: {};
		} catch {
			return {};
		}
	},
	write: (entries) => JSON.stringify(entries),
	merge: (local, remote) => {
		if (!Array.isArray(local) || !Array.isArray(remote)) return remote;
		const byId = new Map<string, any>();
		for (const entry of [...local, ...remote]) {
			if (entry?.id) byId.set(entry.id, entry);
		}
		return [...byId.values()].sort((a, b) => a.timestamp - b.timestamp);
	},
};

const ADAPTERS: StoreAdapter[] = [
	versionedAdapter('settings'),
	versionedAdapter('properties'),
	secretsAdapter,
	recordsAdapter,
];

const readCollabOptions = (userId: string): CollabConnectOptions => {
	try {
		const settings = JSON.parse(
			localStorage.getItem(`texlyre-user-${userId}-settings`) || '{}',
		);
		const servers = settings['collab-signaling-servers'];
		return {
			signalingServers:
				typeof servers === 'string' && servers.trim()
					? servers.split(',').map((s: string) => s.trim())
					: ['ws://ywebrtc.localhost:8082/'],
			autoReconnect: settings['collab-auto-reconnect'] === true,
		};
	} catch {
		return { signalingServers: ['ws://ywebrtc.localhost:8082/'] };
	}
};

const toPlain = (value: unknown): unknown =>
	value === undefined ? null : JSON.parse(JSON.stringify(value));

const isEqual = (a: unknown, b: unknown): boolean =>
	JSON.stringify(a) === JSON.stringify(b);

const emitStoreChanged = (store: string): void => {
	window.dispatchEvent(
		new CustomEvent('chelys-account-store-changed', {
			detail: { store },
		}),
	);
};

class ChelysAccountSyncService {
	private doc: Y.Doc | null = null;
	private roomId: string | null = null;
	private roomKey: string | null = null;
	private userId: string | null = null;
	private username: string | null = null;
	private pollIntervalId: ReturnType<typeof setInterval> | null = null;
	private unobservers: Array<() => void> = [];
	private snapshots = new Map<string, Entries>();
	private startToken = 0;
	private hydrated = false;
	private queue: Promise<void> = Promise.resolve();

	async start(
		roomId: string,
		roomKey: string,
		userId: string,
		username: string,
	): Promise<void> {
		const run = this.queue.then(() =>
			this.runStart(roomId, roomKey, userId, username),
		);
		this.queue = run.catch(() => undefined);
		return run;
	}

	private async runStart(
		roomId: string,
		roomKey: string,
		userId: string,
		username: string,
	): Promise<void> {
		if (this.doc && this.roomId === roomId && this.userId === userId) return;
		this.stop();

		const token = ++this.startToken;

		const { doc, provider } = collabService.connect(roomId, COLLECTION_NAME, {
			password: roomKey,
			autoReconnect: true,
			awarenessTimeout: 30000,
			...readCollabOptions(userId),
		});
		this.doc = doc;
		this.roomId = roomId;
		this.roomKey = roomKey;
		this.userId = userId;
		this.username = username;
		this.hydrated = false;

		collabService.setUserInfo(roomId, COLLECTION_NAME, {
			id: userId,
			username,
			name: username,
			color: '#7da8c4',
			colorLight: '#a8c4dc',
			passwordHash: '',
			createdAt: 0,
		});

		for (const adapter of ADAPTERS) {
			this.observeStore(adapter, doc);
		}

		await this.waitForSync(roomId, provider);
		if (token !== this.startToken) return;

		this.hydrate();

		this.pollIntervalId = setInterval(() => {
			this.pushLocalChanges();
		}, POLL_INTERVAL_MS);
	}

	stop(): void {
		this.startToken++;
		if (this.pollIntervalId) {
			clearInterval(this.pollIntervalId);
			this.pollIntervalId = null;
		}
		for (const unobserve of this.unobservers) {
			unobserve();
		}
		this.unobservers = [];
		if (this.roomId) {
			collabService.disconnect(this.roomId, COLLECTION_NAME);
		}
		this.doc = null;
		this.roomId = null;
		this.roomKey = null;
		this.userId = null;
		this.username = null;
		this.hydrated = false;
		this.snapshots.clear();
	}

	clearSyncState(userId: string): void {
		for (const adapter of ADAPTERS) {
			localStorage.removeItem(snapshotKey(userId, adapter.name));
		}
	}

	async reconnect(): Promise<void> {
		const roomId = this.roomId;
		const userId = this.userId;
		const roomKey = this.roomKey;
		const username = this.username;
		if (!roomId || !userId || !roomKey || !username) return;
		this.stop();
		await this.start(roomId, roomKey, userId, username);
	}

	private async waitForSync(
		roomId: string,
		provider: CollabProvider | null,
	): Promise<void> {
		const container = collabService.getDocContainer(roomId, COLLECTION_NAME);
		const persistence = container?.persistence;

		if (persistence && !persistence.synced) {
			await new Promise<void>((resolve) => {
				const timeout = setTimeout(resolve, PERSISTENCE_TIMEOUT_MS);
				persistence.once('synced', () => {
					clearTimeout(timeout);
					resolve();
				});
			});
		}

		if (provider) {
			await new Promise<void>((resolve) => setTimeout(resolve, PEER_SETTLE_MS));
		}
	}

	private readTombstones(ymap: Y.Map<unknown>): Set<string> {
		const raw = ymap.get(TOMBSTONE_KEY);
		return new Set(Array.isArray(raw) ? (raw as string[]) : []);
	}

	private readSnapshot(adapter: StoreAdapter, userId: string): Entries | null {
		const raw = localStorage.getItem(snapshotKey(userId, adapter.name));
		if (raw === null) return null;
		try {
			const parsed = JSON.parse(raw);
			return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
				? parsed
				: null;
		} catch {
			return null;
		}
	}

	private hydrate(): void {
		const doc = this.doc;
		const userId = this.userId;
		if (!doc || !userId) return;

		for (const adapter of ADAPTERS) {
			const ymap = doc.getMap(adapter.name);
			const raw = localStorage.getItem(adapter.storageKey(userId));
			const local = adapter.read(raw);
			const snapshot = this.readSnapshot(adapter, userId);
			const tombstones = this.readTombstones(ymap);

			const remote: Entries = {};
			ymap.forEach((value, key) => {
				if (key !== TOMBSTONE_KEY) remote[key] = value;
			});

			const merged: Entries = { ...remote };
			for (const [key, value] of Object.entries(local)) {
				const changedLocally =
					snapshot !== null && !isEqual(value, snapshot[key]);
				if (key in remote) {
					if (adapter.merge) {
						merged[key] = adapter.merge(value, remote[key]);
					} else if (changedLocally) {
						merged[key] = value;
					}
				} else if (!tombstones.has(key) || changedLocally) {
					merged[key] = value;
				}
			}

			doc.transact(() => {
				for (const [key, value] of Object.entries(merged)) {
					if (!(key in remote) || !isEqual(remote[key], value)) {
						ymap.set(key, toPlain(value));
					}
				}
			}, SYNC_ORIGIN);

			this.flushStore(adapter, merged, raw);
		}

		this.hydrated = true;
	}

	private flushStore(
		adapter: StoreAdapter,
		entries: Entries,
		raw: string | null,
	): void {
		const userId = this.userId;
		if (!userId) return;
		localStorage.setItem(
			adapter.storageKey(userId),
			adapter.write(entries, raw),
		);
		localStorage.setItem(
			snapshotKey(userId, adapter.name),
			JSON.stringify(entries),
		);
		this.snapshots.set(adapter.name, entries);
		emitStoreChanged(adapter.name);
	}

	private observeStore(adapter: StoreAdapter, doc: Y.Doc): void {
		const ymap = doc.getMap(adapter.name);
		const observer = (
			event: Y.YMapEvent<unknown>,
			transaction: Y.Transaction,
		) => {
			if (transaction.origin === SYNC_ORIGIN) return;
			if (!this.hydrated) return;
			this.applyRemoteChanges(adapter, ymap, event);
		};
		ymap.observe(observer);
		this.unobservers.push(() => ymap.unobserve(observer));
	}

	private applyRemoteChanges(
		adapter: StoreAdapter,
		ymap: Y.Map<unknown>,
		event: Y.YMapEvent<unknown>,
	): void {
		const userId = this.userId;
		if (!userId) return;

		const raw = localStorage.getItem(adapter.storageKey(userId));
		const entries = adapter.read(raw);
		const tombstones = this.readTombstones(ymap);

		event.changes.keys.forEach((change, key) => {
			if (key === TOMBSTONE_KEY) {
				for (const deleted of tombstones) {
					delete entries[deleted];
				}
				return;
			}
			if (change.action === 'delete') {
				delete entries[key];
			} else {
				const incoming = ymap.get(key);
				entries[key] =
					adapter.merge && key in entries
						? adapter.merge(entries[key], incoming)
						: incoming;
			}
		});

		this.flushStore(adapter, entries, raw);
	}

	private pushLocalChanges(): void {
		const doc = this.doc;
		const userId = this.userId;
		if (!doc || !userId || !this.hydrated) return;

		for (const adapter of ADAPTERS) {
			const raw = localStorage.getItem(adapter.storageKey(userId));
			const entries = adapter.read(raw);
			const snapshot = this.snapshots.get(adapter.name) ?? {};
			const ymap = doc.getMap(adapter.name);
			const removed = Object.keys(snapshot).filter((key) => !(key in entries));

			doc.transact(() => {
				const tombstones = this.readTombstones(ymap);
				let tombstonesChanged = false;
				for (const [key, value] of Object.entries(entries)) {
					if (!(key in snapshot) || !isEqual(snapshot[key], value)) {
						ymap.set(key, toPlain(value));
					}
					if (tombstones.delete(key)) tombstonesChanged = true;
				}
				for (const key of removed) {
					ymap.delete(key);
					tombstones.add(key);
					tombstonesChanged = true;
				}
				if (tombstonesChanged) ymap.set(TOMBSTONE_KEY, [...tombstones]);
			}, SYNC_ORIGIN);

			this.snapshots.set(adapter.name, entries);
			localStorage.setItem(
				snapshotKey(userId, adapter.name),
				JSON.stringify(entries),
			);
		}
	}
}

export const chelysAccountSyncService = new ChelysAccountSyncService();
