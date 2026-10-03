// src/types/storage.ts
import type { TransportConfig } from '@chelys/types/transport';
import type { ProjectGroup } from './projects';

export const STORAGE_PROTOCOL = 'texlyre-storage';
export const STORAGE_PROTOCOL_VERSION = 1;

export interface StorageConfigBlock {
	id: string;
	name: string;
	enabled: boolean;
	icon?: string;
	transportConfig: TransportConfig;
}

export interface StorageHelloResult {
	protocol: typeof STORAGE_PROTOCOL;
	version: typeof STORAGE_PROTOCOL_VERSION;
	chunkSize: number;
	maxBufferedSize: number;
}

export interface StorageCommitHeadResult {
	head: string;
}

export interface StorageProtocolFailure {
	code: string;
	message: string;
	head?: string | null;
}

export interface WrappedStorageKey {
	version: 1;
	iv: string;
	wrapped: string;
}

export interface ProjectStorageBinding {
	providerId: string;
	storageProjectId: string;
	baseRevision?: string;
	enabled: boolean;
	shareWithCollaborators?: boolean;
	lastSync?: number;
}

export interface StorageRevisionEntry {
	objectId: string;
	hash: string;
	size: number;
}

export interface StorageRevisionManifest {
	version: 1;
	revisionId: string;
	parentRevision: string | null;
	createdAt: number;
	entries: Record<string, StorageRevisionEntry>;
}

export interface StorageCatalogueProject {
	localProjectId: string;
	storageProjectId: string;
	name: string;
	description?: string;
	type: string;
	group?: ProjectGroup;
	compilerId?: string;
	createdAt?: number;
	updatedAt: number;
	tags?: string[];
	isFavorite?: boolean;
	docUrl?: string;
	wrappedProjectKey: WrappedStorageKey;
}

export interface StorageCatalogue {
	version: 1;
	projects: StorageCatalogueProject[];
}

export interface StorageCatalogueEnvelope {
	version: 1;
	wrappedAccountKey: WrappedStorageKey;
	ciphertext: string;
}

export type StorageProjectStatus =
	| 'synced'
	| 'syncing'
	| 'local-only'
	| 'stored'
	| 'updates-available'
	| 'conflict'
	| 'unavailable'
	| 'error';

export interface StorageDashboardProject {
	providerId: string;
	storageProjectId: string;
	localProjectId: string;
	name: string;
	description: string;
	type: string;
	group?: ProjectGroup;
	compilerId?: string;
	createdAt: number;
	updatedAt: number;
	tags: string[];
	isFavorite: boolean;
	docUrl?: string;
	status: StorageProjectStatus;
	lastSync?: number;
	remoteOnly: boolean;
	error?: string;
}

export interface StorageSyncResult {
	status: 'synced' | 'unchanged' | 'pulled' | 'merged';
	revision: string | null;
	uploadedObjects: number;
}
