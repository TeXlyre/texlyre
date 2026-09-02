import { mergeResolutionService } from '@src/services/MergeResolutionService';
import { fileConflictPromptService } from '@src/services/FileConflictPromptService';
import { fileHandlerService } from '@src/services/FileHandlerService';
import { fileStoreService } from '@src/services/FileStoreService';
import { authService } from '@src/services/AuthService';
import { workspaceService } from '@src/services/WorkspaceService';
import type { FileNode } from '@src/types/files';

jest.mock('@src/services/DiskHandleStore', () => ({
	...jest.requireActual('@src/services/DiskHandleStore'),
	ensurePermission: jest.fn().mockResolvedValue(true),
}));

jest.mock('@src/services/WriteTargetService', () => ({
	...jest.requireActual('@src/services/WriteTargetService'),
	DirectoryTarget: jest.fn().mockImplementation(() => mockAdapter),
}));

const mockAdapter = {
	listEntries: jest.fn(),
	stat: jest.fn(),
	readFile: jest.fn(),
	writeFile: jest.fn(),
};

describe('WorkspaceService', () => {
	const rootHandle = { name: 'paper' } as FileSystemDirectoryHandle;

	const setDirectory = (
		tree: Record<string, Array<{ name: string; isDirectory: boolean }>>,
	) => {
		mockAdapter.listEntries.mockImplementation(
			async (path: string) => tree[path] ?? [],
		);
	};

	beforeEach(() => {
		jest.clearAllMocks();
		workspaceService.deactivate();
		fileHandlerService.detachWorkspace();

		(window as any).showDirectoryPicker = jest.fn().mockResolvedValue(rootHandle);
		(rootHandle as any).queryPermission = jest.fn().mockResolvedValue('granted');
		(rootHandle as any).requestPermission = jest.fn().mockResolvedValue('granted');

		mockAdapter.stat.mockResolvedValue({ lastModified: 500, size: 12 });
		mockAdapter.readFile.mockResolvedValue('\\documentclass{article}');
		jest.spyOn(fileStoreService, 'batchStoreFiles').mockResolvedValue([]);
		jest.spyOn(fileStoreService, 'getAllFiles').mockResolvedValue([]);
		jest
			.spyOn(fileConflictPromptService, 'resolveConflict')
			.mockResolvedValue('overwrite');
		jest.spyOn(authService, 'getProjectById').mockResolvedValue(null);
		jest.spyOn(authService, 'updateProject').mockImplementation(
			async (project) => project,
		);
	});

	it('should report support based on the directory picker', () => {
		expect(workspaceService.isSupported()).toBe(true);

		(window as any).showDirectoryPicker = undefined;
		delete (window as any).showDirectoryPicker;

		expect(workspaceService.isSupported()).toBe(false);
	});

	it('should link a folder without importing before the project opens', async () => {
		await workspaceService.link('project-9', rootHandle);

		expect(fileStoreService.batchStoreFiles).not.toHaveBeenCalled();
		expect(fileHandlerService.hasWorkspace()).toBe(false);
	});

	it('should import a linked folder the first time the project opens', async () => {
		setDirectory({ '': [{ name: 'main.tex', isDirectory: false }] });
		await workspaceService.link('project-9', rootHandle);
		workspaceService.deactivate();

		const restored = await workspaceService.restore('project-9');

		expect(restored).toBe(true);
		expect(fileStoreService.batchStoreFiles).toHaveBeenCalledTimes(1);
	});

	it('should not re-import a linked folder on later opens', async () => {
		setDirectory({ '': [{ name: 'main.tex', isDirectory: false }] });
		await workspaceService.link('project-9', rootHandle);
		await workspaceService.restore('project-9');
		workspaceService.deactivate();
		(fileStoreService.batchStoreFiles as jest.Mock).mockClear();

		await workspaceService.restore('project-9');

		expect(fileStoreService.batchStoreFiles).not.toHaveBeenCalled();
	});

	it('should import a nested directory into the project', async () => {
		setDirectory({
			'': [
				{ name: 'main.tex', isDirectory: false },
				{ name: 'chapters', isDirectory: true },
			],
			'/chapters': [{ name: 'intro.tex', isDirectory: false }],
		});

		await workspaceService.connect('project-1');

		const stored = (fileStoreService.batchStoreFiles as jest.Mock).mock
			.calls[0][0] as FileNode[];
		expect(stored.map((file) => file.path).sort()).toEqual([
			'/chapters',
			'/chapters/intro.tex',
			'/main.tex',
		]);
	});

	it('should preserve disk timestamps on import', async () => {
		setDirectory({ '': [{ name: 'main.tex', isDirectory: false }] });

		await workspaceService.connect('project-1');

		const [stored, options] = (fileStoreService.batchStoreFiles as jest.Mock)
			.mock.calls[0];
		expect(options.preserveTimestamp).toBe(true);
		expect(stored[0].lastModified).toBe(500);
	});

	it('should skip version control and dependency directories', async () => {
		setDirectory({
			'': [
				{ name: '.git', isDirectory: true },
				{ name: 'node_modules', isDirectory: true },
				{ name: 'main.tex', isDirectory: false },
			],
			'/.git': [{ name: 'config', isDirectory: false }],
		});

		await workspaceService.connect('project-1');

		const stored = (fileStoreService.batchStoreFiles as jest.Mock).mock
			.calls[0][0] as FileNode[];
		expect(stored.map((file) => file.path)).toEqual(['/main.tex']);
	});

	it('should attach the workspace so writes reach the folder', async () => {
		setDirectory({ '': [{ name: 'main.tex', isDirectory: false }] });

		await workspaceService.connect('project-1');

		expect(fileHandlerService.hasWorkspace()).toBe(true);
		expect(workspaceService.getStatus()).toMatchObject({
			isConnected: true,
			needsPermission: false,
			projectId: 'project-1',
			directoryName: 'paper',
		});
	});

	it('should link every non-internal project file after import', async () => {
		setDirectory({ '': [{ name: 'main.tex', isDirectory: false }] });
		(fileStoreService.getAllFiles as jest.Mock).mockResolvedValue([
			{ id: 'a', path: '/main.tex', type: 'file', lastModified: 1 },
			{ id: 'b', path: '/.texlyre/state.json', type: 'file', lastModified: 1 },
			{ id: 'c', path: '/chapters', type: 'directory', lastModified: 1 },
		]);

		await workspaceService.connect('project-1');

		expect(fileHandlerService.getLinkedIds()).toEqual(['a']);
	});

	describe('connect merge', () => {
		const annotated =
			"intro\n`<### comment id: c1, user: a, time: 1, content64: 'aGk=', responses: [], resolved: false ###>`flagged`</### comment id: c1 ###>`\ntail";

		beforeEach(() => {
			jest.spyOn(fileHandlerService, 'mirrorFiles').mockResolvedValue();
			jest
				.spyOn(fileConflictPromptService, 'resolveConflict')
				.mockResolvedValue('overwrite');
		});

		it('should import files that exist only on disk', async () => {
			setDirectory({ '': [{ name: 'refs.bib', isDirectory: false }] });
			(fileStoreService.getAllFiles as jest.Mock).mockResolvedValue([]);

			await workspaceService.connect('project-1');

			const stored = (fileStoreService.batchStoreFiles as jest.Mock).mock
				.calls[0][0];
			expect(stored.map((file: { path: string }) => file.path)).toEqual([
				'/refs.bib',
			]);
			expect(fileConflictPromptService.resolveConflict).not.toHaveBeenCalled();
		});

		it('should write project files that are missing from disk', async () => {
			setDirectory({ '': [] });
			(fileStoreService.getAllFiles as jest.Mock).mockResolvedValue([
				{
					id: 'a',
					name: 'main.tex',
					path: '/main.tex',
					type: 'file',
					content: 'body',
					lastModified: 1,
				},
			]);

			await workspaceService.connect('project-1');

			expect(fileHandlerService.mirrorFiles).toHaveBeenCalledWith([
				expect.objectContaining({ path: '/main.tex' }),
			]);
		});

		it('should not prompt when only annotations differ', async () => {
			setDirectory({ '': [{ name: 'main.tex', isDirectory: false }] });
			mockAdapter.readFile.mockResolvedValue('intro\nflagged\ntail');
			(fileStoreService.getAllFiles as jest.Mock).mockResolvedValue([
				{
					id: 'a',
					name: 'main.tex',
					path: '/main.tex',
					type: 'file',
					content: annotated,
					lastModified: 1,
				},
			]);

			await workspaceService.connect('project-1');

			expect(fileConflictPromptService.resolveConflict).not.toHaveBeenCalled();
			expect(fileStoreService.batchStoreFiles).not.toHaveBeenCalled();
		});

		it('should prompt when contents genuinely differ', async () => {
			setDirectory({ '': [{ name: 'main.tex', isDirectory: false }] });
			mockAdapter.readFile.mockResolvedValue('a different body');
			(fileStoreService.getAllFiles as jest.Mock).mockResolvedValue([
				{
					id: 'a',
					name: 'main.tex',
					path: '/main.tex',
					type: 'file',
					content: 'body',
					lastModified: 1,
				},
			]);

			await workspaceService.connect('project-1');

			expect(fileConflictPromptService.resolveConflict).toHaveBeenCalled();
			const stored = (fileStoreService.batchStoreFiles as jest.Mock).mock
				.calls[0][0];
			expect(stored[0]).toMatchObject({ id: 'a', content: 'a different body' });
		});

		it('should push the project version to disk when the user keeps it', async () => {
			(fileConflictPromptService.resolveConflict as jest.Mock).mockResolvedValue(
				'cancel',
			);
			setDirectory({ '': [{ name: 'main.tex', isDirectory: false }] });
			mockAdapter.readFile.mockResolvedValue('disk body');
			(fileStoreService.getAllFiles as jest.Mock).mockResolvedValue([
				{
					id: 'a',
					name: 'main.tex',
					path: '/main.tex',
					type: 'file',
					content: 'project body',
					lastModified: 1,
				},
			]);

			await workspaceService.connect('project-1');

			expect(fileStoreService.batchStoreFiles).not.toHaveBeenCalled();
			expect(fileHandlerService.mirrorFiles).toHaveBeenCalledWith([
				expect.objectContaining({ content: 'project body' }),
			]);
		});
	});

	describe('reconcile', () => {
		const connect = async () => {
			setDirectory({ '': [{ name: 'main.tex', isDirectory: false }] });
			await workspaceService.connect('project-1');
			await workspaceService.reconcile();
		};

		const projectFile = {
			id: 'a',
			name: 'main.tex',
			path: '/main.tex',
			type: 'file' as const,
			size: 12,
			lastModified: 500,
		};

		it('should skip the project read when the folder is untouched', async () => {
			(fileStoreService.getAllFiles as jest.Mock).mockResolvedValue([
				projectFile,
			]);
			await connect();
			(fileStoreService.getAllFiles as jest.Mock).mockClear();

			const result = await workspaceService.reconcile();

			expect(result.changed).toBe(false);
			expect(fileStoreService.getAllFiles).not.toHaveBeenCalled();
		});

		it('should import files that appeared on disk', async () => {
			(fileStoreService.getAllFiles as jest.Mock).mockResolvedValue([
				projectFile,
			]);
			await connect();

			setDirectory({
				'': [
					{ name: 'main.tex', isDirectory: false },
					{ name: 'refs.bib', isDirectory: false },
				],
			});
			(fileStoreService.batchStoreFiles as jest.Mock).mockClear();

			const result = await workspaceService.reconcile();

			expect(result.added).toBe(1);
			const stored = (fileStoreService.batchStoreFiles as jest.Mock).mock
				.calls[0][0];
			expect(stored.map((file: { path: string }) => file.path)).toEqual([
				'/refs.bib',
			]);
		});

		it('should create folders that appeared on disk', async () => {
			(fileStoreService.getAllFiles as jest.Mock).mockResolvedValue([
				projectFile,
			]);
			await connect();

			setDirectory({
				'': [
					{ name: 'main.tex', isDirectory: false },
					{ name: 'chapters', isDirectory: true },
				],
				'/chapters': [{ name: 'intro.tex', isDirectory: false }],
			});
			(fileStoreService.batchStoreFiles as jest.Mock).mockClear();

			await workspaceService.reconcile();

			const stored = (fileStoreService.batchStoreFiles as jest.Mock).mock
				.calls[0][0];
			expect(
				stored.map((file: { path: string; type: string }) => [
					file.path,
					file.type,
				]),
			).toEqual([
				['/chapters', 'directory'],
				['/chapters/intro.tex', 'file'],
			]);
		});

		it('should detect an empty folder appearing on disk', async () => {
			(fileStoreService.getAllFiles as jest.Mock).mockResolvedValue([
				projectFile,
			]);
			await connect();

			setDirectory({
				'': [
					{ name: 'main.tex', isDirectory: false },
					{ name: 'figures', isDirectory: true },
				],
				'/figures': [],
			});

			const result = await workspaceService.reconcile();

			expect(result.changed).toBe(true);
			expect(result.added).toBe(1);
		});

		it('should delete folders that vanished from disk', async () => {
			(fileStoreService.getAllFiles as jest.Mock).mockResolvedValue([
				projectFile,
				{
					id: 'd',
					name: 'chapters',
					path: '/chapters',
					type: 'directory',
					lastModified: 1,
				},
			]);
			jest.spyOn(fileStoreService, 'batchDeleteFiles').mockResolvedValue();
			setDirectory({ '': [{ name: 'main.tex', isDirectory: false }] });
			await workspaceService.connect('project-1');

			await workspaceService.reconcile();

			expect(fileStoreService.batchDeleteFiles).toHaveBeenCalledWith(
				['d'],
				expect.anything(),
			);
		});

		it('should not count folders as mirrored files', async () => {
			(fileStoreService.getAllFiles as jest.Mock).mockResolvedValue([
				projectFile,
				{
					id: 'd',
					name: 'chapters',
					path: '/chapters',
					type: 'directory',
					lastModified: 1,
				},
			]);
			setDirectory({
				'': [
					{ name: 'main.tex', isDirectory: false },
					{ name: 'chapters', isDirectory: true },
				],
				'/chapters': [],
			});
			await workspaceService.connect('project-1');

			const result = await workspaceService.reconcile();

			expect(result.files.map((file) => file.path)).toEqual(['/main.tex']);
			expect(result.stats.has('/chapters')).toBe(false);
		});

		it('should not delete files opened from outside the folder', async () => {
			(fileStoreService.getAllFiles as jest.Mock).mockResolvedValue([
				projectFile,
				{
					id: 'launched',
					name: 'notes.tex',
					path: '/notes.tex',
					type: 'file',
					lastModified: 1,
					launchHandle: {} as FileSystemFileHandle,
				},
			]);
			jest.spyOn(fileStoreService, 'batchDeleteFiles').mockResolvedValue();
			setDirectory({ '': [{ name: 'main.tex', isDirectory: false }] });
			await workspaceService.connect('project-1');

			const result = await workspaceService.reconcile();

			expect(result.removed).toBe(0);
			expect(fileStoreService.batchDeleteFiles).not.toHaveBeenCalled();
			expect(fileHandlerService.getLaunchLinkedIds()).toEqual(['launched']);
		});

		it('should delete project files that vanished from disk', async () => {
			(fileStoreService.getAllFiles as jest.Mock).mockResolvedValue([
				projectFile,
				{ ...projectFile, id: 'b', name: 'old.tex', path: '/old.tex', size: 3 },
			]);
			jest.spyOn(fileStoreService, 'batchDeleteFiles').mockResolvedValue();
			setDirectory({ '': [{ name: 'main.tex', isDirectory: false }] });
			await workspaceService.connect('project-1');

			const result = await workspaceService.reconcile();

			expect(result.removed).toBe(1);
			expect(fileStoreService.batchDeleteFiles).toHaveBeenCalledWith(
				['b'],
				expect.objectContaining({ showDeleteDialog: false }),
			);
		});

		it('should treat a matching add and remove as a rename', async () => {
			(fileStoreService.getAllFiles as jest.Mock).mockResolvedValue([
				{ ...projectFile, content: 'kept body' },
			]);
			jest.spyOn(fileStoreService, 'batchDeleteFiles').mockResolvedValue();
			await connect();

			setDirectory({ '': [{ name: 'paper.tex', isDirectory: false }] });
			(fileStoreService.batchStoreFiles as jest.Mock).mockClear();

			const result = await workspaceService.reconcile();

			expect(result).toMatchObject({ renamed: 1, added: 0, removed: 0 });
			const stored = (fileStoreService.batchStoreFiles as jest.Mock).mock
				.calls[0][0];
			expect(stored[0].path).toBe('/paper.tex');
			expect(stored[0].content).toBe('kept body');
			expect(fileStoreService.batchDeleteFiles).toHaveBeenCalledWith(
				['a'],
				expect.anything(),
			);
		});

		it('should not mirror its own reconciliation back to disk', async () => {
			(fileStoreService.getAllFiles as jest.Mock).mockResolvedValue([]);
			const spy = jest.spyOn(fileHandlerService, 'withoutMirroring');
			await connect();

			setDirectory({ '': [{ name: 'new.tex', isDirectory: false }] });
			await workspaceService.reconcile();

			expect(spy).toHaveBeenCalled();
		});

		it('should report timestamps so the pull pass does not stat twice', async () => {
			(fileStoreService.getAllFiles as jest.Mock).mockResolvedValue([
				projectFile,
			]);
			await connect();

			mockAdapter.stat.mockResolvedValue({ lastModified: 900, size: 12 });
			const result = await workspaceService.reconcile();

			expect(result.stats.get('/main.tex')).toBe(900);
		});
	});

	it('should flag the project as disk linked when linking a folder', async () => {
		(authService.getProjectById as jest.Mock).mockResolvedValue({
			id: 'project-1',
			isDiskLinked: false,
		});

		await workspaceService.link('project-1', rootHandle);

		expect(authService.updateProject).toHaveBeenCalledWith(
			expect.objectContaining({ isDiskLinked: true }),
		);
	});

	it('should repair a missing flag on a project that still has a folder', async () => {
		setDirectory({ '': [] });
		await workspaceService.connect('project-1');
		workspaceService.deactivate();
		(authService.updateProject as jest.Mock).mockClear();
		(authService.getProjectById as jest.Mock).mockResolvedValue({
			id: 'project-1',
			isDiskLinked: false,
		});

		await workspaceService.restore('project-1');

		expect(authService.updateProject).toHaveBeenCalledWith(
			expect.objectContaining({ isDiskLinked: true }),
		);
	});

	it('should report the number of mirrored files', async () => {
		setDirectory({ '': [{ name: 'main.tex', isDirectory: false }] });
		(fileStoreService.getAllFiles as jest.Mock).mockResolvedValue([
			{ id: 'a', path: '/main.tex', type: 'file', lastModified: 1 },
			{ id: 'b', path: '/refs.bib', type: 'file', lastModified: 1 },
			{ id: 'c', path: '/.texlyre/state.json', type: 'file', lastModified: 1 },
		]);

		await workspaceService.connect('project-1');

		expect(workspaceService.getStatus().fileCount).toBe(2);
	});

	it('should notify status listeners on connect and disconnect', async () => {
		setDirectory({ '': [] });
		const listener = jest.fn();
		const unsubscribe = workspaceService.addStatusListener(listener);

		await workspaceService.connect('project-1');
		await workspaceService.disconnect();

		expect(listener.mock.calls[0][0].isConnected).toBe(true);
		expect(listener.mock.calls.at(-1)?.[0].isConnected).toBe(false);
		expect(fileHandlerService.hasWorkspace()).toBe(false);
		unsubscribe();
	});

	it('should not restore a project that was never folder linked', async () => {
		expect(await workspaceService.restore('unknown-project')).toBe(false);
		expect(fileHandlerService.hasWorkspace()).toBe(false);
		expect(workspaceService.getStatus().projectId).toBeNull();
	});

	it('should keep a linked project visible when permission is missing', async () => {
		const { ensurePermission } = jest.requireMock(
			'@src/services/DiskHandleStore',
		);
		setDirectory({ '': [] });
		await workspaceService.connect('project-1');
		workspaceService.deactivate();
		ensurePermission.mockResolvedValueOnce(false);

		const restored = await workspaceService.restore('project-1');

		expect(restored).toBe(true);
		expect(workspaceService.getStatus()).toMatchObject({
			isConnected: false,
			needsPermission: true,
			projectId: 'project-1',
		});
		expect(fileHandlerService.hasWorkspace()).toBe(false);
	});

	it('should stay visible but idle when only the project flag survives', async () => {
		(authService.getProjectById as jest.Mock).mockResolvedValue({
			id: 'project-2',
			isDiskLinked: true,
		});

		const restored = await workspaceService.restore('project-2');

		expect(restored).toBe(true);
		expect(workspaceService.getStatus().needsPermission).toBe(true);
		expect(fileHandlerService.hasWorkspace()).toBe(false);
	});

	it('should attach the folder again once permission is granted', async () => {
		const { ensurePermission } = jest.requireMock(
			'@src/services/DiskHandleStore',
		);
		setDirectory({ '': [] });
		await workspaceService.connect('project-1');
		workspaceService.deactivate();
		ensurePermission.mockResolvedValueOnce(false);
		await workspaceService.restore('project-1');

		const reconnected = await workspaceService.reconnect();

		expect(reconnected).toBe(true);
		expect(fileHandlerService.hasWorkspace()).toBe(true);
		expect(workspaceService.getStatus().needsPermission).toBe(false);
	});

	it('should refuse to change to a folder that is not empty', async () => {
		setDirectory({ '': [] });
		await workspaceService.connect('project-1');
		setDirectory({ '': [{ name: 'other.tex', isDirectory: false }] });

		await expect(workspaceService.changeFolder()).rejects.toThrow();
	});

	it('should clear the disk flag when disconnecting', async () => {
		setDirectory({ '': [] });
		await workspaceService.connect('project-1');
		(authService.getProjectById as jest.Mock).mockResolvedValue({
			id: 'project-1',
			isDiskLinked: true,
		});

		await workspaceService.disconnect();

		expect(authService.updateProject).toHaveBeenCalledWith(
			expect.objectContaining({ isDiskLinked: false }),
		);
		expect(workspaceService.getStatus().projectId).toBeNull();
	});

	it('should restore a previously connected folder without re-importing', async () => {
		setDirectory({ '': [{ name: 'main.tex', isDirectory: false }] });
		await workspaceService.connect('project-1');
		workspaceService.deactivate();
		(fileStoreService.batchStoreFiles as jest.Mock).mockClear();

		const restored = await workspaceService.restore('project-1');

		expect(restored).toBe(true);
		expect(fileStoreService.batchStoreFiles).not.toHaveBeenCalled();
	});
});
