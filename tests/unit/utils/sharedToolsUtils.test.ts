import * as Y from 'yjs';
import {
	Awareness,
	applyAwarenessUpdate,
	encodeAwarenessUpdate,
} from 'y-protocols/awareness';

import type { TypesetterServerConfig } from '@src/services/GenericTypesetterService';
import type { ACPServerConfig } from '@src/types/acp';
import type { LSPConfigBlock } from '@src/types/lsp';
import type { SharedLocalTool } from '@src/types/sharedTools';
import {
	buildSharedToolAdvertisement,
	classifySharedToolConflict,
	describeSharedToolAvailability,
	getSharedToolKind,
	isSharedAgentId,
	normalizeSharedToolAdvertisement,
	normalizeSharedToolPreferences,
	projectAgentKey,
	projectSharingKey,
	readSharedToolsFromAwareness,
	selectAdvertisedTools,
	sharedAgentId,
	sharedToolIdentity,
} from '@src/utils/sharedToolsUtils';

const typesetter = (
	overrides: Partial<TypesetterServerConfig> = {},
): TypesetterServerConfig => ({
	id: 'sile',
	name: 'SILE',
	enabled: true,
	projectType: 'sile',
	inputExtensions: ['sil'],
	outputFormats: [{ id: 'pdf', mimeType: 'application/pdf' }],
	transportConfig: {
		type: 'webrtc',
		roomId: 'shared-sile',
		signaling: ['wss://signal.example'],
	},
	capabilities: {},
	...overrides,
});

const lsp = (overrides: Partial<LSPConfigBlock> = {}): LSPConfigBlock => ({
	id: 'ltex',
	name: 'LTeX',
	enabled: true,
	fileExtensions: ['tex'],
	transportConfig: { type: 'websocket', url: 'wss://ltex.example' },
	clientConfig: '{}',
	...overrides,
});

const awarenessPair = () => {
	const receiverDoc = new Y.Doc();
	const senderDoc = new Y.Doc();

	// tests/setup.ts intentionally makes crypto.getRandomValues deterministic,
	// so Y.Doc instances otherwise receive the same client ID. Give the real
	// Awareness instances distinct peers before encoding an actual update.
	senderDoc.clientID = receiverDoc.clientID + 1;

	return {
		senderDoc,
		receiverDoc,
		sender: new Awareness(senderDoc),
		receiver: new Awareness(receiverDoc),
	};
};

