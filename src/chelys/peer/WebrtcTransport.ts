// src/chelys/peer/WebrtcTransport.ts
import { createNamedLogger } from '@/logging';
import type {
	ClientTransport,
	ControlMode,
	TransportPayload,
} from '../types/transport';
import {
	acquireChannel,
	findPeerConnection,
	forgetChannel,
	subscribeProviderPeers,
	type DataChannelLike,
	type SimplePeer,
} from './TransportChannel';
import { HOST_PROBE_MESSAGE, HOST_READY_MESSAGE } from './SessionContract';
import { openSession, type SessionLease } from './SessionClient';
import { FrameReassembler, encodeFrames } from './TransportFraming';

const moduleLog = createNamedLogger('WebrtcTransport');

const BUFFER_HIGH_WATER = 1024 * 1024;
const BUFFER_LOW_WATER = 256 * 1024;
const SYNC_INTERVAL_MS = 100;
const CHANNEL_CONNECT_TIMEOUT_MS = 20_000;
const CHANNEL_RETRY_DELAY_MS = 500;
const HOST_PROBE_INTERVAL_MS = 250;
const IDLE_RETIRE_MS = 60_000;

export interface WebrtcTransportOptions {
	baseRoomId: string;
	controlRoomId: string;
	controlMode: ControlMode;
	signaling: string[];
	label: string;
	timeoutMs?: number;
}

interface ActiveChannel {
	peer: SimplePeer;
	channel: DataChannelLike;
	reassembler: FrameReassembler;
	ready: boolean;
	connectTimer: ReturnType<typeof setTimeout> | null;
	probeTimer: ReturnType<typeof setInterval> | null;
}

const reusableTransports = new Map<string, AwarenessTransport>();

const transportKeyFor = (options: WebrtcTransportOptions): string =>
	[
		options.controlMode,
		options.controlRoomId,
		options.baseRoomId,
		options.label,
		...[...options.signaling].sort(),
	].join('\n');

const toError = (error: unknown): Error =>
	error instanceof Error ? error : new Error(String(error));

class AwarenessTransport implements ClientTransport {
	private readonly messageHandlers = new Set<
		(payload: TransportPayload) => void
	>();
	private readonly closeHandlers = new Set<() => void>();
	private readonly errorHandlers = new Set<(error: Error) => void>();
	private readonly openHandlers = new Set<() => void>();
	private readonly queue: ArrayBuffer[] = [];

	private active: ActiveChannel | null = null;
	private syncTimer: ReturnType<typeof setInterval> | null = null;
	private retryTimer: ReturnType<typeof setTimeout> | null = null;
	private idleTimer: ReturnType<typeof setTimeout> | null = null;
	private released = false;
	private retired = false;
	private opened = false;
	private readonly unsubscribeProvider: () => void;
	private readonly unsubscribeAwareness: () => void;
	private readonly unsubscribeInvalid: () => void;

	constructor(
		private readonly lease: SessionLease,
		private readonly label: string,
		private readonly poolKey: string,
	) {
		this.unsubscribeProvider = subscribeProviderPeers(
			lease.connection.provider,
			this.sync,
		);
		lease.connection.awareness.on('change', this.sync);
		this.unsubscribeAwareness = () =>
			lease.connection.awareness.off('change', this.sync);
		this.unsubscribeInvalid = lease.onInvalid((error) => {
			this.notifyError(error);
			this.retire();
		});
		this.syncTimer = setInterval(this.sync, SYNC_INTERVAL_MS);
		this.sync();
	}

	get isOpen(): boolean {
		return (
			!this.released &&
			!this.retired &&
			this.active?.ready === true &&
			this.active.channel.readyState === 'open'
		);
	}

	get canReuse(): boolean {
		return !this.retired;
	}

	reuse(): void {
		if (this.retired) {
			throw new Error(`Transport is no longer reusable: ${this.label}`);
		}
		this.clearIdleTimer();
		this.clearConsumerState();
		this.released = false;
		this.opened = this.active?.ready === true;
		this.sync();
	}

	send(payload: TransportPayload): void {
		if (this.released || this.retired) return;
		for (const frame of encodeFrames(payload)) this.queue.push(frame);
		this.flush();
	}

	close(): void {
		if (this.released || this.retired) return;
		this.released = true;
		this.queue.length = 0;
		this.dropActive(true);
		this.notify(this.closeHandlers);
		this.clearConsumerState();
		this.idleTimer = setTimeout(() => this.retire(), IDLE_RETIRE_MS);
	}

	abort(): void {
		this.retire();
	}

	onMessage(handler: (payload: TransportPayload) => void): () => void {
		this.messageHandlers.add(handler);
		return () => this.messageHandlers.delete(handler);
	}

