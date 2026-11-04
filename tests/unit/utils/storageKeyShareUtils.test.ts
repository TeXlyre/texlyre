import type {
	DataChannelLike,
	PeerConnectionLike,
	SimplePeer,
	WebrtcConn,
} from '../../../src/chelys/peer/TransportChannel';
import {
	hostStorageProjectKeySharing,
	requestStorageProjectKey,
} from '../../../src/utils/storageKeyShareUtils';

class LinkedDataChannel implements DataChannelLike {
	readyState: RTCDataChannelState = 'connecting';
	bufferedAmount = 0;
	binaryType: BinaryType = 'arraybuffer';
	bufferedAmountLowThreshold = 0;
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onopen: ((event?: unknown) => void) | null = null;
	onclose: ((event?: unknown) => void) | null = null;
	onerror: ((event?: unknown) => void) | null = null;
	onbufferedamountlow: ((event?: unknown) => void) | null = null;
	partner: LinkedDataChannel | null = null;

	constructor(readonly label: string) {}

	send(data: ArrayBuffer): void {
		const copy = data.slice(0);
		queueMicrotask(() => this.partner?.onmessage?.({ data: copy }));
	}

	close(): void {
		if (this.readyState === 'closed') return;
		this.readyState = 'closed';
		const partner = this.partner;
		queueMicrotask(() => this.onclose?.());
		if (partner && partner.readyState !== 'closed') {
			partner.readyState = 'closed';
			queueMicrotask(() => partner.onclose?.());
		}
	}
}

class LinkedPeerConnection implements PeerConnectionLike {
	ondatachannel: ((event: Event & { channel: DataChannelLike }) => void) | null =
		null;
	remote: LinkedPeerConnection | null = null;

	createDataChannel(label: string): DataChannelLike {
		if (!this.remote) throw new Error('Missing remote peer connection');
		const local = new LinkedDataChannel(label);
		const remote = new LinkedDataChannel(label);
		local.partner = remote;
		remote.partner = local;
		queueMicrotask(() => {
			this.remote?.ondatachannel?.({ channel: remote } as Event & {
				channel: DataChannelLike;
			});
			local.readyState = 'open';
			remote.readyState = 'open';
			local.onopen?.();
			remote.onopen?.();
		});
		return local;
	}
}

class TestPeer implements SimplePeer {
	connected = false;
	readonly _pc: LinkedPeerConnection;
	private readonly handlers = new Map<'connect' | 'close', Set<() => void>>();

	constructor(connection: LinkedPeerConnection) {
		this._pc = connection;
	}

	_needsNegotiation(): void {}

	on(event: 'connect' | 'close', handler: () => void): void {
		const handlers = this.handlers.get(event) ?? new Set();
		handlers.add(handler);
		this.handlers.set(event, handlers);
	}

	off(event: 'connect' | 'close', handler: () => void): void {
		this.handlers.get(event)?.delete(handler);
	}

	emit(event: 'connect' | 'close'): void {
		for (const handler of this.handlers.get(event) ?? []) handler();
	}
}

class TestProvider {
	readonly room = {
		peerId: '',
		webrtcConns: new Map<string, WebrtcConn>(),
	};
	private readonly handlers = new Map<'peers' | 'status', Set<() => void>>();

	constructor(peerId: string) {
		this.room.peerId = peerId;
	}

	on(event: 'peers' | 'status', handler: () => void): void {
		const handlers = this.handlers.get(event) ?? new Set();
		handlers.add(handler);
		this.handlers.set(event, handlers);
	}

	off(event: 'peers' | 'status', handler: () => void): void {
		this.handlers.get(event)?.delete(handler);
	}

	emit(event: 'peers' | 'status'): void {
		for (const handler of this.handlers.get(event) ?? []) handler();
	}
}

const providerPair = (connected = true) => {
	const leftPc = new LinkedPeerConnection();
	const rightPc = new LinkedPeerConnection();
	leftPc.remote = rightPc;
	rightPc.remote = leftPc;

	const leftPeer = new TestPeer(leftPc);
	const rightPeer = new TestPeer(rightPc);
	const left = new TestProvider('left');
	const right = new TestProvider('right');
	const leftConn: WebrtcConn = {
		peer: leftPeer,
		connected: false,
		remotePeerId: 'right',
	};
	const rightConn: WebrtcConn = {
		peer: rightPeer,
		connected: false,
		remotePeerId: 'left',
	};

	const attach = (): void => {
		left.room.webrtcConns.set('right', leftConn);
		right.room.webrtcConns.set('left', rightConn);
		left.emit('peers');
		right.emit('peers');
	};
	const connect = (): void => {
		leftConn.connected = true;
		rightConn.connected = true;
		leftPeer.connected = true;
		rightPeer.connected = true;
		leftPeer.emit('connect');
		rightPeer.emit('connect');
	};

	if (connected) {
		attach();
		connect();
	}

	return { left, right, attach, connect };
};

describe('storage project key sharing', () => {
	it('transfers only the requested project key over an existing WebRTC peer', async () => {
		const { left, right } = providerPair();
		const expected = new Uint8Array(32).map((_, index) => index + 1);
		const stop = hostStorageProjectKeySharing(
			right,
			'opaque-project-a',
			async () => expected,
		);

		await expect(
			requestStorageProjectKey(left, 'opaque-project-a', 1_000),
		).resolves.toEqual(expected);
		stop();
	});

	it('starts hosting when y-webrtc announces a peer before simple-peer connects', async () => {
		const { left, right, attach, connect } = providerPair(false);
		const expected = new Uint8Array(32).fill(7);
		const stop = hostStorageProjectKeySharing(
			right,
			'opaque-project-a',
			async () => expected,
		);

		attach();
		connect();

		await expect(
			requestStorageProjectKey(left, 'opaque-project-a', 1_000),
		).resolves.toEqual(expected);
		stop();
	});

	it('does not hand out a key when no peer is hosting that project attachment', async () => {
		const { left } = providerPair();
		await expect(
			requestStorageProjectKey(left, 'opaque-project-b', 50),
		).rejects.toThrow();
	});
});
