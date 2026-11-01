// src/services/StorageSyncService.ts
import { nanoid } from 'nanoid';

import { createNamedLogger } from '@/logging';
import { t } from '@/i18n';
import type { Project } from '../types/projects';
import {
	fromBase64Url,
	isBinaryFile,
	toArrayBuffer,
	toBase64Url,
	toBytes,
} from '../utils/fileUtils';
import { stripAnnotationTagsWithSpans } from '../utils/annotationTagUtils';
import type {
	ProjectStorageBinding,
	StorageCatalogue,
	StorageCatalogueEnvelope,
	StorageCatalogueProject,
	StorageDashboardProject,
	StorageRevisionManifest,
	StorageSyncResult,
	WrappedStorageKey,
} from '../types/storage';
import {
	decryptStorageBytes,
	encryptStorageBytes,
	exportProjectStorageKey,
	generateAccountStorageKey,
	generateProjectStorageKey,
	importProjectStorageKey,
	unwrapAccountStorageKey,
	unwrapProjectStorageKey,
	wrapAccountStorageKey,
	wrapProjectStorageKey,
} from '../utils/storageEncryptionUtils';
import { authService } from './AuthService';
import {
	UnifiedDataStructureService,
	type BackupLayoutService,
	type DocumentMetadata,
	type FileMetadata,
	type ProjectMetadata,
} from './BackupLayoutService';
import { chelysService } from './ChelysService';
import {
	genericStorageService,
	StorageProtocolError,
} from './GenericStorageService';
import { ProjectDataService } from './ProjectDataService';
import {
	notificationService,
	shouldShowNotification,
} from './NotificationService';
import {
	mergeResolutionService,
	type ConflictResolution,
	type FileConflict,
} from './MergeResolutionService';

const moduleLog = createNamedLogger('StorageSyncService');

const AUTO_SYNC_DELAY = 2000;
const AUTO_SYNC_RETRY_DELAY = 250;
const CATALOGUE_PURPOSE = 'catalogue';
const REVISION_PURPOSE = (revisionId: string): string =>
	`revision-manifest:${revisionId}`;
const OBJECT_PURPOSE = (objectId: string): string => `object:${objectId}`;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type StorageClient = Pick<
	typeof genericStorageService,
	| 'getCatalogue'
	| 'putCatalogue'
	| 'getHead'
	| 'getRevision'
	| 'getObject'
	| 'putObject'
	| 'commitHead'
	| 'registerOwner'
	| 'deleteProject'
>;

interface StringStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

interface SnapshotEntry {
	bytes: Uint8Array;
	hashBytes: Uint8Array;
}

interface LoadedCatalogue {
	accountKey: CryptoKey;
	envelope: StorageCatalogueEnvelope;
	catalogue: StorageCatalogue;
}

interface StorageAutoSyncState {
	userId: string;
	projectId: string;
	timer: ReturnType<typeof setTimeout> | null;
	running: boolean;
	dirty: boolean;
	retryCount: number;
}

export interface StorageSyncServiceOptions {
	storageService?: StorageClient;
	dataSerializer?: Pick<
		ProjectDataService,
		| 'serializeProjectDocuments'
		| 'serializeProjectFiles'
		| 'deserializeToIndexedDB'
	>;
	unifiedService?: UnifiedDataStructureService;
	getProjectById?: (projectId: string) => Promise<Project | null>;
	getProjectsByUser?: (userId: string) => Promise<Project[]>;
	updateProject?: (project: Project) => Promise<void>;
	getWrappingKey?: () => CryptoKey | null;
	persistence?: StringStorage;
}

export class StorageRemoteAheadError extends Error {
	readonly remoteHead: string | null;

	constructor(remoteHead: string | null) {
		super('Remote storage has moved beyond the local base revision');
		this.name = 'StorageRemoteAheadError';
		this.remoteHead = remoteHead;
	}
}

const encodeJson = (value: unknown): Uint8Array =>
	encoder.encode(JSON.stringify(value, null, 2));

const sha256 = async (bytes: Uint8Array): Promise<string> => {
	const digest = new Uint8Array(
		await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes)),
	);
	return toBase64Url(digest);
};

const cleanRelativePath = (path: string): string =>
	path.startsWith('/') ? path.slice(1) : path;

const stripVolatileProjectMetadata = <T extends Record<string, unknown>>(
	metadata: T,
): Record<string, unknown> => {
	const stable = { ...metadata };
	delete stable.lastSync;
	delete stable.exportedAt;
	return stable;
};

const stripVolatileDocumentMetadata = (
	documents: DocumentMetadata[],
): Record<string, unknown>[] =>
	documents.map((document) => {
		const stable = { ...document } as Record<string, unknown>;
		delete stable.lastModified;
		return stable;
	});

const isCatalogue = (value: unknown): value is StorageCatalogue => {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<StorageCatalogue>;
	return candidate.version === 1 && Array.isArray(candidate.projects);
};

const isCatalogueEnvelope = (
	value: unknown,
): value is StorageCatalogueEnvelope => {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<StorageCatalogueEnvelope>;
	return (
		candidate.version === 1 &&
		!!candidate.wrappedAccountKey &&
		typeof candidate.ciphertext === 'string'
	);
};

const isRevisionManifest = (
	value: unknown,
): value is StorageRevisionManifest => {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<StorageRevisionManifest>;
	return (
		candidate.version === 1 &&
		typeof candidate.revisionId === 'string' &&
		!!candidate.entries &&
		typeof candidate.entries === 'object'
	);
};

export class StorageSyncService {
	private readonly storageService: StorageClient;
	private readonly dataSerializer: Pick<
		ProjectDataService,
		| 'serializeProjectDocuments'
		| 'serializeProjectFiles'
		| 'deserializeToIndexedDB'
	>;
	private readonly unifiedService: UnifiedDataStructureService;
	private readonly getProjectById: (
		projectId: string,
	) => Promise<Project | null>;
	private readonly getProjectsByUser: (userId: string) => Promise<Project[]>;
	private readonly updateProject: (project: Project) => Promise<void>;
	private readonly getWrappingKey: () => CryptoKey | null;
	private readonly persistence: StringStorage;
	private readonly projectSyncs = new Map<string, Promise<StorageSyncResult>>();
	private readonly deletingProjects = new Set<string>();
	private readonly autoSyncs = new Map<string, StorageAutoSyncState>();
	private readonly autoSyncFailures = new Set<string>();

	constructor(options: StorageSyncServiceOptions = {}) {
		this.storageService = options.storageService ?? genericStorageService;
		this.dataSerializer = options.dataSerializer ?? new ProjectDataService();
		this.unifiedService =
			options.unifiedService ?? new UnifiedDataStructureService();
		this.getProjectById =
			options.getProjectById ??
			((projectId) => authService.getProjectById(projectId));
		this.getProjectsByUser =
			options.getProjectsByUser ??
			((userId) => authService.getProjectsByUser(userId));
		this.updateProject =
			options.updateProject ??
			(async (project) => {
				await authService.createOrUpdateProject(project, false);
			});
		this.getWrappingKey =
			options.getWrappingKey ?? (() => chelysService.getStorageWrappingKey());
		this.persistence = options.persistence ?? localStorage;
	}

	getProjectBinding(
		userId: string,
		projectId: string,
	): ProjectStorageBinding | null {
		return this.readBindings(userId)[projectId] ?? null;
	}