describe('shared tools', () => {
	it('normalizes persistent preferences without accepting malformed entries', () => {
		expect(
			normalizeSharedToolPreferences({
				shareWithAll: { 'typesetter:sile': true, bad: false },
				shareProjectTools: { 'yjs:paper': true },
				decisions: {
					good: { decision: 'accepted', revision: 'r1', localId: 'sile' },
					bad: { decision: 'maybe', revision: 2 },
				},
				origins: {
					'typesetter:sile': {
						ownerId: 'alice',
						ownerName: 'Alice',
						toolId: 'sile',
					},
					bad: { ownerId: 3 },
				},
			}),
		).toEqual({
			shareWithAll: { 'typesetter:sile': true },
			shareProjectTools: { 'yjs:paper': true },
			shareProjectAgents: {},
			decisions: {
				good: { decision: 'accepted', revision: 'r1', localId: 'sile' },
			},
			origins: {
				'typesetter:sile': {
					ownerId: 'alice',
					ownerName: 'Alice',
					toolId: 'sile',
				},
			},
		});
	});

	it('uses the project fragment as the local project-sharing key', () => {
		expect(projectSharingKey('https://texlyre.example/editor#yjs:paper-1')).toBe(
			'yjs:paper-1',
		);
		expect(projectSharingKey('yjs:paper-1')).toBe('yjs:paper-1');
	});

	it('selects global tools plus project-used tools only when project sharing is on', () => {
		const tools: SharedLocalTool[] = [
			{
				kind: 'typesetter',
				config: typesetter(),
				shareable: true,
				sharedWithAll: true,
				usedByProject: false,
			},
			{
				kind: 'lsp',
				config: lsp(),
				shareable: true,
				sharedWithAll: false,
				usedByProject: true,
			},
			{
				kind: 'lsp',
				config: lsp({
					id: 'local',
					name: 'Local',
					transportConfig: { type: 'websocket', url: 'ws://localhost:7000' },
				}),
				shareable: false,
				sharedWithAll: true,
				usedByProject: true,
			},
		];

		expect(
			selectAdvertisedTools(tools, false).map((tool) => tool.config.id),
		).toEqual(['sile']);
		expect(
			selectAdvertisedTools(tools, true).map((tool) => tool.config.id),
		).toEqual(['sile', 'ltex']);
	});

	it('preserves original ownership when a received tool is reshared', () => {
		const advertisement = buildSharedToolAdvertisement(
			'typesetter',
			typesetter({ id: 'local-copy' }),
			{ id: 'bob', name: 'Bob' },
			{ ownerId: 'alice', ownerName: 'Alice', toolId: 'sile' },
		);

		expect(advertisement.ownerId).toBe('alice');
		expect(advertisement.ownerName).toBe('Alice');
		expect(advertisement.toolId).toBe('sile');
		expect(advertisement.config.id).toBe('sile');
	});

	it('classifies exact ID, conflicting ID, same-name and unrelated tools separately', () => {
		const remote = buildSharedToolAdvertisement(
			'typesetter',
			typesetter(),
			{ id: 'alice', name: 'Alice' },
		);

		expect(classifySharedToolConflict(remote, [typesetter()]).kind).toBe(
			'same-id-same-config',
		);
		expect(
			classifySharedToolConflict(remote, [
				typesetter({ transportConfig: { type: 'webrtc', roomId: 'other' } }),
			]).kind,
		).toBe('same-id-different-config');
		expect(
			classifySharedToolConflict(remote, [typesetter({ id: 'mine' })]).kind,
		).toBe('same-name');
		expect(
			classifySharedToolConflict(remote, [
				typesetter({ id: 'other', name: 'Other' }),
			]).kind,
		).toBe('none');
	});

	it('does not advertise browser-local worker language servers', () => {
		expect(
			describeSharedToolAvailability(
				lsp({
					id: 'worker-lsp',
					transportConfig: { type: 'worker', workerPath: '/worker.js' },
				}),
			).shareable,
		).toBe(false);
	});

	it('identifies typesetter and LSP recipes from their normalized shape', () => {
		expect(getSharedToolKind(typesetter())).toBe('typesetter');
		expect(getSharedToolKind(lsp())).toBe('lsp');
	});

	it('reads real Yjs awareness updates and deduplicates relayed tools by origin', () => {
		const { senderDoc, receiverDoc, sender, receiver } = awarenessPair();
		const advertisement = buildSharedToolAdvertisement(
			'typesetter',
			typesetter(),
			{ id: 'alice', name: 'Alice' },
		);

		sender.setLocalStateField('user', {
			id: 'alice',
			username: 'alice',
			name: 'Alice',
		});
		sender.setLocalStateField('sharedTools', [advertisement]);
		applyAwarenessUpdate(
			receiver,
			encodeAwarenessUpdate(sender, [sender.clientID]),
			'test',
		);

		const tools = readSharedToolsFromAwareness(receiver, 'bob');
		expect(tools).toHaveLength(1);
		expect(tools[0]).toMatchObject({
			ownerId: 'alice',
			ownerName: 'Alice',
			advertiserId: 'alice',
			advertiserName: 'Alice',
			toolId: 'sile',
		});
		expect(
			sharedToolIdentity('typesetter', tools[0].ownerId, tools[0].toolId),
		).toBe('typesetter:alice:sile');

		sender.destroy();
		receiver.destroy();
		senderDoc.destroy();
		receiverDoc.destroy();
	});

	it('does not re-import a relayed copy of the current user own tool', () => {
		const { senderDoc, receiverDoc, sender, receiver } = awarenessPair();
		const advertisement = buildSharedToolAdvertisement(
			'typesetter',
			typesetter(),
			{ id: 'bob', name: 'Bob' },
			{ ownerId: 'alice', ownerName: 'Alice', toolId: 'sile' },
		);

		sender.setLocalStateField('user', { id: 'bob', username: 'bob' });
		sender.setLocalStateField('sharedTools', [advertisement]);
		applyAwarenessUpdate(
			receiver,
			encodeAwarenessUpdate(sender, [sender.clientID]),
			'test',
		);

		expect(readSharedToolsFromAwareness(receiver, 'alice')).toEqual([]);

		sender.destroy();
		receiver.destroy();
		senderDoc.destroy();
		receiverDoc.destroy();
	});
});

