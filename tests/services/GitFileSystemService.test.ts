const mockFiles = new Map<string, any>();
const mockStoreFile = jest.fn(async (file: any) => {
	mockFiles.set(file.path, { ...file });
	return file.id;
});
const mockDeleteFileByPath = jest.fn(async (path: string) => {
	const file = mockFiles.get(path);
	if (file) mockFiles.set(path, { ...file, isDeleted: true });
});
const mockBatchMoveFiles = jest.fn(async (operations: any[]) =>
	operations.map((operation) => {
		const file =
			mockFiles.get(operation.targetPath) ??
			[...mockFiles.values()].find((entry) => entry.id === operation.fileId);
		return file?.id ?? operation.fileId;
	}),
);
const mockUpdateDocumentContent = jest.fn();
const mockGetDocContainer = jest.fn();

jest.mock('@isomorphic-git/lightning-fs', () => ({
	__esModule: true,
	default: jest.fn().mockImplementation(() => ({
		promises: {
			readFile: jest.fn(),
			writeFile: jest.fn(),
			unlink: jest.fn(),
			readdir: jest.fn(async () => []),
			mkdir: jest.fn(),
			rmdir: jest.fn(),
			rename: jest.fn(),
			stat: jest.fn(async () => {
				const error = new Error('ENOENT') as Error & { code?: string };
				error.code = 'ENOENT';
				throw error;
			}),
			lstat: jest.fn(),
			readlink: jest.fn(),
			symlink: jest.fn(),
			flush: jest.fn(),
		},
	})),
}));

jest.mock('isomorphic-git', () => ({
	resolveRef: jest.fn(),
	findMergeBase: jest.fn(),
	writeRef: jest.fn(),
}));

jest.mock('@src/services/FileStoreService', () => ({
	fileStoreService: {
		getCurrentProjectId: jest.fn(() => 'project-1'),
		initialize: jest.fn(),
		getFileByPath: jest.fn(async (path: string) => mockFiles.get(path)),
		getChildrenByPath: jest.fn(async (path: string) =>
			[...mockFiles.values()].filter((file) => {
				const index = file.path.lastIndexOf('/');
				const parent = index === 0 ? '/' : file.path.slice(0, index);
				return parent === path;
			}),
		),
		storeFile: mockStoreFile,
		deleteFileByPath: mockDeleteFileByPath,
		batchMoveFiles: mockBatchMoveFiles,
	},
}));

jest.mock('@src/services/CollabService', () => ({
	collabService: {
		getDocContainer: mockGetDocContainer,
		updateDocumentContent: mockUpdateDocumentContent,
	},
}));

jest.mock('@src/utils/fileUtils', () => ({
	getMimeType: (path: string) =>
		path.endsWith('.png') ? 'image/png' : 'text/plain',
	isBinaryFile: (path: string) => path.endsWith('.png'),
	isTemporaryFile: (path: string) => path.endsWith('.aux'),
	toArrayBuffer: (content: Uint8Array) => content.slice().buffer,
}));

jest.mock('@/logging', () => ({
	createNamedLogger: () => ({ warn: jest.fn() }),
}));

import LightningFS from '@isomorphic-git/lightning-fs';
import { gitFileSystemService } from '@src/services/GitFileSystemService';

