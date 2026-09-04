jest.mock('@/i18n', () => ({
	t: (message: string) => message,
}));

jest.mock('@src/services/AuthService', () => ({
	authService: {
		getProjectsByUser: jest.fn(),
		createOrUpdateProject: jest.fn(),
		db: null,
		initialize: jest.fn(),
	},
}));

jest.mock('@src/services/FileStoreService', () => ({
	fileStoreService: {
		switchToProject: jest.fn(),
		getFileByPath: jest.fn(),
		createDirectoryPath: jest.fn(),
		storeFile: jest.fn(),
	},
	fileStorageEventEmitter: { emitChange: jest.fn() },
}));

jest.mock('@src/services/ProjectDataService', () => ({
	ProjectDataService: jest.fn(),
}));

jest.mock('@src/services/BackupLayoutService', () => ({
	UnifiedDataStructureService: jest.fn(),
}));

import { authService } from '@src/services/AuthService';
import { fileStoreService } from '@src/services/FileStoreService';
import { GitBackupImportService } from '@src/services/GitBackupImportService';
import type {
	GitBackupAdapter,
	GitBackupProjectFiles,
	ResolvedGitCredentials,
} from '@src/types/gitBackup';

const mockAuthService = authService as jest.Mocked<typeof authService>;
const mockFileStoreService = fileStoreService as jest.Mocked<
	typeof fileStoreService
>;

interface Target {
	id: string;
}

const credentials: ResolvedGitCredentials<Target> = {
	token: 'token',
	target: { id: 'target' },
	branch: 'main',
};

const toRemoteString = (bytes: Uint8Array): string =>
	Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');

const utf8RemoteString = (text: string): string =>
	toRemoteString(new TextEncoder().encode(text));

const createAdapter = (
	readFile: GitBackupAdapter<Target>['readFile'],
): GitBackupAdapter<Target> =>
	({
		displayName: 'Test',
		pluginId: 'test',
		tokenSecretKey: 'token',
		targetSecretKey: 'target',
		statusTargetKey: 'target',
		tokenType: 'token',
		importIdPrefix: 'test-import',
		testConnection: jest.fn(async () => true),
		listTargets: jest.fn(async () => []),
		parseTarget: jest.fn(() => ({ id: 'target' })),
		targetFromStoredValue: jest.fn(() => ({ id: 'target' })),
		getTargetLabel: jest.fn(() => 'target'),
		getTargetSecretValue: jest.fn(() => 'target'),
		getTargetMetadata: jest.fn(() => ({})),
		getRecursiveTree: jest.fn(async () => []),
		readFile,
		commitChanges: jest.fn(async () => {}),
	}) as GitBackupAdapter<Target>;

describe('GitBackupImportService', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockAuthService.getProjectsByUser.mockResolvedValue([{ id: 'project-1' }]);
		mockFileStoreService.getFileByPath.mockResolvedValue(undefined);
		mockFileStoreService.switchToProject.mockResolvedValue(undefined);
		mockFileStoreService.createDirectoryPath.mockResolvedValue(undefined);
		mockFileStoreService.storeFile.mockResolvedValue(undefined);
		mockAuthService.createOrUpdateProject.mockResolvedValue(undefined);
	});

	it('groups project metadata, document snapshots and nested files', () => {
		const adapter = createAdapter(jest.fn(async () => ''));
		adapter.getFileRefForPath = jest.fn(
			(_item, path, branch) => `${branch}:${path}`,
		);
		const service = new GitBackupImportService(adapter);
		const grouped = service.groupProjectFiles(
			[
				{ type: 'blob', path: 'projects/p1/metadata.json', sha: 'a' },
				{
					type: 'blob',
					path: 'projects/p1/documents/.texlyre_metadata.json',
					sha: 'b',
				},
				{ type: 'blob', path: 'projects/p1/documents/d1.txt', sha: 'c' },
				{ type: 'blob', path: 'projects/p1/documents/d1.yjs', sha: 'd' },
				{
					type: 'blob',
					path: 'projects/p1/files/folder/main.tex',
					sha: 'e',
				},
			],
			undefined,
			'dev',
		);

		const project = grouped.get('p1');
		expect(project?.metadataRef).toBe('dev:projects/p1/metadata.json');
		expect(project?.documentsMetadataRef).toBe(
			'dev:projects/p1/documents/.texlyre_metadata.json',
		);
		expect(project?.documents.get('d1')).toEqual({
			txtRef: 'dev:projects/p1/documents/d1.txt',
			yjsRef: 'dev:projects/p1/documents/d1.yjs',
		});
		expect(project?.files.get('/folder/main.tex')).toBe(
			'dev:projects/p1/files/folder/main.tex',
		);
	});

	it(
		'imports UTF-8 text correctly while preserving binary files byte-for-byte',
		async () => {
		const arabic = 'يعود تاريخ أنظمة التنضيد الرقمية';
		const binary = new Uint8Array([0, 255, 128, 10, 1, 200]);
		const projectMetadata = {
			id: 'project-1',
			name: 'Arabic project',
			docUrl: 'yjs:project-1',
		};
		const filesMetadata = [
			{
				id: 'text-file',
				name: 'arabic.tex',
				path: '/arabic.tex',
				type: 'file',
				isBinary: false,
			},
			{
				id: 'binary-file',
				name: 'image.png',
				path: '/image.png',
				type: 'file',
				isBinary: true,
			},
		];
		const remote = new Map<string, string>([
			['metadata-ref', utf8RemoteString(JSON.stringify(projectMetadata))],
			['files-metadata-ref', utf8RemoteString(JSON.stringify(filesMetadata))],
			['arabic-ref', utf8RemoteString(arabic)],
			['binary-ref', toRemoteString(binary)],
		]);
		const adapter = createAdapter(
			jest.fn(async (_token, _target, ref) => remote.get(ref) || ''),
		);
		const deserializeToIndexedDB = jest.fn(async () => {});
		const dataSerializer = { deserializeToIndexedDB };
		const layout = {
			convertMetadataToProject: jest.fn((metadata) => metadata),
			createManifest: jest.fn(() => ({ version: 1 })),
		};
		const service = new GitBackupImportService(adapter, {
			shouldIgnoreFile: () => false,
			reportActivity: jest.fn(),
			dataSerializer: dataSerializer as any,
			unifiedService: layout as any,
		});
		const projectFiles: GitBackupProjectFiles = {
			metadataRef: 'metadata-ref',
			filesMetadataRef: 'files-metadata-ref',
			documents: new Map(),
			files: new Map([
				['/arabic.tex', 'arabic-ref'],
				['/image.png', 'binary-ref'],
			]),
		};

		const importedMissing = await service.importProjects(
			new Map([['project-1', projectFiles]]),
			credentials,
			'user-1',
		);

		expect(importedMissing).toBe(0);
		const stored = mockFileStoreService.storeFile.mock.calls.map(
			([file]) => file,
		);
		const storedText = stored.find((file) => file.path === '/arabic.tex');
		const storedBinary = stored.find((file) => file.path === '/image.png');

		expect(storedText?.content).toBe(arabic);
		expect(storedBinary?.content).toBeInstanceOf(ArrayBuffer);
		expect(Array.from(new Uint8Array(storedBinary.content))).toEqual(
			Array.from(binary),
		);
		expect(deserializeToIndexedDB).toHaveBeenCalledTimes(1);
		},
	);
});
