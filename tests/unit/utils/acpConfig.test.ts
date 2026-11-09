import { parseAcpConfigs } from '@src/utils/toolConfigUtils';

describe('parseAcpConfigs', () => {
	it('reads the JSON string Chelys injects and forces newline framing', () => {
		const configs = parseAcpConfigs(
			JSON.stringify([
				{
					id: 'claude-agent',
					name: 'Claude Agent',
					enabled: true,
					transportConfig: {
						type: 'websocket',
						url: 'ws://localhost:7060',
						contentLength: true,
					},
					cwd: ' /home/me/agent ',
					mcpServers: '[]',
				},
			]),
		);

		expect(configs).toEqual([
			{
				id: 'claude-agent',
				name: 'Claude Agent',
				enabled: true,
				transportConfig: {
					type: 'websocket',
					url: 'ws://localhost:7060',
					contentLength: false,
				},
				cwd: '/home/me/agent',
				mcpServers: '[]',
			},
		]);
	});

	it('drops blocks without an id or with a worker transport', () => {
		expect(
			parseAcpConfigs([
				{ name: 'No id', transportConfig: { type: 'websocket' } },
				{ id: 'w', transportConfig: { type: 'worker', workerPath: '/x.js' } },
				{ id: 'r', transportConfig: { type: 'webrtc', roomId: 'room' } },
			]).map((config) => config.id),
		).toEqual(['r']);
	});
});