describe('GitFileSystemService', () => {
	beforeEach(() => {
		mockFiles.clear();
		localStorage.clear();
		jest.clearAllMocks();
	});

	it('keeps Git data in a project-scoped private IndexedDB filesystem', () => {
		gitFileSystemService.get('private-project');

		expect(LightningFS).toHaveBeenCalledWith(
			'texlyre-project-private-project-git',
		);
	});

	it('owns only Git filesystem settings', () => {
		const fileSystem = gitFileSystemService.get('settings-project');
		expect(fileSystem.getSettings()).toEqual({
			gitCleanAnnotations: false,
			storeGitOnDisk: false,
			backupGitToRemote: false,
		});

		fileSystem.setGitCleanAnnotations(true);
		fileSystem.linkGitToDisk();
		expect(fileSystem.getSettings()).toEqual({
			gitCleanAnnotations: true,
			storeGitOnDisk: true,
			backupGitToRemote: false,
		});

		fileSystem.unlinkGitFromDisk();
		expect(fileSystem.getSettings().storeGitOnDisk).toBe(false);
	});

	it('reuses immutable Git objects without reading their bytes again', async () => {
		const fileSystem = gitFileSystemService.get('incremental-git') as any;
		const objectPath = `objects/ab/${'c'.repeat(38)}`;
		fileSystem.privateExists = jest.fn(async (path: string) => path === '/.git/HEAD');
		const promises = fileSystem.privateFs.promises;
		promises.readdir.mockImplementation(async (path: string) => {
			if (path === '/.git') return ['HEAD', 'objects'];
			if (path === '/.git/objects') return ['ab'];
			if (path === '/.git/objects/ab') return ['c'.repeat(38)];
			return [];
		});
		promises.stat.mockImplementation(async (path: string) => ({
			isDirectory: () => path === '/.git/objects' || path === '/.git/objects/ab',
		}));
		promises.readFile.mockResolvedValue(new TextEncoder().encode('ref: refs/heads/main\n'));

		const result = await fileSystem.exportGitBackup(new Set([objectPath]));
		expect(result.files.has('HEAD')).toBe(true);
		expect(result.reused.has(objectPath)).toBe(true);
		expect(promises.readFile).toHaveBeenCalledWith('/.git/HEAD');
		expect(promises.readFile).not.toHaveBeenCalledWith(`/.git/${objectPath}`);
	});

	it('fast-forwards existing Git history without touching the worktree or staging state', async () => {
		const git = await import('isomorphic-git');
		const refs = new Map([['refs/heads/main', 'a'.repeat(40)]]);
		(git.resolveRef as jest.Mock).mockImplementation(async ({ ref }: { ref: string }) => {
			const oid = refs.get(ref);
			if (oid) return oid;
			throw Object.assign(new Error('Missing ref'), { code: 'NotFoundError' });
		});
		(git.findMergeBase as jest.Mock).mockResolvedValue(['a'.repeat(40)]);
		(git.writeRef as jest.Mock).mockImplementation(async ({ ref, value }: { ref: string; value: string }) => {
			refs.set(ref, value);
		});
		const fileSystem = gitFileSystemService.get('fast-forward-project') as any;
		fileSystem.privateExists = jest.fn(async (path: string) => path === '/.git/HEAD');
		const objectPath = `objects/ab/${'c'.repeat(38)}`;
		const files = new Map<string, Uint8Array>([
			['HEAD', new TextEncoder().encode('ref: refs/heads/main\n')],
			['refs/heads/main', new TextEncoder().encode(`${'b'.repeat(40)}\n`)],
			[objectPath, new Uint8Array([1, 2, 3])],
		]);

		await expect(fileSystem.integrateGitBackup(files)).resolves.toBe(true);
		expect(refs.get('refs/heads/main')).toBe('b'.repeat(40));
		expect(git.writeRef).toHaveBeenCalledWith(expect.objectContaining({
			ref: 'refs/heads/main', value: 'b'.repeat(40), force: true,
		}));
		expect(fileSystem.privateFs.promises.writeFile).toHaveBeenCalledWith(
			`/.git/${objectPath}`, expect.any(Uint8Array),
		);
		expect(fileSystem.privateFs.promises.writeFile).not.toHaveBeenCalledWith(
			'/.git/index', expect.anything(),
		);
		expect(fileSystem.privateFs.promises.flush).toHaveBeenCalledTimes(1);
	});

	it('preserves a divergent local branch rather than replacing it', async () => {
		const git = await import('isomorphic-git');
		(git.resolveRef as jest.Mock).mockResolvedValue('a'.repeat(40));
		(git.findMergeBase as jest.Mock).mockResolvedValue([]);
		const fileSystem = gitFileSystemService.get('divergent-project') as any;
		fileSystem.privateExists = jest.fn(async (path: string) => path === '/.git/HEAD');
		const files = new Map<string, Uint8Array>([
			['HEAD', new TextEncoder().encode('ref: refs/heads/main\n')],
			['refs/heads/main', new TextEncoder().encode(`${'b'.repeat(40)}\n`)],
		]);
		await expect(fileSystem.integrateGitBackup(files)).resolves.toBe(false);
		expect(git.writeRef).not.toHaveBeenCalled();
	});

	it('syncs only the side that moved from the shared disk baseline', async () => {
		const fileSystem = gitFileSystemService.get('disk-sync-project') as any;
		fileSystem.linkGitToDisk();
		fileSystem.diskRoot = {};
		fileSystem.diskBaselineSignature = 'base';
		fileSystem.privateSignature = jest.fn(async () => 'browser-next');
		fileSystem.diskSignature = jest.fn(async () => 'base');
		fileSystem.copyPrivateToDisk = jest.fn(async () => undefined);
		fileSystem.copyDiskToPrivate = jest.fn(async () => undefined);
		fileSystem.getDiskStatus = jest.fn(async () => ({}));

		await fileSystem.syncGitToDisk();
		expect(fileSystem.copyPrivateToDisk).toHaveBeenCalledTimes(1);
		expect(fileSystem.copyDiskToPrivate).not.toHaveBeenCalled();
	});

	it('does not overwrite independently changed browser and disk histories', async () => {
		const fileSystem = gitFileSystemService.get('disk-conflict-project') as any;
		fileSystem.linkGitToDisk();
		fileSystem.diskRoot = {};
		fileSystem.diskBaselineSignature = 'base';
		fileSystem.privateSignature = jest.fn(async () => 'browser-next');
		fileSystem.diskSignature = jest.fn(async () => 'disk-next');
		fileSystem.copyPrivateToDisk = jest.fn(async () => undefined);
		fileSystem.copyDiskToPrivate = jest.fn(async () => undefined);
		fileSystem.getDiskStatus = jest.fn(async () => ({ conflict: fileSystem.diskConflict }));

		await expect(fileSystem.syncGitToDisk()).resolves.toEqual({ conflict: true });
		expect(fileSystem.copyPrivateToDisk).not.toHaveBeenCalled();
		expect(fileSystem.copyDiskToPrivate).not.toHaveBeenCalled();
	});

	it('prunes only TeXlyre-managed Git root entries from the linked folder', async () => {
		const fileSystem = gitFileSystemService.get('disk-prune-project') as any;
		fileSystem.privateFs.promises.readdir.mockResolvedValue([]);
		const removeEntry = jest.fn(async () => undefined);
		const diskDirectory = {
			async *entries() {
				yield ['packed-refs', { kind: 'file' }];
				yield ['index', { kind: 'file' }];
				yield ['hooks', { kind: 'directory' }];
				yield ['custom-tool-state', { kind: 'file' }];
			},
			removeEntry,
		};

		await fileSystem.mirrorPrivateDirectoryToDisk('/.git', diskDirectory);
		expect(removeEntry).toHaveBeenCalledWith('packed-refs', { recursive: true });
		expect(removeEntry).toHaveBeenCalledWith('index', { recursive: true });
		expect(removeEntry).not.toHaveBeenCalledWith('hooks', expect.anything());
		expect(removeEntry).not.toHaveBeenCalledWith(
			'custom-tool-state',
			expect.anything(),
		);
	});

	it('exposes only normal project files to Git', async () => {
		mockFiles.set('/main.tex', {
			id: 'main',
			name: 'main.tex',
			path: '/main.tex',
			type: 'file',
			content: 'hello',
			lastModified: 1,
		});
		mockFiles.set('/build.aux', {
			id: 'aux',
			name: 'build.aux',
			path: '/build.aux',
			type: 'file',
			content: 'generated',
			lastModified: 1,
		});
		mockFiles.set('/output.pdf', {
			id: 'output',
			name: 'output.pdf',
			path: '/output.pdf',
			type: 'file',
			content: new ArrayBuffer(0),
			excludeFromSync: true,
			lastModified: 1,
		});

		const fs = gitFileSystemService.get('project-1').fs;
		await expect(fs.promises.readdir('/')).resolves.toEqual(['main.tex']);
	});

	it('reads live Yjs text for linked files', async () => {
		mockFiles.set('/main.tex', {
			id: 'main',
			name: 'main.tex',
			path: '/main.tex',
			type: 'file',
			content: 'stale',
			documentId: 'doc-1',
			lastModified: 1,
		});
		mockGetDocContainer.mockReturnValue({
			doc: { getText: () => ({ toString: () => 'live content' }) },
		});

		const fs = gitFileSystemService.get('project-1').fs;
		const content = await fs.promises.readFile('/main.tex', 'utf8');

		expect(content).toBe('live content');
	});

	it('writes checkout changes through FileStore and linked Yjs documents', async () => {
		mockFiles.set('/main.tex', {
			id: 'main',
			name: 'main.tex',
			path: '/main.tex',
			type: 'file',
			content: 'old',
			documentId: 'doc-1',
			lastModified: 1,
		});

		const fs = gitFileSystemService.get('project-1').fs;
		await fs.promises.writeFile('/main.tex', new TextEncoder().encode('restored'));

		expect(mockStoreFile).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'main',
				path: '/main.tex',
				content: 'restored',
				documentId: 'doc-1',
			}),
			{ showConflictDialog: false },
		);
		expect(mockUpdateDocumentContent).toHaveBeenCalledWith(
			'project-1',
			'doc-1',
			expect.any(Function),
		);
		expect(mockUpdateDocumentContent.mock.calls[0][2]()).toBe('restored');
	});

	it('treats relative Git paths and dot as the project root', async () => {
		mockFiles.set('/main.tex', {
			id: 'main',
			name: 'main.tex',
			path: '/main.tex',
			type: 'file',
			content: 'hello',
			lastModified: 1,
		});

		const fs = gitFileSystemService.get('project-1').fs;
		await expect(fs.promises.lstat('.')).resolves.toEqual(
			expect.objectContaining({ type: 'dir' }),
		);
		await expect(fs.promises.readdir('.')).resolves.toEqual(['main.tex']);
		await expect(fs.promises.readFile('./main.tex', 'utf8')).resolves.toBe(
			'hello',
		);

		await fs.promises.writeFile('.git/HEAD', 'ref: refs/heads/main\n');
		expect(mockStoreFile).not.toHaveBeenCalled();
	});

	it('keeps .git writes out of FileStore', async () => {
		const fs = gitFileSystemService.get('project-1').fs;
		await fs.promises.writeFile('/.git/HEAD', 'ref: refs/heads/main\n');

		expect(mockStoreFile).not.toHaveBeenCalled();
	});
});
