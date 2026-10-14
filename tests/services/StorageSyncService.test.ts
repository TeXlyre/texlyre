import type { Project } from '../../src/types/projects';
import {
	StorageRemoteAheadError,
	StorageSyncService,
} from '../../src/services/StorageSyncService';
import { StorageProtocolError } from '../../src/services/GenericStorageService';
import { deriveStorageWrappingKey } from '../../src/utils/storageEncryptionUtils';

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
			projectId === project.id ? project : null,
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
		getContent() {
			return copyContent(fileContent);
		},
		getAppliedCount() {
			return applied;
		},
	};
};

describe('StorageSyncService reconciliation', () => {
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
		await writer.service.syncProject('user-a', project.id, 'garage');
		const remoteHeadBeforeMerge = remote.heads.values().next().value;

		const result = await peer.service.syncProject(
			'user-a',
			project.id,
			'garage',
		);

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

describe('StorageSyncService dashboard lifecycle', () => {
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

