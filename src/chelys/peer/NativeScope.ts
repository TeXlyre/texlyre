// src/chelys/peer/NativeScope.ts
import type { Awareness } from 'y-protocols/awareness';

import type { PeerState } from './SessionContract';

const NATIVE_SCOPE_CONTROL_KEY = '__CHELYS_WEBRTC_SCOPE_CONTROL__';
const NATIVE_SCOPE_CONFIG_KEY = '__chelysRuntimeScope';

export interface NativeScopeControl {
	reset(scopeId: string): Promise<void>;
	subscribe(
		scopeId: string,
		listener: (connectedPeers: number) => void,
	): () => void;
	getConnectedCount(scopeId: string): number;
}

export const peerKind = (): 'texlyre' | 'chelys' =>
	typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
		? 'chelys'
		: 'texlyre';

export const getNativeScopeControl = (): NativeScopeControl | null => {
	const candidate = (globalThis as Record<string, unknown>)[
		NATIVE_SCOPE_CONTROL_KEY
	];
	if (!candidate || typeof candidate !== 'object') return null;
	const control = candidate as Partial<NativeScopeControl>;
	return typeof control.reset === 'function' &&
		typeof control.subscribe === 'function' &&
		typeof control.getConnectedCount === 'function'
		? (control as NativeScopeControl)
		: null;
};

export const scopedPeerOptions = (
	scopeId: string,
): Record<string, unknown> => ({
	config: {
		[NATIVE_SCOPE_CONFIG_KEY]: scopeId,
	},
});

export const hasRemoteTexlyrePeer = (awareness: Awareness): boolean => {
	for (const [clientId, state] of awareness.getStates()) {
		if (clientId === awareness.clientID) continue;
		const peer = (state as { accountPeer?: Partial<PeerState> }).accountPeer;
		if (peer?.kind === 'texlyre') return true;
	}
	return false;
};
