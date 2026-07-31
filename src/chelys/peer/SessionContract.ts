// src/chelys/peer/SessionContract.ts
import type { Awareness } from 'y-protocols/awareness';
import type { WebrtcProvider } from 'y-webrtc';
import type * as Y from 'yjs';

export const SESSIONS_MAP_NAME = 'chelys_service_sessions';
export const HOSTS_AWARENESS_FIELD = 'chelysServiceHosts';
export const HOST_PROBE_MESSAGE = '\u0000texlyre-service-host-probe-v1';
export const HOST_READY_MESSAGE = '\u0000texlyre-service-host-ready-v1';

export type SessionStatus = 'requested' | 'ready' | 'error';

export interface PeerState {
	id: string;
	instanceId: string;
	transportPeerId?: string;
	kind: 'texlyre' | 'chelys';
	userId: string;
	username: string;
}

export interface ControlConnection {
	roomId: string;
	doc: Y.Doc;
	provider: WebrtcProvider;
	awareness: Awareness;
	peer: PeerState;
	ready: Promise<void>;
}

export interface HostAdvertisement {
	id: string;
	baseRoomId: string;
	label: string;
	status: 'ready';
	hostPeerId: string;
	hostInstanceId: string;
	hostTransportPeerId: string;
}

export interface SessionRequest {
	id: string;
	requestId: string;
	baseRoomId: string;
	label: string;
	channelLabel: string;
	sessionRoomId: string;
	requesterPeerId: string;
	requesterInstanceId: string;
	requesterTransportPeerId: string;
	requesterSessionTransportPeerId: string;
	targetHostPeerId: string;
	targetHostInstanceId: string;
	targetHostTransportPeerId: string;
	targetHostSessionTransportPeerId?: string;
	status: SessionStatus;
	createdAt: number;
	error?: string;
}

export const makeHostKey = (baseRoomId: string, label: string): string =>
	`${baseRoomId}\n${label}`;

export const makeSessionId = (
	baseRoomId: string,
	label: string,
	instanceId: string,
): string => `${baseRoomId}:${label}:${instanceId}`;

export const makeChannelLabel = (label: string, requestId: string): string =>
	`${label}:${requestId}`;

/**
 * Gives each ephemeral TeXlyre peer one direct service room. All typesetter and
 * LSP channels for that peer are multiplexed over the room's peer connection.
 */
export const makeSessionRoomId = (
	controlRoomId: string,
	requesterPeerId: string,
): string => `${controlRoomId}:service-peer:${requesterPeerId}`;

export const isSessionRequest = (value: unknown): value is SessionRequest => {
	if (!value || typeof value !== 'object') return false;
	const request = value as Partial<SessionRequest>;
	return (
		typeof request.id === 'string' &&
		typeof request.requestId === 'string' &&
		typeof request.baseRoomId === 'string' &&
		typeof request.label === 'string' &&
		typeof request.channelLabel === 'string' &&
		typeof request.sessionRoomId === 'string' &&
		typeof request.requesterPeerId === 'string' &&
		typeof request.requesterInstanceId === 'string' &&
		typeof request.requesterTransportPeerId === 'string' &&
		typeof request.requesterSessionTransportPeerId === 'string' &&
		typeof request.targetHostPeerId === 'string' &&
		typeof request.targetHostInstanceId === 'string' &&
		typeof request.targetHostTransportPeerId === 'string' &&
		(request.targetHostSessionTransportPeerId === undefined ||
			typeof request.targetHostSessionTransportPeerId === 'string') &&
		(request.status === 'requested' ||
			request.status === 'ready' ||
			request.status === 'error') &&
		(request.status !== 'ready' ||
			typeof request.targetHostSessionTransportPeerId === 'string') &&
		typeof request.createdAt === 'number'
	);
};

export const readPeerState = (state: unknown): PeerState | null => {
	if (!state || typeof state !== 'object') return null;
	const peer = (state as { accountPeer?: unknown }).accountPeer;
	if (!peer || typeof peer !== 'object') return null;
	const value = peer as Partial<PeerState>;
	return typeof value.id === 'string' &&
		typeof value.instanceId === 'string' &&
		(value.kind === 'texlyre' || value.kind === 'chelys')
		? (value as PeerState)
		: null;
};

export const readHostAdvertisements = (
	state: unknown,
): Record<string, HostAdvertisement> => {
	if (!state || typeof state !== 'object') return {};
	const value = (state as Record<string, unknown>)[HOSTS_AWARENESS_FIELD];
	return value && typeof value === 'object'
		? (value as Record<string, HostAdvertisement>)
		: {};
};
