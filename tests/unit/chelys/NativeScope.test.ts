import type { Awareness } from 'y-protocols/awareness';

import {
    getNativeScopeControl,
    hasRemoteTexlyrePeer,
    peerKind,
    scopedPeerOptions,
} from '@chelys/peer/NativeScope';

const CONTROL_KEY = '__CHELYS_WEBRTC_SCOPE_CONTROL__';
const TAURI_KEY = '__TAURI_INTERNALS__';

const control = (overrides: Record<string, unknown> = {}): unknown => ({
    reset: () => Promise.resolve(),
    subscribe: () => () => undefined,
    getConnectedCount: () => 0,
    ...overrides,
});

const awarenessWith = (
    clientID: number,
    states: Array<[number, unknown]>,
): Awareness =>
    ({
        clientID,
        getStates: () => new Map(states),
    }) as unknown as Awareness;

const texlyrePeer = { accountPeer: { kind: 'texlyre' } };
const chelysPeer = { accountPeer: { kind: 'chelys' } };

describe('Native Scope', () => {
    afterEach(() => {
        delete (globalThis as Record<string, unknown>)[CONTROL_KEY];
        delete (window as unknown as Record<string, unknown>)[TAURI_KEY];
    });

    describe('peerKind', () => {
        it('should report texlyre in a plain browser', () => {
            expect(peerKind()).toBe('texlyre');
        });

        it('should report chelys inside the Tauri shell', () => {
            (window as unknown as Record<string, unknown>)[TAURI_KEY] = {};

            expect(peerKind()).toBe('chelys');
        });
    });

    describe('getNativeScopeControl', () => {
        it('should return the control when every method is present', () => {
            const candidate = control();
            (globalThis as Record<string, unknown>)[CONTROL_KEY] = candidate;

            expect(getNativeScopeControl()).toBe(candidate);
        });

        it('should reject a control missing reset', () => {
            (globalThis as Record<string, unknown>)[CONTROL_KEY] = control({
                reset: undefined,
            });

            expect(getNativeScopeControl()).toBeNull();
        });

        it('should reject a control missing subscribe', () => {
            (globalThis as Record<string, unknown>)[CONTROL_KEY] = control({
                subscribe: undefined,
            });

            expect(getNativeScopeControl()).toBeNull();
        });

        it('should reject a control missing getConnectedCount', () => {
            (globalThis as Record<string, unknown>)[CONTROL_KEY] = control({
                getConnectedCount: undefined,
            });

            expect(getNativeScopeControl()).toBeNull();
        });

        it('should reject a control whose members are not callable', () => {
            (globalThis as Record<string, unknown>)[CONTROL_KEY] = control({
                reset: 'reset',
            });

            expect(getNativeScopeControl()).toBeNull();
        });

        it('should return null when nothing is installed', () => {
            expect(getNativeScopeControl()).toBeNull();
        });

        it('should return null for a non object candidate', () => {
            (globalThis as Record<string, unknown>)[CONTROL_KEY] = 'control';

            expect(getNativeScopeControl()).toBeNull();
        });
    });

    describe('scopedPeerOptions', () => {
        it('should carry the runtime scope the native bridge reads', () => {
            expect(scopedPeerOptions('scope-1')).toEqual({
                config: { __chelysRuntimeScope: 'scope-1' },
            });
        });
    });

    describe('hasRemoteTexlyrePeer', () => {
        it('should find a remote TeXlyre peer', () => {
            const awareness = awarenessWith(1, [
                [1, chelysPeer],
                [2, texlyrePeer],
            ]);

            expect(hasRemoteTexlyrePeer(awareness)).toBe(true);
        });

        it('should ignore the local client even when it is TeXlyre', () => {
            const awareness = awarenessWith(1, [[1, texlyrePeer]]);

            expect(hasRemoteTexlyrePeer(awareness)).toBe(false);
        });

        it('should ignore remote Chelys peers', () => {
            const awareness = awarenessWith(1, [[2, chelysPeer]]);

            expect(hasRemoteTexlyrePeer(awareness)).toBe(false);
        });

        it('should tolerate states without a peer', () => {
            const awareness = awarenessWith(1, [
                [2, {}],
                [3, { accountPeer: null }],
                [4, texlyrePeer],
            ]);

            expect(hasRemoteTexlyrePeer(awareness)).toBe(true);
        });

        it('should report false for an empty room', () => {
            expect(hasRemoteTexlyrePeer(awarenessWith(1, []))).toBe(false);
        });
    });
});