	attachProject(
		userId: string,
		projectId: string,
		providerId: string,
	): ProjectStorageBinding {
		const bindings = this.readBindings(userId);
		const existing = bindings[projectId];
		if (existing) {
			if (existing.providerId !== providerId) {
				throw new Error(
					'Project is already attached to another storage provider',
				);
			}
			return existing;
		}

		const binding: ProjectStorageBinding = {
			providerId,
			storageProjectId: nanoid(32),
			enabled: true,
		};
		bindings[projectId] = binding;
		this.writeBindings(userId, bindings);
		this.clearDisconnected(userId, projectId, providerId);
		return binding;
	}

	attachSharedProject(
		userId: string,
		projectId: string,
		providerId: string,
		storageProjectId: string,
		baseRevision?: string,
	): ProjectStorageBinding {
		const bindings = this.readBindings(userId);
		const existing = bindings[projectId];
		if (
			existing &&
			(existing.providerId !== providerId ||
				existing.storageProjectId !== storageProjectId)
		) {
			throw new Error(
				'Project is already attached to another storage provider',
			);
		}

		const binding: ProjectStorageBinding = {
			...(existing ?? {}),
			providerId,
			storageProjectId,
			...(baseRevision ? { baseRevision } : {}),
			enabled: true,
		};
		bindings[projectId] = binding;
		this.writeBindings(userId, bindings);
		this.clearDisconnected(userId, projectId, providerId);
		return binding;
	}

	getProjectBindings(userId: string): Record<string, ProjectStorageBinding> {
		return { ...this.readBindings(userId) };
	}

	setProjectStorageEnabled(
		userId: string,
		projectId: string,
		enabled: boolean,
	): ProjectStorageBinding | null {
		const binding = this.getProjectBinding(userId, projectId);
		if (!binding) return null;
		const next = { ...binding, enabled };
		this.updateBinding(userId, projectId, next);
		return next;
	}

	setShareWithCollaborators(
		userId: string,
		projectId: string,
		enabled: boolean,
	): ProjectStorageBinding | null {
		const binding = this.getProjectBinding(userId, projectId);
		if (!binding) return null;
		const next = { ...binding, shareWithCollaborators: enabled };
		this.updateBinding(userId, projectId, next);
		return next;
	}

	async storeSharedProjectKey(
		userId: string,
		projectId: string,
		rawKey: Uint8Array,
	): Promise<void> {
		const binding = this.getProjectBinding(userId, projectId);
		if (!binding) throw new Error('Project is not attached to shared storage');
		const wrappingKey = this.getWrappingKey();
		if (!wrappingKey) throw new Error('Storage credentials are not unlocked');

		const { accountKey } = await this.getOrCreateAccountKey(
			userId,
			wrappingKey,
		);
		const projectKey = await importProjectStorageKey(rawKey);
		const wrapped = await wrapProjectStorageKey(projectKey, accountKey);
		const keys = this.readSharedProjectKeys(userId);
		keys[this.sharedProjectKeyId(binding)] = wrapped;
		this.writeSharedProjectKeys(userId, keys);
	}

	async exportProjectKeyForSharing(
		userId: string,
		projectId: string,
	): Promise<Uint8Array> {
		const binding = this.getProjectBinding(userId, projectId);
		if (
			!binding ||
			!binding.enabled ||
			binding.shareWithCollaborators !== true
		) {
			throw new Error('Storage sharing is not enabled for this project');
		}
		const wrappingKey = this.getWrappingKey();
		if (!wrappingKey) throw new Error('Storage credentials are not unlocked');

		const localSharedKey = await this.loadSharedProjectKey(
			userId,
			binding,
			wrappingKey,
		);
		if (localSharedKey) return exportProjectStorageKey(localSharedKey);

		const loaded = await this.loadCatalogue(
			userId,
			binding.providerId,
			wrappingKey,
		);
		const entry = loaded.catalogue.projects.find(
			(project) => project.storageProjectId === binding.storageProjectId,
		);
		if (!entry) throw new Error('Stored project key is unavailable');
		const projectKey = await unwrapProjectStorageKey(
			entry.wrappedProjectKey,
			loaded.accountKey,
		);
		return exportProjectStorageKey(projectKey);
	}

	async disconnectBoundProject(
		userId: string,
		projectId: string,
	): Promise<void> {
		const binding = this.getProjectBinding(userId, projectId);
		if (!binding) return;
		const key = `${userId}:${projectId}`;
		const auto = this.autoSyncs.get(key);
		if (auto?.timer) clearTimeout(auto.timer);
		this.autoSyncs.delete(key);
		const active = this.projectSyncs.get(
			`${userId}:${projectId}:${binding.providerId}`,
		);
		if (active) await active.catch(() => undefined);
		const latest = this.getProjectBinding(userId, projectId);
		if (
			latest?.providerId === binding.providerId &&
			latest.storageProjectId === binding.storageProjectId
		) {
			this.disconnectProject(userId, projectId);
		}
	}

	disconnectProject(userId: string, projectId: string): void {
		const bindings = this.readBindings(userId);
		const binding = bindings[projectId];
		if (!binding) return;
		delete bindings[projectId];
		this.writeBindings(userId, bindings);
		this.markDisconnected(userId, projectId, binding.providerId);
		const auto = this.autoSyncs.get(`${userId}:${projectId}`);
		if (auto?.timer) clearTimeout(auto.timer);
		this.autoSyncs.delete(`${userId}:${projectId}`);
		this.autoSyncFailures.delete(`${userId}:${projectId}`);

		const stillUsed = Object.values(bindings).some(
			(candidate) =>
				candidate.providerId === binding.providerId &&
				candidate.storageProjectId === binding.storageProjectId,
		);
		if (!stillUsed) {
			const keys = this.readSharedProjectKeys(userId);
			delete keys[this.sharedProjectKeyId(binding)];
			this.writeSharedProjectKeys(userId, keys);
		}
	}

	async reconnectProject(
		userId: string,
		projectId: string,
		providerId: string,
		storageProjectId: string,
	): Promise<void> {
		const project = await this.getProjectById(projectId);
		if (!project || project.ownerId !== userId)
			throw new Error('Local project not found');
		if (this.getProjectBinding(userId, projectId)) {
			throw new Error('Project is already attached to storage');
		}
		const wrappingKey = this.getWrappingKey();
		if (!wrappingKey) throw new Error('Storage credentials are not unlocked');
		const loaded = await this.loadCatalogue(userId, providerId, wrappingKey);
		if (
			!loaded.catalogue.projects.some(
				(entry) =>
					entry.localProjectId === projectId &&
					entry.storageProjectId === storageProjectId,
			)
		)
			throw new Error('Stored project not found in catalogue');
		this.attachSharedProject(userId, projectId, providerId, storageProjectId);
	}

