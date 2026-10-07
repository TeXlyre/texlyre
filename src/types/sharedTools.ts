// src/types/sharedTools.ts
import type { ToolConfigBlock } from './toolConfig';

export type SharedToolKind = 'typesetter' | 'lsp' | 'storage';
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
}

export interface SharedByMeTool extends SharedLocalTool {
	scope: 'all' | 'project';
}
