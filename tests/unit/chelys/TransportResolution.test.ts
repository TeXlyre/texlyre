import {
    type AccountControlRoomProvider,
    getAccountControlConnection,
    getAccountControlRoomId,
    getAccountControlUser,
    setAccountControlRoomProvider,
    whenAccountControlConnected,
} from '@chelys/peer/AccountControlRoom';
import {
    readSignalingServers,
    resolveTransportConfig,
} from '@chelys/peer/TransportResolution';
import type { ControlConnection } from '@chelys/peer/SessionContract';
import type { TransportConfig } from '@chelys/types/transport';

const provider = (
    overrides: Partial<AccountControlRoomProvider> = {},
): AccountControlRoomProvider => ({
    getRoomId: () => null,
    getConnection: () => null,
    whenConnected: () => Promise.reject(new Error('not connected')),
    ...overrides,
});

const connectionWithUser = (user: unknown): ControlConnection =>
    ({
        awareness: { getLocalState: () => ({ user }) },
    }) as unknown as ControlConnection;

const writeSettings = (key: string, value: unknown): void => {
    localStorage.setItem(key, JSON.stringify(value));
};

describe('Transport Resolution', () => {
    beforeEach(() => {
        localStorage.clear();
        setAccountControlRoomProvider(null);
    });

    afterEach(() => {
        setAccountControlRoomProvider(null);
    });

    describe('AccountControlRoom registry', () => {
        it('should behave as signed out when no provider is registered', () => {
            expect(getAccountControlRoomId()).toBeNull();
            expect(getAccountControlConnection()).toBeNull();
            expect(getAccountControlUser()).toBeUndefined();
        });

        it('should reject rather than hang when no provider is registered', async () => {
            await expect(whenAccountControlConnected()).rejects.toThrow(
                'No Chelys account control room is registered',
            );
        });

        it('should read through to the registered provider', () => {
            setAccountControlRoomProvider(
                provider({ getRoomId: () => 'account-room' }),
            );

            expect(getAccountControlRoomId()).toBe('account-room');
        });

        it('should stop reading through once the provider is cleared', () => {
            setAccountControlRoomProvider(
                provider({ getRoomId: () => 'account-room' }),
            );
            setAccountControlRoomProvider(null);

            expect(getAccountControlRoomId()).toBeNull();
        });

        it('should project only the presence fields onto the rendezvous user', () => {
            setAccountControlRoomProvider(
                provider({
                    getConnection: () =>
                        connectionWithUser({
                            id: 'user-1',
                            username: 'alice',
                            name: 'Alice',
                            color: '#fff',
                            colorLight: '#eee',
                            secret: 'should not travel',
                        }),
                }),
            );

            expect(getAccountControlUser()).toEqual({
                id: 'user-1',
                username: 'alice',
                name: 'Alice',
                color: '#fff',
                colorLight: '#eee',
            });
        });

        it('should return no user when presence carries no username', () => {
            setAccountControlRoomProvider(
                provider({
                    getConnection: () => connectionWithUser({ id: 'user-1' }),
                }),
            );

            expect(getAccountControlUser()).toBeUndefined();
        });
    });

    describe('readSignalingServers', () => {
        it('should read the settings of the named user', () => {
            writeSettings('texlyre-user-alice-settings', {
                'collab-signaling-servers': 'wss://a, wss://b',
            });

            expect(readSignalingServers('alice')).toEqual([
                'wss://a',
                'wss://b',
            ]);
        });

        it('should fall back to the signed in user when none is named', () => {
            localStorage.setItem('texlyre-current-user', 'alice');
            writeSettings('texlyre-user-alice-settings', {
                'collab-signaling-servers': 'wss://a',
            });

            expect(readSignalingServers()).toEqual(['wss://a']);
        });

        it('should read global settings when nobody is signed in', () => {
            writeSettings('texlyre-settings', {
                'collab-signaling-servers': 'wss://global',
            });

            expect(readSignalingServers()).toEqual(['wss://global']);
        });

        it('should drop blank entries', () => {
            writeSettings('texlyre-user-alice-settings', {
                'collab-signaling-servers': 'wss://a, ,, wss://b ,',
            });

            expect(readSignalingServers('alice')).toEqual([
                'wss://a',
                'wss://b',
            ]);
        });

        it('should return nothing when the setting is absent or not a string', () => {
            writeSettings('texlyre-user-alice-settings', {
                'collab-signaling-servers': ['wss://a'],
            });

            expect(readSignalingServers('alice')).toEqual([]);
            expect(readSignalingServers('bob')).toEqual([]);
        });

        it('should survive corrupted settings', () => {
            localStorage.setItem('texlyre-user-alice-settings', '{not json');

            expect(readSignalingServers('alice')).toEqual([]);
        });
    });

    describe('resolveTransportConfig', () => {
        it('should pass non webrtc transports through untouched', async () => {
            const config: TransportConfig = {
                type: 'websocket',
                url: 'wss://service',
            };

            await expect(resolveTransportConfig('svc', config)).resolves.toBe(
                config,
            );
        });

        it('should treat an explicit room as a dedicated control room', async () => {
            const result = await resolveTransportConfig('svc', {
                type: 'webrtc',
                roomId: 'override',
                signaling: ['wss://a'],
            });

            expect(result).toMatchObject({
                roomId: 'override',
                controlRoomId: 'override',
                controlMode: 'dedicated',
                signaling: ['wss://a'],
            });
        });

        it('should not consult the account room when a room is overridden', async () => {
            const getRoomId = jest.fn(() => 'account-room');
            setAccountControlRoomProvider(provider({ getRoomId }));

            const result = await resolveTransportConfig('svc', {
                type: 'webrtc',
                roomId: 'override',
                signaling: ['wss://a'],
            });

            expect(result.controlRoomId).toBe('override');
            expect(getRoomId).not.toHaveBeenCalled();
        });

        it('should namespace the service room under the account room', async () => {
            setAccountControlRoomProvider(
                provider({ getRoomId: () => 'account-room' }),
            );

            const result = await resolveTransportConfig('typesetter', {
                type: 'webrtc',
                signaling: ['wss://a'],
            });

            expect(result).toMatchObject({
                roomId: 'account-room:typesetter',
                controlRoomId: 'account-room',
                controlMode: 'account',
            });
        });

        it('should ignore a blank room override', async () => {
            setAccountControlRoomProvider(
                provider({ getRoomId: () => 'account-room' }),
            );

            const result = await resolveTransportConfig('svc', {
                type: 'webrtc',
                roomId: '   ',
                signaling: ['wss://a'],
            });

            expect(result.controlMode).toBe('account');
            expect(result.controlRoomId).toBe('account-room');
        });

        it('should resolve without a room when nobody is signed in', async () => {
            const result = await resolveTransportConfig(
                'svc',
                { type: 'webrtc', signaling: ['wss://a'] },
                0,
            );

            expect(result.roomId).toBeUndefined();
            expect(result.controlRoomId).toBeUndefined();
            expect(result.controlMode).toBe('account');
        });

        it('should read signaling from settings when the config omits it', async () => {
            localStorage.setItem('texlyre-current-user', 'alice');
            writeSettings('texlyre-user-alice-settings', {
                'collab-signaling-servers': 'wss://from-settings',
            });

            const result = await resolveTransportConfig('svc', {
                type: 'webrtc',
                roomId: 'override',
            });

            expect(result.signaling).toEqual(['wss://from-settings']);
        });

        it('should prefer signaling supplied by the config', async () => {
            localStorage.setItem('texlyre-current-user', 'alice');
            writeSettings('texlyre-user-alice-settings', {
                'collab-signaling-servers': 'wss://from-settings',
            });

            const result = await resolveTransportConfig('svc', {
                type: 'webrtc',
                roomId: 'override',
                signaling: ['wss://explicit'],
            });

            expect(result.signaling).toEqual(['wss://explicit']);
        });
    });

    describe('resolveTransportConfig account room timeout', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should give up on the account room once the deadline passes', async () => {
            setAccountControlRoomProvider(provider({ getRoomId: () => null }));

            const pending = resolveTransportConfig(
                'svc',
                { type: 'webrtc', signaling: ['wss://a'] },
                1000,
            );
            await jest.advanceTimersByTimeAsync(1500);

            await expect(pending).resolves.toMatchObject({
                roomId: undefined,
                controlRoomId: undefined,
                controlMode: 'account',
            });
        });

        it('should pick the account room up as soon as it appears', async () => {
            let roomId: string | null = null;
            setAccountControlRoomProvider(provider({ getRoomId: () => roomId }));

            const pending = resolveTransportConfig(
                'svc',
                { type: 'webrtc', signaling: ['wss://a'] },
                5000,
            );
            await jest.advanceTimersByTimeAsync(300);
            roomId = 'late-room';
            await jest.advanceTimersByTimeAsync(300);

            await expect(pending).resolves.toMatchObject({
                roomId: 'late-room:svc',
                controlRoomId: 'late-room',
            });
        });
    });
});