	async deleteRemoteProjects(
		userId: string,
		providerId: string,
		storageProjectIds: string[],
	): Promise<void> {
		const ids = new Set(storageProjectIds);
		if (ids.size === 0) return;
		const bindings = this.getProjectBindings(userId);
		const affected = Object.entries(bindings).filter(
			([, binding]) =>
				binding.providerId === providerId && ids.has(binding.storageProjectId),
		);
		const syncKeys = affected.map(
			([projectId]) => `${userId}:${projectId}:${providerId}`,
		);

		for (const key of syncKeys) this.deletingProjects.add(key);
		for (const [projectId] of affected) {
			const auto = this.autoSyncs.get(`${userId}:${projectId}`);
			if (auto?.timer) clearTimeout(auto.timer);
			this.autoSyncs.delete(`${userId}:${projectId}`);
		}
		try {
			await Promise.all(
				syncKeys
					.map((key) => this.projectSyncs.get(key))
					.filter((sync): sync is Promise<StorageSyncResult> => !!sync)
					.map((sync) => sync.catch(() => undefined)),
			);
			const wrappingKey = this.getWrappingKey();
			if (!wrappingKey) throw new Error('Storage credentials are not unlocked');
			const loaded = await this.loadCatalogue(userId, providerId, wrappingKey);
			const present = loaded.catalogue.projects.filter((entry) =>
				ids.has(entry.storageProjectId),
			);
			if (present.length !== ids.size)
				throw new Error('Some remote projects are no longer in the catalogue');
			if (present.some((entry) => !entry.deletionKey)) {
				throw new Error(
					'Cannot securely delete this older project: server-side ownership was not registered when it was created',
				);
			}
			for (const id of ids) {
				const entry = present.find(
					(candidate) => candidate.storageProjectId === id,
				)!;
				await this.storageService.deleteProject(
					providerId,
					id,
					entry.deletionKey!,
				);
				loaded.catalogue.projects = loaded.catalogue.projects.filter(
					(entry) => entry.storageProjectId !== id,
				);
				await this.saveCatalogue(providerId, loaded);
				for (const [projectId, binding] of Object.entries(
					this.getProjectBindings(userId),
				)) {
					if (
						binding.providerId === providerId &&
						binding.storageProjectId === id
					) {
						this.disconnectProject(userId, projectId);
					}
				}
			}
		} finally {
			for (const key of syncKeys) this.deletingProjects.delete(key);
		}
	}

	private disconnectedKey(userId: string): string {
		return `texlyre-user-${userId}-storage-disconnected`;
	}

	private readDisconnected(userId: string): Record<string, string[]> {
		try {
			const parsed: unknown = JSON.parse(
				this.persistence.getItem(this.disconnectedKey(userId)) || '{}',
			);
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
				return {};
			const result: Record<string, string[]> = {};
			for (const [projectId, providers] of Object.entries(parsed)) {
				if (Array.isArray(providers))
					result[projectId] = providers.filter(
						(v): v is string => typeof v === 'string',
					);
			}
			return result;
		} catch {
			return {};
		}
	}

	private markDisconnected(
		userId: string,
		projectId: string,
		providerId: string,
	): void {
		const disconnected = this.readDisconnected(userId);
		disconnected[projectId] = [
			...new Set([...(disconnected[projectId] ?? []), providerId]),
		];
		this.persistence.setItem(
			this.disconnectedKey(userId),
			JSON.stringify(disconnected),
		);
	}

	private clearDisconnected(
		userId: string,
		projectId: string,
		providerId: string,
	): void {
		const disconnected = this.readDisconnected(userId);
		if (!disconnected[projectId]?.includes(providerId)) return;
		disconnected[projectId] = disconnected[projectId].filter(
			(id) => id !== providerId,
		);
		if (disconnected[projectId].length === 0) delete disconnected[projectId];
		this.persistence.setItem(
			this.disconnectedKey(userId),
			JSON.stringify(disconnected),
		);
	}

	private isDisconnected(
		userId: string,
		projectId: string,
		providerId: string,
	): boolean {
		return (
			this.readDisconnected(userId)[projectId]?.includes(providerId) ?? false
		);
	}

	async checkBoundProjectRevision(
		userId: string,
		projectId: string,
	): Promise<{
		status: 'synced' | 'local-only' | 'updates-available' | 'unavailable';
		revision: string | null;
	} | null> {
		const binding = this.getProjectBinding(userId, projectId);
		if (!binding) return null;
		if (!binding.enabled) return { status: 'unavailable', revision: null };

		const head = await this.storageService.getHead(
			binding.providerId,
			binding.storageProjectId,
		);

		const latest = this.getProjectBinding(userId, projectId);
		if (
			!latest ||
			latest.providerId !== binding.providerId ||
			latest.storageProjectId !== binding.storageProjectId
		)
			return null;
		if (!latest.enabled) return { status: 'unavailable', revision: head };

		if (
			latest.baseRevision !== binding.baseRevision &&
			head !== latest.baseRevision
		) {
			return null;
		}
		return {
			status: !head
				? 'local-only'
				: latest.baseRevision === head
					? 'synced'
					: 'updates-available',
			revision: head,
		};
	}

	syncBoundProject(
		userId: string,
		projectId: string,
	): Promise<StorageSyncResult> {
		const binding = this.getProjectBinding(userId, projectId);
		if (!binding) throw new Error('Project is not attached to storage');
		return this.syncProject(userId, projectId, binding.providerId);
	}

	scheduleBoundProjectSync(userId: string, projectId: string): void {
		const binding = this.getProjectBinding(userId, projectId);
		if (
			!binding?.enabled ||
			this.deletingProjects.has(`${userId}:${projectId}:${binding.providerId}`)
		)
			return;

		const key = `${userId}:${projectId}`;
		let state = this.autoSyncs.get(key);
		if (!state) {
			state = {
				userId,
				projectId,
				timer: null,
				running: false,
				dirty: false,
				retryCount: 0,
			};
			this.autoSyncs.set(key, state);
		}

		state.dirty = true;
		state.retryCount = 0;
		if (state.timer) clearTimeout(state.timer);
		state.timer = setTimeout(
			() => void this.flushBoundProjectAutoSync(key),
			AUTO_SYNC_DELAY,
		);
	}

	private async flushBoundProjectAutoSync(key: string): Promise<void> {
		const state = this.autoSyncs.get(key);
		if (!state) return;
		state.timer = null;

		if (state.running) {
			state.dirty = true;
			return;
		}

		const binding = this.getProjectBinding(state.userId, state.projectId);
		if (!binding?.enabled) {
			this.autoSyncs.delete(key);
			return;
		}

		state.running = true;
		state.dirty = false;
		let retryDelay = 0;
		try {
			await this.syncBoundProject(state.userId, state.projectId);
			state.retryCount = 0;
			this.autoSyncFailures.delete(key);
		} catch (error) {
			if (
				error instanceof StorageRemoteAheadError &&
				error.remoteHead &&
				state.retryCount < 1
			) {
				state.retryCount += 1;
				state.dirty = true;
				retryDelay = AUTO_SYNC_RETRY_DELAY;
			} else {
				moduleLog.warn('Automatic storage sync failed:', error);

				const connectionFailed =
					this.storageService === genericStorageService &&
					genericStorageService.getConnectionStatus(binding.providerId) !==
					'connected';
				if (!connectionFailed && !this.autoSyncFailures.has(key)) {
					this.autoSyncFailures.add(key);
					if (shouldShowNotification('storage-notifications', 'error')) {
						notificationService.showError(
							t('Automatic remote storage sync failed'),
						);
					}
				}
			}
		} finally {
			state.running = false;
			if (state.dirty && !state.timer) {
				state.timer = setTimeout(
					() => void this.flushBoundProjectAutoSync(key),
					retryDelay,
				);
			} else if (!state.dirty && !state.timer) {
				this.autoSyncs.delete(key);
			}
		}
	}

	async reconcileProjectBinding(
		userId: string,
		projectId: string,
	): Promise<StorageDashboardProject | null> {
		const binding = this.getProjectBinding(userId, projectId);
		const project = await this.getProjectById(projectId);
		if (!binding || !project || project.ownerId !== userId) return null;

		let status: StorageDashboardProject['status'];
		if (!binding.enabled) {
			status = 'unavailable';
		} else {
			const head = await this.storageService.getHead(
				binding.providerId,
				binding.storageProjectId,
			);
			if (!head) status = 'local-only';
			else if (binding.baseRevision === head) status = 'synced';
			else status = 'updates-available';
		}

		return {
			providerId: binding.providerId,
			storageProjectId: binding.storageProjectId,
			localProjectId: project.id,
			name: project.name,
			description: project.description,
			type: project.type,
			group: project.group,
			compilerId: project.compilerId,
			createdAt: project.createdAt,
			updatedAt: project.updatedAt,
			tags: project.tags,
			isFavorite: project.isFavorite,
			docUrl: project.docUrl,
			status,
			lastSync: binding.lastSync,
			remoteOnly: false,
		};
	}

