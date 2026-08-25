import {
    CHANNEL_PREFIX,
    acquireChannel,
    forgetChannel,
    subscribeChannel,
    type DataChannelLike,
    type PeerConnectionLike,
    type SimplePeer,
} from '@chelys/peer/TransportChannel';

class FakeDataChannel {
    readyState: RTCDataChannelState = 'connecting';
    bufferedAmount = 0;
    binaryType: BinaryType = 'blob';
    bufferedAmountLowThreshold = 0;
    closed = false;
    onmessage = null;
    onopen = null;
    onclose = null;
    onerror = null;
    onbufferedamountlow = null;

    constructor(readonly label: string) {}

    send(): void {}

    close(): void {
        this.closed = true;
        this.readyState = 'closed';
    }
}

class FakePeerConnection {
    ondatachannel: ((event: unknown) => void) | null = null;
    created: FakeDataChannel[] = [];

    createDataChannel(label: string): FakeDataChannel {
        const channel = new FakeDataChannel(label);
        this.created.push(channel);
        return channel;
    }
}

interface Harness {
    peer: SimplePeer;
    connection: FakePeerConnection;
    needsNegotiation: jest.Mock;
}

const harness = (options: { negotiable?: boolean } = {}): Harness => {
    const connection = new FakePeerConnection();
    const needsNegotiation = jest.fn();
    const peer = {
        connected: true,
        _pc: connection as unknown as PeerConnectionLike,
        ...(options.negotiable === false
            ? {}
            : { _needsNegotiation: needsNegotiation }),
    } as SimplePeer;
    return { peer, connection, needsNegotiation };
};

const deliver = (
    connection: FakePeerConnection,
    channel: DataChannelLike,
): void => {
    connection.ondatachannel?.({ channel } as unknown);
};

