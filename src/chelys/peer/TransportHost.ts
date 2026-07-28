// src/chelys/peer/TransportHost.ts
import type { WebrtcProvider } from 'y-webrtc';

import { createNamedLogger } from '@/logging';
import {
	findPeerConnection,
	subscribeChannel,
	subscribeProviderPeers,
	type DataChannelLike,
	type SimplePeer,
} from './TransportChannel';
import { FrameReassembler, encodeFrames } from './TransportFraming';
import type { HostTransport, TransportPayload } from '../types/transport';

const moduleLog = createNamedLogger('TransportHost');

const BUFFER_HIGH_WATER = 1024 * 1024;
const BUFFER_LOW_WATER = 256 * 1024;
const SYNC_INTERVAL_MS = 100;
const CHANNEL_RETRY_DELAY_MS = 500;

export interface TransportHostOptions {
	provider: WebrtcProvider;
	remoteTransportPeerId: string;
	channelLabel: string;
	label: string;
}

class HostedChannel implements HostTransport {
	private readonly messageHandlers = new Set<
		(payload: TransportPayload) => void
	>();
	private readonly closeHandlers = new Set<() => void>();
	private readonly openHandlers = new Set<() => void>();
	private readonly reassembler = new FrameReassembler({
		onError: (error) => this.fail(error),
	});
	private readonly queue: ArrayBuffer[] = [];
	private drainTimer: ReturnType<typeof setInterval> | null = null;
	private drainTimeout: ReturnType<typeof setTimeout> | null = null;
	private closeRequested = false;
	private closed = false;

	constructor(
		readonly peerId: string,
		private readonly channel: DataChannelLike,
		private readonly label: string,
	) {
		this.attachChannel();
	}

	get rawChannel(): DataChannelLike {
		return this.channel;
	}

	get isOpen(): boolean {
		return !this.closed && this.channel.readyState === 'open';
	}

	isClosed(): boolean {
		return this.closed || this.channel.readyState === 'closed';
	}

	send(payload: TransportPayload): void {
		if (this.closed) return;
		for (const frame of encodeFrames(payload)) this.queue.push(frame);
		this.flush();
	}

	closeWhenDrained(): void {
		if (this.closed || this.closeRequested) return;
		this.closeRequested = true;
		this.flush();
		this.finishDrainIfReady();
		if (this.closed) return;
		this.drainTimer = setInterval(this.finishDrainIfReady, 25);
		this.drainTimeout = setTimeout(
			() => this.fail(new Error(`Timed out draining ${this.label}`)),
			120_000,
		);
	}

	close(): void {
		this.finish(true);
	}

	onMessage(handler: (payload: TransportPayload) => void): () => void {
		this.messageHandlers.add(handler);
		return () => this.messageHandlers.delete(handler);
	}

	onClose(handler: () => void): () => void {
		if (this.closed) {
			queueMicrotask(handler);
			return () => undefined;
		}
		this.closeHandlers.add(handler);
		return () => this.closeHandlers.delete(handler);
	}

	onOpen(handler: () => void): () => void {
		if (this.isOpen) {
			queueMicrotask(handler);
			return () => undefined;
		}
		this.openHandlers.add(handler);
		return () => this.openHandlers.delete(handler);
	}

	private attachChannel(): void {
		this.channel.binaryType = 'arraybuffer';
		this.channel.bufferedAmountLowThreshold = BUFFER_LOW_WATER;
		this.channel.onopen = () => {
			moduleLog.info(`${this.label}: awareness channel open`);
			const handlers = Array.from(this.openHandlers);
			this.openHandlers.clear();
			for (const handler of handlers) handler();
			this.flush();
		};
		this.channel.onmessage = (event) => {
			const payload = this.reassembler.push(event.data as ArrayBuffer);
			if (payload !== null) {
				for (const handler of this.messageHandlers) handler(payload);
			}
		};
		this.channel.onclose = () => this.finish(false);
		this.channel.onerror = (event) => {
			const detail = (event as { error?: unknown } | undefined)?.error;
			this.fail(
				detail instanceof Error
					? detail
					: new Error(`WebRTC channel error for ${this.label}`),
			);
		};
		this.channel.onbufferedamountlow = () => {
			this.flush();
			this.finishDrainIfReady();
		};
		if (this.channel.readyState === 'open') {
			queueMicrotask(() => this.channel.onopen?.());
		}
	}

	private flush(): void {
		while (this.queue.length > 0 && this.isOpen) {
			if (this.channel.bufferedAmount > BUFFER_HIGH_WATER) return;
			const frame = this.queue.shift();
			if (!frame) return;
			try {
				this.channel.send(frame);
			} catch (error) {
				this.queue.unshift(frame);
				this.fail(error instanceof Error ? error : new Error(String(error)));
				return;
			}
		}
		this.finishDrainIfReady();
	}

	private readonly finishDrainIfReady = (): void => {
		if (
			this.closeRequested &&
			this.queue.length === 0 &&
			this.channel.bufferedAmount === 0
		) {
			this.close();
		}
	};

