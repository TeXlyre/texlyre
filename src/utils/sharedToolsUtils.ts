// src/utils/sharedToolsUtils.ts
import type { Awareness } from 'y-protocols/awareness';
import type * as Y from 'yjs';

import type { ToolConfigBlock } from '../types/toolConfig';
import type { StorageConfigBlock } from '../types/storage';
import type {
	ObservedSharedTool,
	SharedToolAdvertisement,
	SharedToolConflict,
	SharedLocalTool,
	SharedToolKind,
	SharedToolOrigin,
	SharedToolPreferences,
	SharedStorageAttachment,
} from '../types/sharedTools';
import { describeConfigShare } from './toolConfigShareUtils';
import {
	isRecord,
	normalizeAcpConfig,
	normalizeLspConfig,
	normalizeStorageConfig,
	normalizeTypesetterConfig,
} from './toolConfigUtils';

export const SHARED_TOOL_PREFERENCES_SETTING = 'shared-tool-preferences';
export const SHARED_TOOLS_AWARENESS_FIELD = 'sharedTools';
export const SHARED_PROJECT_AGENTS_MAP = 'sharedProjectAgents';

export const EMPTY_SHARED_TOOL_PREFERENCES: SharedToolPreferences = {
	shareWithAll: {},
	shareProjectTools: {},
	shareProjectAgents: {},
	decisions: {},
	origins: {},
};

const cloneRecord = (value: unknown): Record<string, unknown> =>
	isRecord(value) ? value : {};

const normalizeTrueMap = (value: unknown): Record<string, true> =>
	Object.fromEntries(
		Object.entries(cloneRecord(value)).flatMap(([key, enabled]) =>
			enabled === true ? [[key, true as const]] : [],
		),
	);

export function normalizeSharedToolPreferences(
	value: unknown,
): SharedToolPreferences {
	if (!isRecord(value)) {
		return {
			shareWithAll: {},
			shareProjectTools: {},
			shareProjectAgents: {},
			decisions: {},
			origins: {},
		};
	}

	const decisions = Object.fromEntries(
		Object.entries(cloneRecord(value.decisions)).flatMap(([key, decision]) => {
			if (
				!isRecord(decision) ||
				(decision.decision !== 'accepted' && decision.decision !== 'ignored') ||
				typeof decision.revision !== 'string'
			) {
				return [];
			}

			return [
				[
					key,
					{
						decision: decision.decision,
						revision: decision.revision,
						...(typeof decision.localId === 'string'
							? { localId: decision.localId }
							: {}),
						...(typeof decision.imported === 'boolean'
							? { imported: decision.imported }
							: {}),
					},
				],
			];
		}),
	) as SharedToolPreferences['decisions'];

	const origins = Object.fromEntries(
		Object.entries(cloneRecord(value.origins)).flatMap(([key, origin]) => {
			if (
				!isRecord(origin) ||
				typeof origin.ownerId !== 'string' ||
				typeof origin.ownerName !== 'string' ||
				typeof origin.toolId !== 'string'
			) {
				return [];
			}

			return [
				[
					key,
					{
						ownerId: origin.ownerId,
						ownerName: origin.ownerName,
						toolId: origin.toolId,
					},
				],
			];
		}),
	) as SharedToolPreferences['origins'];

	return {
		shareWithAll: normalizeTrueMap(value.shareWithAll),
		shareProjectTools: normalizeTrueMap(value.shareProjectTools),
		shareProjectAgents: normalizeTrueMap(value.shareProjectAgents),
		decisions,
		origins,
	};
}

const encodeKeyPart = (value: string): string => encodeURIComponent(value);

export function getSharedToolKind(config: ToolConfigBlock): SharedToolKind {
	if ('projectType' in config) return 'typesetter';
	if ('fileExtensions' in config || 'clientConfig' in config) return 'lsp';
	return 'storage';
}

export function localSharedToolKey(kind: SharedToolKind, id: string): string {
	return `${kind}:${encodeKeyPart(id)}`;
}

