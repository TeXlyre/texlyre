import { webcrypto } from 'node:crypto';

import type { Project } from '../../src/types/projects';
import {
	StorageRemoteAheadError,
	StorageSyncService,
} from '../../src/services/StorageSyncService';
import { StorageProtocolError } from '../../src/services/GenericStorageService';
import { gitFileSystemService } from '../../src/services/GitFileSystemService';
import {
	decryptStorageBytes,
	deriveStorageWrappingKey,
	importProjectStorageKey,
} from '../../src/utils/storageEncryptionUtils';

let originalSubtle: SubtleCrypto;
let originalGetRandomValues: Crypto['getRandomValues'];

beforeAll(() => {
	originalSubtle = globalThis.crypto.subtle;
	originalGetRandomValues = globalThis.crypto.getRandomValues;
	(globalThis.crypto as { subtle: SubtleCrypto }).subtle = webcrypto.subtle;
	globalThis.crypto.getRandomValues = webcrypto.getRandomValues.bind(webcrypto);
});

afterAll(() => {
	(globalThis.crypto as { subtle: SubtleCrypto }).subtle = originalSubtle;
	globalThis.crypto.getRandomValues = originalGetRandomValues;
});

class MemoryStringStorage {
	private readonly values = new Map<string, string>();

	getItem(key: string): string | null {
		return this.values.get(key) ?? null;
	}

	setItem(key: string, value: string): void {
		this.values.set(key, value);
	}
}

class MemoryStorageProvider {
	catalogue: Uint8Array | null = null;
	readonly heads = new Map<string, string>();
	readonly revisions = new Map<string, Uint8Array>();
	readonly objects = new Map<string, Uint8Array>();
	readonly owners = new Map<string, string>();
	putObjectCount = 0;
	getObjectCount = 0;
	getRevisionCount = 0;
	getCatalogueCount = 0;
	commitCount = 0;
	failNextObject = false;
	raceHeadOnNextCommit: string | null = null;

	async getCatalogue(): Promise<Uint8Array | null> {
		this.getCatalogueCount += 1;
		return this.catalogue ? this.copy(this.catalogue) : null;
	}

	async putCatalogue(_providerId: string, bytes: Uint8Array): Promise<void> {
		this.catalogue = this.copy(bytes);
	}

	async getHead(_providerId: string, projectId: string): Promise<string | null> {
		return this.heads.get(projectId) ?? null;
	}

	async getRevision(
		_providerId: string,
		projectId: string,
		revisionId: string,
	): Promise<Uint8Array | null> {
		this.getRevisionCount += 1;
		const bytes = this.revisions.get(`${projectId}/${revisionId}`);
		return bytes ? this.copy(bytes) : null;
	}

	async getObject(
		_providerId: string,
		projectId: string,
		objectId: string,
	): Promise<Uint8Array | null> {
		this.getObjectCount += 1;
		const bytes = this.objects.get(`${projectId}/${objectId}`);
		return bytes ? this.copy(bytes) : null;
	}

	async putObject(
		_providerId: string,
		projectId: string,
		objectId: string,
		bytes: Uint8Array,
	): Promise<void> {
		if (this.failNextObject) {
			this.failNextObject = false;
			throw new Error('object write failed');
		}
		this.putObjectCount += 1;
		this.objects.set(`${projectId}/${objectId}`, this.copy(bytes));
	}

	async commitHead(
		_providerId: string,
		projectId: string,
		expectedHead: string | null,
		newRevision: string,
		manifest: Uint8Array,
	): Promise<{ head: string }> {
		if (this.raceHeadOnNextCommit) {
			this.heads.set(projectId, this.raceHeadOnNextCommit);
			this.raceHeadOnNextCommit = null;
		}
		const current = this.heads.get(projectId) ?? null;
		if (current !== expectedHead) {
			throw new StorageProtocolError({
				code: 'stale-head',
				message: 'Remote HEAD changed',
				head: current,
			});
		}
		this.revisions.set(`${projectId}/${newRevision}`, this.copy(manifest));
		this.heads.set(projectId, newRevision);
		this.commitCount += 1;
		return { head: newRevision };
	}

	async registerOwner(_providerId: string, projectId: string, token: string): Promise<void> {
		const previous = this.owners.get(projectId);
		if (previous && previous !== token) throw new Error('Project has another owner');
		if (!previous && (this.heads.has(projectId) ||
			[...this.objects.keys()].some((key) => key.startsWith(`${projectId}/`)))) {
			throw new Error('Legacy projects cannot be claimed');
		}
		this.owners.set(projectId, token);
	}

	async deleteProject(_providerId: string, projectId: string, deleteToken: string): Promise<void> {
		if (this.owners.get(projectId) !== deleteToken) throw new Error('Invalid project deletion key');
		this.heads.delete(projectId);
		for (const key of this.revisions.keys()) if (key.startsWith(`${projectId}/`)) this.revisions.delete(key);
		for (const key of this.objects.keys()) if (key.startsWith(`${projectId}/`)) this.objects.delete(key);
	}

	private copy(bytes: Uint8Array): Uint8Array {
		const copy = new Uint8Array(bytes.byteLength);
		copy.set(bytes);
		return copy;
	}
}

const project: Project = {
	id: 'project-local-id',
	name: 'Secret Research Project',
	description: 'Private description',
	type: 'latex',
	docUrl: 'yjs:project-local-id',
	createdAt: 1_700_000_000_000,
	updatedAt: 1_700_000_100_000,
	ownerId: 'user-a',
	tags: ['private'],
	isFavorite: false,
};

const makeHarness = async () => {
	const remote = new MemoryStorageProvider();
	const persistence = new MemoryStringStorage();
	const wrappingKey = await deriveStorageWrappingKey({
		username: 'alice',
		password: 'correct horse battery staple',
		prfOutput: new Uint8Array(32).fill(7),
	});
	let fileContent = 'alpha';
	let documentTimestamp = 100;

	const dataSerializer = {
		async serializeProjectDocuments() {
			documentTimestamp += 1;
			return {
				documents: [
					{
						id: 'doc-a',
						name: 'main.tex',
						createdAt: 50,
						lastModified: documentTimestamp,
						hasYjsState: true,
						hasReadableContent: true,
					},
				],
				documentContents: new Map([
					[
						'doc-a',
						{
							readableContent: 'document body',
							yjsState: new Uint8Array([1, 2, 3, 4]),
						},
					],
				]),
			};
		},
		async serializeProjectFiles() {
			return {
				files: [
					{
						id: 'file-a',
						name: 'asset.bin',
						path: '/asset.bin',
						type: 'file' as const,
						createdAt: 60,
						lastModified: 70,
						size: 5,
						isBinary: true,
					},
				],
				fileContents: new Map<string, ArrayBuffer | string>([
					['/asset.bin', fileContent],
				]),
				deletedFiles: [],
			};
		},
		async deserializeToIndexedDB() {},
	};

	const service = new StorageSyncService({
		storageService: remote,
		dataSerializer,
		getProjectById: async (projectId) =>
			projectId === project.id ? project : null,
		updateProject: async () => {},
		getWrappingKey: () => wrappingKey,
		persistence,
	});

	return {
		remote,
		service,
		persistence,
		wrappingKey,
		dataSerializer,
		setFileContent(value: string) {
			fileContent = value;
		},
	};
};

