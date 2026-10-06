// src/utils/storageKeyShareUtils.ts
// Live collaborator key handoff only; cryptographic key derivation/wrapping lives in storageEncryptionUtils.
import {
	acquireChannel,
	forgetChannel,
	listPeerConnections,
	subscribeChannel,
	subscribeProviderPeers,
	type DataChannelLike,
	type SimplePeer,
} from '../chelys/peer/TransportChannel';
import {
	FrameReassembler,
	encodeFrames,
} from '../chelys/peer/TransportFraming';

const CHANNEL_PREFIX = 'storage-key-v1';
const REQUEST_MESSAGE = 'request';
const ERROR_PREFIX = 'error:';
const DEFAULT_TIMEOUT_MS = 15_000;
const PROJECT_KEY_BYTES = 32;

const channelLabel = (storageProjectId: string): string =>
	`${CHANNEL_PREFIX}:${storageProjectId}`;

const send = (channel: DataChannelLike, payload: string | Uint8Array): void => {
	for (const frame of encodeFrames(payload)) channel.send(frame);
};

const closeChannel = (channel: DataChannelLike): void => {
	try {
		channel.close();
	} catch {
		// Already closed.
	}
};

export function hostStorageProjectKeySharing(
	provider: unknown,
	storageProjectId: string,
	getProjectKey: () => Promise<Uint8Array>,
): () => void {
	const label = channelLabel(storageProjectId);
	const subscriptions = new Map<SimplePeer, () => void>();
	const channels = new Set<DataChannelLike>();
	let stopped = false;

	const accept = (channel: DataChannelLike): void => {
		if (stopped) {
			closeChannel(channel);
			return;
		}
		channels.add(channel);
		channel.binaryType = 'arraybuffer';
		const reassembler = new FrameReassembler();
		let handled = false;

		const close = (): void => {
			channels.delete(channel);
			reassembler.reset();
			channel.onmessage = null;
			channel.onopen = null;
			channel.onclose = null;
			channel.onerror = null;
			closeChannel(channel);
		};

		channel.onmessage = (event) => {
			const payload = reassembler.push(event.data as ArrayBuffer);
			if (handled || payload !== REQUEST_MESSAGE) return;
			handled = true;

			void getProjectKey()
				.then((key) => {
					if (key.byteLength !== PROJECT_KEY_BYTES) {
						throw new Error('Invalid project storage key');
					}
					if (channel.readyState === 'open') send(channel, key);
				})
				.catch((error) => {
					if (channel.readyState === 'open') {
						send(
							channel,
							`${ERROR_PREFIX}${error instanceof Error ? error.message : 'Project storage key unavailable'}`,
						);
					}
				})
				.finally(() => queueMicrotask(close));
		};
		channel.onclose = close;
		channel.onerror = close;
	};

	const sync = (): void => {
		if (stopped) return;
		const peers = listPeerConnections(provider);
		const active = new Set(peers.map(({ peer }) => peer));

		for (const [peer, unsubscribe] of subscriptions) {
			if (active.has(peer)) continue;
			unsubscribe();
			subscriptions.delete(peer);
		}
		for (const { peer } of peers) {
			if (subscriptions.has(peer)) continue;
			const unsubscribe = subscribeChannel(peer, label, accept);
			if (unsubscribe) subscriptions.set(peer, unsubscribe);
		}
	};

	const unsubscribeProvider = subscribeProviderPeers(provider, sync);
	sync();

	return () => {
		if (stopped) return;
		stopped = true;
		unsubscribeProvider();
		for (const unsubscribe of subscriptions.values()) unsubscribe();
		subscriptions.clear();
		for (const channel of channels) closeChannel(channel);
		channels.clear();
	};
}

interface PeerRequest {
	promise: Promise<Uint8Array>;
	cancel(): void;
}

const requestFromPeer = (
	peer: SimplePeer,
	storageProjectId: string,
	timeoutMs: number,
): PeerRequest => {
	const label = channelLabel(storageProjectId);
	const acquired = acquireChannel(peer, label);
	if (!acquired) {
		return {
			promise: Promise.reject(new Error('WebRTC project peer is not ready')),
			cancel: () => undefined,
		};
	}

	const channel = acquired.channel;
	const reassembler = new FrameReassembler();
	let settled = false;
	let sent = false;
	let timer: ReturnType<typeof setTimeout>;
	let resolvePromise!: (value: Uint8Array) => void;
	let rejectPromise!: (error: Error) => void;

	const promise = new Promise<Uint8Array>((resolve, reject) => {
		resolvePromise = resolve;
		rejectPromise = reject;
	});

	const cleanup = (): void => {
		clearTimeout(timer);
		reassembler.reset();
		channel.onmessage = null;
		channel.onopen = null;
		channel.onclose = null;
		channel.onerror = null;
		forgetChannel(peer, label, channel);
		closeChannel(channel);
	};

	const finish = (key?: Uint8Array, error?: Error): void => {
		if (settled) return;
		settled = true;
		cleanup();
		if (error) rejectPromise(error);
		else resolvePromise(key!);
	};

	const sendRequest = (): void => {
		if (sent || channel.readyState !== 'open') return;
		sent = true;
		send(channel, REQUEST_MESSAGE);
	};

	channel.binaryType = 'arraybuffer';
	channel.onopen = sendRequest;
	channel.onmessage = (event) => {
		const payload = reassembler.push(event.data as ArrayBuffer);
		if (typeof payload === 'string') {
			if (payload.startsWith(ERROR_PREFIX)) {
				finish(undefined, new Error(payload.slice(ERROR_PREFIX.length)));
			}
			return;
		}
		if (!(payload instanceof Uint8Array)) return;
		if (payload.byteLength !== PROJECT_KEY_BYTES) {
			finish(
				undefined,
				new Error('Peer returned an invalid project storage key'),
			);
			return;
		}
		finish(payload);
	};
	channel.onclose = () =>
		finish(undefined, new Error('Storage key channel closed'));
	channel.onerror = () =>
		finish(undefined, new Error('Storage key WebRTC channel failed'));
	timer = setTimeout(
		() =>
			finish(undefined, new Error('Timed out requesting project storage key')),
		timeoutMs,
	);
	if (channel.readyState === 'open') queueMicrotask(sendRequest);

	return {
		promise,
		cancel: () => finish(undefined, new Error('Storage key request cancelled')),
	};
};

export function requestStorageProjectKey(
	provider: unknown,
	storageProjectId: string,
	timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Uint8Array> {
	const peers = listPeerConnections(provider);
	if (peers.length === 0) {
		return Promise.reject(
			new Error(
				'No live WebRTC collaborator is available to share the storage key',
			),
		);
	}

	const requests = peers.map(({ peer }) =>
		requestFromPeer(peer, storageProjectId, timeoutMs),
	);

	return Promise.any(requests.map(({ promise }) => promise))
		.catch((error: AggregateError) => {
			const first = error.errors.find(
				(candidate) => candidate instanceof Error,
			);
			throw (
				first ??
				new Error('No collaborator could provide the project storage key')
			);
		})
		.finally(() => {
			for (const request of requests) request.cancel();
		});
}