	async reconcileProvider(
		userId: string,
		providerId: string,
	): Promise<StorageDashboardProject[]> {
		const wrappingKey = this.getWrappingKey();
		if (!wrappingKey) throw new Error('Storage credentials are not unlocked');

		const [loaded, localProjects] = await Promise.all([
			this.loadCatalogue(userId, providerId, wrappingKey),
			this.getProjectsByUser(userId),
		]);
		const localById = new Map(
			localProjects.map((project) => [project.id, project]),
		);
		const bindings = this.readBindings(userId);
		const seenLocal = new Set<string>();
		const result: StorageDashboardProject[] = [];

		for (const entry of loaded.catalogue.projects) {
			const local = localById.get(entry.localProjectId);
			let binding = local ? bindings[local.id] : undefined;
			if (
				local &&
				!this.isDisconnected(userId, local.id, providerId) &&
				(!binding || binding.providerId === providerId)
			) {
				if (!binding) {
					binding = {
						providerId,
						storageProjectId: entry.storageProjectId,
						enabled: true,
					};
					this.updateBinding(userId, local.id, binding);
				} else if (binding.storageProjectId !== entry.storageProjectId) {
					binding = { ...binding, storageProjectId: entry.storageProjectId };
					this.updateBinding(userId, local.id, binding);
				}
			}

			const head = await this.storageService.getHead(
				providerId,
				entry.storageProjectId,
			);
			if (!head && !local) continue;
			if (local) seenLocal.add(local.id);

			let status: StorageDashboardProject['status'];
			if (!local) status = 'stored';
			else if (!binding && this.isDisconnected(userId, local.id, providerId))
				status = 'disconnected';
			else if (!binding || binding.providerId !== providerId) status = 'error';
			else if (!binding.enabled) status = 'unavailable';
			else if (!head) status = 'local-only';
			else if (binding.baseRevision === head) status = 'synced';
			else status = 'updates-available';

			result.push(
				this.toDashboardProject(
					providerId,
					entry,
					status,
					!local,
					binding?.lastSync,
					local,
				),
			);
		}

		for (const local of localProjects) {
			const binding = bindings[local.id];
			if (
				!binding ||
				binding.providerId !== providerId ||
				seenLocal.has(local.id)
			) {
				continue;
			}
			const missingEntry =
				binding.enabled &&
				(!!binding.baseRevision ||
					!!(await this.storageService.getHead(
						providerId,
						binding.storageProjectId,
					)));
			result.push({
				providerId,
				storageProjectId: binding.storageProjectId,
				localProjectId: local.id,
				name: local.name,
				description: local.description,
				type: local.type,
				group: local.group,
				compilerId: local.compilerId,
				createdAt: local.createdAt,
				updatedAt: local.updatedAt,
				tags: local.tags,
				isFavorite: local.isFavorite,
				docUrl: local.docUrl,
				status: !binding.enabled
					? 'unavailable'
					: missingEntry
						? 'error'
						: 'local-only',
				lastSync: binding.lastSync,
				remoteOnly: false,
				error: missingEntry
					? 'Project storage entry is missing from the remote catalogue'
					: undefined,
			});
		}

		return result;
	}

	async restoreRemoteProject(
		userId: string,
		providerId: string,
		storageProjectId: string,
	): Promise<Project> {
		const wrappingKey = this.getWrappingKey();
		if (!wrappingKey) throw new Error('Storage credentials are not unlocked');
		const loaded = await this.loadCatalogue(userId, providerId, wrappingKey);
		const entry = loaded.catalogue.projects.find(
			(project) => project.storageProjectId === storageProjectId,
		);
		if (!entry) throw new Error('Stored project not found in catalogue');
		if (await this.getProjectById(entry.localProjectId)) {
			throw new Error('Project already exists locally');
		}

		const head = await this.storageService.getHead(
			providerId,
			storageProjectId,
		);
		if (!head) throw new Error('Stored project has no revision');
		const projectKey = await unwrapProjectStorageKey(
			entry.wrappedProjectKey,
			loaded.accountKey,
		);
		const manifest = await this.loadRevisionManifest(
			providerId,
			storageProjectId,
			head,
			projectKey,
		);
		const snapshot = await this.loadSnapshot(
			providerId,
			storageProjectId,
			manifest,
			projectKey,
		);
		const metadataPath = this.unifiedService.getProjectMetadataPath(
			entry.localProjectId,
		);
		const metadataEntry = snapshot.get(metadataPath);
		if (!metadataEntry) throw new Error('Stored project metadata is missing');
		const parsed = JSON.parse(
			decoder.decode(metadataEntry.bytes),
		) as ProjectMetadata;
		const project = this.unifiedService.convertMetadataToProject({
			...parsed,
			id: entry.localProjectId,
			ownerId: userId,
			docUrl: parsed.docUrl || entry.docUrl || `yjs:${entry.localProjectId}`,
		});

		await this.applyProjectSnapshot(userId, project, snapshot);
		this.updateBinding(userId, project.id, {
			providerId,
			storageProjectId,
			baseRevision: head,
			enabled: true,
			lastSync: Date.now(),
		});
		this.clearDisconnected(userId, project.id, providerId);
		return (await this.getProjectById(project.id)) ?? project;
	}

	syncProject(
		userId: string,
		projectId: string,
		providerId: string,
	): Promise<StorageSyncResult> {
		const key = `${userId}:${projectId}:${providerId}`;
		if (this.deletingProjects.has(key)) {
			throw new Error('Remote project deletion is in progress');
		}
		const active = this.projectSyncs.get(key);
		if (active) return active;

		const sync = this.performSync(userId, projectId, providerId)
			.then((result) => {
				if (
					typeof document !== 'undefined' &&
					typeof CustomEvent !== 'undefined'
				) {
					document.dispatchEvent(
						new CustomEvent('storage-project-synced', {
							detail: { userId, projectId },
						}),
					);
				}
				return result;
			})
			.finally(() => {
				if (this.projectSyncs.get(key) === sync) this.projectSyncs.delete(key);
			});
		this.projectSyncs.set(key, sync);
		return sync;
	}

	private async performSync(
		userId: string,
		projectId: string,
		providerId: string,
	): Promise<StorageSyncResult> {
		const project = await this.getProjectById(projectId);
		if (!project || project.ownerId !== userId) {
			throw new Error('Project not found');
		}

		const binding = this.attachProject(userId, projectId, providerId);
		if (!binding.enabled) throw new Error('Project storage is disabled');

		const wrappingKey = this.getWrappingKey();
		if (!wrappingKey) {
			throw new Error('Storage credentials are not unlocked');
		}

		const sharedProjectKey = await this.loadSharedProjectKey(
			userId,
			binding,
			wrappingKey,
		);
		const projectKey = sharedProjectKey
			? sharedProjectKey
			: await this.ensureProjectKey(
				providerId,
				userId,
				project,
				binding,
				await this.loadCatalogue(userId, providerId, wrappingKey),
			);

		const [remoteHead, localSnapshot] = await Promise.all([
			this.storageService.getHead(providerId, binding.storageProjectId),
			this.serializeProject(project),
		]);
		const localHashes = await this.hashSnapshot(localSnapshot);
		const baseManifest = binding.baseRevision
			? await this.loadRevisionManifest(
				providerId,
				binding.storageProjectId,
				binding.baseRevision,
				projectKey,
			)
			: null;
		const expectedHead = binding.baseRevision ?? null;

		if (remoteHead === expectedHead) {
			if (this.matchesManifest(localHashes, baseManifest)) {
				this.touchBinding(userId, projectId, binding);
				return {
					status: 'unchanged',
					revision: binding.baseRevision ?? null,
					uploadedObjects: 0,
				};
			}
			return this.commitSnapshot(
				userId,
				projectId,
				providerId,
				binding,
				projectKey,
				remoteHead,
				baseManifest,
				localSnapshot,
				localHashes,
				'synced',
			);
		}

		if (!remoteHead) {
			throw new StorageRemoteAheadError(null);
		}
		const remoteManifest = await this.loadRevisionManifest(
			providerId,
			binding.storageProjectId,
			remoteHead,
			projectKey,
		);

		if (this.matchesManifest(localHashes, remoteManifest)) {
			this.updateBinding(userId, projectId, {
				...binding,
				baseRevision: remoteHead,
				lastSync: Date.now(),
			});
			return { status: 'unchanged', revision: remoteHead, uploadedObjects: 0 };
		}

		return this.reconcileRemoteHead(
			userId,
			project,
			providerId,
			binding,
			projectKey,
			baseManifest,
			remoteManifest,
			localSnapshot,
			localHashes,
		);
	}