describe('StorageSyncService shared binding', () => {
	it('records a shared project attachment locally without replacing another binding', async () => {
		const { service } = await makeHarness();
		const attached = service.attachSharedProject(
			'user-a',
			project.id,
			'garage',
			'opaque-shared-project',
			'revision-7',
		);

		expect(attached).toEqual({
			providerId: 'garage',
			storageProjectId: 'opaque-shared-project',
			baseRevision: 'revision-7',
			enabled: true,
		});
		expect(
			service.setShareWithCollaborators('user-a', project.id, true),
		).toMatchObject({ shareWithCollaborators: true });
		expect(service.getProjectBinding('user-a', project.id)).toMatchObject({
			storageProjectId: 'opaque-shared-project',
			shareWithCollaborators: true,
		});

		expect(() =>
			service.attachSharedProject(
				'user-a',
				project.id,
				'other-provider',
				'other-project',
			),
		).toThrow('Project is already attached to another storage provider');
	});

	it('rewraps a received project key locally and can re-share it without the owner catalogue', async () => {
		const { remote, service: owner, dataSerializer } = await makeHarness();
		await owner.syncProject('user-a', project.id, 'garage');
		const ownerBinding = owner.getProjectBinding('user-a', project.id)!;
		owner.setShareWithCollaborators('user-a', project.id, true);
		const sharedKey = await owner.exportProjectKeyForSharing(
			'user-a',
			project.id,
		);

		const collaboratorPersistence = new MemoryStringStorage();
		const collaboratorWrappingKey = await deriveStorageWrappingKey({
			username: 'bob',
			password: 'different credentials',
			prfOutput: new Uint8Array(32).fill(9),
		});
		const collaboratorProject: Project = {
			...project,
			id: 'shared-local-project',
			docUrl: 'yjs:shared-local-project',
			ownerId: 'user-b',
		};
		const collaborator = new StorageSyncService({
			storageService: remote,
			dataSerializer,
			getProjectById: async (projectId) =>
				projectId === collaboratorProject.id ? collaboratorProject : null,
			updateProject: async () => {},
			getWrappingKey: () => collaboratorWrappingKey,
			persistence: collaboratorPersistence,
		});

		collaborator.attachSharedProject(
			'user-b',
			'shared-local-project',
			'garage',
			ownerBinding.storageProjectId,
			ownerBinding.baseRevision,
		);
		await collaborator.storeSharedProjectKey(
			'user-b',
			'shared-local-project',
			sharedKey,
		);
		collaborator.setShareWithCollaborators(
			'user-b',
			'shared-local-project',
			true,
		);

		const remoteCatalogueBefore = remote.catalogue?.slice();
		remote.getCatalogueCount = 0;
		const reshared = await collaborator.exportProjectKeyForSharing(
			'user-b',
			'shared-local-project',
		);

		expect(reshared).toEqual(sharedKey);
		expect(remote.getCatalogueCount).toBe(0);
		expect(remote.catalogue).toEqual(remoteCatalogueBefore);

		const headBeforeCollaboratorSync = remote.heads.get(
			ownerBinding.storageProjectId,
		);
		const collaboratorSync = await collaborator.syncProject(
			'user-b',
			collaboratorProject.id,
			'garage',
		);
		expect(collaboratorSync.status).toBe('synced');
		expect(remote.getCatalogueCount).toBe(0);
		expect(remote.heads.get(ownerBinding.storageProjectId)).not.toBe(
			headBeforeCollaboratorSync,
		);

		const storedKeys = collaboratorPersistence.getItem(
			'texlyre-user-user-b-storage-shared-project-keys',
		);
		expect(storedKeys).not.toBeNull();
		const rawKeyText = btoa(
			String.fromCharCode(...Array.from(sharedKey)),
		).replace(/=+$/g, '');
		expect(storedKeys).not.toContain(rawKeyText);

		collaborator.disconnectProject('user-b', 'shared-local-project');
		expect(
			collaboratorPersistence.getItem(
				'texlyre-user-user-b-storage-shared-project-keys',
			),
		).toBe('{}');
	});
});

describe('StorageSyncService', () => {
	it('creates an encrypted first revision and performs a true no-op sync', async () => {
		const { remote, service } = await makeHarness();

		const first = await service.syncProject('user-a', project.id, 'garage');
		const binding = service.getProjectBinding('user-a', project.id);

		expect(first.status).toBe('synced');
		expect(first.uploadedObjects).toBe(6);
		expect(binding?.baseRevision).toBe(first.revision);
		expect(binding?.storageProjectId).not.toBe(project.id);
		expect(remote.heads.get(binding!.storageProjectId)).toBe(first.revision);
		expect(remote.commitCount).toBe(1);

		const catalogueText = new TextDecoder().decode(remote.catalogue!);
		expect(catalogueText).not.toContain(project.name);
		expect(catalogueText).not.toContain(project.id);
		expect(catalogueText).not.toContain('main.tex');

		const uploadedAfterFirst = remote.putObjectCount;
		const second = await service.syncProject('user-a', project.id, 'garage');

		expect(second).toEqual({
			status: 'unchanged',
			revision: first.revision,
			uploadedObjects: 0,
		});
		expect(remote.putObjectCount).toBe(uploadedAfterFirst);
		expect(remote.commitCount).toBe(1);
	});

	it('allows remote deletion only when the catalogue contains the deletion key', async () => {
		const { remote, service } = await makeHarness();
		await service.syncProject('user-a', project.id, 'garage');
		const binding = service.getProjectBinding('user-a', project.id)!;

		expect(await service.canDeleteRemoteProject(
			'user-a', 'garage', binding.storageProjectId,
		)).toBe(true);
		expect(await service.canDeleteRemoteProject(
			'user-a', 'garage', 'missing-project',
		)).toBe(false);

		remote.catalogue = null;
		expect(await service.canDeleteRemoteProject(
			'user-a', 'garage', binding.storageProjectId,
		)).toBe(false);
	});

	it('does not rewrite a catalogue or project ownership when a previously stored HEAD disappears', async () => {
		const { remote, service, persistence, wrappingKey, dataSerializer } = await makeHarness();
		const first = await service.syncProject('user-a', project.id, 'garage');
		const binding = service.getProjectBinding('user-a', project.id)!;
		remote.heads.delete(binding.storageProjectId);
		remote.catalogue = null; // Simulate a fresh/incorrect Garage volume.
		const ownersBefore = new Map(remote.owners);
		const uploadsBefore = remote.putObjectCount;

		await expect(service.syncProject('user-a', project.id, 'garage'))
			.rejects.toThrow('Remote storage revision is missing');
		expect(remote.catalogue).toBeNull();
		expect(remote.owners).toEqual(ownersBefore);
		expect(remote.putObjectCount).toBe(uploadsBefore);
		expect(remote.commitCount).toBe(1);
		expect(service.getProjectBinding('user-a', project.id)?.baseRevision)
			.toBe(first.revision);
	});

	it('uploads only the logical object that actually changed', async () => {
		const { remote, service, setFileContent } = await makeHarness();
		await service.syncProject('user-a', project.id, 'garage');
		const before = remote.putObjectCount;

		setFileContent('bravo');
		const result = await service.syncProject('user-a', project.id, 'garage');

		expect(result.status).toBe('synced');
		expect(result.uploadedObjects).toBe(1);
		expect(remote.putObjectCount - before).toBe(1);
		expect(remote.commitCount).toBe(2);
	});

	it('never advances HEAD or baseRevision when an object upload fails', async () => {
		const { remote, service, setFileContent } = await makeHarness();
		const first = await service.syncProject('user-a', project.id, 'garage');
		const binding = service.getProjectBinding('user-a', project.id)!;

		setFileContent('bravo');
		remote.failNextObject = true;
		await expect(
			service.syncProject('user-a', project.id, 'garage'),
		).rejects.toThrow('object write failed');

		expect(remote.heads.get(binding.storageProjectId)).toBe(first.revision);
		expect(
			service.getProjectBinding('user-a', project.id)?.baseRevision,
		).toBe(first.revision);
		expect(remote.commitCount).toBe(1);
	});

	it('surfaces a CAS race without replacing the local base revision', async () => {
		const { remote, service, setFileContent } = await makeHarness();
		const first = await service.syncProject('user-a', project.id, 'garage');
		const binding = service.getProjectBinding('user-a', project.id)!;

		setFileContent('bravo');
		remote.raceHeadOnNextCommit = 'external-revision';
		await expect(
			service.syncProject('user-a', project.id, 'garage'),
		).rejects.toMatchObject({
			name: 'StorageRemoteAheadError',
			remoteHead: 'external-revision',
		});

		expect(remote.heads.get(binding.storageProjectId)).toBe('external-revision');
		expect(
			service.getProjectBinding('user-a', project.id)?.baseRevision,
		).toBe(first.revision);
		expect(remote.commitCount).toBe(1);
	});
});


