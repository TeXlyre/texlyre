// src/utils/toolConfigShare.ts
import type { ToolConfigBlock } from '../types/toolConfig';

export type ToolConfigShareState = 'ready' | 'warning' | 'blocked';

export interface ToolConfigShareInfo {
	json: string;
	fileName: string;
	state: ToolConfigShareState;
	message?: string;
}

const LOOPBACK_HOSTS = new Set([
	'localhost',
	'127.0.0.1',
	'0.0.0.0',
	'::1',
	'[::1]',
]);

const isLoopbackUrl = (url: string | undefined): boolean => {
	if (!url?.trim()) return false;

	const authority = url.replace(/^[a-z]+:\/\//i, '').split('/')[0];
	const host = authority.startsWith('[')
		? authority.slice(0, authority.indexOf(']') + 1)
		: authority.split(':')[0];

	return LOOPBACK_HOSTS.has(host.toLowerCase());
};

export function describeConfigShare(
	config: ToolConfigBlock,
): ToolConfigShareInfo {
	const transport = config.transportConfig;
	const json = JSON.stringify(config, null, 2);
	const fileName = `${config.id}.json`;

	if (transport.type === 'webrtc' && !transport.roomId?.trim()) {
		return {
			json,
			fileName,
			state: 'blocked',
			message:
				'This configuration uses a WebRTC room derived from your account. Anyone you send it to would resolve their own account room, so it cannot reach the same server. Set a room override to make it shareable.',
		};
	}

	if (transport.type === 'websocket' && !transport.url?.trim()) {
		return {
			json,
			fileName,
			state: 'blocked',
			message: 'This configuration has no WebSocket server URL.',
		};
	}

	if (transport.type === 'websocket' && isLoopbackUrl(transport.url)) {
		return {
			json,
			fileName,
			state: 'warning',
			message:
				'The server URL resolves only on this machine. Collaborators need a reachable host before this configuration works for them.',
		};
	}

	return { json, fileName, state: 'ready' };
}
