import {
    HOSTS_AWARENESS_FIELD,
    HOST_PROBE_MESSAGE,
    HOST_READY_MESSAGE,
    SESSIONS_MAP_NAME,
    isSessionRequest,
    makeChannelLabel,
    makeHostKey,
    makeSessionId,
    makeSessionRoomId,
    readHostAdvertisements,
    readPeerState,
    type SessionRequest,
} from '@chelys/peer/SessionContract';

const request = (overrides: Partial<SessionRequest> = {}): unknown => ({
    id: 'room:lsp:instance',
    requestId: 'request-1',
    baseRoomId: 'room',
    label: 'lsp',
    channelLabel: 'lsp:request-1',
    sessionRoomId: 'room:service-peer:peer-1',
    requesterPeerId: 'peer-1',
    requesterInstanceId: 'instance',
    requesterTransportPeerId: 'transport-1',
    requesterSessionTransportPeerId: 'session-transport-1',
    targetHostPeerId: 'host-1',
    targetHostInstanceId: 'host-instance',
    targetHostTransportPeerId: 'host-transport',
    status: 'requested',
    createdAt: 1,
    ...overrides,
});

const peerState = (peer: unknown): unknown => ({ accountPeer: peer });

describe('Session Contract', () => {
    describe('wire constants', () => {
        it('should keep the identifiers Chelys and TeXlyre agree on', () => {
            expect(SESSIONS_MAP_NAME).toBe('chelys_service_sessions');
            expect(HOSTS_AWARENESS_FIELD).toBe('chelysServiceHosts');
            expect(HOST_PROBE_MESSAGE).toBe(
                '\u0000texlyre-service-host-probe-v1',
            );
            expect(HOST_READY_MESSAGE).toBe(
                '\u0000texlyre-service-host-ready-v1',
            );
        });
    });

    describe('key builders', () => {
        it('should separate room and label with a character neither contains', () => {
            expect(makeHostKey('room', 'lsp')).toBe('room\nlsp');
            expect(makeHostKey('room', 'a:b')).not.toBe(
                makeHostKey('room:a', 'b'),
            );
        });

        it('should scope a session id to room, label and instance', () => {
            expect(makeSessionId('room', 'lsp', 'instance')).toBe(
                'room:lsp:instance',
            );
        });

        it('should build a channel label from label and request id', () => {
            expect(makeChannelLabel('lsp', 'request-1')).toBe('lsp:request-1');
        });

        it('should give each requester one service room', () => {
            expect(makeSessionRoomId('control', 'peer-1')).toBe(
                'control:service-peer:peer-1',
            );
            expect(makeSessionRoomId('control', 'peer-2')).not.toBe(
                makeSessionRoomId('control', 'peer-1'),
            );
        });
    });

    describe('isSessionRequest', () => {
        it('should accept a well formed requested entry', () => {
            expect(isSessionRequest(request())).toBe(true);
        });

        it('should accept a ready entry carrying the host session peer', () => {
            expect(
                isSessionRequest(
                    request({
                        status: 'ready',
                        targetHostSessionTransportPeerId: 'host-session',
                    }),
                ),
            ).toBe(true);
        });

        it('should reject a ready entry without the host session peer', () => {
            expect(isSessionRequest(request({ status: 'ready' }))).toBe(false);
        });

        it('should accept an error entry without the host session peer', () => {
            expect(isSessionRequest(request({ status: 'error' }))).toBe(true);
        });

        it('should reject an unknown status', () => {
            expect(isSessionRequest(request({ status: 'pending' as never }))).toBe(
                false,
            );
        });

        it('should reject a non numeric createdAt', () => {
            expect(
                isSessionRequest(request({ createdAt: '1' as never })),
            ).toBe(false);
        });

        it('should reject an entry missing the requester session peer', () => {
            const value = request() as Record<string, unknown>;
            delete value.requesterSessionTransportPeerId;

            expect(isSessionRequest(value)).toBe(false);
        });

        it('should reject non objects', () => {
            expect(isSessionRequest(null)).toBe(false);
            expect(isSessionRequest(undefined)).toBe(false);
            expect(isSessionRequest('request')).toBe(false);
        });
    });

    describe('readPeerState', () => {
        it('should read a fully populated peer', () => {
            const peer = {
                id: 'peer-1',
                instanceId: 'instance',
                transportPeerId: 'transport-1',
                kind: 'texlyre',
                userId: 'user',
                username: 'alice',
            };

            expect(readPeerState(peerState(peer))).toEqual(peer);
        });

        it('should accept a peer that has not yet published a transport id', () => {
            const peer = {
                id: 'peer-1',
                instanceId: 'instance',
                kind: 'chelys',
                userId: 'user',
                username: 'chelys',
            };

            expect(readPeerState(peerState(peer))).toEqual(peer);
        });

        it('should reject a peer with an unknown kind', () => {
            expect(
                readPeerState(
                    peerState({ id: 'a', instanceId: 'b', kind: 'other' }),
                ),
            ).toBeNull();
        });

        it('should reject a peer missing its identifiers', () => {
            expect(readPeerState(peerState({ kind: 'texlyre' }))).toBeNull();
            expect(
                readPeerState(peerState({ id: 'a', kind: 'texlyre' })),
            ).toBeNull();
        });

        it('should return null when the awareness state carries no peer', () => {
            expect(readPeerState(null)).toBeNull();
            expect(readPeerState({})).toBeNull();
            expect(readPeerState({ accountPeer: 'peer' })).toBeNull();
        });
    });

    describe('readHostAdvertisements', () => {
        it('should read the advertisement map from an awareness state', () => {
            const hosts = { 'room\nlsp': { id: 'advert' } };

            expect(
                readHostAdvertisements({ [HOSTS_AWARENESS_FIELD]: hosts }),
            ).toBe(hosts);
        });

        it('should fall back to an empty map', () => {
            expect(readHostAdvertisements(null)).toEqual({});
            expect(readHostAdvertisements({})).toEqual({});
            expect(
                readHostAdvertisements({ [HOSTS_AWARENESS_FIELD]: 'hosts' }),
            ).toEqual({});
        });
    });
});
