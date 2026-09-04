jest.mock('@/i18n', () => ({
	t: (message: string) => message,
}));

jest.mock('@src/services/ProjectDataService', () => ({
	ProjectDataService: jest.fn(),
}));

jest.mock('@src/services/BackupLayoutService', () => ({
	UnifiedDataStructureService: jest.fn(),
}));

jest.mock('@src/utils/annotationTagUtils', () => ({
	stripAnnotationTagsWithSpans: (content: string) => ({ content, spans: [] }),
}));

jest.mock('@src/utils/annotationMerge', () => ({
	mergeAnnotatedSources: jest.fn((_sources: string[], incoming: string) => ({
		content: incoming,
	})),
}));

jest.mock('@src/utils/yjsUtils', () => ({
	yjsStateFromText: (text: string) => new TextEncoder().encode(text).buffer,
}));

jest.mock('@src/services/MergeResolutionService', () => ({
	mergeResolutionService: {
		tryAutoMerge: jest.fn(),
		resolveConflicts: jest.fn(),
	},
}));

import { mergeResolutionService } from '@src/services/MergeResolutionService';
import { mergeAnnotatedSources } from '@src/utils/annotationMerge';
import { GitBackupSyncService } from '@src/services/GitBackupSyncService';
import type {
	GitBackupAdapter,
	GitBackupChange,
	ResolvedGitCredentials,
} from '@src/types/gitBackup';

interface Target {
	id: string;
}

const credentials: ResolvedGitCredentials<Target> = {
	token: 'token',
	target: { id: 'target' },
	branch: 'main',
};

const utf8RemoteString = (text: string): string =>
	Array.from(new TextEncoder().encode(text), (byte) =>
		String.fromCharCode(byte),
	).join('');

const createAdapter = (
	overrides: Partial<GitBackupAdapter<Target>> = {},
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
		readFile: jest.fn(async () => ''),
		commitChanges: jest.fn(async () => {}),
		...overrides,
	}) as GitBackupAdapter<Target>;

describe('GitBackupSyncService', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('indexes blob refs without leaking tree-only entries', () => {
		const service = new GitBackupSyncService(createAdapter());
		const indexed = service.indexRemoteTree([
			{ type: 'blob', path: 'a.txt', sha: 'sha-a' },
			{ type: 'blob', path: 'b.txt', id: 'id-b' },
			{ type: 'tree', path: 'folder', sha: 'tree-sha' },
		]);

		expect(indexed.existingFiles).toEqual(new Set(['a.txt', 'b.txt']));
		expect(indexed.existingFileRefs).toEqual(
			new Map([
				['a.txt', 'sha-a'],
				['b.txt', 'id-b'],
			]),
		);
	});

	it(
		'records linked document paths while building project changes',
		async () => {
		const serializer = {
			serializeProjectDocuments: jest.fn(async () => ({
				documents: [],
				documentContents: new Map(),
			})),
			serializeProjectFiles: jest.fn(async () => ({
				files: [
					{
						id: 'file-1',
						name: 'main.tex',
						path: '/main.tex',
						type: 'file',
						documentId: 'doc-1',
					},
				],
				deletedFiles: [],
				fileContents: new Map([['/main.tex', 'hello']]),
			})),
		};
		const layout = {
			convertProjectToMetadata: jest.fn(() => ({ id: 'project-1' })),
			convertFileToMetadata: jest.fn((file) => file),
		};
		const service = new GitBackupSyncService(createAdapter(), {
			reportActivity: jest.fn(),
			dataSerializer: serializer as any,
			unifiedService: layout as any,
		});

		const result = await service.buildChangesForProjects(
			[{ id: 'project-1' }],
			new Set(),
			new Map(),
			{
				maxFileSize: 1024 * 1024,
				shouldIgnoreFile: () => false,
			},
		);

		expect(
			result.linkedDocuments.get('projects/project-1/files/main.tex'),
		).toEqual({
				txtPath: 'projects/project-1/documents/doc-1.txt',
				yjsPath: 'projects/project-1/documents/doc-1.yjs',
			},
		);
		expect(
			result.changes.find(
				(change) => change.path === 'projects/project-1/files/main.tex',
			),
		).toMatchObject({ type: 'create', content: 'hello' });
		},
	);

	it(
		'propagates a remote-only linked-file resolution to txt and yjs snapshots',
		async () => {
		const physicalPath = 'projects/project-1/files/main.tex';
		const txtPath = 'projects/project-1/documents/doc-1.txt';
		const yjsPath = 'projects/project-1/documents/doc-1.yjs';
		const adapter = createAdapter({
			getLatestCommitSha: jest.fn(async () => 'current'),
			readFileAtRef: jest.fn(async (_token, _target, _path, ref) =>
				utf8RemoteString(ref === 'baseline' ? 'base' : 'remote'),
			),
		});
		const service = new GitBackupSyncService(adapter);
		(
			mergeResolutionService.tryAutoMerge as jest.MockedFunction<
				typeof mergeResolutionService.tryAutoMerge
			>
		).mockReturnValue({
			resolved: true,
			unchanged: false,
			content: 'remote',
		} as any);

		const changes: GitBackupChange[] = [
			{
				type: 'update',
				path: physicalPath,
				content: 'local',
				previousRef: 'old-ref',
			},
		];
		const linkedDocuments = new Map([
			[physicalPath, { txtPath, yjsPath }],
		]);
		const existingFiles = new Set([physicalPath, txtPath, yjsPath]);
		const existingFileRefs = new Map([
			[physicalPath, 'remote-ref'],
			[txtPath, 'txt-ref'],
			[yjsPath, 'yjs-ref'],
		]);

		const resolved = await service.resolveConflicts(
			credentials,
			changes,
			'baseline',
			linkedDocuments,
			existingFiles,
			existingFileRefs,
		);

		expect(resolved).not.toBeNull();
		expect(resolved?.some((change) => change.path === physicalPath)).toBe(false);
		expect(resolved?.find((change) => change.path === txtPath)).toMatchObject({
			type: 'update',
			content: 'remote',
		});
		expect(mergeAnnotatedSources).toHaveBeenCalledWith(
			['local', 'remote'],
			'remote',
		);
		const yjsChange = resolved?.find((change) => change.path === yjsPath);
		expect(yjsChange?.type).toBe('update');
		if (yjsChange?.type === 'update') {
			expect(new TextDecoder().decode(yjsChange.content as ArrayBuffer)).toBe(
				'remote',
			);
		}
		},
	);
});
