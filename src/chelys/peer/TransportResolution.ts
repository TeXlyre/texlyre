// src/chelys/peer/TransportResolution.ts
import { getAccountControlRoomId } from './AccountControlRoom';
import type { TransportConfig } from '../types/transport';

const ACCOUNT_ROOM_POLL_MS = 250;
const DEFAULT_ACCOUNT_ROOM_TIMEOUT_MS = 15_000;

export function readSignalingServers(userId?: string | null): string[] {
	const owner = userId ?? localStorage.getItem('texlyre-current-user');
	const storageKey = owner
		? `texlyre-user-${owner}-settings`
		: 'texlyre-settings';

	try {
		const settings = JSON.parse(
			localStorage.getItem(storageKey) || '{}',
		) as Record<string, unknown>;
		const servers = settings['collab-signaling-servers'];
		return typeof servers === 'string'
			? servers
					.split(',')
					.map((server) => server.trim())
					.filter(Boolean)
			: [];
	} catch {
		return [];
	}
}

function waitForAccountRoom(timeoutMs: number): Promise<string | null> {
	const current = getAccountControlRoomId();
	if (current) return Promise.resolve(current);

	return new Promise((resolve) => {
		const deadline = Date.now() + timeoutMs;
		const poll = (): void => {
			const roomId = getAccountControlRoomId();
			if (roomId || Date.now() >= deadline) {
				resolve(roomId ?? null);
				return;
			}
			setTimeout(poll, ACCOUNT_ROOM_POLL_MS);
		};
		setTimeout(poll, Math.min(ACCOUNT_ROOM_POLL_MS, timeoutMs));
	});
}

export async function resolveTransportConfig(
	configId: string,
	config: TransportConfig,
	accountRoomTimeoutMs = DEFAULT_ACCOUNT_ROOM_TIMEOUT_MS,
): Promise<TransportConfig> {
	if (config.type !== 'webrtc') return config;

	const explicitRoomId =
		typeof config.roomId === 'string' && config.roomId.trim().length > 0;
	if (explicitRoomId) {
		return {
			...config,
			roomId: config.roomId,
			controlRoomId: config.roomId,
			controlMode: 'dedicated',
			signaling: config.signaling?.length
				? config.signaling
				: readSignalingServers(),
		};
	}

	const accountRoomId = await waitForAccountRoom(accountRoomTimeoutMs);
	return {
		...config,
		roomId: accountRoomId ? `${accountRoomId}:${configId}` : undefined,
		controlRoomId: accountRoomId ?? undefined,
		controlMode: 'account',
		signaling: config.signaling?.length
			? config.signaling
			: readSignalingServers(),
	};
}
