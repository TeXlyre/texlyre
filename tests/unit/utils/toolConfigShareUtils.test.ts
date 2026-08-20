import type { TypesetterServerConfig } from '@src/services/GenericTypesetterService';
import { describeConfigShare } from '@src/utils/toolConfigShareUtils';

const typesetter = (
	transportConfig: TypesetterServerConfig['transportConfig'],
): TypesetterServerConfig => ({
	id: 'sile',
	name: 'SILE',
	enabled: true,
	projectType: 'sile',
	inputExtensions: ['sil'],
	outputFormats: [],
	transportConfig,
	capabilities: {},
});

describe('describeConfigShare', () => {
	it('allows an explicit WebRTC room', () => {
		expect(
			describeConfigShare(
				typesetter({ type: 'webrtc', roomId: 'shared-room' }),
			).state,
		).toBe('ready');
	});

	it('blocks account-derived WebRTC rooms', () => {
		expect(describeConfigShare(typesetter({ type: 'webrtc' })).state).toBe(
			'blocked',
		);
	});

	it('warns for loopback WebSocket URLs and allows reachable URLs', () => {
		expect(
			describeConfigShare(
				typesetter({ type: 'websocket', url: 'ws://localhost:7000' }),
			).state,
		).toBe('warning');
		expect(
			describeConfigShare(
				typesetter({ type: 'websocket', url: 'wss://tools.example/sile' }),
			).state,
		).toBe('ready');
	});

	it('blocks incomplete WebSocket recipes', () => {
		expect(
			describeConfigShare(typesetter({ type: 'websocket' })).state,
		).toBe('blocked');
	});
});
