import type {
	DataChannelLike,
	PeerConnectionLike,
	SimplePeer,
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

const providerPair = () => {
	const leftPc = new LinkedPeerConnection();
	const rightPc = new LinkedPeerConnection();
	leftPc.remote = rightPc;
	rightPc.remote = leftPc;

	const leftPeer: SimplePeer = {
		connected: true,
		_pc: leftPc,
		_needsNegotiation() {},
	};
	const rightPeer: SimplePeer = {
		connected: true,
		_pc: rightPc,
		_needsNegotiation() {},
	};

	return {
		left: {
			room: {
				peerId: 'left',
				webrtcConns: new Map([
					[
						'right',
						{ peer: leftPeer, connected: true, remotePeerId: 'right' },
					],
				]),
			},
		},
		right: {
			room: {
				peerId: 'right',
				webrtcConns: new Map([
					[
						'left',
						{ peer: rightPeer, connected: true, remotePeerId: 'left' },
					],
				]),
			},
		},
	};
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

	it('does not hand out a key when no peer is hosting that project attachment', async () => {
		const { left } = providerPair();
		await expect(
			requestStorageProjectKey(left, 'opaque-project-b', 50),
		).rejects.toThrow();
	});
});