type TestFileContent = string | Uint8Array;

const copyContent = (content: TestFileContent): TestFileContent =>
	typeof content === 'string' ? content : content.slice();

const makeReconciliationClient = (
	remote: MemoryStorageProvider,
	wrappingKey: CryptoKey,
	initialContent: TestFileContent,
	binary = false,
) => {
	const persistence = new MemoryStringStorage();
	let fileContent = copyContent(initialContent);
	let lastModified = 100;
	let applied = 0;
	let localProject = { ...project };

	const dataSerializer = {
		async serializeProjectDocuments() {
			return { documents: [], documentContents: new Map() };
		},
		async serializeProjectFiles() {
			return {
				files: [
					{
						id: 'file-main',
						name: binary ? 'asset.bin' : 'main.tex',
						path: binary ? '/asset.bin' : '/main.tex',
						type: 'file' as const,
						createdAt: 50,
						lastModified,
						size:
							typeof fileContent === 'string'
								? fileContent.length
								: fileContent.byteLength,
						isBinary: binary,
					},
				],
				fileContents: new Map<string, ArrayBuffer | string>([
					[
						binary ? '/asset.bin' : '/main.tex',
						typeof fileContent === 'string'
							? fileContent
							: fileContent.slice().buffer as ArrayBuffer,
					],
				]),
				deletedFiles: [],
			};
		},
		async deserializeToIndexedDB(data: any) {
			applied += 1;
			const imported = data.projectData.get(project.id);
			const path = binary ? '/asset.bin' : '/main.tex';
			const next = imported.fileContents.get(path);
			fileContent =
				typeof next === 'string'
					? next
					: new Uint8Array(next as ArrayBuffer).slice();
			lastModified = imported.files[0]?.lastModified ?? lastModified;
		},
	};

	const service = new StorageSyncService({
		storageService: remote,
		dataSerializer,
		getProjectById: async (projectId) =>
			projectId === project.id ? localProject : null,
		updateProject: async () => {},
		getWrappingKey: () => wrappingKey,
		persistence,
	});

	return {
		service,
		setContent(content: TestFileContent) {
			fileContent = copyContent(content);
			lastModified += 1;
		},
		setProjectName(name: string) {
			localProject = { ...localProject, name };
		},
		getContent() {
			return copyContent(fileContent);
		},
		getAppliedCount() {
			return applied;
		},
	};
};


const makeFileTreeClient = (
	remote: MemoryStorageProvider,
	wrappingKey: CryptoKey,
) => {
	const persistence = new MemoryStringStorage();
	const files = new Map<string, string>([['/base.tex', 'base']]);
	const deleted = new Map<string, { id: string; name: string; path: string }>();
	let applied = 0;

	const metadataFor = (path: string) => ({
		id: `file-${path}`,
		name: path.split('/').pop()!,
		path,
		type: 'file' as const,
		createdAt: 50,
		lastModified: 100,
		size: files.get(path)?.length ?? 0,
		isBinary: false,
	});

	const dataSerializer = {
		async serializeProjectDocuments() {
			return { documents: [], documentContents: new Map() };
		},
		async serializeProjectFiles() {
			return {
				files: [...files.keys()].map(metadataFor),
				fileContents: new Map<string, ArrayBuffer | string>(files),
				deletedFiles: [...deleted.values()].map((entry) => ({
					...metadataFor(entry.path),
					id: entry.id,
					name: entry.name,
				})),
			};
		},
		async deserializeToIndexedDB(data: any) {
			applied += 1;
			const imported = data.projectData.get(project.id);
			files.clear();
			for (const file of imported.files) {
				if (file.type !== 'file') continue;
				const content = imported.fileContents.get(file.path);
				if (typeof content === 'string') files.set(file.path, content);
			}
		},
	};

	const service = new StorageSyncService({
		storageService: remote,
		dataSerializer,
		getProjectById: async (projectId) =>
			projectId === project.id ? project : null,
		updateProject: async () => {},
		getWrappingKey: () => wrappingKey,
		persistence,
	});

	return {
		service,
		addFile(path: string, content: string) {
			deleted.delete(path);
			files.set(path, content);
		},
		deleteFile(path: string) {
			if (!files.has(path)) return;
			files.delete(path);
			deleted.set(path, {
				id: `file-${path}`,
				name: path.split('/').pop()!,
				path,
			});
		},
		getPaths() {
			return [...files.keys()].sort();
		},
		getAppliedCount() {
			return applied;
		},
	};
};

const readRemoteManifest = async (
	remote: MemoryStorageProvider,
	service: StorageSyncService,
	revision: string,
) => {
	service.setShareWithCollaborators('user-a', project.id, true);
	const rawKey = await service.exportProjectKeyForSharing('user-a', project.id);
	const key = await importProjectStorageKey(rawKey);
	const binding = service.getProjectBinding('user-a', project.id)!;
	const encrypted = remote.revisions.get(`${binding.storageProjectId}/${revision}`)!;
	const decrypted = await decryptStorageBytes(
		key,
		encrypted,
		`revision-manifest:${revision}`,
	);
	return JSON.parse(new TextDecoder().decode(decrypted)) as {
		entries: Record<string, unknown>;
	};
};

