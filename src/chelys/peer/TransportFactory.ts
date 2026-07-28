// src/chelys/peer/TransportFactory.ts
import { t } from '@/i18n';
import type {
	ClientTransport,
	TransportConfig,
	TransportOpenOptions,
} from '../types/transport';
import { openWebSocketTransport } from './WebSocketTransport';
import { openWebrtcTransport } from './WebrtcTransport';

export function openTransport(
	config: TransportConfig,
	options: TransportOpenOptions,
): Promise<ClientTransport> {
	switch (config.type) {
		case 'websocket':
			return config.url
				? openWebSocketTransport(config.url)
				: Promise.reject(new Error(t('Transport URL is missing')));

		case 'webrtc':
			if (!config.roomId || !config.controlRoomId || !config.controlMode) {
				return Promise.reject(
					new Error(
						t('No transport room: sign in to Chelys or set a room override'),
					),
				);
			}
			if (!config.signaling?.length) {
				return Promise.reject(new Error(t('No signaling servers configured')));
			}
			return openWebrtcTransport({
				baseRoomId: config.roomId,
				controlRoomId: config.controlRoomId,
				controlMode: config.controlMode,
				signaling: config.signaling,
				label: options.label,
				timeoutMs: options.timeoutMs,
			});

		default:
			return Promise.reject(new Error(`Unsupported transport: ${config.type}`));
	}
}
