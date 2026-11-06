// src/services/StorageSyncPersistence.ts
import { createNamedLogger } from '@/logging';
import type { Project } from '../types/projects';
import {
	fromBase64Url,
	toArrayBuffer,
	toBase64Url,
	toBytes,
} from '../utils/fileUtils';
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
	generateAccountStorageKey,
	generateProjectStorageKey,
	unwrapAccountStorageKey,
	unwrapProjectStorageKey,
	wrapAccountStorageKey,
	wrapProjectStorageKey,
} from '../utils/storageEncryptionUtils';
import { authService } from './AuthService';
import {
	UnifiedDataStructureService,
	type DocumentMetadata,
} from './BackupLayoutService';
import { chelysService } from './ChelysService';
import { genericStorageService } from './GenericStorageService';
import { ProjectDataService } from './ProjectDataService';

export const moduleLog = createNamedLogger('StorageSyncService');

export const AUTO_SYNC_DELAY = 2000;
export const AUTO_SYNC_RETRY_DELAY = 250;
export const CATALOGUE_PURPOSE = 'catalogue';
export const REVISION_PURPOSE = (revisionId: string): string =>
	`revision-manifest:${revisionId}`;
export const OBJECT_PURPOSE = (objectId: string): string =>
	`object:${objectId}`;
export const encoder = new TextEncoder();
export const decoder = new TextDecoder();

export type StorageClient = Pick<
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

export interface StringStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

export interface SnapshotEntry {
	bytes: Uint8Array;
	hashBytes: Uint8Array;
}

export interface PendingGitBackup {
	marker: string;
	files: Map<string, SnapshotEntry>;
	hashes: Map<string, string>;
}

export interface LoadedCatalogue {
	accountKey: CryptoKey;
	envelope: StorageCatalogueEnvelope;
	catalogue: StorageCatalogue;
}

export interface StorageAutoSyncState {
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

export const encodeJson = (value: unknown): Uint8Array =>
	encoder.encode(JSON.stringify(value, null, 2));

export const sha256 = async (bytes: Uint8Array): Promise<string> => {
	const digest = new Uint8Array(
		await crypto.subtle.digest('SHA-256', toArrayBuffer(bytes)),
	);
	return toBase64Url(digest);
};

export const cleanRelativePath = (path: string): string =>
	path.startsWith('/') ? path.slice(1) : path;

export const stripVolatileProjectMetadata = <T extends Record<string, unknown>>(
	metadata: T,
): Record<string, unknown> => {
	const stable = { ...metadata };
	delete stable.lastSync;
	delete stable.exportedAt;
	return stable;
};

export const stripVolatileDocumentMetadata = (
	documents: DocumentMetadata[],
): Record<string, unknown>[] =>
	documents.map((document) => {
		const stable = { ...document } as Record<string, unknown>;
		delete stable.lastModified;
		return stable;
	});

export const isCatalogue = (value: unknown): value is StorageCatalogue => {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<StorageCatalogue>;
	return candidate.version === 1 && Array.isArray(candidate.projects);
};

export const isCatalogueEnvelope = (
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

export const isRevisionManifest = (
	value: unknown,
): value is StorageRevisionManifest => {
	if (!value || typeof value !== 'object') return false;
	const candidate = value as Partial<StorageRevisionManifest>;
	return (
		(candidate.version === 1 || candidate.version === 2) &&
		(candidate.version !== 2 || !!candidate.git) &&
		typeof candidate.revisionId === 'string' &&
		!!candidate.entries &&
		typeof candidate.entries === 'object'
	);
};

export abstract class StorageSyncPersistence {
	protected readonly storageService: StorageClient;
	protected readonly dataSerializer: Pick<
		ProjectDataService,
		| 'serializeProjectDocuments'
		| 'serializeProjectFiles'
		| 'deserializeToIndexedDB'
	>;
	protected readonly unifiedService: UnifiedDataStructureService;
	protected readonly getProjectById: (
		projectId: string,
	) => Promise<Project | null>;
	protected readonly getProjectsByUser: (userId: string) => Promise<Project[]>;
	protected readonly updateProject: (project: Project) => Promise<void>;
	protected readonly getWrappingKey: () => CryptoKey | null;
	protected readonly persistence: StringStorage;
	protected readonly projectSyncs = new Map<
		string,
		Promise<StorageSyncResult>
	>();
	protected readonly rejectedGitBackups = new Map<string, string>();
	protected readonly deletingProjects = new Set<string>();
	protected readonly autoSyncs = new Map<string, StorageAutoSyncState>();
	protected readonly autoSyncFailures = new Set<string>();

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

	protected async loadCatalogue(
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

	protected async adoptAccountKey(
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

	protected async getOrCreateAccountKey(
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

	protected async ensureProjectKey(
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

	protected async saveCatalogue(
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

	protected async loadRevisionManifest(
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

	protected async serializeProject(
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

	protected setEntry(
		snapshot: Map<string, SnapshotEntry>,
		path: string,
		value: string | Uint8Array | ArrayBuffer,
	): void {
		const bytes = toBytes(value);
		snapshot.set(path, { bytes, hashBytes: bytes });
	}

	protected setJsonEntry(
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

	protected async hashSnapshot(
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

	protected matchesManifest(
		hashes: Map<string, string>,
		base: StorageRevisionManifest | null,
	): boolean {
		if (!base) return false;
		const paths = Object.keys(base.entries);
		if (paths.length !== hashes.size) return false;
		return paths.every((path) => base.entries[path]?.hash === hashes.get(path));
	}

	protected toDashboardProject(
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

	protected catalogueProjectFromProject(
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

	protected touchBinding(
		userId: string,
		projectId: string,
		binding: ProjectStorageBinding,
	): void {
		this.updateBinding(userId, projectId, { ...binding, lastSync: Date.now() });
	}

	protected readBindings(
		userId: string,
	): Record<string, ProjectStorageBinding> {
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

	protected async loadSharedProjectKey(
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

	protected readSharedProjectKeys(
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

	protected writeSharedProjectKeys(
		userId: string,
		keys: Record<string, WrappedStorageKey>,
	): void {
		this.persistence.setItem(
			this.sharedProjectKeysKey(userId),
			JSON.stringify(keys),
		);
	}

	protected sharedProjectKeyId(binding: ProjectStorageBinding): string {
		return `${encodeURIComponent(binding.providerId)}:${encodeURIComponent(
			binding.storageProjectId,
		)}`;
	}

	protected sharedProjectKeysKey(userId: string): string {
		return `texlyre-user-${userId}-storage-shared-project-keys`;
	}

	protected updateBinding(
		userId: string,
		projectId: string,
		binding: ProjectStorageBinding,
	): void {
		const bindings = this.readBindings(userId);
		bindings[projectId] = binding;
		this.writeBindings(userId, bindings);
	}

	protected writeBindings(
		userId: string,
		bindings: Record<string, ProjectStorageBinding>,
	): void {
		this.persistence.setItem(this.bindingKey(userId), JSON.stringify(bindings));
	}

	protected bindingKey(userId: string): string {
		return `texlyre-user-${userId}-storage-bindings`;
	}

	protected accountKeyEnvelopeKey(userId: string): string {
		return `texlyre-user-${userId}-storage-account-key`;
	}
}
