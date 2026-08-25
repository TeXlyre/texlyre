// src/chelys/peer/TransportChannel.ts
export const CHANNEL_PREFIX = 'texlyre-service';

const PROVIDER_ROOM_POLL_MS = 25;
const PROVIDER_ROOM_TIMEOUT_MS = 15_000;
const CHANNEL_LABEL_PREFIX = `${CHANNEL_PREFIX}:`;

export interface DataChannelLike {
	readonly label: string;
	readyState: RTCDataChannelState;
	bufferedAmount: number;
	binaryType: BinaryType;
	bufferedAmountLowThreshold: number;
	send(data: ArrayBuffer): void;
	close(): void;
	onmessage: ((event: { data: unknown }) => void) | null;
	onopen: ((event?: unknown) => void) | null;
	onclose: ((event?: unknown) => void) | null;
	onerror: ((event?: unknown) => void) | null;
	onbufferedamountlow: ((event?: unknown) => void) | null;
}

interface DataChannelEvent extends Event {
	channel: DataChannelLike;
}

type DataChannelHandler = (event: DataChannelEvent) => void;

export interface PeerConnectionLike {
	ondatachannel: DataChannelHandler | null;
	createDataChannel(
		label: string,
		options?: { ordered?: boolean },
	): DataChannelLike;
}

export interface SimplePeer {
	connected: boolean;
	_pc?: PeerConnectionLike;
	_needsNegotiation?(): void;
}

export interface WebrtcConn {
	peer: SimplePeer;
	connected: boolean;
	remotePeerId: string;
}

export interface ProviderRoom {
	peerId: string;
	webrtcConns: Map<string, WebrtcConn>;
}

export interface PeerProvider {
	room?: ProviderRoom | null;
	on?(event: 'peers' | 'status', handler: () => void): void;
	off?(event: 'peers' | 'status', handler: () => void): void;
}

export interface AcquiredChannel {
	channel: DataChannelLike;
	reused: boolean;
}

interface ChannelBroker {
	originalHandler: DataChannelHandler | null;
	subscribers: Map<string, Set<(channel: DataChannelLike) => void>>;
	wrapper: DataChannelHandler;
}

const channelsByConnection = new WeakMap<
	PeerConnectionLike,
	Map<string, DataChannelLike>
>();

const channelBrokers = new WeakMap<PeerConnectionLike, ChannelBroker>();

export function acquireChannel(
	peer: SimplePeer,
	label: string,
): AcquiredChannel | null {
	const connection = peer._pc;
	if (!connection) return null;

	const channels = getChannels(connection);
	const existing = channels.get(label);
	if (existing) {
		if (
			existing.readyState === 'open' ||
			existing.readyState === 'connecting'
		) {
			return { channel: existing, reused: true };
		}
		if (existing.readyState === 'closing') return null;
		channels.delete(label);
	}

	const channel = connection.createDataChannel(`${CHANNEL_PREFIX}:${label}`, {
		ordered: true,
	});
	channels.set(label, channel);

	try {
		if (typeof peer._needsNegotiation !== 'function') {
			throw new Error(
				'WebRTC peer does not support service-channel renegotiation',
			);
		}
		peer._needsNegotiation();
	} catch (error) {
		channels.delete(label);
		if (channels.size === 0) channelsByConnection.delete(connection);
		try {
			channel.close();
		} catch {
			// The channel did not finish initialising.
		}
		throw error;
	}

	return { channel, reused: false };
}

export function forgetChannel(
	peer: SimplePeer,
	label: string,
	channel: DataChannelLike,
): void {
	const connection = peer._pc;
	if (!connection) return;

	const channels = channelsByConnection.get(connection);
	if (!channels || channels.get(label) !== channel) return;

	channels.delete(label);
	if (channels.size === 0) channelsByConnection.delete(connection);
}

export function subscribeChannel(
	peer: SimplePeer,
	label: string,
	handler: (channel: DataChannelLike) => void,
): (() => void) | null {
	const connection = peer._pc;
	if (!connection) return null;

	const broker = getChannelBroker(connection);
	const handlers = broker.subscribers.get(label) ?? new Set();
	handlers.add(handler);
	broker.subscribers.set(label, handlers);

	return () => {
		handlers.delete(handler);
		if (handlers.size === 0) broker.subscribers.delete(label);
	};
}

export function providerPeerId(provider: unknown): string | null {
	return (provider as PeerProvider).room?.peerId ?? null;
}

export function findPeerConnection(
	provider: unknown,
	remotePeerId: string,
): WebrtcConn | null {
	const connection = (provider as PeerProvider).room?.webrtcConns.get(
		remotePeerId,
	);
	return connection?.connected && connection.peer.connected ? connection : null;
}

export function subscribeProviderPeers(
	provider: unknown,
	handler: () => void,
): () => void {
	const typed = provider as PeerProvider;
	typed.on?.('peers', handler);
	typed.on?.('status', handler);
	return () => {
		typed.off?.('peers', handler);
		typed.off?.('status', handler);
	};
}

export function waitForProviderPeerId(
	provider: unknown,
	timeoutMs = PROVIDER_ROOM_TIMEOUT_MS,
): Promise<string> {
	const immediate = providerPeerId(provider);
	if (immediate) return Promise.resolve(immediate);

	return new Promise((resolve, reject) => {
		let settled = false;
		const finish = (value?: string, error?: Error): void => {
			if (settled) return;
			settled = true;
			clearInterval(pollTimer);
			clearTimeout(timeoutTimer);
			unsubscribe();
			if (error) reject(error);
			else resolve(value!);
		};
		const inspect = (): void => {
			const value = providerPeerId(provider);
			if (value) finish(value);
		};
		const unsubscribe = subscribeProviderPeers(provider, inspect);
		const pollTimer = setInterval(inspect, PROVIDER_ROOM_POLL_MS);
		const timeoutTimer = setTimeout(
			() =>
				finish(
					undefined,
					new Error('WebRTC awareness room did not initialise'),
				),
			timeoutMs,
		);
		inspect();
	});
}

function getChannels(
	connection: PeerConnectionLike,
): Map<string, DataChannelLike> {
	let channels = channelsByConnection.get(connection);
	if (!channels) {
		channels = new Map();
		channelsByConnection.set(connection, channels);
	}
	return channels;
}

function getChannelBroker(connection: PeerConnectionLike): ChannelBroker {
	const existing = channelBrokers.get(connection);
	if (existing) return existing;

	const broker = {} as ChannelBroker;
	broker.originalHandler = connection.ondatachannel;
	broker.subscribers = new Map();
	broker.wrapper = (event): void => {
		const channel = event.channel;
		if (!channel.label.startsWith(CHANNEL_LABEL_PREFIX)) {
			broker.originalHandler?.call(connection, event);
			return;
		}

		const label = channel.label.slice(CHANNEL_LABEL_PREFIX.length);
		const handlers = broker.subscribers.get(label);
		if (handlers?.size) {
			for (const subscriber of Array.from(handlers)) subscriber(channel);
			return;
		}

		try {
			channel.close();
		} catch {
			// Drop stale service channels that no active host requested.
		}
	};
	connection.ondatachannel = broker.wrapper;
	channelBrokers.set(connection, broker);
	return broker;
}
