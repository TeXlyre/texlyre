// src/services/StorageSyncService.ts
import { nanoid } from 'nanoid';

import { t } from '@/i18n';
import type { Project } from '../types/projects';
import type {
	ProjectStorageBinding,
	StorageDashboardProject,
	StorageSyncResult,
} from '../types/storage';
import {
	exportProjectStorageKey,
	importProjectStorageKey,
	unwrapProjectStorageKey,
	wrapProjectStorageKey,
} from '../utils/storageEncryptionUtils';
import type { ProjectMetadata } from './BackupLayoutService';
import { genericStorageService } from './GenericStorageService';
import {
	notificationService,
	shouldShowNotification,
} from './NotificationService';
import { StorageSnapshotReconciliation } from './StorageSnapshotReconciliation';
import {
	AUTO_SYNC_DELAY,
	AUTO_SYNC_RETRY_DELAY,
	moduleLog,
	StorageRemoteAheadError,
	decoder,
} from './StorageSyncPersistence';

export { StorageRemoteAheadError } from './StorageSyncPersistence';
export type { StorageSyncServiceOptions } from './StorageSyncPersistence';

export class StorageSyncService extends StorageSnapshotReconciliation {
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
		status:
			| 'synced'
			| 'local-only'
			| 'updates-available'
			| 'unavailable'
			| 'error';
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
				? latest.baseRevision
					? 'error'
					: 'local-only'
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
			if (!head) status = binding.baseRevision ? 'error' : 'local-only';
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
			else if (!head) status = binding.baseRevision ? 'error' : 'local-only';
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
		if (manifest.git) {
			await this.restoreGitBackup(
				project.id,
				providerId,
				storageProjectId,
				manifest,
				projectKey,
			);
		}
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

		if (
			binding.baseRevision &&
			(await this.storageService.getHead(
				providerId,
				binding.storageProjectId,
			)) === null
		) {
			throw new Error(
				'Remote storage revision is missing. Check the original Garage data volume and storage.env before syncing again.',
			);
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

		if (remoteHead === expectedHead && baseManifest?.git) {
			await this.restoreGitBackup(
				projectId,
				providerId,
				binding.storageProjectId,
				baseManifest,
				projectKey,
			);
		}

		if (remoteHead === expectedHead) {
			const pendingGit = await this.prepareGitBackup(projectId, baseManifest);
			if (
				this.matchesManifest(localHashes, baseManifest) &&
				!this.gitBackupChanged(pendingGit, baseManifest)
			) {
				await this.finishGitBackup(projectId, pendingGit);
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
				pendingGit,
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
		if (remoteManifest.git) {
			await this.restoreGitBackup(
				projectId,
				providerId,
				binding.storageProjectId,
				remoteManifest,
				projectKey,
				baseManifest,
			);
		}

		if (this.matchesManifest(localHashes, remoteManifest)) {
			const pendingGit = await this.prepareGitBackup(projectId, remoteManifest);
			if (this.gitBackupChanged(pendingGit, remoteManifest)) {
				return this.commitSnapshot(
					userId,
					projectId,
					providerId,
					binding,
					projectKey,
					remoteHead,
					remoteManifest,
					localSnapshot,
					localHashes,
					'merged',
					pendingGit,
				);
			}
			await this.finishGitBackup(projectId, pendingGit);
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
}

export const storageSyncService = new StorageSyncService();