	private async reconcileRemoteHead(
		userId: string,
		project: Project,
		providerId: string,
		binding: ProjectStorageBinding,
		projectKey: CryptoKey,
		baseManifest: StorageRevisionManifest | null,
		remoteManifest: StorageRevisionManifest,
		localSnapshot: Map<string, SnapshotEntry>,
		localHashes: Map<string, string>,
	): Promise<StorageSyncResult> {
		const finalSnapshot = new Map(localSnapshot);
		const conflicts: FileConflict[] = [];
		const conflictStates = new Map<
			string,
			{ local: SnapshotEntry | null; remote: SnapshotEntry | null }
		>();
		const initialResolutions = new Map<string, ConflictResolution>();
		const objectCache = new Map<string, Uint8Array>();
		const paths = new Set([
			...Object.keys(baseManifest?.entries ?? {}),
			...localSnapshot.keys(),
			...Object.keys(remoteManifest.entries),
		]);
		const projectMetadataPath = this.unifiedService.getProjectMetadataPath(
			project.id,
		);

		for (const path of [...paths].sort()) {
			const baseHash = baseManifest?.entries[path]?.hash;
			const localHash = localHashes.get(path);
			const remoteHash = remoteManifest.entries[path]?.hash;

			if (localHash === remoteHash) continue;
			if (localHash === baseHash) {
				initialResolutions.set(path, { action: 'keep-remote' });
				await this.setSnapshotFromManifest(
					finalSnapshot,
					path,
					providerId,
					binding.storageProjectId,
					remoteManifest,
					projectKey,
					objectCache,
				);
				continue;
			}
			if (remoteHash === baseHash) {
				initialResolutions.set(path, { action: 'keep-local' });
				continue;
			}

			if (path === projectMetadataPath) continue;

			const local = localSnapshot.get(path) ?? null;
			const remote = await this.loadSnapshotEntry(
				providerId,
				binding.storageProjectId,
				path,
				remoteManifest,
				projectKey,
				objectCache,
			);
			const base = baseManifest
				? await this.loadSnapshotEntry(
					providerId,
					binding.storageProjectId,
					path,
					baseManifest,
					projectKey,
					objectCache,
				)
				: null;
			const conflict = this.createFileConflict(path, base, local, remote);
			conflicts.push(conflict);
			conflictStates.set(path, { local, remote });

			if (
				local &&
				remote &&
				!conflict.isBinary &&
				!path.endsWith('/.texlyre_metadata.json') &&
				!path.endsWith('.yjs')
			) {
				const merged = mergeResolutionService.tryAutoMerge(
					base ? decoder.decode(base.bytes) : undefined,
					decoder.decode(local.bytes),
					decoder.decode(remote.bytes),
					false,
				);
				if (merged.resolved) {
					initialResolutions.set(path, {
						action: 'merged',
						content: merged.content,
					});
				}
			}
		}

		if (conflicts.length > 0) {
			const resolutions = await mergeResolutionService.resolveConflicts(
				conflicts,
				undefined,
				{ initialResolutions },
			);
			if (!resolutions) throw new Error('Storage reconciliation cancelled');

			for (const conflict of conflicts) {
				const resolution = resolutions.get(conflict.path);
				if (!resolution) continue;
				const state = conflictStates.get(conflict.path)!;
				if (resolution.action === 'keep-local') {
					this.setSnapshotEntry(finalSnapshot, conflict.path, state.local);
				} else if (resolution.action === 'keep-remote') {
					this.setSnapshotEntry(finalSnapshot, conflict.path, state.remote);
				} else {
					this.setSnapshotEntry(
						finalSnapshot,
						conflict.path,
						this.entryFromBytes(conflict.path, toBytes(resolution.content)),
					);
				}
			}
		}

		const finalHashes = await this.hashSnapshot(finalSnapshot);
		const changedLocally = !this.hashesEqual(localHashes, finalHashes);
		if (changedLocally) {
			await this.applyProjectSnapshot(userId, project, finalSnapshot);
		}

		if (this.matchesManifest(finalHashes, remoteManifest)) {
			this.updateBinding(userId, project.id, {
				...binding,
				baseRevision: remoteManifest.revisionId,
				lastSync: Date.now(),
			});
			return {
				status: 'pulled',
				revision: remoteManifest.revisionId,
				uploadedObjects: 0,
			};
		}

		return this.commitSnapshot(
			userId,
			project.id,
			providerId,
			binding,
			projectKey,
			remoteManifest.revisionId,
			remoteManifest,
			finalSnapshot,
			finalHashes,
			'merged',
		);
	}

	private async commitSnapshot(
		userId: string,
		projectId: string,
		providerId: string,
		binding: ProjectStorageBinding,
		projectKey: CryptoKey,
		expectedHead: string | null,
		previousManifest: StorageRevisionManifest | null,
		snapshot: Map<string, SnapshotEntry>,
		hashes: Map<string, string>,
		status: 'synced' | 'merged',
	): Promise<StorageSyncResult> {
		const entries: StorageRevisionManifest['entries'] = {};
		let uploadedObjects = 0;
		for (const path of [...snapshot.keys()].sort()) {
			const snapshotEntry = snapshot.get(path)!;
			const hash = hashes.get(path)!;
			const previous = previousManifest?.entries[path];
			if (previous?.hash === hash) {
				entries[path] = previous;
				continue;
			}

			const objectId = nanoid(32);
			const encrypted = await encryptStorageBytes(
				projectKey,
				snapshotEntry.bytes,
				OBJECT_PURPOSE(objectId),
			);
			await this.storageService.putObject(
				providerId,
				binding.storageProjectId,
				objectId,
				encrypted,
			);
			entries[path] = { objectId, hash, size: snapshotEntry.bytes.byteLength };
			uploadedObjects += 1;
		}

		const revisionId = nanoid(32);
		const manifest: StorageRevisionManifest = {
			version: 1,
			revisionId,
			parentRevision: expectedHead,
			createdAt: Date.now(),
			entries,
		};
		const encryptedManifest = await encryptStorageBytes(
			projectKey,
			encodeJson(manifest),
			REVISION_PURPOSE(revisionId),
		);

		try {
			await this.storageService.commitHead(
				providerId,
				binding.storageProjectId,
				expectedHead,
				revisionId,
				encryptedManifest,
			);
		} catch (error) {
			if (
				error instanceof StorageProtocolError &&
				error.code === 'stale-head'
			) {
				throw new StorageRemoteAheadError(error.head ?? null);
			}
			throw error;
		}

		this.updateBinding(userId, projectId, {
			...binding,
			baseRevision: revisionId,
			lastSync: Date.now(),
		});
		return { status, revision: revisionId, uploadedObjects };
	}

