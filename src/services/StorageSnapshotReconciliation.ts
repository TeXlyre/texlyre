// src/services/StorageSnapshotReconciliation.ts
import { nanoid } from 'nanoid';

import type { Project } from '../types/projects';
import { isBinaryFile, toArrayBuffer, toBytes } from '../utils/fileUtils';
import { stripAnnotationTagsWithSpans } from '../utils/annotationTagUtils';
import type {
	ProjectStorageBinding,
	StorageRevisionManifest,
	StorageSyncResult,
} from '../types/storage';
import {
	decryptStorageBytes,
	encryptStorageBytes,
} from '../utils/storageEncryptionUtils';
import type {
	BackupLayoutService,
	DocumentMetadata,
	FileMetadata,
	ProjectMetadata,
} from './BackupLayoutService';
import { StorageProtocolError } from './GenericStorageService';
import { gitFileSystemService } from './GitFileSystemService';
import {
	mergeResolutionService,
	type ConflictResolution,
	type FileConflict,
} from './MergeResolutionService';
import {
	StorageSyncPersistence,
	StorageRemoteAheadError,
	moduleLog,
	decoder,
	encodeJson,
	sha256,
	OBJECT_PURPOSE,
	REVISION_PURPOSE,
	cleanRelativePath,
	stripVolatileProjectMetadata,
	stripVolatileDocumentMetadata,
} from './StorageSyncPersistence';
import type { SnapshotEntry, PendingGitBackup } from './StorageSyncPersistence';

export abstract class StorageSnapshotReconciliation extends StorageSyncPersistence {
	protected async reconcileRemoteHead(
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

		const pendingGit = await this.prepareGitBackup(project.id, remoteManifest);
		if (
			this.matchesManifest(finalHashes, remoteManifest) &&
			!this.gitBackupChanged(pendingGit, remoteManifest)
		) {
			await this.finishGitBackup(project.id, pendingGit);
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
			pendingGit,
		);
	}

	protected gitBackupChanged(
		backup: PendingGitBackup | null,
		manifest: StorageRevisionManifest | null,
	): boolean {
		if (!backup) return false;
		const entries = manifest?.git ?? {};
		if (Object.keys(entries).length !== backup.hashes.size) return true;
		return [...backup.hashes].some(
			([path, hash]) => entries[path]?.hash !== hash,
		);
	}