describe('StorageSyncService optional Git backup', () => {
	afterEach(() => jest.restoreAllMocks());

	it('backs up changed Git objects incrementally without revisiting them during file sync', async () => {
		const { service, remote, setFileContent } = await makeHarness();
		await service.syncProject('user-a', project.id, 'garage');
		let marker: string | null = 'git-change-1';
		let gitBase: string | null = null;
		const head = new TextEncoder().encode('ref: refs/heads/main\n');
		const object = new Uint8Array([1, 2, 3, 4]);
		const exportGitBackup = jest.fn(async () => ({ files: new Map([
			['HEAD', head],
			[`objects/ab/${'c'.repeat(38)}`, object],
		]), reused: new Set<string>() }));
		const fakeGit = {
			getGitBackupDirty: () => marker,
			getGitBackupBase: () => gitBase,
			hasGitBackupConflict: () => false,
			exportGitBackup,
			markGitBackupSynced: (value: string, signature: string) => { gitBase = signature; if (marker === value) marker = null; },
			canRestoreGitBackup: async () => false,
			hasGitBackupObject: async () => false,
			setGitBackupConflict: jest.fn(),
		};
		jest.spyOn(gitFileSystemService, 'get').mockReturnValue(fakeGit as never);
		jest.spyOn(gitFileSystemService, 'getForRemoteBackup').mockReturnValue(fakeGit as never);

		const committed = await service.syncProject('user-a', project.id, 'garage');
		expect(committed.uploadedObjects).toBe(2);
		expect(exportGitBackup).toHaveBeenCalledTimes(1);
		const before = remote.putObjectCount;
		await expect(service.syncProject('user-a', project.id, 'garage'))
			.resolves.toMatchObject({ status: 'unchanged', uploadedObjects: 0 });
		expect(exportGitBackup).toHaveBeenCalledTimes(1);

		const binding = service.getProjectBinding('user-a', project.id)!;
		const loaded = await (service as any).loadCatalogue('user-a', 'garage',
			(service as any).getWrappingKey());
		const { unwrapProjectStorageKey } = await import('../../src/utils/storageEncryptionUtils');
		const key = await unwrapProjectStorageKey(
			loaded.catalogue.projects[0].wrappedProjectKey, loaded.accountKey,
		);
		const previous = await (service as any).loadRevisionManifest(
			'garage', binding.storageProjectId, binding.baseRevision, key,
		);
		expect(previous.version).toBe(2);
		expect(Object.keys(previous.git).sort()).toEqual([
			'HEAD', `objects/ab/${'c'.repeat(38)}`,
		]);

		setFileContent('changed');
		const changed = await service.syncProject('user-a', project.id, 'garage');
		expect(changed.uploadedObjects).toBe(1);
		expect(remote.putObjectCount - before).toBe(1);
		expect(exportGitBackup).toHaveBeenCalledTimes(1);
		const latest = await (service as any).loadRevisionManifest(
			'garage', binding.storageProjectId, changed.revision, key,
		);
		expect(latest.git).toEqual(previous.git);
	});

	it('restores missing local Git without overwriting an existing Git repository', async () => {
		const { service } = await makeHarness();
		let marker: string | null = 'git-change-1';
		let gitBase: string | null = null;
		let canRestore = false;
		const importGitBackup = jest.fn(async (_files: Map<string, Uint8Array>) => true);
		const fakeGit = {
			getGitBackupDirty: () => marker,
			getGitBackupBase: () => gitBase,
			hasGitBackupConflict: () => false,
			exportGitBackup: async () => ({ files: new Map([['HEAD', new TextEncoder().encode('ref: refs/heads/main\n')]]), reused: new Set<string>() }),
			markGitBackupSynced: (value: string, signature: string) => { gitBase = signature; if (marker === value) marker = null; },
			canRestoreGitBackup: async () => canRestore,
			hasGitBackupObject: async () => false,
			importGitBackup,
			integrateGitBackup: jest.fn(async () => true),
			adoptGitBackup: (signature: string) => { gitBase = signature; },
			setGitBackupConflict: jest.fn(),
		};
		jest.spyOn(gitFileSystemService, 'get').mockReturnValue(fakeGit as never);
		jest.spyOn(gitFileSystemService, 'getForRemoteBackup').mockReturnValue(fakeGit as never);
		await service.syncProject('user-a', project.id, 'garage');
		expect(importGitBackup).not.toHaveBeenCalled();
		canRestore = true;
		await service.syncProject('user-a', project.id, 'garage');
		expect(importGitBackup).toHaveBeenCalledTimes(1);
		expect(importGitBackup.mock.calls[0][0].has('HEAD')).toBe(true);
		canRestore = false;
		await service.syncProject('user-a', project.id, 'garage');
		expect(importGitBackup).toHaveBeenCalledTimes(1);
	});

	it('imports subsequent commits into an existing peer and reuses unchanged Git objects', async () => {
		const { service, remote } = await makeHarness();
		const head = new TextEncoder().encode('ref: refs/heads/main\n');
		const oid1 = 'a'.repeat(40);
		const oid2 = 'b'.repeat(40);
		const object1 = `objects/ab/${'c'.repeat(38)}`;
		const object2 = `objects/de/${'f'.repeat(38)}`;
		let marker: string | null = 'initial';
		let base: string | null = null;
		let commit = oid1;
		const source = {
			getGitBackupDirty: () => marker,
			getGitBackupBase: () => base,
			hasGitBackupConflict: () => false,
			canRestoreGitBackup: async () => false,
			hasGitBackupObject: async () => false,
			exportGitBackup: jest.fn(async (known: Set<string>) => ({
				files: new Map<string, Uint8Array>([
					['HEAD', head],
					['refs/heads/main', new TextEncoder().encode(`${commit}\n`)],
					...[ [object1, new Uint8Array([1])] as [string, Uint8Array],
						...(commit === oid2 ? [[object2, new Uint8Array([2])] as [string, Uint8Array]] : []),
					].filter(([path]) => !known?.has(path)),
				]),
				reused: new Set<string>([object1, object2].filter((path) => known?.has(path) && (path === object1 || commit === oid2))),
			})),
			markGitBackupSynced: (value: string, signature: string) => {
				base = signature;
				if (marker === value) marker = null;
			},
			setGitBackupConflict: jest.fn(),
		};
		let peerBase: string | null = null;
		let peerInitialized = false;
		const imported = jest.fn(async () => { peerInitialized = true; return true; });
		const updated = jest.fn(async () => true);
		const peer = {
			getGitBackupBase: () => peerBase,
			canRestoreGitBackup: async () => !peerInitialized,
			hasGitBackupConflict: () => false,
			hasGitBackupObject: async (path: string) => path === object1,
			importGitBackup: imported,
			integrateGitBackup: updated,
			adoptGitBackup: (signature: string) => { peerBase = signature; },
			setGitBackupConflict: jest.fn(),
			getGitBackupDirty: () => null,
		};
		let active: typeof source | typeof peer = source;
		jest.spyOn(gitFileSystemService, 'get').mockImplementation(() => active as never);
		jest.spyOn(gitFileSystemService, 'getForRemoteBackup').mockImplementation(() =>
			active === source ? source as never : null);
		await service.syncProject('user-a', project.id, 'garage');
		active = peer;
		await service.syncProject('user-a', project.id, 'garage');
		expect(imported).toHaveBeenCalledTimes(1);
		active = source;
		commit = oid2;
		marker = 'next-commit';
		await service.syncProject('user-a', project.id, 'garage');
		const objectsBefore = remote.getObjectCount;
		active = peer;
		await service.syncProject('user-a', project.id, 'garage');
		expect(updated).toHaveBeenCalledTimes(1);
		expect(updated.mock.calls[0][0].get('refs/heads/main')).toEqual(new TextEncoder().encode(`${oid2}\n`));
		expect(updated.mock.calls[0][0].has(object2)).toBe(true);
		expect(updated.mock.calls[0][0].has(object1)).toBe(false);
		expect(remote.getObjectCount - objectsBefore).toBe(3); // HEAD, branch ref, new object
		await service.syncProject('user-a', project.id, 'garage');
		expect(updated).toHaveBeenCalledTimes(1);
	});

	it('allows an opted-in shared peer to publish Git commits into the same encrypted project', async () => {
		const { service: owner, remote, dataSerializer } = await makeHarness();
		await owner.syncProject('user-a', project.id, 'garage');
		const ownerBinding = owner.getProjectBinding('user-a', project.id)!;
		owner.setShareWithCollaborators('user-a', project.id, true);
		const sharedKey = await owner.exportProjectKeyForSharing('user-a', project.id);
		const peerProject = { ...project, id: 'peer-project', ownerId: 'user-b' };
		const peerKey = await deriveStorageWrappingKey({
			username: 'bob', password: 'different credentials',
			prfOutput: new Uint8Array(32).fill(9),
		});
		const peerService = new StorageSyncService({
			storageService: remote,
			dataSerializer,
			getProjectById: async (id) => id === peerProject.id ? peerProject : null,
			getWrappingKey: () => peerKey,
			persistence: new MemoryStringStorage(),
		});
		peerService.attachSharedProject(
			'user-b', peerProject.id, 'garage',
			ownerBinding.storageProjectId, ownerBinding.baseRevision,
		);
		await peerService.storeSharedProjectKey('user-b', peerProject.id, sharedKey);
		const files = new Map([['HEAD', new TextEncoder().encode('ref: refs/heads/main\n')]]);
		const fakeGit = {
			getGitBackupDirty: () => 'peer-commit',
			getGitBackupBase: () => null,
			hasGitBackupConflict: () => false,
			exportGitBackup: jest.fn(async () => ({ files, reused: new Set<string>() })),
			markGitBackupSynced: jest.fn(),
			setGitBackupConflict: jest.fn(),
		};
		jest.spyOn(gitFileSystemService, 'getForRemoteBackup').mockReturnValue(fakeGit as never);
		jest.spyOn(gitFileSystemService, 'get').mockReturnValue(fakeGit as never);
		const result = await peerService.syncProject('user-b', peerProject.id, 'garage');
		const projectKey = await importProjectStorageKey(sharedKey);
		const manifest = await (peerService as any).loadRevisionManifest(
			'garage', ownerBinding.storageProjectId, result.revision, projectKey,
		);
		expect(manifest.git).toHaveProperty('HEAD');
		expect(fakeGit.markGitBackupSynced).toHaveBeenCalledTimes(1);
	});

	it('does not export local Git when remote history changed independently', async () => {
		const { service } = await makeHarness();
		let conflicted = false;
		const fakeGit = {
			getGitBackupDirty: () => 'local-change',
			getGitBackupBase: () => 'previous-git-backup',
			hasGitBackupConflict: () => false,
			exportGitBackup: jest.fn(),
			setGitBackupConflict: jest.fn((value: boolean) => { conflicted = value; }),
		};
		jest.spyOn(gitFileSystemService, 'get').mockReturnValue(fakeGit as never);
		jest.spyOn(gitFileSystemService, 'getForRemoteBackup').mockReturnValue(fakeGit as never);
		const remote = { version: 2, git: { HEAD: { hash: 'b' } } };
		await expect((service as any).prepareGitBackup(project.id, remote))
			.resolves.toBeNull();
		expect(fakeGit.exportGitBackup).not.toHaveBeenCalled();
		expect(fakeGit.setGitBackupConflict).toHaveBeenCalledWith(true);
		// Advancing the ordinary project revision must not unblock the Git conflict.
		await expect((service as any).prepareGitBackup(project.id, remote))
			.resolves.toBeNull();
		expect(fakeGit.exportGitBackup).not.toHaveBeenCalled();
	});
});