	private async setSnapshotFromManifest(
		snapshot: Map<string, SnapshotEntry>,
		path: string,
		providerId: string,
		storageProjectId: string,
		manifest: StorageRevisionManifest,
		projectKey: CryptoKey,
		cache: Map<string, Uint8Array>,
	): Promise<void> {
		this.setSnapshotEntry(
			snapshot,
			path,
			await this.loadSnapshotEntry(
				providerId,
				storageProjectId,
				path,
				manifest,
				projectKey,
				cache,
			),
		);
	}

	private async loadSnapshotEntry(
		providerId: string,
		storageProjectId: string,
		path: string,
		manifest: StorageRevisionManifest,
		projectKey: CryptoKey,
		cache: Map<string, Uint8Array>,
	): Promise<SnapshotEntry | null> {
		const entry = manifest.entries[path];
		if (!entry) return null;
		let bytes = cache.get(entry.objectId);
		if (!bytes) {
			const encrypted = await this.storageService.getObject(
				providerId,
				storageProjectId,
				entry.objectId,
			);
			if (!encrypted) {
				throw new Error(`Storage object not found: ${entry.objectId}`);
			}
			bytes = await decryptStorageBytes(
				projectKey,
				encrypted,
				OBJECT_PURPOSE(entry.objectId),
			);
			cache.set(entry.objectId, bytes);
		}
		return this.entryFromBytes(path, bytes);
	}

	private async loadSnapshot(
		providerId: string,
		storageProjectId: string,
		manifest: StorageRevisionManifest,
		projectKey: CryptoKey,
	): Promise<Map<string, SnapshotEntry>> {
		const snapshot = new Map<string, SnapshotEntry>();
		const cache = new Map<string, Uint8Array>();
		for (const path of Object.keys(manifest.entries).sort()) {
			const entry = await this.loadSnapshotEntry(
				providerId,
				storageProjectId,
				path,
				manifest,
				projectKey,
				cache,
			);
			if (entry) snapshot.set(path, entry);
		}
		return snapshot;
	}

	private createFileConflict(
		path: string,
		base: SnapshotEntry | null,
		local: SnapshotEntry | null,
		remote: SnapshotEntry | null,
	): FileConflict {
		const binary = path.endsWith('.yjs') || isBinaryFile(path);
		const toConflictValue = (
			entry: SnapshotEntry | null,
		): string | ArrayBuffer =>
			binary
				? entry
					? toArrayBuffer(entry.bytes)
					: new ArrayBuffer(0)
				: entry
					? decoder.decode(entry.bytes)
					: '';
		const conflict: FileConflict = {
			path,
			isBinary: binary,
			localContent: toConflictValue(local),
			remoteContent: toConflictValue(remote),
			changeType: !local ? 'deleted' : !remote ? 'added' : 'modified',
		};
		if (!binary) {
			if (base) conflict.baseContent = decoder.decode(base.bytes);
			const localView = stripAnnotationTagsWithSpans(
				conflict.localContent as string,
			);
			const remoteView = stripAnnotationTagsWithSpans(
				conflict.remoteContent as string,
			);
			conflict.localViewContent = localView.content;
			conflict.remoteViewContent = remoteView.content;
			conflict.localAnnotationSpans = localView.spans;
			conflict.annotationSpans = remoteView.spans;
		}
		return conflict;
	}

	private setSnapshotEntry(
		snapshot: Map<string, SnapshotEntry>,
		path: string,
		entry: SnapshotEntry | null,
	): void {
		if (entry) snapshot.set(path, entry);
		else snapshot.delete(path);
	}

	private entryFromBytes(path: string, bytes: Uint8Array): SnapshotEntry {
		let hashBytes = bytes;
		try {
			if (/^projects\/[^/]+\/metadata\.json$/.test(path)) {
				const metadata = JSON.parse(decoder.decode(bytes)) as Record<
					string,
					unknown
				>;
				hashBytes = encodeJson(stripVolatileProjectMetadata(metadata));
			} else if (path.endsWith('/documents/.texlyre_metadata.json')) {
				const documents = JSON.parse(
					decoder.decode(bytes),
				) as DocumentMetadata[];
				hashBytes = encodeJson(stripVolatileDocumentMetadata(documents));
			}
		} catch {
			// Invalid JSON is handled when the snapshot is applied.
		}
		return { bytes, hashBytes };
	}

	private hashesEqual(a: Map<string, string>, b: Map<string, string>): boolean {
		if (a.size !== b.size) return false;
		for (const [path, hash] of a) {
			if (b.get(path) !== hash) return false;
		}
		return true;
	}

	private async applyProjectSnapshot(
		userId: string,
		project: Project,
		snapshot: Map<string, SnapshotEntry>,
	): Promise<void> {
		const projectMetadataPath = this.unifiedService.getProjectMetadataPath(
			project.id,
		);
		const metadataEntry = snapshot.get(projectMetadataPath);
		if (!metadataEntry) {
			throw new Error('Storage snapshot is missing project metadata');
		}
		const parsedMetadata = JSON.parse(
			decoder.decode(metadataEntry.bytes),
		) as ProjectMetadata;
		const metadata: ProjectMetadata = {
			...parsedMetadata,
			id: project.id,
			ownerId: userId,
			docUrl: project.docUrl,
		};
		const documents = this.parseJsonEntry<DocumentMetadata[]>(
			snapshot,
			this.unifiedService.getDocumentMetadataPath(project.id),
			[],
		);
		const fileMetadata = this.parseJsonEntry<
			(FileMetadata & { isDeleted?: boolean })[]
		>(snapshot, this.unifiedService.getFilesMetadataPath(project.id), []);
		const activeFiles = fileMetadata.filter((file) => !file.isDeleted);
		const deletedFiles = fileMetadata.filter((file) => file.isDeleted);
		const documentContents = new Map<
			string,
			{ yjsState?: Uint8Array; readableContent?: string }
		>();
		for (const document of documents) {
			const txt = snapshot.get(
				this.unifiedService.getDocumentContentPath(project.id, document.id),
			);
			const yjs = snapshot.get(
				this.unifiedService.getDocumentYjsPath(project.id, document.id),
			);
			documentContents.set(document.id, {
				readableContent: txt ? decoder.decode(txt.bytes) : undefined,
				yjsState: yjs ? yjs.bytes : undefined,
			});
		}

		const fileContents = new Map<string, ArrayBuffer | string>();
		for (const file of activeFiles) {
			if (file.type !== 'file') continue;
			const entry = snapshot.get(
				this.unifiedService.getFileContentPath(
					project.id,
					cleanRelativePath(file.path),
				),
			);
			if (!entry) continue;
			fileContents.set(
				file.path,
				file.isBinary || isBinaryFile(file.path)
					? toArrayBuffer(entry.bytes)
					: decoder.decode(entry.bytes),
			);
		}

		if (deletedFiles.length > 0) {
			const { fileStoreService } = await import('./FileStoreService');
			const actualProjectId = project.docUrl.startsWith('yjs:')
				? project.docUrl.slice(4)
				: project.docUrl;
			if (!fileStoreService.isConnectedToProject(actualProjectId)) {
				await fileStoreService.initialize(`yjs:${actualProjectId}`);
			}
			for (const file of deletedFiles) {
				await fileStoreService.deleteFileByPath(file.path, {
					showDeleteDialog: false,
					allowLinkedFileDelete: true,
				});
			}
		}

		const data: BackupLayoutService = {
			manifest: this.unifiedService.createManifest('import'),
			account: null,
			projects: [metadata],
			projectData: new Map([
				[
					project.id,
					{
						metadata,
						documents,
						files: activeFiles,
						documentContents,
						fileContents,
					},
				],
			]),
		};
		await this.updateProject(
			this.unifiedService.convertMetadataToProject(metadata),
		);
		await this.dataSerializer.deserializeToIndexedDB(
			data,
			project.id,
			project.docUrl,
		);
	}

