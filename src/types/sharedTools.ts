// src/types/sharedTools.ts
import type { ACPServerConfig } from './acp';
import type { ToolConfigBlock } from './toolConfig';

export type SharedToolKind = 'typesetter' | 'lsp' | 'storage' | 'agent';
export type SharedToolDecisionState = 'accepted' | 'ignored';

export interface SharedToolOrigin {
	ownerId: string;
	ownerName: string;
	toolId: string;
}

export interface SharedToolDecision {
	decision: SharedToolDecisionState;
	revision: string;
	localId?: string;
	imported?: boolean;
}

export interface SharedToolPreferences {
	shareWithAll: Record<string, true>;
	shareProjectTools: Record<string, true>;
	// Agents shared in a project, keyed by projectAgentKey. Agents are only
	// shared one by one, never along with the project's other tools.
	shareProjectAgents: Record<string, true>;
	decisions: Record<string, SharedToolDecision>;
	origins: Record<string, SharedToolOrigin>;
}

export interface SharedStorageAttachment {
	storageProjectId: string;
	baseRevision?: string;
}

export interface SharedToolAdvertisement extends SharedToolOrigin {
	kind: SharedToolKind;
	name: string;
	revision: string;
	config: ToolConfigBlock;
	storage?: SharedStorageAttachment;
}

export interface ObservedSharedTool extends SharedToolAdvertisement {
	advertiserId: string;
	advertiserName: string;
}

export type SharedToolConflictKind =
	| 'none'
	| 'same-id-same-config'
	| 'same-id-different-config'
	| 'same-name';

export interface SharedToolConflict {
	kind: SharedToolConflictKind;
	localId?: string;
}

export interface SharedToolOffer extends ObservedSharedTool {
	identity: string;
	conflict: SharedToolConflict;
	status: 'new' | 'update' | 'accepted' | 'ignored' | 'using-existing';
	localId?: string;
}

export interface SharedLocalTool {
	kind: SharedToolKind;
	config: ToolConfigBlock;
	shareable: boolean;
	shareMessage?: string;
	sharedWithAll: boolean;
	usedByProject: boolean;
	projectShared?: boolean;
	storage?: SharedStorageAttachment;
	// For agents: chosen to be shared in this project.
	sharedInProject?: boolean;
}

export interface SharedByMeTool extends SharedLocalTool {
	scope: 'all' | 'project';
}

// A collaborator's agent this user accepted, usable while its owner shares
// it. The config id is namespaced (see sharedAgentId) so it never clashes with
// the user's own agents.
export interface SharedAgent {
	identity: string;
	ownerId: string;
	ownerName: string;
	config: ACPServerConfig;
}