describe('shared agents', () => {
	const agent = (overrides: Partial<ACPServerConfig> = {}): ACPServerConfig => ({
		id: 'claude',
		name: 'Claude Agent',
		enabled: true,
		transportConfig: { type: 'webrtc', roomId: 'claude-room-1' },
		cwd: '/home/owner/thesis',
		mcpServers: '[{"name":"x","command":"sh"}]',
		sessionMeta: '{"claudeCode":{}}',
		...overrides,
	});
	const agentTool = (overrides: Partial<SharedLocalTool> = {}): SharedLocalTool => ({
		kind: 'agent',
		config: agent(),
		shareable: true,
		sharedWithAll: false,
		usedByProject: false,
		...overrides,
	});

	it('is identified by its shape', () => {
		expect(getSharedToolKind(agent())).toBe('agent');
	});

	it('is advertised only when chosen for the project, never with the other tools', () => {
		expect(selectAdvertisedTools([agentTool()], true)).toEqual([]);
		expect(
			selectAdvertisedTools([agentTool({ sharedWithAll: true, usedByProject: true })], true),
		).toEqual([]);
		expect(
			selectAdvertisedTools([agentTool({ sharedInProject: true })], false).map(
				(tool) => tool.config.id,
			),
		).toEqual(['claude']);
		// A loopback agent can't be reached by collaborators.
		expect(
			selectAdvertisedTools(
				[agentTool({ sharedInProject: true, shareable: false })],
				false,
			),
		).toEqual([]);
		expect(
			describeSharedToolAvailability(
				agent({ transportConfig: { type: 'websocket', url: 'ws://localhost:7060' } }),
			).shareable,
		).toBe(false);
	});

	it("sends only the transport, not the owner's directory, MCP servers or session options", () => {
		const advertisement = buildSharedToolAdvertisement('agent', agent(), {
			id: 'alice',
			name: 'Alice',
		});
		expect(advertisement.config).toEqual({
			id: 'claude',
			name: 'Claude Agent',
			enabled: true,
			transportConfig: { type: 'webrtc', roomId: 'claude-room-1' },
		});
		// A received advertisement is cut down the same way.
		const received = normalizeSharedToolAdvertisement({
			...advertisement,
			config: agent(),
		});
		expect(received?.config).toEqual({
			...advertisement.config,
			transportConfig: { type: 'webrtc', roomId: 'claude-room-1', contentLength: false },
		});
	});

	it('keeps per-project agent choices in the preferences', () => {
		const key = projectAgentKey('yjs:paper-1', 'claude');
		expect(
			normalizeSharedToolPreferences({ shareProjectAgents: { [key]: true, other: 'yes' } })
				.shareProjectAgents,
		).toEqual({ [key]: true });
		expect(sharedAgentId('agent:alice:claude')).toBe('shared-agent:agent:alice:claude');
		expect(isSharedAgentId('shared-agent:agent:alice:claude')).toBe(true);
		expect(isSharedAgentId('claude')).toBe(false);
	});

	it('only takes an agent from its owner, not relayed by someone else', () => {
		const { senderDoc, receiverDoc, sender, receiver } = awarenessPair();
		const advertisement = buildSharedToolAdvertisement('agent', agent(), {
			id: 'alice',
			name: 'Alice',
		});
		sender.setLocalStateField('user', { id: 'mallory', name: 'Mallory' });
		sender.setLocalStateField('sharedTools', [advertisement]);
		applyAwarenessUpdate(receiver, encodeAwarenessUpdate(sender, [sender.clientID]), 'test');
		expect(readSharedToolsFromAwareness(receiver, 'bob')).toEqual([]);

		sender.setLocalStateField('user', { id: 'alice', name: 'Alice' });
		applyAwarenessUpdate(receiver, encodeAwarenessUpdate(sender, [sender.clientID]), 'test');
		expect(readSharedToolsFromAwareness(receiver, 'bob')).toMatchObject([
			{ kind: 'agent', ownerId: 'alice', toolId: 'claude' },
		]);

		sender.destroy();
		receiver.destroy();
		senderDoc.destroy();
		receiverDoc.destroy();
	});
});
