// src/services/ChelysAccountSyncService.ts
import type * as Y from 'yjs';

import { collabService } from './CollabService';
import type { CollabConnectOptions } from '../types/collab';

const SYNC_ORIGIN = 'chelys-account-sync';
const COLLECTION_NAME = 'chelys_account';
const POLL_INTERVAL_MS = 3000;

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
		return JSON.stringify({ ...entries, _version: version });
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

class ChelysAccountSyncService {
	private doc: Y.Doc | null = null;
	private roomId: string | null = null;
	private userId: string | null = null;
	private pollIntervalId: ReturnType<typeof setInterval> | null = null;
	private unobservers: Array<() => void> = [];
	private snapshots = new Map<string, Entries>();

	async start(roomId: string, roomKey: string, userId: string): Promise<void> {
		if (this.doc && this.roomId === roomId && this.userId === userId) return;
		this.stop();

		const { doc } = collabService.connect(roomId, COLLECTION_NAME, {
			password: roomKey,
			...readCollabOptions(userId),
		});
		this.doc = doc;
		this.roomId = roomId;
		this.userId = userId;

		const container = collabService.getDocContainer(roomId, COLLECTION_NAME);
		if (container?.persistence && !container.persistence.synced) {
			await new Promise<void>((resolve) => {
				const timeout = setTimeout(resolve, 2000);
				container.persistence.once('synced', () => {
					clearTimeout(timeout);
					resolve();
				});
			});
		}

		if (this.doc !== doc) return;

		for (const adapter of ADAPTERS) {
			this.initializeStore(adapter, doc, userId);
		}

		this.pollIntervalId = setInterval(
			() => this.pushLocalChanges(),
			POLL_INTERVAL_MS,
		);
	}

	stop(): void {
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
		this.userId = null;
		this.snapshots.clear();
	}

	private initializeStore(
		adapter: StoreAdapter,
		doc: Y.Doc,
		userId: string,
	): void {
		const ymap = doc.getMap(adapter.name);
		const storageKey = adapter.storageKey(userId);
		const raw = localStorage.getItem(storageKey);
		const local = adapter.read(raw);

		const merged: Entries = { ...local };
		ymap.forEach((value, key) => {
			merged[key] =
				adapter.merge && key in local
					? adapter.merge(local[key], value)
					: value;
		});

		doc.transact(() => {
			for (const [key, value] of Object.entries(local)) {
				if (!ymap.has(key)) ymap.set(key, toPlain(value));
			}
		}, SYNC_ORIGIN);

		if (!isEqual(merged, local)) {
			localStorage.setItem(storageKey, adapter.write(merged, raw));
		}
		this.snapshots.set(adapter.name, merged);

		const observer = (
			event: Y.YMapEvent<unknown>,
			transaction: Y.Transaction,
		) => {
			if (transaction.origin === SYNC_ORIGIN) return;
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

		const storageKey = adapter.storageKey(userId);
		const raw = localStorage.getItem(storageKey);
		const entries = adapter.read(raw);

		event.changes.keys.forEach((change, key) => {
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

		localStorage.setItem(storageKey, adapter.write(entries, raw));
		this.snapshots.set(adapter.name, entries);
	}

	private pushLocalChanges(): void {
		const doc = this.doc;
		const userId = this.userId;
		if (!doc || !userId) return;

		for (const adapter of ADAPTERS) {
			const entries = adapter.read(
				localStorage.getItem(adapter.storageKey(userId)),
			);
			const snapshot = this.snapshots.get(adapter.name) ?? {};
			const ymap = doc.getMap(adapter.name);

			doc.transact(() => {
				for (const [key, value] of Object.entries(entries)) {
					if (!(key in snapshot) || !isEqual(snapshot[key], value)) {
						ymap.set(key, toPlain(value));
					}
				}
				for (const key of Object.keys(snapshot)) {
					if (!(key in entries)) ymap.delete(key);
				}
			}, SYNC_ORIGIN);

			this.snapshots.set(adapter.name, entries);
		}
	}
}

export const chelysAccountSyncService = new ChelysAccountSyncService();