describe('StorageSyncService reconciliation', () => {

	it('merges independent file additions without opening the merge UI', async () => {
		const remote = new MemoryStorageProvider();
		const wrappingKey = await deriveStorageWrappingKey({
			username: 'alice',
			password: 'shared-account',
			prfOutput: new Uint8Array(32).fill(13),
		});
		const writer = makeFileTreeClient(remote, wrappingKey);
		const peer = makeFileTreeClient(remote, wrappingKey);

		await writer.service.syncProject('user-a', project.id, 'garage');
		await peer.service.syncProject('user-a', project.id, 'garage');
		writer.addFile('/remote.tex', 'remote');
		peer.addFile('/local.tex', 'local');
		await writer.service.syncProject('user-a', project.id, 'garage');

		let mergeRequests = 0;
		const removeListener = (await import('../../src/services/MergeResolutionService'))
			.mergeResolutionService.addListener((request) => {
				mergeRequests += 1;
				request.resolve(
					new Map(
						request.conflicts.map((conflict) => [
							conflict.path,
							{ action: 'keep-local' as const },
						]),
					),
				);
			});
		try {
			const result = await peer.service.syncProject(
				'user-a',
				project.id,
				'garage',
			);
			expect(result.status).toBe('merged');
		} finally {
			removeListener();
		}

		expect(mergeRequests).toBe(0);
		expect(peer.getPaths()).toEqual(['/base.tex', '/local.tex', '/remote.tex']);
		expect(peer.getAppliedCount()).toBe(1);
	});

	it('commits file additions and deletions into the Garage revision manifest', async () => {
		const remote = new MemoryStorageProvider();
		const wrappingKey = await deriveStorageWrappingKey({
			username: 'alice',
			password: 'shared-account',
			prfOutput: new Uint8Array(32).fill(14),
		});
		const client = makeFileTreeClient(remote, wrappingKey);

		await client.service.syncProject('user-a', project.id, 'garage');
		client.addFile('/added.tex', 'added');
		const added = await client.service.syncProject(
			'user-a',
			project.id,
			'garage',
		);
		const addedManifest = await readRemoteManifest(
			remote,
			client.service,
			added.revision!,
		);
		expect(addedManifest.entries).toHaveProperty([
			`projects/${project.id}/files/added.tex`,
		]);

		client.deleteFile('/added.tex');
		const removed = await client.service.syncProject(
			'user-a',
			project.id,
			'garage',
		);
		const removedManifest = await readRemoteManifest(
			remote,
			client.service,
			removed.revision!,
		);
		expect(removedManifest.entries).not.toHaveProperty([
			`projects/${project.id}/files/added.tex`,
		]);
	});

	it('adopts a collaborator revision without downloading or reapplying edits already received locally', async () => {
		const remote = new MemoryStorageProvider();
		const wrappingKey = await deriveStorageWrappingKey({
			username: 'alice',
			password: 'shared-account',
			prfOutput: new Uint8Array(32).fill(9),
		});
		const writer = makeReconciliationClient(remote, wrappingKey, 'base');
		const peer = makeReconciliationClient(remote, wrappingKey, 'base');

		await writer.service.syncProject('user-a', project.id, 'garage');
		await peer.service.syncProject('user-a', project.id, 'garage');
		writer.setContent('shared edit');
		await writer.service.syncProject('user-a', project.id, 'garage');
		peer.setContent('shared edit');

		const beforeReads = remote.getObjectCount;
		const beforeCommits = remote.commitCount;
		const result = await peer.service.syncProject(
			'user-a',
			project.id,
			'garage',
		);

		expect(result.status).toBe('unchanged');
		expect(remote.getObjectCount).toBe(beforeReads);
		expect(remote.commitCount).toBe(beforeCommits);
		expect(peer.getAppliedCount()).toBe(0);
		expect(peer.service.getProjectBinding('user-a', project.id)?.baseRevision).toBe(
			result.revision,
		);
	});

	it('pulls a remote-only change through ProjectDataService without creating another revision', async () => {
		const remote = new MemoryStorageProvider();
		const wrappingKey = await deriveStorageWrappingKey({
			username: 'alice',
			password: 'shared-account',
			prfOutput: new Uint8Array(32).fill(10),
		});
		const writer = makeReconciliationClient(remote, wrappingKey, 'base');
		const peer = makeReconciliationClient(remote, wrappingKey, 'base');

		await writer.service.syncProject('user-a', project.id, 'garage');
		await peer.service.syncProject('user-a', project.id, 'garage');
		writer.setContent('remote only');
		await writer.service.syncProject('user-a', project.id, 'garage');
		const beforeCommits = remote.commitCount;

		const result = await peer.service.syncProject(
			'user-a',
			project.id,
			'garage',
		);

		expect(result.status).toBe('pulled');
		expect(peer.getContent()).toBe('remote only');
		expect(peer.getAppliedCount()).toBe(1);
		expect(remote.commitCount).toBe(beforeCommits);
	});

	it('three-way auto-merges independent text edits and commits the merged result on top of remote HEAD', async () => {
		const remote = new MemoryStorageProvider();
		const wrappingKey = await deriveStorageWrappingKey({
			username: 'alice',
			password: 'shared-account',
			prfOutput: new Uint8Array(32).fill(11),
		});
		const base = 'one\nmiddle\nthree\n';
		const writer = makeReconciliationClient(remote, wrappingKey, base);
		const peer = makeReconciliationClient(remote, wrappingKey, base);

		await writer.service.syncProject('user-a', project.id, 'garage');
		await peer.service.syncProject('user-a', project.id, 'garage');
		writer.setContent('ONE\nmiddle\nthree\n');
		peer.setContent('one\nmiddle\nTHREE\n');
		writer.setProjectName('Remote title');
		peer.setProjectName('Local title');
		await writer.service.syncProject('user-a', project.id, 'garage');
		const remoteHeadBeforeMerge = remote.heads.values().next().value;

		let mergeRequests = 0;
		const removeListener = (await import('../../src/services/MergeResolutionService'))
			.mergeResolutionService.addListener((request) => {
				mergeRequests += 1;
				request.resolve(
					new Map(
						request.conflicts.map((conflict) => [
							conflict.path,
							{ action: 'keep-local' as const },
						]),
					),
				);
			});
		let result;
		try {
			result = await peer.service.syncProject(
				'user-a',
				project.id,
				'garage',
			);
		} finally {
			removeListener();
		}

		expect(mergeRequests).toBe(0);
		expect(result.status).toBe('merged');
		expect(peer.getContent()).toBe('ONE\nmiddle\nTHREE\n');
		expect(result.revision).not.toBe(remoteHeadBeforeMerge);
		expect(peer.service.getProjectBinding('user-a', project.id)?.baseRevision).toBe(
			result.revision,
		);
	});

	it('routes divergent binary content through the existing conflict resolver instead of overwriting it', async () => {
		const remote = new MemoryStorageProvider();
		const wrappingKey = await deriveStorageWrappingKey({
			username: 'alice',
			password: 'shared-account',
			prfOutput: new Uint8Array(32).fill(12),
		});
		const writer = makeReconciliationClient(
			remote,
			wrappingKey,
			new Uint8Array([1, 2]),
			true,
		);
		const peer = makeReconciliationClient(
			remote,
			wrappingKey,
			new Uint8Array([1, 2]),
			true,
		);

		await writer.service.syncProject('user-a', project.id, 'garage');
		await peer.service.syncProject('user-a', project.id, 'garage');
		writer.setContent(new Uint8Array([3, 4]));
		peer.setContent(new Uint8Array([5, 6]));
		await writer.service.syncProject('user-a', project.id, 'garage');

		const removeListener = (await import('../../src/services/MergeResolutionService'))
			.mergeResolutionService.addListener((request) => {
				expect(request.conflicts.map((conflict) => conflict.path)).toEqual([
					`projects/${project.id}/files/asset.bin`,
				]);
				request.resolve(
					new Map(
						request.conflicts.map((conflict) => [
							conflict.path,
							{ action: 'keep-remote' as const },
						]),
					),
				);
			});
		try {
			const result = await peer.service.syncProject(
				'user-a',
				project.id,
				'garage',
			);
			expect(result.status).toBe('pulled');
			expect([...((peer.getContent() as Uint8Array) ?? [])]).toEqual([3, 4]);
		} finally {
			removeListener();
		}
	});
});

