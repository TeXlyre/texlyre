// src/utils/sharedToolsUtils.ts
import type { Awareness } from 'y-protocols/awareness';

import type { ToolConfigBlock } from '../types/toolConfig';
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
	normalizeLspConfig,
	normalizeStorageConfig,
	normalizeTypesetterConfig,
} from './toolConfigUtils';

export const SHARED_TOOL_PREFERENCES_SETTING = 'shared-tool-preferences';
export const SHARED_TOOLS_AWARENESS_FIELD = 'sharedTools';

export const EMPTY_SHARED_TOOL_PREFERENCES: SharedToolPreferences = {
	shareWithAll: {},
	shareProjectTools: {},
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

export function selectAdvertisedTools(
	tools: SharedLocalTool[],
	shareProjectTools: boolean,
): SharedLocalTool[] {
	const selected = new Map<string, SharedLocalTool>();
	for (const tool of tools) {
		const sharedWithAll = tool.kind !== 'storage' && tool.sharedWithAll;
		const sharedWithProject =
			tool.usedByProject && (tool.projectShared ?? shareProjectTools);
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
	return rest;
};

export function sharedToolConfigFingerprint(config: ToolConfigBlock): string {
	return hashString(JSON.stringify(configWithoutDisplayFields(config)));
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
	config: ToolConfigBlock,
	toolId: string,
): ToolConfigBlock {
	const shared = {
		...config,
		id: toolId,
		enabled: true,
	} as ToolConfigBlock & { icon?: string };
	delete shared.icon;
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
	const sharedConfig = canonicalSharedConfig(config, resolvedOrigin.toolId);

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
			value.kind !== 'storage') ||
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

	const config = canonicalSharedConfig(normalized, value.toolId);
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
			if (!tool || tool.ownerId === currentUserId) continue;

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