describe('Transport Channel', () => {
    describe('acquireChannel', () => {
        it('should create a prefixed ordered channel and renegotiate', () => {
            const { peer, connection, needsNegotiation } = harness();
            const acquired = acquireChannel(peer, 'lsp');

            expect(acquired).not.toBeNull();
            expect(acquired?.reused).toBe(false);
            expect(acquired?.channel.label).toBe(`${CHANNEL_PREFIX}:lsp`);
            expect(connection.created).toHaveLength(1);
            expect(needsNegotiation).toHaveBeenCalledTimes(1);
        });

        it('should reuse a channel that is still connecting', () => {
            const { peer, connection } = harness();
            const first = acquireChannel(peer, 'lsp');
            const second = acquireChannel(peer, 'lsp');

            expect(second?.reused).toBe(true);
            expect(second?.channel).toBe(first?.channel);
            expect(connection.created).toHaveLength(1);
        });

        it('should reuse an open channel', () => {
            const { peer, connection } = harness();
            const first = acquireChannel(peer, 'lsp');
            (first?.channel as FakeDataChannel).readyState = 'open';

            expect(acquireChannel(peer, 'lsp')?.reused).toBe(true);
            expect(connection.created).toHaveLength(1);
        });

        it('should refuse to hand out a channel that is closing', () => {
            const { peer, connection } = harness();
            const first = acquireChannel(peer, 'lsp');
            (first?.channel as FakeDataChannel).readyState = 'closing';

            expect(acquireChannel(peer, 'lsp')).toBeNull();
            expect(connection.created).toHaveLength(1);
        });

        it('should replace a closed channel', () => {
            const { peer, connection } = harness();
            const first = acquireChannel(peer, 'lsp');
            (first?.channel as FakeDataChannel).readyState = 'closed';
            const second = acquireChannel(peer, 'lsp');

            expect(second?.reused).toBe(false);
            expect(second?.channel).not.toBe(first?.channel);
            expect(connection.created).toHaveLength(2);
        });

        it('should keep separate channels per label', () => {
            const { peer, connection } = harness();
            const lsp = acquireChannel(peer, 'lsp');
            const typesetter = acquireChannel(peer, 'typesetter');

            expect(typesetter?.channel).not.toBe(lsp?.channel);
            expect(connection.created).toHaveLength(2);
        });

        it('should return null when the peer has no connection', () => {
            expect(acquireChannel({ connected: true } as SimplePeer, 'lsp')).toBeNull();
        });

        it('should roll back when the peer cannot renegotiate', () => {
            const { peer, connection } = harness({ negotiable: false });

            expect(() => acquireChannel(peer, 'lsp')).toThrow(
                'WebRTC peer does not support service-channel renegotiation',
            );
            expect(connection.created[0].closed).toBe(true);
        });

        it('should roll back when renegotiation throws', () => {
            const { peer, connection, needsNegotiation } = harness();
            needsNegotiation.mockImplementation(() => {
                throw new Error('negotiation failed');
            });

            expect(() => acquireChannel(peer, 'lsp')).toThrow(
                'negotiation failed',
            );
            expect(connection.created[0].closed).toBe(true);
        });

        it('should not leave a rolled back channel cached', () => {
            const { peer, connection, needsNegotiation } = harness();
            needsNegotiation.mockImplementationOnce(() => {
                throw new Error('negotiation failed');
            });

            expect(() => acquireChannel(peer, 'lsp')).toThrow();
            const retried = acquireChannel(peer, 'lsp');

            expect(retried?.reused).toBe(false);
            expect(connection.created).toHaveLength(2);
        });
    });

    describe('forgetChannel', () => {
        it('should allow a fresh channel after the previous one is forgotten', () => {
            const { peer, connection } = harness();
            const first = acquireChannel(peer, 'lsp');
            forgetChannel(peer, 'lsp', first!.channel);
            const second = acquireChannel(peer, 'lsp');

            expect(second?.reused).toBe(false);
            expect(connection.created).toHaveLength(2);
        });

        it('should ignore a channel that is no longer the cached one', () => {
            const { peer, connection } = harness();
            const first = acquireChannel(peer, 'lsp');
            forgetChannel(peer, 'lsp', new FakeDataChannel('stale'));

            expect(acquireChannel(peer, 'lsp')?.channel).toBe(first?.channel);
            expect(connection.created).toHaveLength(1);
        });

        it('should ignore a peer with no connection', () => {
            expect(() =>
                forgetChannel(
                    { connected: true } as SimplePeer,
                    'lsp',
                    new FakeDataChannel('x'),
                ),
            ).not.toThrow();
        });
    });

    describe('subscribeChannel', () => {
        it('should deliver an inbound channel to the matching label', () => {
            const { peer, connection } = harness();
            const handler = jest.fn();
            subscribeChannel(peer, 'lsp', handler);

            const inbound = new FakeDataChannel(`${CHANNEL_PREFIX}:lsp`);
            deliver(connection, inbound);

            expect(handler).toHaveBeenCalledWith(inbound);
            expect(inbound.closed).toBe(false);
        });

        it('should not deliver to a different label', () => {
            const { peer, connection } = harness();
            const handler = jest.fn();
            subscribeChannel(peer, 'lsp', handler);

            deliver(connection, new FakeDataChannel(`${CHANNEL_PREFIX}:typesetter`));

            expect(handler).not.toHaveBeenCalled();
        });

        it('should close a service channel that nobody claims', () => {
            const { peer, connection } = harness();
            subscribeChannel(peer, 'lsp', jest.fn());

            const orphan = new FakeDataChannel(`${CHANNEL_PREFIX}:typesetter`);
            deliver(connection, orphan);

            expect(orphan.closed).toBe(true);
        });

        it('should pass non service channels to the original handler', () => {
            const { peer, connection } = harness();
            const original = jest.fn();
            connection.ondatachannel = original;
            const handler = jest.fn();
            subscribeChannel(peer, 'lsp', handler);

            const collab = new FakeDataChannel('y-webrtc');
            deliver(connection, collab);

            expect(original).toHaveBeenCalledTimes(1);
            expect(handler).not.toHaveBeenCalled();
            expect(collab.closed).toBe(false);
        });

        it('should fan out to every subscriber of a label', () => {
            const { peer, connection } = harness();
            const first = jest.fn();
            const second = jest.fn();
            subscribeChannel(peer, 'lsp', first);
            subscribeChannel(peer, 'lsp', second);

            deliver(connection, new FakeDataChannel(`${CHANNEL_PREFIX}:lsp`));

            expect(first).toHaveBeenCalledTimes(1);
            expect(second).toHaveBeenCalledTimes(1);
        });

        it('should stop delivering once unsubscribed', () => {
            const { peer, connection } = harness();
            const handler = jest.fn();
            const unsubscribe = subscribeChannel(peer, 'lsp', handler);
            unsubscribe?.();

            const orphan = new FakeDataChannel(`${CHANNEL_PREFIX}:lsp`);
            deliver(connection, orphan);

            expect(handler).not.toHaveBeenCalled();
            expect(orphan.closed).toBe(true);
        });

        it('should return null when the peer has no connection', () => {
            expect(
                subscribeChannel({ connected: true } as SimplePeer, 'lsp', jest.fn()),
            ).toBeNull();
        });
    });
});