export function projectAgentKey(projectKey: string, agentId: string): string {
	return `${encodeKeyPart(projectKey)}:${encodeKeyPart(agentId)}`;
}

export function selectAdvertisedTools(
	tools: SharedLocalTool[],
	shareProjectTools: boolean,
): SharedLocalTool[] {
	const selected = new Map<string, SharedLocalTool>();
	for (const tool of tools) {
		const sharedWithAll =
			tool.kind !== 'storage' && tool.kind !== 'agent' && tool.sharedWithAll;
		// Agents are only shared where their owner ticked them for the project.
		const sharedWithProject =
			tool.kind === 'agent'
				? tool.sharedInProject === true
				: tool.usedByProject && (tool.projectShared ?? shareProjectTools);
		if (!tool.shareable || (!sharedWithAll && !sharedWithProject)) {
			continue;
		}
		selected.set(localSharedToolKey(tool.kind, tool.config.id), tool);
	}
	return Array.from(selected.values());
}

export function sharedToolIdentity(
	kind: SharedToolKind,
	ownerId: string,
	toolId: string,
	storageProjectId?: string,
): string {
	const identity = `${kind}:${encodeKeyPart(ownerId)}:${encodeKeyPart(toolId)}`;
	return kind === 'storage' && storageProjectId
		? `${identity}:${encodeKeyPart(storageProjectId)}`
		: identity;
}

export const SHARED_AGENT_ID_PREFIX = 'shared-agent:';

export function sharedAgentId(identity: string): string {
	return `${SHARED_AGENT_ID_PREFIX}${identity}`;
}

export function isSharedAgentId(id: string | null | undefined): boolean {
	return !!id?.startsWith(SHARED_AGENT_ID_PREFIX);
}

export function projectSharingKey(value: string): string {
	const fragment = value.includes('#')
		? value.slice(value.indexOf('#') + 1)
		: value;
	try {
		return decodeURIComponent(fragment);
	} catch {
		return fragment;
	}
}

const hashString = (value: string): string => {
	let hash = 0x811c9dc5;
	for (let i = 0; i < value.length; i += 1) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(36);
};

const configWithoutDisplayFields = (
	config: ToolConfigBlock,
): Record<string, unknown> => {
	const rest = { ...(config as unknown as Record<string, unknown>) };
	delete rest.id;
	delete rest.name;
	delete rest.enabled;
	delete rest.icon;
	delete rest.transportId;
	return rest;
};

const stableObject = (value: unknown): unknown =>
	Array.isArray(value)
		? value.map(stableObject)
		: isRecord(value)
			? Object.fromEntries(
					Object.keys(value)
						.sort()
						.map((key) => [key, stableObject(value[key])]),
				)
			: value;

export function sharedToolConfigFingerprint(config: ToolConfigBlock): string {
	return hashString(
		JSON.stringify(stableObject(configWithoutDisplayFields(config))),
	);
}

export function sharedToolRevision(
	config: ToolConfigBlock,
	storage?: SharedStorageAttachment,
): string {
	return hashString(
		JSON.stringify(
			storage ? { config, storageProjectId: storage.storageProjectId } : config,
		),
	);
}

export function describeSharedToolAvailability(config: ToolConfigBlock): {
	shareable: boolean;
	message?: string;
} {
	if (config.transportConfig.type === 'worker') {
		return {
			shareable: false,
			message:
				'This language server runs locally in the browser and does not provide a remote tool to collaborators.',
		};
	}

	const share = describeConfigShare(config);
	return { shareable: share.state === 'ready', message: share.message };
}

export function isToolShareable(config: ToolConfigBlock): boolean {
	return describeSharedToolAvailability(config).shareable;
}

