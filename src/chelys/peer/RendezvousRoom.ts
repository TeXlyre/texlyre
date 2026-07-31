// src/chelys/peer/RendezvousRoom.ts
import { Awareness } from 'y-protocols/awareness';
import { WebrtcProvider } from 'y-webrtc';
import * as Y from 'yjs';

import { createNamedLogger } from '@/logging';
import {
	getNativeScopeControl,
	hasRemoteTexlyrePeer,
	peerKind,
	scopedPeerOptions,
} from './NativeScope';
import type { ControlConnection, PeerState } from './SessionContract';
import { waitForProviderPeerId } from './TransportChannel';

const moduleLog = createNamedLogger('RendezvousRoom');

const INITIAL_NATIVE_PEER_GRACE_MS = 6_000;
const LOST_NATIVE_PEER_GRACE_MS = 2_500;

export interface RendezvousUser {
	id?: string;
	username: string;
	name?: string;
	color?: string;
	colorLight?: string;
}

export interface RendezvousConnection extends ControlConnection {
	roomName: string;
	runtimeId: string;
	nativeScopeId: string | null;
}

export interface RendezvousLease {
	readonly connection: RendezvousConnection;
	subscribe(listener: (connection: RendezvousConnection) => void): () => void;
	release(): void;
}

interface SharedEntry {
	roomId: string;
	roomName: string;
	signaling: string[];
	runtimeId: string;
	peerId: string;
	user: RendezvousUser | null;
	connection: RendezvousConnection;
	refs: number;
	listeners: Set<(connection: RendezvousConnection) => void>;
	nativeUnsubscribe: (() => void) | null;
	awarenessChangeHandler: (() => void) | null;
	recoveryTimer: ReturnType<typeof setTimeout> | null;
	operation: Promise<void>;
	stopped: boolean;
	hadHealthyPeer: boolean;
}

const sharedEntries = new Map<string, SharedEntry>();

const normalizeSignaling = (signaling: string[]): string[] => [
	...new Set(signaling.map((server) => server.trim()).filter(Boolean)),
];

const cacheKeyFor = (roomId: string, signaling: string[]): string =>
	[roomId, ...normalizeSignaling(signaling).sort()].join('\n');

const roomNameFor = (roomId: string): string =>
	`texlyre-service-rendezvous-${roomId}`;

const createConnection = (
	roomId: string,
	roomName: string,
	signaling: string[],
	user: RendezvousUser | null,
	runtimeId: string,
	peerId: string,
): RendezvousConnection => {
	const kind = peerKind();
	const nativeScopeId = kind === 'chelys' ? runtimeId : null;
	const doc = new Y.Doc();
	const awareness = new Awareness(doc);
	const peer: PeerState = {
		id: peerId,
		instanceId: runtimeId,
		kind,
		userId: '',
		username: kind,
	};
	const provider = new WebrtcProvider(roomName, doc, {
		awareness,
		maxConns: Number.POSITIVE_INFINITY,
		filterBcConns: false,
		...(signaling.length > 0 ? { signaling } : {}),
		...(nativeScopeId ? { peerOpts: scopedPeerOptions(nativeScopeId) } : {}),
	});

	awareness.setLocalStateField('accountPeer', peer);
	if (user) awareness.setLocalStateField('user', user);

	const connection: RendezvousConnection = {
		roomId,
		roomName,
		runtimeId,
		nativeScopeId,
		doc,
		provider,
		awareness,
		peer,
		ready: Promise.resolve(),
	};
	connection.ready = waitForProviderPeerId(provider).then((transportPeerId) => {
		peer.transportPeerId = transportPeerId;
		awareness.setLocalStateField('accountPeer', peer);
	});
	return connection;
};

const cancelRecovery = (entry: SharedEntry): void => {
	if (entry.recoveryTimer) clearTimeout(entry.recoveryTimer);
	entry.recoveryTimer = null;
};

const destroyConnection = async (
	connection: RendezvousConnection,
	resetNativeScope: boolean,
): Promise<void> => {
	try {
		connection.awareness.setLocalState(null);
	} catch {
		// The awareness runtime may already be detached.
	}
	connection.provider.destroy();
	connection.awareness.destroy();
	connection.doc.destroy();

	if (resetNativeScope && connection.nativeScopeId) {
		await getNativeScopeControl()?.reset(connection.nativeScopeId);
	}
};

const emitConnection = (entry: SharedEntry): void => {
	for (const listener of Array.from(entry.listeners)) {
		listener(entry.connection);
	}
};

const detachHealthObservers = (entry: SharedEntry): void => {
	entry.nativeUnsubscribe?.();
	entry.nativeUnsubscribe = null;

	if (entry.awarenessChangeHandler) {
		entry.connection.awareness.off('change', entry.awarenessChangeHandler);
		entry.awarenessChangeHandler = null;
	}
};