describe('StorageSyncService incoming revision checks', () => {
	it('checks only HEAD and never downloads or reconciles data', async () => {
		const { service, remote } = await makeHarness();
		await expect(service.checkBoundProjectRevision('user-a', project.id))
			.resolves.toBeNull();

		const binding = service.attachProject('user-a', project.id, 'garage');
		await expect(service.checkBoundProjectRevision('user-a', project.id))
			.resolves.toEqual({ status: 'local-only', revision: null });

		remote.heads.set(binding.storageProjectId, 'r1');
		await expect(service.checkBoundProjectRevision('user-a', project.id))
			.resolves.toEqual({ status: 'updates-available', revision: 'r1' });

		service.attachSharedProject(
			'user-a', project.id, 'garage', binding.storageProjectId, 'r1',
		);
		await expect(service.checkBoundProjectRevision('user-a', project.id))
			.resolves.toEqual({ status: 'synced', revision: 'r1' });

		remote.heads.delete(binding.storageProjectId);
		await expect(service.checkBoundProjectRevision('user-a', project.id))
			.resolves.toEqual({ status: 'error', revision: null });

		expect(remote.getObjectCount).toBe(0);
		expect(remote.getRevisionCount).toBe(0);
		expect(remote.getCatalogueCount).toBe(0);
		expect(remote.commitCount).toBe(0);

		service.setProjectStorageEnabled('user-a', project.id, false);
		await expect(service.checkBoundProjectRevision('user-a', project.id))
			.resolves.toEqual({ status: 'unavailable', revision: null });
	});
});

