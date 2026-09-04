import type { FileNode } from '@src/types/files';

const mockResolveConflicts = jest.fn();

jest.mock('@src/services/MergeResolutionService', () => ({
	mergeResolutionService: { resolveConflicts: mockResolveConflicts },
}));

type FileHandlerModule = typeof import('@src/services/FileHandlerService');

interface MockHandle {
	name: string;
	getFile: jest.Mock;
	createWritable: jest.Mock;
	queryPermission: jest.Mock;
	requestPermission: jest.Mock;
	write: jest.Mock;
	close: jest.Mock;
}

describe('FileHandlerService', () => {
	let module: FileHandlerModule;
	let setConsumer: jest.Mock;

	const createHandle = (
		name: string,
		content: string,
		lastModified: number,
		permission: 'granted' | 'prompt' | 'denied' = 'granted',
	): MockHandle => {
		const write = jest.fn().mockResolvedValue(undefined);
		const close = jest.fn().mockResolvedValue(undefined);

		return {
			name,
			write,
			close,
			getFile: jest.fn().mockResolvedValue({
				name,
				type: 'text/x-tex',
				lastModified,
				text: async () => content,
				arrayBuffer: async () => new TextEncoder().encode(content).buffer,
			}),
			createWritable: jest.fn().mockResolvedValue({ write, close }),
			queryPermission: jest.fn().mockResolvedValue(permission),
			requestPermission: jest.fn().mockResolvedValue(permission),
		};
	};

	const createFile = (handle?: MockHandle, lastModified = 1_000): FileNode => ({
		id: 'file-1',
		name: 'main.tex',
		path: '/main.tex',
		type: 'file',
		lastModified,
		isBinary: false,
		launchHandle: handle as unknown as FileSystemFileHandle,
	});

	const loadModule = async (withLaunchQueue = true) => {
		setConsumer = jest.fn();

		if (withLaunchQueue) {
			Object.defineProperty(window, 'launchQueue', {
				value: { setConsumer },
				configurable: true,
			});
		} else {
			// biome-ignore lint/performance/noDelete: the property must be absent
			delete (window as { launchQueue?: unknown }).launchQueue;
		}

		jest.resetModules();
		module = await import('@src/services/FileHandlerService');
	};

	beforeEach(async () => {
		mockResolveConflicts.mockReset();
		await loadModule();
	});

	describe('initialize', () => {
		it('should register a launch consumer only once', () => {
			module.fileHandlerService.initialize();
			module.fileHandlerService.initialize();

			expect(setConsumer).toHaveBeenCalledTimes(1);
		});

		it('should report no support and skip registration without a launch queue', async () => {
			await loadModule(false);

			module.fileHandlerService.initialize();

			expect(module.fileHandlerService.isSupported()).toBe(false);
			expect(setConsumer).not.toHaveBeenCalled();
		});
	});

	describe('launch listeners', () => {
		const launch = async (handles: MockHandle[]) => {
			module.fileHandlerService.initialize();
			setConsumer.mock.calls[0][0]({ files: handles });
			await new Promise((resolve) => setTimeout(resolve, 0));
		};

		it('should buffer launched files until a listener registers', async () => {
			const listener = jest.fn();
			await launch([createHandle('main.tex', 'hello', 1)]);

			module.fileHandlerService.addLaunchListener(listener);

			expect(listener).toHaveBeenCalledTimes(1);
			expect(listener.mock.calls[0][0]).toHaveLength(1);
			expect(listener.mock.calls[0][0][0].name).toBe('main.tex');
		});

		it('should deliver the buffered files only to the first listener', async () => {
			const first = jest.fn();
			const second = jest.fn();
			await launch([createHandle('main.tex', 'hello', 1)]);

			module.fileHandlerService.addLaunchListener(first);
			module.fileHandlerService.addLaunchListener(second);

			expect(first).toHaveBeenCalledTimes(1);
			expect(second).not.toHaveBeenCalled();
		});

		it('should skip handles that cannot be read', async () => {
			const listener = jest.fn();
			module.fileHandlerService.addLaunchListener(listener);

			const broken = createHandle('broken.tex', '', 1);
			broken.getFile.mockRejectedValue(new Error('denied'));

			await launch([broken, createHandle('main.tex', 'hello', 1)]);

			expect(listener.mock.calls[0][0].map((f: { name: string }) => f.name)).toEqual([
				'main.tex',
			]);
		});

		it('should not notify listeners when nothing could be read', async () => {
			const listener = jest.fn();
			module.fileHandlerService.addLaunchListener(listener);

			const broken = createHandle('broken.tex', '', 1);
			broken.getFile.mockRejectedValue(new Error('denied'));

			await launch([broken]);

			expect(listener).not.toHaveBeenCalled();
		});

		it('should stop notifying after the listener is removed', async () => {
			const listener = jest.fn();
			const remove = module.fileHandlerService.addLaunchListener(listener);
			remove();

			await launch([createHandle('main.tex', 'hello', 1)]);

			expect(listener).not.toHaveBeenCalled();
		});
	});

	describe('ensureWritable', () => {
		it('should not prompt when write access is already granted', async () => {
			const handle = createHandle('main.tex', 'hello', 1);

			const granted = await module.fileHandlerService.ensureWritable(
				handle as unknown as FileSystemFileHandle,
			);

			expect(granted).toBe(true);
			expect(handle.requestPermission).not.toHaveBeenCalled();
		});

		it('should prompt when write access is not yet granted', async () => {
			const handle = createHandle('main.tex', 'hello', 1, 'prompt');
			handle.requestPermission.mockResolvedValue('granted');

			const granted = await module.fileHandlerService.ensureWritable(
				handle as unknown as FileSystemFileHandle,
			);

			expect(granted).toBe(true);
			expect(handle.requestPermission).toHaveBeenCalledWith({
				mode: 'readwrite',
			});
		});

		it('should return false when the prompt is declined', async () => {
			const handle = createHandle('main.tex', 'hello', 1, 'denied');

			const granted = await module.fileHandlerService.ensureWritable(
				handle as unknown as FileSystemFileHandle,
			);

			expect(granted).toBe(false);
		});
	});

	describe('writeBack', () => {
		it('should write content through the handle', async () => {
			const handle = createHandle('main.tex', 'hello', 1);

			const written = await module.fileHandlerService.writeBack(
				createFile(handle),
				'updated',
			);

			expect(written).toBe(true);
			expect(handle.write).toHaveBeenCalledWith('updated');
			expect(handle.close).toHaveBeenCalled();
		});

		it('should do nothing for files without a disk link', async () => {
			const file = createFile();
			file.launchHandle = undefined;

			expect(await module.fileHandlerService.writeBack(file, 'updated')).toBe(
				false,
			);
		});

		it('should not write when the permission has lapsed', async () => {
			const handle = createHandle('main.tex', 'hello', 1, 'prompt');

			const written = await module.fileHandlerService.writeBack(
				createFile(handle),
				'updated',
			);

			expect(written).toBe(false);
			expect(handle.createWritable).not.toHaveBeenCalled();
			expect(handle.requestPermission).not.toHaveBeenCalled();
		});

		it('should report failure when the write throws', async () => {
			const handle = createHandle('main.tex', 'hello', 1);
			handle.createWritable.mockRejectedValue(new Error('disk full'));

			expect(
				await module.fileHandlerService.writeBack(createFile(handle), 'updated'),
			).toBe(false);
		});
	});

	describe('workspace targets', () => {
		const createAdapter = (lastModified = 1_000, content = 'from disk') => ({
			stat: jest.fn().mockResolvedValue({ lastModified, size: 9 }),
			readFile: jest.fn().mockResolvedValue(content),
			writeFile: jest.fn().mockResolvedValue(undefined),
			deleteEntry: jest.fn().mockResolvedValue(undefined),
			createDirectory: jest.fn().mockResolvedValue(undefined),
		});

		const workspaceFile = (): FileNode => ({
			id: 'ws-1',
			name: 'intro.tex',
			path: '/chapters/intro.tex',
			type: 'file',
			lastModified: 1_000,
		});

		afterEach(() => {
			module.fileHandlerService.detachWorkspace();
		});

		it('should write through the adapter using the file path', async () => {
			const adapter = createAdapter();
			module.fileHandlerService.attachWorkspace(adapter as never);

			const written = await module.fileHandlerService.writeBack(
				workspaceFile(),
				'body',
			);

			expect(written).toBe(true);
			expect(adapter.writeFile).toHaveBeenCalledWith(
				'/chapters/intro.tex',
				'body',
			);
		});

		it('should strip annotations on the workspace path too', async () => {
			const adapter = createAdapter();
			module.fileHandlerService.attachWorkspace(adapter as never);

			await module.fileHandlerService.writeBack(
				workspaceFile(),
				"a `<### comment id: c1, user: u, time: 1, content64: 'aGk=', responses: [], resolved: false ###>`b`</### comment id: c1 ###>` c",
			);

			expect(adapter.writeFile.mock.calls[0][1]).not.toContain('### comment');
		});

		it('should never mirror TeXlyre internal files into the folder', async () => {
			const adapter = createAdapter();
			module.fileHandlerService.attachWorkspace(adapter as never);
			const file = { ...workspaceFile(), path: '/.texlyre/state.json' };

			expect(await module.fileHandlerService.writeBack(file, 'junk')).toBe(false);
			expect(module.fileHandlerService.shouldMirror(file)).toBe(false);
			expect(adapter.writeFile).not.toHaveBeenCalled();
		});

		it('should pull adapter content that changed after the last write', async () => {
			const adapter = createAdapter();
			module.fileHandlerService.attachWorkspace(adapter as never);
			const file = workspaceFile();
			const apply = jest.fn().mockResolvedValue(undefined);

			await module.fileHandlerService.writeBack(file, 'body');
			adapter.stat.mockResolvedValue({ lastModified: 2_000, size: 9 });

			expect(await module.fileHandlerService.pullIfChanged(file, apply)).toBe(
				'applied',
			);
			expect(apply).toHaveBeenCalledWith('from disk');
		});

		it('should not pull when a reattached folder is merely observed', async () => {
			const adapter = createAdapter(9_000);
			module.fileHandlerService.attachWorkspace(adapter as never);
			const apply = jest.fn();

			expect(
				await module.fileHandlerService.pullIfChanged(workspaceFile(), apply),
			).toBe('unchanged');
			expect(apply).not.toHaveBeenCalled();
		});

		it('should drop workspace baselines on detach', async () => {
			const adapter = createAdapter();
			module.fileHandlerService.attachWorkspace(adapter as never);
			await module.fileHandlerService.writeBack(workspaceFile(), 'body');

			module.fileHandlerService.detachWorkspace();

			expect(module.fileHandlerService.getLinkedIds()).toEqual([]);
			expect(
				await module.fileHandlerService.writeBack(workspaceFile(), 'body'),
			).toBe(false);
		});

		it('should mirror only files that belong in the folder', async () => {
			const adapter = createAdapter();
			module.fileHandlerService.attachWorkspace(adapter as never);

			await module.fileHandlerService.mirrorFiles([
				{ ...workspaceFile(), content: 'body' },
				{ ...workspaceFile(), id: 'ws-2', path: '/.texlyre/x', content: 'x' },
				{ ...workspaceFile(), id: 'ws-3', content: undefined },
				{ ...workspaceFile(), id: 'ws-4', content: 'gone', isDeleted: true },
			]);

			expect(adapter.writeFile).toHaveBeenCalledTimes(1);
			expect(adapter.writeFile).toHaveBeenCalledWith(
				'/chapters/intro.tex',
				'body',
			);
		});

		it('should create folders on disk when mirroring a directory node', async () => {
			const adapter = createAdapter();
			module.fileHandlerService.attachWorkspace(adapter as never);

			await module.fileHandlerService.mirrorFiles([
				{
					id: 'dir-1',
					name: 'chapters',
					path: '/chapters',
					type: 'directory',
					lastModified: 1,
				},
			]);

			expect(adapter.createDirectory).toHaveBeenCalledWith('/chapters');
			expect(adapter.writeFile).not.toHaveBeenCalled();
		});

		it('should not create TeXlyre internal folders on disk', async () => {
			const adapter = createAdapter();
			module.fileHandlerService.attachWorkspace(adapter as never);

			await module.fileHandlerService.mirrorFiles([
				{
					id: 'dir-2',
					name: 'texlyre',
					path: '/.texlyre',
					type: 'directory',
					lastModified: 1,
				},
			]);

			expect(adapter.createDirectory).not.toHaveBeenCalled();
		});

		it('should remove deleted files from the folder', async () => {
			const adapter = createAdapter();
			module.fileHandlerService.attachWorkspace(adapter as never);

			await module.fileHandlerService.removeFromDisk([workspaceFile()]);

			expect(adapter.deleteEntry).toHaveBeenCalledWith('/chapters/intro.tex');
		});

		it('should not echo writes back to disk while mirroring is suppressed', async () => {
			const adapter = createAdapter();
			module.fileHandlerService.attachWorkspace(adapter as never);

			await module.fileHandlerService.withoutMirroring(async () => {
				await module.fileHandlerService.mirrorFiles([
					{ ...workspaceFile(), content: 'body' },
				]);
				await module.fileHandlerService.removeFromDisk([workspaceFile()]);
			});

			expect(adapter.writeFile).not.toHaveBeenCalled();
			expect(adapter.deleteEntry).not.toHaveBeenCalled();
		});

		it('should resume mirroring after suppression ends', async () => {
			const adapter = createAdapter();
			module.fileHandlerService.attachWorkspace(adapter as never);

			await module.fileHandlerService.withoutMirroring(async () => undefined);
			await module.fileHandlerService.mirrorFiles([
				{ ...workspaceFile(), content: 'body' },
			]);

			expect(adapter.writeFile).toHaveBeenCalled();
		});

		it('should reuse timestamps gathered by the folder walk', async () => {
			const adapter = createAdapter();
			module.fileHandlerService.attachWorkspace(adapter as never);
			const file = workspaceFile();
			await module.fileHandlerService.writeBack(file, 'body');
			adapter.stat.mockClear();

			await module.fileHandlerService.syncFromDisk(
				[file],
				async () => undefined,
				new Map([['/chapters/intro.tex', 2_000]]),
			);

			expect(adapter.stat).not.toHaveBeenCalled();
			expect(adapter.readFile).toHaveBeenCalled();
		});

		it('should merge external edits into annotated files instead of refusing', async () => {
			const adapter = createAdapter(1_000, 'intro\nflagged\nrewritten');
			module.fileHandlerService.attachWorkspace(adapter as never);
			const file = {
				...workspaceFile(),
				content:
					"intro\n`<### comment id: c1, user: a, time: 1, content64: 'aGk=', responses: [], resolved: false ###>`flagged`</### comment id: c1 ###>`\noutro",
			};
			const apply = jest.fn().mockResolvedValue(undefined);

			await module.fileHandlerService.writeBack(file, file.content);
			adapter.stat.mockResolvedValue({ lastModified: 2_000, size: 9 });

			const summary = await module.fileHandlerService.syncFromDisk(
				[file],
				async (_file, content) => apply(content),
			);

			expect(summary.merged).toEqual(['intro.tex']);
			expect(summary.droppedAnnotations).toBe(0);
			expect(apply.mock.calls[0][0]).toContain('### comment id: c1');
			expect(apply.mock.calls[0][0]).toContain('rewritten');
		});

		it('should merge annotations when local content is stored as a buffer', async () => {
			const adapter = createAdapter(1_000, 'intro\nflagged\nrewritten');
			module.fileHandlerService.attachWorkspace(adapter as never);
			const annotated =
				"intro\n`<### comment id: c1, user: a, time: 1, content64: 'aGk=', responses: [], resolved: false ###>`flagged`</### comment id: c1 ###>`\noutro";
			const file = {
				...workspaceFile(),
				content: new TextEncoder().encode(annotated).buffer,
			};
			const apply = jest.fn().mockResolvedValue(undefined);

			await module.fileHandlerService.writeBack(file, file.content);
			adapter.stat.mockResolvedValue({ lastModified: 2_000, size: 9 });

			const result = await module.fileHandlerService.pullIfChanged(file, apply);

			expect(result).toBe('merged');
			expect(apply.mock.calls[0][0]).toContain('### comment id: c1');
			expect(apply.mock.calls[0][0]).toContain('rewritten');
		});

		it('should open the merge view when a sync would drop annotations', async () => {
			const resolve = mockResolveConflicts.mockResolvedValue(
					new Map([['/chapters/intro.tex', { action: 'keep-local' }]]),
				);

			const adapter = createAdapter(1_000, 'intro\nrewritten entirely\ntail');
			module.fileHandlerService.attachWorkspace(adapter as never);
			const file = {
				...workspaceFile(),
				content:
					"intro\n`<### comment id: c1, user: a, time: 1, content64: 'aGk=', responses: [], resolved: false ###>`flagged`</### comment id: c1 ###>`\ntail",
			};

			await module.fileHandlerService.writeBack(file, file.content);
			adapter.stat.mockResolvedValue({ lastModified: 2_000, size: 9 });

			const summary = await module.fileHandlerService.syncFromDisk(
				[file],
				async () => undefined,
			);

			expect(resolve).toHaveBeenCalled();
			expect(summary.merged).toEqual(['intro.tex']);
		});

		it('should keep the project version when the merge view is dismissed', async () => {
			const resolve = mockResolveConflicts.mockResolvedValue(null);

			const adapter = createAdapter(1_000, 'intro\nrewritten entirely\ntail');
			module.fileHandlerService.attachWorkspace(adapter as never);
			const file = {
				...workspaceFile(),
				content:
					"intro\n`<### comment id: c1, user: a, time: 1, content64: 'aGk=', responses: [], resolved: false ###>`flagged`</### comment id: c1 ###>`\ntail",
			};
			const apply = jest.fn();

			await module.fileHandlerService.writeBack(file, file.content);
			adapter.stat.mockResolvedValue({ lastModified: 2_000, size: 9 });

			const summary = await module.fileHandlerService.syncFromDisk([file], apply);

			expect(summary.conflicted).toEqual(['intro.tex']);
			expect(apply).not.toHaveBeenCalled();
		});

		it('should write a merged result back to the folder', async () => {
			const adapter = createAdapter(1_000, 'intro\nrewritten\ntail');
			module.fileHandlerService.attachWorkspace(adapter as never);
			const file = {
				...workspaceFile(),
				content:
					"intro\n`<### comment id: c1, user: a, time: 1, content64: 'aGk=', responses: [], resolved: false ###>`flagged`</### comment id: c1 ###>`\ntail",
			};

			await module.fileHandlerService.writeBack(file, file.content);
			adapter.stat.mockResolvedValue({ lastModified: 2_000, size: 9 });
			adapter.writeFile.mockClear();

			const result = await module.fileHandlerService.pullIfChanged(
				file,
				async () => undefined,
			);

			expect(result).toBe('merged');
			expect(adapter.writeFile).toHaveBeenCalledTimes(1);
			expect(adapter.writeFile.mock.calls[0][1]).not.toContain('### comment');
		});

		it('should not write back a plain pull that matches the folder', async () => {
			const adapter = createAdapter();
			module.fileHandlerService.attachWorkspace(adapter as never);
			const file = workspaceFile();

			await module.fileHandlerService.writeBack(file, 'body');
			adapter.stat.mockResolvedValue({ lastModified: 2_000, size: 9 });
			adapter.writeFile.mockClear();

			const result = await module.fileHandlerService.pullIfChanged(
				file,
				async () => undefined,
			);

			expect(result).toBe('applied');
			expect(adapter.writeFile).not.toHaveBeenCalled();
		});

		it('should summarise a folder sync by outcome', async () => {
			const adapter = createAdapter();
			module.fileHandlerService.attachWorkspace(adapter as never);

			const changed = workspaceFile();
			const diverged = { ...workspaceFile(), id: 'ws-2', name: 'a.tex' };
			await module.fileHandlerService.writeBack(changed, 'body');
			await module.fileHandlerService.writeBack(diverged, 'body');
			adapter.stat.mockResolvedValue({ lastModified: 2_000, size: 9 });
			diverged.lastModified = 5_000;

			const summary = await module.fileHandlerService.syncFromDisk(
				[changed, diverged],
				async () => undefined,
			);

			expect(summary.applied).toEqual(['intro.tex']);
			expect(summary.conflicted).toEqual(['a.tex']);
			expect(summary.merged).toEqual([]);
		});
	});

	describe('annotations', () => {
		const annotated =
			"Intro `<### comment id: c1, user: a, time: 1, content64: 'aGk=', responses: [], resolved: false ###>`flagged`</### comment id: c1 ###>` tail";

		it('should strip comment tags before writing to disk', async () => {
			const handle = createHandle('main.tex', 'hello', 1);

			await module.fileHandlerService.writeBack(createFile(handle), annotated);

			const written = handle.write.mock.calls[0][0] as string;
			expect(written).not.toContain('### comment');
			expect(written).toContain('flagged');
		});

		it('should leave unannotated content untouched', async () => {
			const handle = createHandle('main.tex', 'hello', 1);

			await module.fileHandlerService.writeBack(
				createFile(handle),
				'\\section{Intro}',
			);

			expect(handle.write).toHaveBeenCalledWith('\\section{Intro}');
		});

		it('should merge rather than refuse when annotations are present', async () => {
			const handle = createHandle('main.tex', 'from disk', 1_000);
			const file = { ...createFile(handle), content: annotated };
			const apply = jest.fn();

			await module.fileHandlerService.writeBack(file, annotated);
			handle.getFile.mockResolvedValue({
				name: 'main.tex',
				type: 'text/x-tex',
				lastModified: 2_000,
				text: async () => 'from disk',
				arrayBuffer: async () => new ArrayBuffer(0),
			});

			const result = await module.fileHandlerService.pullIfChanged(file, apply);

			expect(result).toBe('merged');
			expect(apply).toHaveBeenCalled();
		});
	});

	describe('pullIfChanged', () => {
		it('should apply content that changed on disk after the last write', async () => {
			const handle = createHandle('main.tex', 'from disk', 1_000);
			const file = createFile(handle);
			const apply = jest.fn().mockResolvedValue(undefined);

			await module.fileHandlerService.writeBack(file, 'local');
			handle.getFile.mockResolvedValue({
				name: 'main.tex',
				type: 'text/x-tex',
				lastModified: 2_000,
				text: async () => 'from disk',
				arrayBuffer: async () => new ArrayBuffer(0),
			});

			const result = await module.fileHandlerService.pullIfChanged(file, apply);

			expect(result).toBe('applied');
			expect(apply).toHaveBeenCalledWith('from disk');
		});

		it('should read binary files as an array buffer', async () => {
			const handle = createHandle('figure.png', 'binary', 1_000);
			const file = { ...createFile(handle), isBinary: true };
			const apply = jest.fn().mockResolvedValue(undefined);

			await module.fileHandlerService.writeBack(file, 'local');
			handle.getFile.mockResolvedValue({
				name: 'figure.png',
				type: 'image/png',
				lastModified: 2_000,
				text: async () => 'binary',
				arrayBuffer: async () => new ArrayBuffer(4),
			});

			await module.fileHandlerService.pullIfChanged(file, apply);

			expect(apply.mock.calls[0][0]).toBeInstanceOf(ArrayBuffer);
		});

		it('should treat the first observation as the baseline', async () => {
			const handle = createHandle('main.tex', 'from disk', 5_000);
			const apply = jest.fn();

			const result = await module.fileHandlerService.pullIfChanged(
				createFile(handle),
				apply,
			);

			expect(result).toBe('unchanged');
			expect(apply).not.toHaveBeenCalled();
		});

		it('should report a conflict when both sides changed', async () => {
			const handle = createHandle('main.tex', 'from disk', 1_000);
			const file = createFile(handle);
			const apply = jest.fn();

			await module.fileHandlerService.writeBack(file, 'local');
			handle.getFile.mockResolvedValue({
				name: 'main.tex',
				type: 'text/x-tex',
				lastModified: 2_000,
				text: async () => 'from disk',
				arrayBuffer: async () => new ArrayBuffer(0),
			});
			file.lastModified = 3_000;

			const result = await module.fileHandlerService.pullIfChanged(file, apply);

			expect(result).toBe('conflict');
			expect(apply).not.toHaveBeenCalled();
		});

		it('should suppress write-back while applying disk content', async () => {
			const handle = createHandle('main.tex', 'from disk', 1_000);
			const file = createFile(handle);

			await module.fileHandlerService.writeBack(file, 'local');
			handle.write.mockClear();
			handle.getFile.mockResolvedValue({
				name: 'main.tex',
				type: 'text/x-tex',
				lastModified: 2_000,
				text: async () => 'from disk',
				arrayBuffer: async () => new ArrayBuffer(0),
			});

			await module.fileHandlerService.pullIfChanged(file, async (content) => {
				await module.fileHandlerService.writeBack(file, content);
			});

			expect(handle.write).not.toHaveBeenCalled();
		});

		it('should resume write-back once the pull completes', async () => {
			const handle = createHandle('main.tex', 'from disk', 1_000);
			const file = createFile(handle);

			await module.fileHandlerService.writeBack(file, 'local');
			handle.getFile.mockResolvedValue({
				name: 'main.tex',
				type: 'text/x-tex',
				lastModified: 2_000,
				text: async () => 'from disk',
				arrayBuffer: async () => new ArrayBuffer(0),
			});
			await module.fileHandlerService.pullIfChanged(file, async () => undefined);

			handle.write.mockClear();
			await module.fileHandlerService.writeBack(file, 'later edit');

			expect(handle.write).toHaveBeenCalledWith('later edit');
		});

		it('should report unavailable when read access is missing', async () => {
			const handle = createHandle('main.tex', 'from disk', 1_000, 'prompt');

			expect(
				await module.fileHandlerService.pullIfChanged(
					createFile(handle),
					jest.fn(),
				),
			).toBe('unavailable');
		});

		it('should report unavailable for files without a disk link', async () => {
			const file = createFile();
			file.launchHandle = undefined;

			expect(
				await module.fileHandlerService.pullIfChanged(file, jest.fn()),
			).toBe('unavailable');
		});
	});
});