export function canonicalSharedConfig(
	kind: SharedToolKind,
	config: ToolConfigBlock,
	toolId: string,
): ToolConfigBlock {
	// Agent and storage configs have the same shape, so the kind is passed in
	// rather than inferred.
	if (kind === 'agent') {
		// Only what reaches the owner's agent. Its working directory, MCP
		// servers and session options are the owner's business, and the agent
		// host sets its own.
		return {
			id: toolId,
			name: config.name,
			enabled: true,
			transportConfig: config.transportConfig,
		};
	}
	const shared = {
		...config,
		id: toolId,
		enabled: true,
	} as ToolConfigBlock & { icon?: string; transportId?: string };
	delete shared.icon;
	delete shared.transportId;
	return shared;
}

export function buildSharedToolAdvertisement(
	kind: SharedToolKind,
	config: ToolConfigBlock,
	owner: { id: string; name: string },
	origin?: SharedToolOrigin,
	storage?: SharedStorageAttachment,
): SharedToolAdvertisement {
	const resolvedOrigin = origin ?? {
		ownerId: owner.id,
		ownerName: owner.name,
		toolId: config.id,
	};
	const sharedConfig = canonicalSharedConfig(
		kind,
		config,
		resolvedOrigin.toolId,
	);

	return {
		kind,
		...resolvedOrigin,
		name: config.name,
		revision: sharedToolRevision(sharedConfig, storage),
		config: sharedConfig,
		...(kind === 'storage' && storage ? { storage } : {}),
	};
}

export function normalizeSharedToolAdvertisement(
	value: unknown,
): SharedToolAdvertisement | null {
	if (
		!isRecord(value) ||
		(value.kind !== 'typesetter' &&
			value.kind !== 'lsp' &&
			value.kind !== 'storage' &&
			value.kind !== 'agent') ||
		typeof value.ownerId !== 'string' ||
		typeof value.ownerName !== 'string' ||
		typeof value.toolId !== 'string' ||
		typeof value.name !== 'string'
	) {
		return null;
	}

	const normalized =
		value.kind === 'typesetter'
			? normalizeTypesetterConfig(value.config)
			: value.kind === 'lsp'
				? normalizeLspConfig(value.config)
				: value.kind === 'agent'
					? normalizeAcpConfig(value.config)
					: normalizeStorageConfig(value.config);

	if (!normalized) {
		return null;
	}

	let storage: SharedStorageAttachment | undefined;
	if (value.kind === 'storage') {
		if (
			!isRecord(value.storage) ||
			typeof value.storage.storageProjectId !== 'string' ||
			!value.storage.storageProjectId.trim()
		) {
			return null;
		}
		storage = {
			storageProjectId: value.storage.storageProjectId,
			...(typeof value.storage.baseRevision === 'string'
				? { baseRevision: value.storage.baseRevision }
				: {}),
		};
	}

	const config = canonicalSharedConfig(value.kind, normalized, value.toolId);
	if (!isToolShareable(config)) {
		return null;
	}

	return {
		kind: value.kind,
		ownerId: value.ownerId,
		ownerName: value.ownerName,
		toolId: value.toolId,
		name: value.name,
		revision: sharedToolRevision(config, storage),
		config,
		...(storage ? { storage } : {}),
	};
}

interface AwarenessUser {
	id?: string;
	username?: string;
	name?: string;
}

export function readSharedToolsFromAwareness(
	awareness: Awareness,
	currentUserId?: string,
): ObservedSharedTool[] {
	const observed = new Map<string, ObservedSharedTool>();

	awareness.getStates().forEach((state, clientId) => {
		if (clientId === awareness.clientID || !isRecord(state)) return;

		const user = isRecord(state.user) ? (state.user as AwarenessUser) : {};
		const advertised = state[SHARED_TOOLS_AWARENESS_FIELD];
		if (!Array.isArray(advertised)) return;

		for (const raw of advertised) {
			const tool = normalizeSharedToolAdvertisement(raw);
			if (!tool || tool.kind === 'agent' || tool.ownerId === currentUserId)
				continue;

			const identity = sharedToolIdentity(
				tool.kind,
				tool.ownerId,
				tool.toolId,
				tool.storage?.storageProjectId,
			);
			const candidate: ObservedSharedTool = {
				...tool,
				advertiserId:
					typeof user.id === 'string' ? user.id : `awareness:${clientId}`,
				advertiserName:
					user.name || user.username || tool.ownerName || 'Collaborator',
			};
			const previous = observed.get(identity);

			if (!previous || candidate.advertiserId === tool.ownerId) {
				observed.set(identity, candidate);
			}
		}
	});

	return Array.from(observed.values());
}