	onClose(handler: () => void): () => void {
		if (this.released || this.retired) {
			queueMicrotask(handler);
			return () => undefined;
		}
		this.closeHandlers.add(handler);
		return () => this.closeHandlers.delete(handler);
	}

	onError(handler: (error: Error) => void): () => void {
		this.errorHandlers.add(handler);
		return () => this.errorHandlers.delete(handler);
	}

	onOpen(handler: () => void): () => void {
		if (this.isOpen) {
			queueMicrotask(handler);
			return () => undefined;
		}
		this.openHandlers.add(handler);
		return () => this.openHandlers.delete(handler);
	}

	private readonly sync = (): void => {
		if (this.retired || this.released || this.active) return;
		const connection = findPeerConnection(
			this.lease.connection.provider,
			this.lease.remoteTransportPeerId,
		);
		if (!connection) return;

		try {
			const acquired = acquireChannel(connection.peer, this.lease.channelLabel);
			if (!acquired) {
				this.scheduleRetry();
				return;
			}
			const active: ActiveChannel = {
				peer: connection.peer,
				channel: acquired.channel,
				reassembler: new FrameReassembler({
					onError: (error) => this.handleChannelError(active, error),
				}),
				ready: false,
				connectTimer: null,
				probeTimer: null,
			};
			this.active = active;
			this.attach(active);
			this.armConnectTimeout(active);
		} catch (error) {
			moduleLog.warn(`${this.label}: could not create service channel`, error);
			this.scheduleRetry();
		}
	};

	private attach(active: ActiveChannel): void {
		const { channel } = active;
		channel.binaryType = 'arraybuffer';
		channel.bufferedAmountLowThreshold = BUFFER_LOW_WATER;
		channel.onopen = () => this.handleOpen(active);
		channel.onmessage = (event) => {
			const payload = active.reassembler.push(event.data as ArrayBuffer);
			if (payload !== null) this.receive(active, payload);
		};
		channel.onclose = () => this.handleClose(active);
		channel.onerror = (event) => {
			const detail = (event as { error?: unknown } | undefined)?.error;
			this.handleChannelError(
				active,
				detail instanceof Error
					? detail
					: new Error(`WebRTC channel error for ${this.label}`),
			);
		};
		channel.onbufferedamountlow = () => {
			if (this.active === active) this.flush();
		};
		if (channel.readyState === 'open') {
			queueMicrotask(() => this.handleOpen(active));
		}
	}

	private handleOpen(active: ActiveChannel): void {
		if (this.retired || this.active !== active || active.ready) return;
		moduleLog.info(
			`${this.label}: channel open on the existing awareness peer; awaiting host readiness`,
		);
		this.sendProbe(active);
		active.probeTimer = setInterval(
			() => this.sendProbe(active),
			HOST_PROBE_INTERVAL_MS,
		);
	}

	private sendProbe(active: ActiveChannel): void {
		if (
			this.active !== active ||
			active.ready ||
			active.channel.readyState !== 'open'
		) {
			return;
		}
		try {
			for (const frame of encodeFrames(HOST_PROBE_MESSAGE)) {
				active.channel.send(frame);
			}
		} catch (error) {
			this.handleChannelError(active, toError(error));
		}
	}

	private receive(active: ActiveChannel, payload: TransportPayload): void {
		if (this.active !== active) return;
		if (payload === HOST_READY_MESSAGE) {
			this.markReady(active);
			return;
		}
		if (!active.ready) return;
		for (const handler of Array.from(this.messageHandlers)) handler(payload);
	}

	private markReady(active: ActiveChannel): void {
		if (this.active !== active || active.ready) return;
		active.ready = true;
		this.opened = true;
		this.clearChannelTimers(active);
		moduleLog.info(
			`${this.label}: registered service host on the awareness connection`,
		);
		this.notify(this.openHandlers);
		this.openHandlers.clear();
		this.flush();
	}

	private handleClose(active: ActiveChannel): void {
		if (this.active !== active) return;
		const wasOpen = active.ready || this.opened;
		this.dropActive(false);
		if (this.retired || this.released) return;
		if (wasOpen) {
			this.released = true;
			this.notify(this.closeHandlers);
			this.clearConsumerState();
			this.idleTimer = setTimeout(() => this.retire(), IDLE_RETIRE_MS);
		} else {
			this.scheduleRetry();
		}
	}

	private handleChannelError(active: ActiveChannel, error: Error): void {
		if (this.active !== active) return;
		const wasOpen = active.ready || this.opened;
		this.dropActive(true);
		if (wasOpen) this.notifyError(error);
		if (!this.released && !this.retired) this.scheduleRetry();
	}

	private armConnectTimeout(active: ActiveChannel): void {
		this.clearChannelTimers(active);
		active.connectTimer = setTimeout(() => {
			if (this.active !== active || active.ready) return;
			moduleLog.warn(
				`${this.label}: host did not answer on the existing awareness peer; retrying the channel`,
			);
			this.dropActive(true);
			this.scheduleRetry();
		}, CHANNEL_CONNECT_TIMEOUT_MS);
	}