	private parseJsonEntry<T>(
		snapshot: Map<string, SnapshotEntry>,
		path: string,
		fallback: T,
	): T {
		const entry = snapshot.get(path);
		return entry ? (JSON.parse(decoder.decode(entry.bytes)) as T) : fallback;
	}

	private async loadCatalogue(
		userId: string,
		providerId: string,
		wrappingKey: CryptoKey,
	): Promise<LoadedCatalogue> {
		const stored = await this.storageService.getCatalogue(providerId);
		if (!stored) {
			const { accountKey, wrappedAccountKey } =
				await this.getOrCreateAccountKey(userId, wrappingKey);
			return {
				accountKey,
				envelope: {
					version: 1,
					wrappedAccountKey,
					ciphertext: '',
				},
				catalogue: { version: 1, projects: [] },
			};
		}

		const parsed = JSON.parse(decoder.decode(stored)) as unknown;
		if (!isCatalogueEnvelope(parsed)) {
			throw new Error('Invalid storage catalogue envelope');
		}
		const accountKey = await unwrapAccountStorageKey(
			parsed.wrappedAccountKey,
			wrappingKey,
		);
		await this.adoptAccountKey(
			userId,
			wrappingKey,
			accountKey,
			parsed.wrappedAccountKey,
		);
		const decrypted = await decryptStorageBytes(
			accountKey,
			fromBase64Url(parsed.ciphertext),
			CATALOGUE_PURPOSE,
		);
		const catalogue = JSON.parse(decoder.decode(decrypted)) as unknown;
		if (!isCatalogue(catalogue)) {
			throw new Error('Invalid storage catalogue');
		}
		return { accountKey, envelope: parsed, catalogue };
	}

	private async adoptAccountKey(
		userId: string,
		wrappingKey: CryptoKey,
		accountKey: CryptoKey,
		wrapper: StorageCatalogueEnvelope['wrappedAccountKey'],
	): Promise<void> {
		const storageKey = this.accountKeyEnvelopeKey(userId);
		const previous = this.persistence.getItem(storageKey);
		const next = JSON.stringify(wrapper);
		if (previous && previous !== next) {
			const oldAccountKey = await unwrapAccountStorageKey(
				JSON.parse(previous) as StorageCatalogueEnvelope['wrappedAccountKey'],
				wrappingKey,
			);
			const keys = this.readSharedProjectKeys(userId);
			for (const [id, envelope] of Object.entries(keys)) {
				const projectKey = await unwrapProjectStorageKey(
					envelope,
					oldAccountKey,
				);
				keys[id] = await wrapProjectStorageKey(projectKey, accountKey);
			}
			this.writeSharedProjectKeys(userId, keys);
		}
		this.persistence.setItem(storageKey, next);
	}

	private async getOrCreateAccountKey(
		userId: string,
		wrappingKey: CryptoKey,
	): Promise<{
		accountKey: CryptoKey;
		wrappedAccountKey: StorageCatalogueEnvelope['wrappedAccountKey'];
	}> {
		const key = this.accountKeyEnvelopeKey(userId);
		const stored = this.persistence.getItem(key);
		if (stored) {
			const wrappedAccountKey = JSON.parse(
				stored,
			) as StorageCatalogueEnvelope['wrappedAccountKey'];
			const accountKey = await unwrapAccountStorageKey(
				wrappedAccountKey,
				wrappingKey,
			);
			return { accountKey, wrappedAccountKey };
		}

		const accountKey = await generateAccountStorageKey();
		const wrappedAccountKey = await wrapAccountStorageKey(
			accountKey,
			wrappingKey,
		);
		this.persistence.setItem(key, JSON.stringify(wrappedAccountKey));
		return { accountKey, wrappedAccountKey };
	}

	private async ensureProjectKey(
		providerId: string,
		userId: string,
		project: Project,
		binding: ProjectStorageBinding,
		loaded: LoadedCatalogue,
	): Promise<CryptoKey> {
		let entry = loaded.catalogue.projects.find(
			(candidate) => candidate.storageProjectId === binding.storageProjectId,
		);
		if (!entry) {
			entry = loaded.catalogue.projects.find(
				(candidate) => candidate.localProjectId === project.id,
			);
			if (entry) {
				binding.storageProjectId = entry.storageProjectId;
				this.updateBinding(userId, project.id, binding);
			}
		}

		if (entry) {
			const projectKey = await unwrapProjectStorageKey(
				entry.wrappedProjectKey,
				loaded.accountKey,
			);
			const updated = this.catalogueProjectFromProject(
				project,
				entry.storageProjectId,
				entry.wrappedProjectKey,
			);
			if (JSON.stringify(entry) !== JSON.stringify(updated)) {
				Object.assign(entry, updated);
				await this.saveCatalogue(providerId, loaded);
			}
			if (entry.deletionKey) {
				await this.storageService.registerOwner(
					providerId,
					entry.storageProjectId,
					entry.deletionKey,
				);
			}
			return projectKey;
		}

		const projectKey = await generateProjectStorageKey();
		const deletionKey = Array.from(
			crypto.getRandomValues(new Uint8Array(32)),
			(byte) => byte.toString(16).padStart(2, '0'),
		).join('');
		loaded.catalogue.projects.push({
			...this.catalogueProjectFromProject(
				project,
				binding.storageProjectId,
				await wrapProjectStorageKey(projectKey, loaded.accountKey),
			),
			deletionKey,
		});
		await this.saveCatalogue(providerId, loaded);
		await this.storageService.registerOwner(
			providerId,
			binding.storageProjectId,
			deletionKey,
		);
		return projectKey;
	}

	private async saveCatalogue(
		providerId: string,
		loaded: LoadedCatalogue,
	): Promise<void> {
		const encrypted = await encryptStorageBytes(
			loaded.accountKey,
			encodeJson(loaded.catalogue),
			CATALOGUE_PURPOSE,
		);
		const envelope: StorageCatalogueEnvelope = {
			version: 1,
			wrappedAccountKey: loaded.envelope.wrappedAccountKey,
			ciphertext: toBase64Url(encrypted),
		};
		await this.storageService.putCatalogue(providerId, encodeJson(envelope));
		loaded.envelope = envelope;
	}

	private async loadRevisionManifest(
		providerId: string,
		storageProjectId: string,
		revisionId: string,
		projectKey: CryptoKey,
	): Promise<StorageRevisionManifest> {
		const encrypted = await this.storageService.getRevision(
			providerId,
			storageProjectId,
			revisionId,
		);
		if (!encrypted)
			throw new Error(`Storage revision not found: ${revisionId}`);
		const decrypted = await decryptStorageBytes(
			projectKey,
			encrypted,
			REVISION_PURPOSE(revisionId),
		);
		const manifest = JSON.parse(decoder.decode(decrypted)) as unknown;
		if (!isRevisionManifest(manifest) || manifest.revisionId !== revisionId) {
			throw new Error('Invalid storage revision manifest');
		}
		return manifest;
	}