// Agent links are project data, not presence: collaborators can use their
// own direct connection to Chelys even after the sharer closes TeXlyre.
export function readProjectSharedAgents(
	map: Y.Map<unknown>,
	currentUserId?: string,
): ObservedSharedTool[] {
	const agents: ObservedSharedTool[] = [];
	map.forEach((raw, key) => {
		const agent = normalizeSharedToolAdvertisement(raw);
		if (
			!agent ||
			agent.kind !== 'agent' ||
			agent.ownerId === currentUserId ||
			key !== sharedToolIdentity('agent', agent.ownerId, agent.toolId)
		) {
			return;
		}
		agents.push({
			...agent,
			advertiserId: agent.ownerId,
			advertiserName: agent.ownerName,
		});
	});
	return agents;
}

export function syncProjectSharedAgents(
	map: Y.Map<unknown>,
	ownerId: string,
	advertisements: SharedToolAdvertisement[],
): void {
	const selected = new Map(
		advertisements
			.filter((tool) => tool.kind === 'agent' && tool.ownerId === ownerId)
			.map((tool) => [sharedToolIdentity('agent', ownerId, tool.toolId), tool]),
	);
	map.doc?.transact(() => {
		map.forEach((value, key) => {
			const existing = normalizeSharedToolAdvertisement(value);
			if (
				existing?.kind === 'agent' &&
				existing.ownerId === ownerId &&
				!selected.has(key)
			) {
				map.delete(key);
			}
		});
		selected.forEach((tool, key) => {
			if (JSON.stringify(map.get(key)) !== JSON.stringify(tool)) {
				map.set(key, tool);
			}
		});
	});
}

export function findTrustedSharedStorage(
	tool: SharedToolAdvertisement,
	configs: StorageConfigBlock[],
	preferences: SharedToolPreferences,
): StorageConfigBlock | undefined {
	const identity = sharedToolIdentity('storage', tool.ownerId, tool.toolId);
	const acceptedIds = new Set(
		Object.entries(preferences.decisions)
			.filter(
				([key, decision]) =>
					key.startsWith(`${identity}:`) && decision.decision === 'accepted',
			)
			.map(([, decision]) => decision.localId),
	);
	const fingerprint = sharedToolConfigFingerprint(tool.config);
	return configs.find((config) => {
		if (!config.enabled || sharedToolConfigFingerprint(config) !== fingerprint)
			return false;
		const origin =
			preferences.origins[localSharedToolKey('storage', config.id)];
		if (origin)
			return origin.ownerId === tool.ownerId && origin.toolId === tool.toolId;
		return acceptedIds.has(config.id);
	});
}

export function classifySharedToolConflict(
	tool: Pick<SharedToolAdvertisement, 'toolId' | 'name' | 'config'>,
	localConfigs: ToolConfigBlock[],
): SharedToolConflict {
	const sameId = localConfigs.find((config) => config.id === tool.toolId);
	if (sameId) {
		return {
			kind:
				sharedToolConfigFingerprint(sameId) ===
				sharedToolConfigFingerprint(tool.config)
					? 'same-id-same-config'
					: 'same-id-different-config',
			localId: sameId.id,
		};
	}

	const normalizedName = tool.name.trim().toLowerCase();
	if (normalizedName) {
		const sameName = localConfigs.find(
			(config) => config.name.trim().toLowerCase() === normalizedName,
		);
		if (sameName) {
			return { kind: 'same-name', localId: sameName.id };
		}
	}

	return { kind: 'none' };
}