describe('StorageSyncService dashboard lifecycle', () => {
	it('does not report an unsynced project as an error before its first upload', async () => {
		const { service, remote, wrappingKey, persistence } = await makeHarness();
		service.attachProject('user-a', project.id, 'garage');
		const withLocal = new StorageSyncService({
			storageService: remote,
			getProjectById: async (id) => (id === project.id ? project : null),
			getProjectsByUser: async () => [project],
			getWrappingKey: () => wrappingKey,
			persistence,
		});
		await expect(
			withLocal.reconcileProvider('user-a', 'garage'),
		).resolves.toMatchObject([{ status: 'local-only', error: undefined }]);
	});

	it('keeps a missing previously synchronized catalogue entry as an error', async () => {
		const { service, remote, wrappingKey, persistence } = await makeHarness();
		service.attachSharedProject(
			'user-a',
			project.id,
			'garage',
			'stored-project',
			'revision-1',
		);
		const withLocal = new StorageSyncService({
			storageService: remote,
			getProjectById: async (id) => (id === project.id ? project : null),
			getProjectsByUser: async () => [project],
			getWrappingKey: () => wrappingKey,
			persistence,
		});
		await expect(
			withLocal.reconcileProvider('user-a', 'garage'),
		).resolves.toMatchObject([
			{
				status: 'error',
				error: 'Project storage entry is missing from the remote catalogue',
			},
		]);
	});

	it('flags a missing HEAD for a previously synchronized catalogue project', async () => {
		const { service, remote, wrappingKey, persistence } = await makeHarness();
		await service.syncProject('user-a', project.id, 'garage');
		const binding = service.getProjectBinding('user-a', project.id)!;
		remote.heads.delete(binding.storageProjectId);
		const dashboard = new StorageSyncService({
			storageService: remote,
			getProjectById: async (id) => (id === project.id ? project : null),
			getProjectsByUser: async () => [project],
			getWrappingKey: () => wrappingKey,
			persistence,
		});

		await expect(dashboard.reconcileProvider('user-a', 'garage'))
			.resolves.toMatchObject([{ status: 'error' }]);
	});

	it('reports shared project bindings without requiring an account catalogue', async () => {
		const remote = new MemoryStorageProvider();
		remote.heads.set('shared-project', 'r1');
		const service = new StorageSyncService({
			storageService: remote,
			getProjectById: async (id) => (id === project.id ? project : null),
			persistence: new MemoryStringStorage(),
		});
		service.attachSharedProject(
			'user-a',
			project.id,
			'shared-garage',
			'shared-project',
			'r1',
		);

		await expect(
			service.reconcileProjectBinding('user-a', project.id),
		).resolves.toMatchObject({
			providerId: 'shared-garage',
			storageProjectId: 'shared-project',
			localProjectId: project.id,
			status: 'synced',
			remoteOnly: false,
		});

		remote.heads.set('shared-project', 'r2');
		await expect(
			service.reconcileProjectBinding('user-a', project.id),
		).resolves.toMatchObject({ status: 'updates-available' });

		remote.heads.delete('shared-project');
		await expect(
			service.reconcileProjectBinding('user-a', project.id),
		).resolves.toMatchObject({ status: 'error' });
	});

	it('reconciles a remote-only catalogue without downloading project bodies', async () => {
		const { remote, service: writer } = await makeHarness();
		await writer.syncProject('user-a', project.id, 'garage');
		const beforeObjects = remote.getObjectCount;
		const beforeRevisions = remote.getRevisionCount;
		const wrappingKey = await deriveStorageWrappingKey({
			username: 'alice',
			password: 'correct horse battery staple',
			prfOutput: new Uint8Array(32).fill(7),
		});
		const reader = new StorageSyncService({
			storageService: remote,
			getProjectById: async () => null,
			getProjectsByUser: async () => [],
			getWrappingKey: () => wrappingKey,
			persistence: new MemoryStringStorage(),
		});

		const dashboard = await reader.reconcileProvider('user-a', 'garage');

		expect(dashboard).toHaveLength(1);
		expect(dashboard[0]).toMatchObject({
			localProjectId: project.id,
			name: project.name,
			status: 'stored',
			remoteOnly: true,
		});
		expect(remote.getObjectCount).toBe(beforeObjects);
		expect(remote.getRevisionCount).toBe(beforeRevisions);
	});

	it('restores a remote-only project into the normal project data layer', async () => {
		const { remote, service: writer } = await makeHarness();
		const first = await writer.syncProject('user-a', project.id, 'garage');
		const writerBinding = writer.getProjectBinding('user-a', project.id)!;
		const wrappingKey = await deriveStorageWrappingKey({
			username: 'alice',
			password: 'correct horse battery staple',
			prfOutput: new Uint8Array(32).fill(7),
		});
		let restoredProject: Project | null = null;
		let imported = 0;
		const reader = new StorageSyncService({
			storageService: remote,
			dataSerializer: {
				async serializeProjectDocuments() {
					throw new Error('restore must not serialize local documents');
				},
				async serializeProjectFiles() {
					throw new Error('restore must not serialize local files');
				},
				async deserializeToIndexedDB(data) {
					imported += 1;
					expect(data.projectData.has(project.id)).toBe(true);
				},
			},
			getProjectById: async () => restoredProject,
			getProjectsByUser: async () => (restoredProject ? [restoredProject] : []),
			updateProject: async (value) => {
				restoredProject = value;
			},
			getWrappingKey: () => wrappingKey,
			persistence: new MemoryStringStorage(),
		});

		const restored = await reader.restoreRemoteProject(
			'user-a',
			'garage',
			writerBinding.storageProjectId,
		);

		expect(restored).toMatchObject({
			id: project.id,
			name: project.name,
			ownerId: 'user-a',
		});
		expect(imported).toBe(1);
		expect(reader.getProjectBinding('user-a', project.id)).toMatchObject({
			providerId: 'garage',
			storageProjectId: writerBinding.storageProjectId,
			baseRevision: first.revision,
			enabled: true,
		});
		expect(remote.getObjectCount).toBeGreaterThan(0);
	});
});