	private scheduleRetry(): void {
		if (this.retryTimer || this.released || this.retired) return;
		this.retryTimer = setTimeout(() => {
			this.retryTimer = null;
			this.sync();
		}, CHANNEL_RETRY_DELAY_MS);
	}

	private flush(): void {
		const active = this.active;
		if (
			!active?.ready ||
			active.channel.readyState !== 'open' ||
			this.released ||
			this.retired
		) {
			return;
		}
		while (this.queue.length > 0) {
			if (active.channel.bufferedAmount > BUFFER_HIGH_WATER) return;
			const frame = this.queue.shift();
			if (!frame) return;
			try {
				active.channel.send(frame);
			} catch (error) {
				this.queue.unshift(frame);
				this.handleChannelError(active, toError(error));
				return;
			}
		}
	}

	private dropActive(closeChannel: boolean): void {
		const active = this.active;
		if (!active) return;
		this.active = null;
		this.opened = false;
		active.reassembler.reset();
		this.clearChannelTimers(active);
		active.channel.onopen = null;
		active.channel.onmessage = null;
		active.channel.onclose = null;
		active.channel.onerror = null;
		active.channel.onbufferedamountlow = null;
		forgetChannel(active.peer, this.lease.channelLabel, active.channel);
		if (closeChannel) {
			try {
				active.channel.close();
			} catch {
				// The channel is already closed.
			}
		}
	}

	private clearChannelTimers(active: ActiveChannel): void {
		if (active.connectTimer) clearTimeout(active.connectTimer);
		if (active.probeTimer) clearInterval(active.probeTimer);
		active.connectTimer = null;
		active.probeTimer = null;
	}

	private clearConsumerState(): void {
		this.messageHandlers.clear();
		this.closeHandlers.clear();
		this.errorHandlers.clear();
		this.openHandlers.clear();
		this.queue.length = 0;
	}

	private clearIdleTimer(): void {
		if (this.idleTimer) clearTimeout(this.idleTimer);
		this.idleTimer = null;
	}

	private notify(handlers: Set<() => void>): void {
		for (const handler of Array.from(handlers)) handler();
	}

	private notifyError(error: Error): void {
		for (const handler of Array.from(this.errorHandlers)) handler(error);
	}

	private retire(): void {
		if (this.retired) return;
		this.retired = true;
		this.released = true;
		if (this.syncTimer) clearInterval(this.syncTimer);
		if (this.retryTimer) clearTimeout(this.retryTimer);
		this.syncTimer = null;
		this.retryTimer = null;
		this.clearIdleTimer();
		this.dropActive(true);
		this.unsubscribeProvider();
		this.unsubscribeAwareness();
		this.unsubscribeInvalid();
		this.lease.release();
		this.clearConsumerState();
		if (reusableTransports.get(this.poolKey) === this) {
			reusableTransports.delete(this.poolKey);
		}
	}
}

function waitForOpen(
	transport: AwarenessTransport,
	label: string,
	timeoutMs: number,
): Promise<ClientTransport> {
	if (transport.isOpen) return Promise.resolve(transport);

	return new Promise((resolve, reject) => {
		let settled = false;
		const finish = (error?: Error): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			removeOpen();
			removeError();
			if (error) reject(error);
			else resolve(transport);
		};
		const removeOpen = transport.onOpen(() => finish());
		const removeError = transport.onError((error) => finish(error));
		const timer = setTimeout(() => {
			transport.close();
			finish(new Error(`Timed out connecting to ${label}`));
		}, timeoutMs);
	});
}

export async function openWebrtcTransport(
	options: WebrtcTransportOptions,
): Promise<ClientTransport> {
	const timeoutMs = options.timeoutMs ?? 45_000;
	const poolKey = transportKeyFor(options);
	const existing = reusableTransports.get(poolKey);
	if (existing?.canReuse) {
		existing.reuse();
		moduleLog.info(`${options.label}: reusing awareness-backed transport`);
		return waitForOpen(existing, options.label, timeoutMs);
	}
	if (existing) reusableTransports.delete(poolKey);

	const lease = await openSession({
		baseRoomId: options.baseRoomId,
		controlRoomId: options.controlRoomId,
		controlMode: options.controlMode,
		signaling: options.signaling,
		label: options.label,
		timeoutMs: Math.min(timeoutMs, 30_000),
	});
	const transport = new AwarenessTransport(lease, options.label, poolKey);
	reusableTransports.set(poolKey, transport);
	moduleLog.info(
		`${options.label}: opening on existing awareness peer ${lease.remoteTransportPeerId}`,
	);
	return waitForOpen(transport, options.label, timeoutMs);
}