	protected gitBackupSignature(hashes: Map<string, string>): Promise<string> {
		return sha256(
			encodeJson([...hashes].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
		);
	}

	protected async finishGitBackup(
		projectId: string,
		backup: PendingGitBackup | null,
	): Promise<void> {
		if (!backup) return;
		gitFileSystemService
			.get(projectId)
			.markGitBackupSynced(
				backup.marker,
				await this.gitBackupSignature(backup.hashes),
			);
	}

	protected async prepareGitBackup(
		projectId: string,
		remoteManifest: StorageRevisionManifest | null,
	): Promise<PendingGitBackup | null> {
		const fs = gitFileSystemService.getForRemoteBackup(projectId);
		if (!fs) return null;
		const marker = fs.getGitBackupDirty();
		if (!marker || fs.hasGitBackupConflict()) return null;
		const remoteGit = remoteManifest?.git;
		const knownBase = fs.getGitBackupBase();
		if (knownBase) {
			const remoteSignature = remoteGit
				? await this.gitBackupSignature(
						new Map(
							Object.entries(remoteGit).map(([path, entry]) => [
								path,
								entry.hash,
							]),
						),
					)
				: null;
			if (remoteSignature !== knownBase) {
				fs.setGitBackupConflict(true);
				moduleLog.warn(
					'Remote Git backup changed independently; preserving remote history',
				);
				return null;
			}
		}
		const knownObjects =
			knownBase && remoteGit
				? new Set(
						Object.keys(remoteGit).filter((path) =>
							path.startsWith('objects/'),
						),
					)
				: undefined;
		const exported = await fs.exportGitBackup(knownObjects);
		if (!exported.files.size && !exported.reused.size) return null;
		const files = new Map<string, SnapshotEntry>();
		for (const [path, bytes] of exported.files) {
			files.set(path, { bytes, hashBytes: bytes });
		}
		const hashes = await this.hashSnapshot(files);
		for (const path of exported.reused) {
			const previousHash = remoteGit?.[path]?.hash;
			if (!previousHash) throw new Error('Missing Git backup object baseline');
			hashes.set(path, previousHash);
		}
		if (
			knownBase &&
			remoteGit &&
			Object.entries(remoteGit).some(
				([path, entry]) =>
					path.startsWith('objects/') && hashes.get(path) !== entry.hash,
			)
		) {
			fs.setGitBackupConflict(true);
			moduleLog.warn('Local Git no longer contains all backed-up Git objects');
			return null;
		}
		if (!knownBase && remoteGit && !this.sameGitEntries(remoteGit, hashes)) {
			fs.setGitBackupConflict(true);
			moduleLog.warn(
				'Existing remote Git backup differs from local Git history',
			);
			return null;
		}
		return { marker, files, hashes };
	}

	protected sameGitEntries(
		entries: NonNullable<StorageRevisionManifest['git']>,
		hashes: Map<string, string>,
	): boolean {
		const keys = Object.keys(entries);
		return (
			keys.length === hashes.size &&
			keys.every((path) => entries[path].hash === hashes.get(path))
		);
	}

	protected async restoreGitBackup(
		projectId: string,
		providerId: string,
		storageProjectId: string,
		manifest: StorageRevisionManifest,
		projectKey: CryptoKey,
		previousManifest: StorageRevisionManifest | null = null,
	): Promise<void> {
		const remoteGit = manifest.git;
		if (!remoteGit) return;
		const fs = gitFileSystemService.get(projectId);
		const signature = await this.gitBackupSignature(
			new Map(
				Object.entries(remoteGit).map(([path, entry]) => [path, entry.hash]),
			),
		);
		const emptyLocalGit = await fs.canRestoreGitBackup();
		if (fs.getGitBackupBase() === signature && !emptyLocalGit) return;
		const attempt = `${signature}:${fs.getGitBackupDirty() ?? ''}`;
		if (this.rejectedGitBackups.get(projectId) === attempt) return;
		const previousGit = previousManifest?.git;
		const knownGit =
			previousGit &&
			fs.getGitBackupBase() ===
				(await this.gitBackupSignature(
					new Map(
						Object.entries(previousGit).map(([path, entry]) => [
							path,
							entry.hash,
						]),
					),
				))
				? previousGit
				: null;
		const files = new Map<string, Uint8Array>();
		for (const [path, entry] of Object.entries(remoteGit)) {
			if (
				!emptyLocalGit &&
				path !== 'HEAD' &&
				knownGit?.[path]?.hash === entry.hash
			)
				continue;
			if (!emptyLocalGit && (await fs.hasGitBackupObject(path))) continue;
			const encrypted = await this.storageService.getObject(
				providerId,
				storageProjectId,
				entry.objectId,
			);
			if (!encrypted)
				throw new Error(`Storage Git object missing: ${entry.objectId}`);
			const bytes = await decryptStorageBytes(
				projectKey,
				encrypted,
				OBJECT_PURPOSE(entry.objectId),
			);
			if ((await sha256(bytes)) !== entry.hash) {
				throw new Error('Invalid stored Git object hash');
			}
			files.set(path, bytes);
		}
		const integrated = emptyLocalGit
			? await fs.importGitBackup(files)
			: await fs.integrateGitBackup(files);
		if (integrated) {
			this.rejectedGitBackups.delete(projectId);
			fs.adoptGitBackup(signature);
		} else {
			this.rejectedGitBackups.set(projectId, attempt);
			fs.setGitBackupConflict(true);
			moduleLog.warn(
				'Remote Git history diverged; preserving local Git history',
			);
		}
	}

	protected async commitSnapshot(
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
		pendingGit: PendingGitBackup | null = null,
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

		let git = previousManifest?.git;
		if (pendingGit) {
			git = {};
			for (const [path, hash] of pendingGit.hashes) {
				const previous = previousManifest?.git?.[path];
				if (previous?.hash === hash) {
					git[path] = previous;
					continue;
				}
				const snapshotEntry = pendingGit.files.get(path);
				if (!snapshotEntry)
					throw new Error('Missing changed Git backup object');
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
				git[path] = { objectId, hash, size: snapshotEntry.bytes.byteLength };
				uploadedObjects += 1;
			}
		}

		const revisionId = nanoid(32);
		const manifest: StorageRevisionManifest = {
			version: git ? 2 : 1,
			...(git ? { git } : {}),
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
		await this.finishGitBackup(projectId, pendingGit);
		return { status, revision: revisionId, uploadedObjects };
	}

	protected async setSnapshotFromManifest(
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

	protected async loadSnapshotEntry(
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

	protected async loadSnapshot(
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

	protected createFileConflict(
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

	protected setSnapshotEntry(
		snapshot: Map<string, SnapshotEntry>,
		path: string,
		entry: SnapshotEntry | null,
	): void {
		if (entry) snapshot.set(path, entry);
		else snapshot.delete(path);
	}

	protected entryFromBytes(path: string, bytes: Uint8Array): SnapshotEntry {
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

	protected hashesEqual(
		a: Map<string, string>,
		b: Map<string, string>,
	): boolean {
		if (a.size !== b.size) return false;
		for (const [path, hash] of a) {
			if (b.get(path) !== hash) return false;
		}
		return true;
	}

	protected async applyProjectSnapshot(
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

	protected parseJsonEntry<T>(
		snapshot: Map<string, SnapshotEntry>,
		path: string,
		fallback: T,
	): T {
		const entry = snapshot.get(path);
		return entry ? (JSON.parse(decoder.decode(entry.bytes)) as T) : fallback;
	}
}