describe('StorageSyncService remote catalogue management', () => {
	it('disconnects a missing or unreachable remote without deleting local data or rewriting storage', async () => {
		const { remote, service } = await makeHarness();
		const first = await service.syncProject('user-a', project.id, 'garage');
		const previous = service.getProjectBinding('user-a', project.id)!;
		remote.heads.delete(previous.storageProjectId);
		const catalogue = remote.catalogue;
		const objects = new Map(remote.objects);
		const revisions = new Map(remote.revisions);
		const writesBefore = remote.putObjectCount;
		const getHead = jest.spyOn(remote, 'getHead').mockRejectedValue(new Error('Storage unavailable'));

		await expect(service.disconnectBoundProject('user-a', project.id)).resolves.toBeUndefined();
		expect(getHead).not.toHaveBeenCalled();
		expect(service.getProjectBinding('user-a', project.id)).toBeNull();
		expect(remote.catalogue).toBe(catalogue);
		expect(remote.objects).toEqual(objects);
		expect(remote.revisions).toEqual(revisions);
		expect(remote.putObjectCount).toBe(writesBefore);

		getHead.mockRestore();
		const replacementRemote = new MemoryStorageProvider();
		const replacementService = new StorageSyncService({
			storageService: replacementRemote,
			dataSerializer,
			getProjectById: async () => project,
			updateProject: async () => {},
			getWrappingKey: () => wrappingKey,
			persistence,
		});
		const replacement = replacementService.attachProject('user-a', project.id, 'replacement');
		expect(replacement.storageProjectId).not.toBe(previous.storageProjectId);
		expect(replacement.baseRevision).toBeUndefined();
		const synced = await replacementService.syncProject('user-a', project.id, 'replacement');
		expect(synced.status).toBe('synced');
		expect(synced.revision).not.toBe(first.revision);
		expect(replacementService.getProjectBinding('user-a', project.id)?.storageProjectId)
			.toBe(replacement.storageProjectId);
		expect(remote.objects).toEqual(objects);
	});

	it('keeps a disconnected local project detached across reconciliation and permits explicit reconnection', async () => {
		const { remote, service, persistence, wrappingKey } = await makeHarness();
		await service.syncProject('user-a', project.id, 'garage');
		const id = service.getProjectBinding('user-a', project.id)!.storageProjectId;
		service.disconnectProject('user-a', project.id);

		const reopened = new StorageSyncService({
			storageService: remote,
			persistence,
			getWrappingKey: () => wrappingKey,
			getProjectsByUser: async () => [project],
			getProjectById: async () => project,
		});
		const entries = await reopened.reconcileProvider('user-a', 'garage');
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({ status: 'disconnected', remoteOnly: false });
		expect(reopened.getProjectBinding('user-a', project.id)).toBeNull();

		await reopened.reconnectProject('user-a', project.id, 'garage', id);
		expect(reopened.getProjectBinding('user-a', project.id)).toMatchObject({
			providerId: 'garage', storageProjectId: id, enabled: true,
		});
		expect((await reopened.reconcileProvider('user-a', 'garage'))[0].status).not.toBe('disconnected');
	});

	it('deletes remote objects and revisions, retains local project, and removes catalogue entry', async () => {
		const { remote, service, persistence, wrappingKey } = await makeHarness();
		await service.syncProject('user-a', project.id, 'garage');
		const id = service.getProjectBinding('user-a', project.id)!.storageProjectId;
		const objectCount = remote.objects.size;
		expect(objectCount).toBeGreaterThan(0);
		expect(remote.owners.has(id)).toBe(true);
		expect((await service.reconcileProvider('user-a', 'garage'))[0].canDeleteRemote).toBe(true);
		await expect(remote.deleteProject('garage', id, 'b'.repeat(64)))
			.rejects.toThrow('Invalid project deletion key');
		expect(remote.objects.size).toBe(objectCount);
		await service.deleteRemoteProjects('user-a', 'garage', [id]);
		expect(service.getProjectBinding('user-a', project.id)).toBeNull();
		expect(remote.objects.size).toBe(0);
		expect(remote.revisions.size).toBe(0);
		expect(remote.heads.has(id)).toBe(false);

		const reopened = new StorageSyncService({
			storageService: remote, persistence, getWrappingKey: () => wrappingKey,
			getProjectsByUser: async () => [project],
			getProjectById: async () => project,
		});
		expect(await reopened.reconcileProvider('user-a', 'garage')).toEqual([]);
		expect(reopened.getProjectBinding('user-a', project.id)).toBeNull();
		await expect(reopened.deleteRemoteProjects('user-a', 'garage', [id]))
			.rejects.toThrow('Some remote projects are no longer in the catalogue');
	});

	it('does not grant deletion authority to a peer importing a shared project', async () => {
		const { remote, service } = await makeHarness();
		await service.syncProject('user-a', project.id, 'garage');
		const id = service.getProjectBinding('user-a', project.id)!.storageProjectId;
		const peer = new StorageSyncService({
			storageService: remote,
			persistence: new MemoryStringStorage(),
			getProjectById: async () => project,
		});
		peer.attachSharedProject('user-a', project.id, 'peer-storage', id);
		expect(peer.getProjectBinding('user-a', project.id)?.storageProjectId).toBe(id);
		await expect(peer.deleteRemoteProjects('user-a', 'peer-storage', [id]))
			.rejects.toThrow();
		expect(remote.heads.has(id)).toBe(true);
	});
});

describe('StorageSyncService autosync queue', () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
		jest.restoreAllMocks();
	});

	it('debounces changes and preserves edits that arrive during an active sync', async () => {
		const service = new StorageSyncService({
			persistence: new MemoryStringStorage(),
		});
		service.attachProject('user-a', project.id, 'garage');

		type SyncResult = {
			status: 'synced';
			revision: string;
			uploadedObjects: number;
		};
		let finishFirst!: (result: SyncResult) => void;
		const first = new Promise<SyncResult>(
			(resolve) => {
				finishFirst = resolve;
			},
		);
		const sync = jest
			.spyOn(service, 'syncBoundProject')
			.mockImplementationOnce(() => first)
			.mockResolvedValue({
				status: 'synced',
				revision: 'r2',
				uploadedObjects: 1,
			});

		service.scheduleBoundProjectSync('user-a', project.id);
		service.scheduleBoundProjectSync('user-a', project.id);
		await jest.advanceTimersByTimeAsync(2000);
		expect(sync).toHaveBeenCalledTimes(1);

		service.scheduleBoundProjectSync('user-a', project.id);
		await jest.advanceTimersByTimeAsync(2000);
		expect(sync).toHaveBeenCalledTimes(1);

		finishFirst({ status: 'synced', revision: 'r1', uploadedObjects: 1 });
		await Promise.resolve();
		await jest.runOnlyPendingTimersAsync();
		expect(sync).toHaveBeenCalledTimes(2);
	});

	it('retries one CAS race so a live collaborator can adopt the new HEAD', async () => {
		const service = new StorageSyncService({
			persistence: new MemoryStringStorage(),
		});
		service.attachProject('user-a', project.id, 'garage');
		const sync = jest
			.spyOn(service, 'syncBoundProject')
			.mockRejectedValueOnce(new StorageRemoteAheadError('remote-r2'))
			.mockResolvedValue({
				status: 'unchanged',
				revision: 'remote-r2',
				uploadedObjects: 0,
			});

		service.scheduleBoundProjectSync('user-a', project.id);
		await jest.advanceTimersByTimeAsync(2000);
		await Promise.resolve();
		await jest.advanceTimersByTimeAsync(250);
		expect(sync).toHaveBeenCalledTimes(2);
	});
});

