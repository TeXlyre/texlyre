import * as Y from 'yjs';
import {
	Awareness,
	applyAwarenessUpdate,
	encodeAwarenessUpdate,
} from 'y-protocols/awareness';

import type { TypesetterServerConfig } from '@src/services/GenericTypesetterService';
import type { LSPConfigBlock } from '@src/types/lsp';
import type { StorageConfigBlock } from '@src/types/storage';
import type { SharedLocalTool } from '@src/types/sharedTools';
import { normalizeStorageConfig } from '@src/utils/toolConfigUtils';
import {
	buildSharedToolAdvertisement,
	classifySharedToolConflict,
	findTrustedSharedStorage,
	describeSharedToolAvailability,
	getSharedToolKind,
	normalizeSharedToolPreferences,
	projectSharingKey,
	readSharedToolsFromAwareness,
	selectAdvertisedTools,
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

const storage = (
	overrides: Partial<StorageConfigBlock> = {},
): StorageConfigBlock => ({
	id: 'garage',
	name: 'Garage',
	enabled: true,
	transportConfig: {
		type: 'webrtc',
		roomId: 'shared-garage',
		signaling: ['wss://signal.example'],
	},
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

	it('keeps storage decisions project-specific while existing tool identities stay global', () => {
		expect(sharedToolIdentity('typesetter', 'alice', 'sile')).toBe(
			'typesetter:alice:sile',
		);
		expect(sharedToolIdentity('storage', 'alice', 'garage', 'project-a')).toBe(
			'storage:alice:garage:project-a',
		);
		expect(sharedToolIdentity('storage', 'alice', 'garage', 'project-b')).not.toBe(
			sharedToolIdentity('storage', 'alice', 'garage', 'project-a'),
		);
	});

	it('reuses only trusted storage from the same owner with an identical connection', () => {
		const advertised = buildSharedToolAdvertisement(
			'storage', storage(), { id: 'alice', name: 'Alice' }, undefined,
			{ storageProjectId: 'project-b' },
		);
		const imported = normalizeStorageConfig(storage({ id: 'generated-local-id', name: 'Alice’s Garage' }))!;
		const trusted = normalizeSharedToolPreferences({
			origins: {
				'storage:generated-local-id': {
					ownerId: 'alice', ownerName: 'Alice', toolId: 'garage',
				},
			},
		});

		expect(findTrustedSharedStorage(advertised, [imported], trusted)?.id).toBe(
			'generated-local-id',
		);
		expect(findTrustedSharedStorage(advertised, [imported], normalizeSharedToolPreferences(null)))
			.toBeUndefined();
		expect(findTrustedSharedStorage(advertised, [
			storage({ ...imported, transportConfig: { type: 'webrtc', roomId: 'other' } }),
		], trusted)).toBeUndefined();
		expect(findTrustedSharedStorage(advertised, [
			storage({ ...imported, enabled: false }),
		], trusted)).toBeUndefined();
		expect(findTrustedSharedStorage(
			{ ...advertised, ownerId: 'mallory' }, [imported], trusted,
		)).toBeUndefined();
	});

	it('treats normalized recipes with reordered transport fields as identical', () => {
		const original = storage();
		const normalized = normalizeStorageConfig(original)!;
		expect(classifySharedToolConflict(
			{ toolId: 'garage', name: 'Garage', config: original },
			[normalized],
		).kind).toBe('same-id-same-config');
	});

	it('ignores the local transport alias when matching previously accepted storage', () => {
		const advertisement = buildSharedToolAdvertisement(
			'storage', storage(), { id: 'alice', name: 'Alice' }, undefined,
			{ storageProjectId: 'project-next' },
		);
		const received = normalizeStorageConfig(storage({ id: 'local-alias', transportId: 'garage' }))!;
		const trusted = normalizeSharedToolPreferences({
			origins: {
				'storage:local-alias': {
					ownerId: 'alice', ownerName: 'Alice', toolId: 'garage',
				},
			},
		});
		expect(findTrustedSharedStorage(advertisement, [received], trusted)?.id)
			.toBe('local-alias');
		expect(advertisement.config).not.toHaveProperty('transportId');
	});

	it('reuses a matching manually configured provider after accepting another project', () => {
		const advertised = buildSharedToolAdvertisement(
			'storage', storage(), { id: 'alice', name: 'Alice' }, undefined,
			{ storageProjectId: 'project-b' },
		);
		const accepted = normalizeSharedToolPreferences({
			decisions: {
				[sharedToolIdentity('storage', 'alice', 'garage', 'project-a')]: {
					decision: 'accepted', revision: 'a', localId: 'garage', imported: false,
				},
			},
		});
		expect(findTrustedSharedStorage(advertised, [storage()], accepted)?.id).toBe('garage');
		expect(findTrustedSharedStorage(advertised, [storage()], normalizeSharedToolPreferences({
			decisions: {
				[sharedToolIdentity('storage', 'alice', 'garage', 'project-a')]: {
					decision: 'ignored', revision: 'a', localId: 'garage',
				},
			},
		}))).toBeUndefined();
	});

	it('keeps the owner service ID on shared advertisements after a local alias is applied', () => {
		const config = storage({ id: 'receiver-alias', transportId: 'garage' });
		const advertised = buildSharedToolAdvertisement(
			'storage', config, { id: 'receiver', name: 'Receiver' },
			{ ownerId: 'alice', ownerName: 'Alice', toolId: 'garage' },
			{ storageProjectId: 'project-a' },
		);
		expect(advertised.toolId).toBe('garage');
		expect(advertised.config.id).toBe('garage');
		expect(advertised.config).not.toHaveProperty('transportId');
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
			{
				kind: 'storage',
				config: storage(),
				shareable: true,
				sharedWithAll: true,
				usedByProject: true,
				projectShared: false,
				storage: { storageProjectId: 'opaque-project' },
			},
		];

		expect(
			selectAdvertisedTools(tools, false).map((tool) => tool.config.id),
		).toEqual(['sile']);
		expect(
			selectAdvertisedTools(tools, true).map((tool) => tool.config.id),
		).toEqual(['sile', 'ltex']);

		tools[3].projectShared = true;
		expect(
			selectAdvertisedTools(tools, false).map((tool) => tool.config.id),
		).toEqual(['sile', 'garage']);
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
		expect(getSharedToolKind(storage())).toBe('storage');
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

	it('round-trips a project-scoped storage advertisement through real awareness', () => {
		const { senderDoc, receiverDoc, sender, receiver } = awarenessPair();
		const advertisement = buildSharedToolAdvertisement(
			'storage',
			storage(),
			{ id: 'alice', name: 'Alice' },
			undefined,
			{ storageProjectId: 'opaque-project', baseRevision: 'revision-1' },
		);
		const unsafeConfig = advertisement.config as unknown as Record<
			string,
			unknown
		>;
		unsafeConfig.accessToken = 'should-not-survive-normalization';
		unsafeConfig.bucket = 'private-bucket';
		sender.setLocalStateField('user', { id: 'alice', name: 'Alice' });
		sender.setLocalStateField('sharedTools', [advertisement]);
		applyAwarenessUpdate(
			receiver,
			encodeAwarenessUpdate(sender, [sender.clientID]),
			'test',
		);

		const [observed] = readSharedToolsFromAwareness(receiver, 'bob');
		expect(observed).toMatchObject({
			kind: 'storage',
			toolId: 'garage',
			storage: {
				storageProjectId: 'opaque-project',
				baseRevision: 'revision-1',
			},
		});
		expect(JSON.stringify(observed)).not.toContain(
			'should-not-survive-normalization',
		);
		expect(JSON.stringify(observed)).not.toContain('private-bucket');
		expect(JSON.stringify(observed)).not.toContain('accessToken');
		expect(JSON.stringify(observed)).not.toContain('bucket');

		sender.destroy();
		receiver.destroy();
		senderDoc.destroy();
		receiverDoc.destroy();
	});

	it('rejects non-shareable storage transports through the existing shareability rules', () => {
		expect(
			describeSharedToolAvailability(
				storage({ transportConfig: { type: 'webrtc' } }),
			).shareable,
		).toBe(false);
		expect(
			describeSharedToolAvailability(
				storage({
					transportConfig: {
						type: 'websocket',
						url: 'ws://localhost:9080',
					},
				}),
			).shareable,
		).toBe(false);
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