	private fail(error: Error): void {
		if (this.closed) return;
		moduleLog.error(`${this.label}: channel failed`, error);
		this.close();
	}

	private finish(closeChannel: boolean): void {
		if (this.closed) return;
		this.closed = true;
		this.queue.length = 0;
		this.reassembler.reset();
		if (this.drainTimer) clearInterval(this.drainTimer);
		if (this.drainTimeout) clearTimeout(this.drainTimeout);
		this.drainTimer = null;
		this.drainTimeout = null;
		this.channel.onopen = null;
		this.channel.onmessage = null;
		this.channel.onclose = null;
		this.channel.onerror = null;
		this.channel.onbufferedamountlow = null;
		if (closeChannel) {
			try {
				this.channel.close();
			} catch {
				// Already closed.
			}
		}
		const handlers = Array.from(this.closeHandlers);
		this.messageHandlers.clear();
		this.closeHandlers.clear();
		this.openHandlers.clear();
		for (const handler of handlers) handler();
	}
}

export class TransportHost {
	private readonly channelHandlers = new Set<
		(channel: HostTransport) => void
	>();
	private channel: HostedChannel | null = null;
	private peer: SimplePeer | null = null;
	private unsubscribeChannel: (() => void) | null = null;
	private syncTimer: ReturnType<typeof setInterval> | null = null;
	private retryTimer: ReturnType<typeof setTimeout> | null = null;
	private stopped = true;
	private readyResolve: ((ready: boolean) => void) | null = null;
	private readyPromise: Promise<boolean> = Promise.resolve(false);
	private readonly unsubscribeProvider: () => void;

	constructor(private readonly options: TransportHostOptions) {
		this.unsubscribeProvider = subscribeProviderPeers(
			options.provider,
			this.sync,
		);
	}

	start(): void {
		if (!this.stopped) return;
		this.stopped = false;
		this.readyPromise = new Promise((resolve) => {
			this.readyResolve = resolve;
		});
		this.syncTimer = setInterval(this.sync, SYNC_INTERVAL_MS);
		this.sync();
	}

	whenReady(): Promise<boolean> {
		return this.readyPromise;
	}

	stop(): void {
		if (this.stopped) return;
		this.stopped = true;
		if (this.syncTimer) clearInterval(this.syncTimer);
		if (this.retryTimer) clearTimeout(this.retryTimer);
		this.syncTimer = null;
		this.retryTimer = null;
		this.releaseChannel(true);
		this.releasePeerListener();
		this.channelHandlers.clear();
		this.readyResolve?.(false);
		this.readyResolve = null;
		this.unsubscribeProvider();
	}

	onChannel(handler: (channel: HostTransport) => void): () => void {
		this.channelHandlers.add(handler);
		if (this.channel) handler(this.channel);
		return () => this.channelHandlers.delete(handler);
	}

	private readonly sync = (): void => {
		if (this.stopped || this.channel) return;
		const connection = findPeerConnection(
			this.options.provider,
			this.options.remoteTransportPeerId,
		);
		if (!connection) {
			if (!this.channel) this.releasePeerListener();
			return;
		}
		if (this.peer === connection.peer && this.unsubscribeChannel) return;

		this.releasePeerListener();
		const unsubscribe = subscribeChannel(
			connection.peer,
			this.options.channelLabel,
			(channel) => this.acceptChannel(connection.remotePeerId, channel),
		);
		if (!unsubscribe) {
			this.scheduleRetry();
			return;
		}

		this.peer = connection.peer;
		this.unsubscribeChannel = unsubscribe;
		this.readyResolve?.(true);
		this.readyResolve = null;
		moduleLog.info(
			`${this.options.label}: listening on awareness peer ${connection.remotePeerId}`,
		);
	};

	private acceptChannel(peerId: string, rawChannel: DataChannelLike): void {
		if (this.stopped) {
			try {
				rawChannel.close();
			} catch {
				// The host was stopped while the event was being delivered.
			}
			return;
		}
		if (this.channel) {
			if (this.channel.rawChannel !== rawChannel) {
				try {
					rawChannel.close();
				} catch {
					// Ignore a duplicate channel that already closed.
				}
			}
			return;
		}

		const channel = new HostedChannel(peerId, rawChannel, this.options.label);
		this.channel = channel;
		channel.onClose(() => {
			if (this.channel !== channel) return;
			this.releaseChannel(false);
			this.scheduleRetry();
		});
		for (const handler of Array.from(this.channelHandlers)) handler(channel);
		moduleLog.info(
			`${this.options.label}: accepted browser-negotiated channel from ${peerId}`,
		);
	}

	private scheduleRetry(): void {
		if (this.stopped || this.retryTimer) return;
		this.retryTimer = setTimeout(() => {
			this.retryTimer = null;
			this.sync();
		}, CHANNEL_RETRY_DELAY_MS);
	}

	private releaseChannel(close: boolean): void {
		const channel = this.channel;
		this.channel = null;
		if (close) channel?.close();
	}

	private releasePeerListener(): void {
		this.unsubscribeChannel?.();
		this.unsubscribeChannel = null;
		this.peer = null;
	}
}