const observeNativeScope = (entry: SharedEntry): void => {
	detachHealthObservers(entry);

	const scopeId = entry.connection.nativeScopeId;
	if (!scopeId) return;

	const control = getNativeScopeControl();
	if (!control) {
		moduleLog.warn('Native WebRTC scope control is unavailable');
		return;
	}

	const update = (): void => {
		if (entry.stopped) return;

		const connectedPeers = control.getConnectedCount(scopeId);
		const hasTexlyrePeer = hasRemoteTexlyrePeer(entry.connection.awareness);

		if (connectedPeers > 0 || hasTexlyrePeer) {
			if (connectedPeers > 0) entry.hadHealthyPeer = true;
			cancelRecovery(entry);
			return;
		}

		scheduleRecovery(entry);
	};

	entry.nativeUnsubscribe = control.subscribe(scopeId, () => update());
	entry.awarenessChangeHandler = update;
	entry.connection.awareness.on('change', update);
	update();
};

const restartEntry = async (entry: SharedEntry): Promise<void> => {
	if (entry.stopped || entry.refs <= 0) return;

	detachHealthObservers(entry);
	const previous = entry.connection;
	await destroyConnection(previous, true);

	if (entry.stopped || entry.refs <= 0) return;

	entry.connection = createConnection(
		entry.roomId,
		entry.roomName,
		entry.signaling,
		entry.user,
		entry.runtimeId,
		entry.peerId,
	);
	emitConnection(entry);
	observeNativeScope(entry);
};

const queueRestart = (entry: SharedEntry): void => {
	entry.operation = entry.operation
		.then(() => restartEntry(entry))
		.catch((error) => {
			moduleLog.error('Failed to restart rendezvous', error);
		});
};

function scheduleRecovery(entry: SharedEntry): void {
	if (
		entry.stopped ||
		entry.refs <= 0 ||
		!entry.connection.nativeScopeId ||
		entry.recoveryTimer
	) {
		return;
	}

	const delay = entry.hadHealthyPeer
		? LOST_NATIVE_PEER_GRACE_MS
		: INITIAL_NATIVE_PEER_GRACE_MS;

	entry.recoveryTimer = setTimeout(() => {
		entry.recoveryTimer = null;
		if (entry.stopped || entry.refs <= 0) return;

		const scopeId = entry.connection.nativeScopeId;
		const connectedPeers = scopeId
			? (getNativeScopeControl()?.getConnectedCount(scopeId) ?? 0)
			: 0;
		const hasTexlyrePeer = hasRemoteTexlyrePeer(entry.connection.awareness);

		if (connectedPeers === 0 && !hasTexlyrePeer) {
			queueRestart(entry);
		}
	}, delay);
}

export function acquireRendezvous(
	roomId: string,
	signaling: string[],
	user?: RendezvousUser | null,
): RendezvousLease {
	const normalizedSignaling = normalizeSignaling(signaling);
	const cacheKey = cacheKeyFor(roomId, normalizedSignaling);
	let entry = sharedEntries.get(cacheKey);

	if (!entry) {
		const roomName = roomNameFor(roomId);
		const runtimeId = crypto.randomUUID();
		const peerId = crypto.randomUUID();
		entry = {
			roomId,
			roomName,
			signaling: normalizedSignaling,
			runtimeId,
			peerId,
			user: user ?? null,
			connection: createConnection(
				roomId,
				roomName,
				normalizedSignaling,
				user ?? null,
				runtimeId,
				peerId,
			),
			refs: 0,
			listeners: new Set(),
			nativeUnsubscribe: null,
			awarenessChangeHandler: null,
			recoveryTimer: null,
			operation: Promise.resolve(),
			stopped: false,
			hadHealthyPeer: false,
		};
		sharedEntries.set(cacheKey, entry);
		observeNativeScope(entry);
	} else if (user) {
		entry.user = user;
		entry.connection.awareness.setLocalStateField('user', user);
	}

	entry.refs += 1;
	let released = false;

	return {
		get connection(): RendezvousConnection {
			return entry!.connection;
		},
		subscribe(
			listener: (connection: RendezvousConnection) => void,
		): () => void {
			entry!.listeners.add(listener);
			listener(entry!.connection);
			return () => entry!.listeners.delete(listener);
		},
		release(): void {
			if (released) return;
			released = true;
			entry!.refs -= 1;
			if (entry!.refs > 0) return;

			entry!.stopped = true;
			cancelRecovery(entry!);
			detachHealthObservers(entry!);
			entry!.listeners.clear();
			sharedEntries.delete(cacheKey);

			const connection = entry!.connection;
			entry!.operation = entry!.operation
				.then(() => destroyConnection(connection, true))
				.catch((error) => {
					moduleLog.error('Failed to destroy rendezvous', error);
				});
		},
	};
}