	private async serializeProject(
		project: Project,
	): Promise<Map<string, SnapshotEntry>> {
		const [documents, files] = await Promise.all([
			this.dataSerializer.serializeProjectDocuments(project),
			this.dataSerializer.serializeProjectFiles(project, true, false),
		]);
		const snapshot = new Map<string, SnapshotEntry>();
		const projectMetadata = this.unifiedService.convertProjectToMetadata(
			project,
			'backup',
		) as unknown as Record<string, unknown>;
		this.setJsonEntry(
			snapshot,
			this.unifiedService.getProjectMetadataPath(project.id),
			projectMetadata,
			stripVolatileProjectMetadata(projectMetadata),
		);

		if (documents.documents.length > 0) {
			this.setJsonEntry(
				snapshot,
				this.unifiedService.getDocumentMetadataPath(project.id),
				documents.documents,
				stripVolatileDocumentMetadata(documents.documents),
			);
		}
		for (const document of documents.documents) {
			const content = documents.documentContents.get(document.id);
			if (content?.readableContent !== undefined) {
				this.setEntry(
					snapshot,
					this.unifiedService.getDocumentContentPath(project.id, document.id),
					content.readableContent,
				);
			}
			if (content?.yjsState !== undefined) {
				this.setEntry(
					snapshot,
					this.unifiedService.getDocumentYjsPath(project.id, document.id),
					content.yjsState,
				);
			}
		}

		if (files.files.length > 0 || files.deletedFiles.length > 0) {
			const activePaths = new Set(files.files.map((file) => file.path));
			const metadata = [
				...files.files,
				...files.deletedFiles
					.filter((file) => !activePaths.has(file.path))
					.map((file) => ({ ...file, isDeleted: true })),
			];
			this.setJsonEntry(
				snapshot,
				this.unifiedService.getFilesMetadataPath(project.id),
				metadata,
			);
		}
		for (const file of files.files) {
			if (file.type !== 'file') continue;
			const content = files.fileContents.get(file.path);
			if (content === undefined) continue;
			this.setEntry(
				snapshot,
				this.unifiedService.getFileContentPath(
					project.id,
					cleanRelativePath(file.path),
				),
				content,
			);
		}

		return snapshot;
	}

	private setEntry(
		snapshot: Map<string, SnapshotEntry>,
		path: string,
		value: string | Uint8Array | ArrayBuffer,
	): void {
		const bytes = toBytes(value);
		snapshot.set(path, { bytes, hashBytes: bytes });
	}

	private setJsonEntry(
		snapshot: Map<string, SnapshotEntry>,
		path: string,
		value: unknown,
		hashValue: unknown = value,
	): void {
		snapshot.set(path, {
			bytes: encodeJson(value),
			hashBytes: encodeJson(hashValue),
		});
	}

	private async hashSnapshot(
		snapshot: Map<string, SnapshotEntry>,
	): Promise<Map<string, string>> {
		return new Map(
			await Promise.all(
				[...snapshot].map(
					async ([path, entry]) =>
						[path, await sha256(entry.hashBytes)] as const,
				),
			),
		);
	}

	private matchesManifest(
		hashes: Map<string, string>,
		base: StorageRevisionManifest | null,
	): boolean {
		if (!base) return false;
		const paths = Object.keys(base.entries);
		if (paths.length !== hashes.size) return false;
		return paths.every((path) => base.entries[path]?.hash === hashes.get(path));
	}

	private toDashboardProject(
		providerId: string,
		entry: StorageCatalogueProject,
		status: StorageDashboardProject['status'],
		remoteOnly: boolean,
		lastSync?: number,
		local?: Project,
	): StorageDashboardProject {
		return {
			providerId,
			storageProjectId: entry.storageProjectId,
			localProjectId: entry.localProjectId,
			name: local?.name ?? entry.name,
			description: local?.description ?? entry.description ?? '',
			type: local?.type ?? entry.type,
			group: local?.group ?? entry.group,
			compilerId: local?.compilerId ?? entry.compilerId,
			createdAt: local?.createdAt ?? entry.createdAt ?? entry.updatedAt,
			updatedAt: local?.updatedAt ?? entry.updatedAt,
			tags: local?.tags ?? entry.tags ?? [],
			isFavorite: local?.isFavorite ?? entry.isFavorite ?? false,
			docUrl: local?.docUrl ?? entry.docUrl,
			status,
			lastSync,
			remoteOnly,
			canDeleteRemote: !!entry.deletionKey,
		};
	}

	private catalogueProjectFromProject(
		project: Project,
		storageProjectId: string,
		wrappedProjectKey: StorageCatalogueProject['wrappedProjectKey'],
	): StorageCatalogueProject {
		return {
			localProjectId: project.id,
			storageProjectId,
			name: project.name,
			description: project.description,
			type: project.type,
			group: project.group,
			compilerId: project.compilerId,
			createdAt: project.createdAt,
			updatedAt: project.updatedAt,
			tags: project.tags,
			isFavorite: project.isFavorite,
			docUrl: project.docUrl,
			wrappedProjectKey,
		};
	}

	private touchBinding(
		userId: string,
		projectId: string,
		binding: ProjectStorageBinding,
	): void {
		this.updateBinding(userId, projectId, { ...binding, lastSync: Date.now() });
	}

	private readBindings(userId: string): Record<string, ProjectStorageBinding> {
		try {
			const raw = this.persistence.getItem(this.bindingKey(userId));
			if (!raw) return {};
			const parsed = JSON.parse(raw) as Record<string, ProjectStorageBinding>;
			return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
				? parsed
				: {};
		} catch {
			return {};
		}
	}

	private async loadSharedProjectKey(
		userId: string,
		binding: ProjectStorageBinding,
		wrappingKey: CryptoKey,
	): Promise<CryptoKey | null> {
		const envelope =
			this.readSharedProjectKeys(userId)[this.sharedProjectKeyId(binding)];
		if (!envelope) return null;
		const { accountKey } = await this.getOrCreateAccountKey(
			userId,
			wrappingKey,
		);
		return unwrapProjectStorageKey(envelope, accountKey);
	}

	private readSharedProjectKeys(
		userId: string,
	): Record<string, WrappedStorageKey> {
		try {
			const parsed = JSON.parse(
				this.persistence.getItem(this.sharedProjectKeysKey(userId)) || '{}',
			) as unknown;
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
				return {};
			return parsed as Record<string, WrappedStorageKey>;
		} catch {
			return {};
		}
	}

	private writeSharedProjectKeys(
		userId: string,
		keys: Record<string, WrappedStorageKey>,
	): void {
		this.persistence.setItem(
			this.sharedProjectKeysKey(userId),
			JSON.stringify(keys),
		);
	}

	private sharedProjectKeyId(binding: ProjectStorageBinding): string {
		return `${encodeURIComponent(binding.providerId)}:${encodeURIComponent(
			binding.storageProjectId,
		)}`;
	}

	private sharedProjectKeysKey(userId: string): string {
		return `texlyre-user-${userId}-storage-shared-project-keys`;
	}

	private updateBinding(
		userId: string,
		projectId: string,
		binding: ProjectStorageBinding,
	): void {
		const bindings = this.readBindings(userId);
		bindings[projectId] = binding;
		this.writeBindings(userId, bindings);
	}

	private writeBindings(
		userId: string,
		bindings: Record<string, ProjectStorageBinding>,
	): void {
		this.persistence.setItem(this.bindingKey(userId), JSON.stringify(bindings));
	}

	private bindingKey(userId: string): string {
		return `texlyre-user-${userId}-storage-bindings`;
	}

	private accountKeyEnvelopeKey(userId: string): string {
		return `texlyre-user-${userId}-storage-account-key`;
	}
}

export const storageSyncService = new StorageSyncService();
