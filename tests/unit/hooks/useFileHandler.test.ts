import { act, renderHook, waitFor } from '@testing-library/react';
import { useDiskFiles } from '@src/hooks/useDiskFiles';
import { fileHandlerService } from '@src/services/FileHandlerService';
import { fileStoreService } from '@src/services/FileStoreService';
import { notificationService } from '@src/services/NotificationService';
import { collabService } from '@src/services/CollabService';
import { workspaceService } from '@src/services/WorkspaceService';
import type { FileNode } from '@src/types/files';

describe('useDiskFiles', () => {
	const linkedFile: FileNode = {
		id: 'file-1',
		name: 'main.tex',
		path: '/main.tex',
		type: 'file',
		lastModified: 1_000,
		launchHandle: {} as FileSystemFileHandle,
	};

	beforeEach(() => {
		jest.restoreAllMocks();
		jest.spyOn(fileHandlerService, 'initialize').mockImplementation(() => undefined);
		jest.spyOn(fileHandlerService, 'isSupported').mockReturnValue(true);
		jest
			.spyOn(fileHandlerService, 'addLaunchListener')
			.mockReturnValue(() => undefined);
		jest.spyOn(fileHandlerService, 'pullIfChanged').mockResolvedValue('unchanged');
		jest.spyOn(fileHandlerService, 'syncFromDisk').mockResolvedValue({
			applied: [],
			merged: [],
			conflicted: [],
			droppedAnnotations: 0,
		});
		jest.spyOn(fileHandlerService, 'hasWorkspace').mockReturnValue(false);
		jest.spyOn(fileHandlerService, 'getLaunchLinkedIds').mockReturnValue([]);
		jest.spyOn(workspaceService, 'reconcile').mockResolvedValue({
			changed: false,
			files: [],
			stats: new Map(),
			added: 0,
			removed: 0,
			renamed: 0,
		});
		jest
			.spyOn(collabService, 'updateDocumentContent')
			.mockResolvedValue(undefined);
		jest.spyOn(workspaceService, 'restore').mockResolvedValue(false);
		jest.spyOn(workspaceService, 'refreshLinks').mockResolvedValue([]);
		jest.spyOn(workspaceService, 'deactivate').mockImplementation(() => undefined);
		jest.spyOn(fileStoreService, 'getAllFiles').mockResolvedValue([linkedFile]);
		jest
			.spyOn(fileStoreService, 'getFilesByIds')
			.mockResolvedValue([linkedFile]);
		jest.spyOn(fileHandlerService, 'resetLinks').mockImplementation(() => undefined);
		jest.spyOn(fileHandlerService, 'unregisterLink').mockImplementation(() => undefined);
		jest.spyOn(fileHandlerService, 'getLinkedIds').mockReturnValue(['file-1']);
		jest
			.spyOn(fileStoreService, 'updateFileContent')
			.mockResolvedValue(undefined);
		jest.spyOn(notificationService, 'showInfo').mockImplementation(() => undefined);
		jest.spyOn(notificationService, 'showError').mockImplementation(() => undefined);
	});

	const emitLaunch = () => {
		const listener = (
			fileHandlerService.addLaunchListener as jest.Mock
		).mock.calls[0][0];

		act(() => {
			listener([
				{
					name: 'main.tex',
					type: 'text/x-tex',
					buffer: new ArrayBuffer(4),
					handle: {} as FileSystemFileHandle,
				},
			]);
		});
	};

	it('should expose launched files as pending share files', () => {
		const { result } = renderHook(() => useDiskFiles(null));

		emitLaunch();

		expect(result.current.launchedFiles).toHaveLength(1);
		expect(result.current.launchedFiles[0].name).toBe('main.tex');
		expect(result.current.launchedFiles[0].handle).toBeDefined();
	});

	it('should clear launched files on request', () => {
		const { result } = renderHook(() => useDiskFiles(null));
		emitLaunch();

		act(() => {
			result.current.clearLaunchedFiles();
		});

		expect(result.current.launchedFiles).toEqual([]);
	});

	it('should unsubscribe from launches on unmount', () => {
		const unsubscribe = jest.fn();
		(fileHandlerService.addLaunchListener as jest.Mock).mockReturnValue(
			unsubscribe,
		);

		renderHook(() => useDiskFiles(null)).unmount();

		expect(unsubscribe).toHaveBeenCalled();
	});

	it('should not read project files when no project is open', async () => {
		renderHook(() => useDiskFiles(null));

		await waitFor(() => {
			expect(fileStoreService.getAllFiles).not.toHaveBeenCalled();
		});
		expect(fileStoreService.getFilesByIds).not.toHaveBeenCalled();
	});

	it('should pull disk changes into storage when a project is open', async () => {
		(fileHandlerService.syncFromDisk as jest.Mock).mockImplementation(
			async (files, apply) => {
				await apply(files[0], 'from disk');
				return {
					applied: ['main.tex'],
					merged: [],
					conflicted: [],
					droppedAnnotations: 0,
				};
			},
		);

		renderHook(() => useDiskFiles('yjs:project-1'));

		await waitFor(() => {
			expect(fileStoreService.updateFileContent).toHaveBeenCalledWith(
				'file-1',
				'from disk',
			);
		});
		expect(notificationService.showInfo).toHaveBeenCalled();
	});

	it('should push pulled content into a linked document', async () => {
		(fileStoreService.getFilesByIds as jest.Mock).mockResolvedValue([
			{ ...linkedFile, documentId: 'doc-1' },
		]);
		(fileHandlerService.syncFromDisk as jest.Mock).mockImplementation(
			async (files, apply) => {
				await apply(files[0], 'from disk');
				return {
					applied: ['main.tex'],
					merged: [],
					conflicted: [],
					droppedAnnotations: 0,
				};
			},
		);

		renderHook(() => useDiskFiles('yjs:project-1'));

		await waitFor(() => {
			expect(collabService.updateDocumentContent).toHaveBeenCalledWith(
				'project-1',
				'doc-1',
				expect.any(Function),
			);
		});
		const updater = (collabService.updateDocumentContent as jest.Mock).mock
			.calls[0][2];
		expect(updater('anything')).toBe('from disk');
	});

	it('should not touch documents for unlinked files', async () => {
		(fileHandlerService.syncFromDisk as jest.Mock).mockImplementation(
			async (files, apply) => {
				await apply(files[0], 'from disk');
				return {
					applied: ['main.tex'],
					merged: [],
					conflicted: [],
					droppedAnnotations: 0,
				};
			},
		);

		renderHook(() => useDiskFiles('yjs:project-1'));

		await waitFor(() => {
			expect(fileStoreService.updateFileContent).toHaveBeenCalled();
		});
		expect(collabService.updateDocumentContent).not.toHaveBeenCalled();
	});

	it('should report merges and dropped annotations separately from conflicts', async () => {
		(fileHandlerService.syncFromDisk as jest.Mock).mockResolvedValue({
			applied: [],
			merged: ['a.tex'],
			conflicted: ['b.tex'],
			droppedAnnotations: 3,
		});

		renderHook(() => useDiskFiles('yjs:project-1'));

		await waitFor(() => {
			expect(notificationService.showError).toHaveBeenCalledTimes(1);
		});
		expect(notificationService.showInfo).toHaveBeenCalledTimes(2);
	});

	it('should reconcile the folder before pulling when a workspace is connected', async () => {
		(fileHandlerService.hasWorkspace as jest.Mock).mockReturnValue(true);
		(workspaceService.reconcile as jest.Mock).mockResolvedValue({
			changed: true,
			files: [linkedFile],
			stats: new Map([['/main.tex', 2_000]]),
			added: 1,
			removed: 0,
			renamed: 0,
		});

		renderHook(() => useDiskFiles('yjs:project-1'));

		await waitFor(() => {
			expect(fileHandlerService.syncFromDisk).toHaveBeenCalledWith(
				[linkedFile],
				expect.any(Function),
				expect.any(Map),
			);
		});
		expect(fileStoreService.getFilesByIds).not.toHaveBeenCalled();
	});

	it('should still pull files opened from outside an unchanged folder', async () => {
		(fileHandlerService.hasWorkspace as jest.Mock).mockReturnValue(true);
		(fileHandlerService.getLaunchLinkedIds as jest.Mock).mockReturnValue([
			'file-1',
		]);

		renderHook(() => useDiskFiles('yjs:project-1'));

		await waitFor(() => {
			expect(fileStoreService.getFilesByIds).toHaveBeenCalledWith(['file-1']);
		});
		expect(fileHandlerService.syncFromDisk).toHaveBeenCalled();
	});

	it('should do no work when the connected folder is untouched', async () => {
		(fileHandlerService.hasWorkspace as jest.Mock).mockReturnValue(true);

		renderHook(() => useDiskFiles('yjs:project-1'));

		await waitFor(() => {
			expect(workspaceService.reconcile).toHaveBeenCalled();
		});
		expect(fileHandlerService.syncFromDisk).not.toHaveBeenCalled();
		expect(fileStoreService.getFilesByIds).not.toHaveBeenCalled();
	});

	it('should adopt workspace links when the project has a connected folder', async () => {
		(workspaceService.restore as jest.Mock).mockResolvedValue(true);

		renderHook(() => useDiskFiles('yjs:project-1'));

		await waitFor(() => {
			expect(workspaceService.refreshLinks).toHaveBeenCalled();
		});
		expect(fileStoreService.getAllFiles).not.toHaveBeenCalled();
	});

	it('should release the workspace when the project changes', async () => {
		const { unmount } = renderHook(() => useDiskFiles('yjs:project-1'));

		await waitFor(() => {
			expect(workspaceService.restore).toHaveBeenCalledWith('project-1');
		});

		unmount();

		expect(workspaceService.deactivate).toHaveBeenCalled();
	});

	it('should seed the linked ids from storage once per project', async () => {
		renderHook(() => useDiskFiles('yjs:project-1'));

		await waitFor(() => {
			expect(fileHandlerService.resetLinks).toHaveBeenCalledWith(['file-1']);
		});
	});

	it('should read only the linked files rather than the whole project', async () => {
		renderHook(() => useDiskFiles('yjs:project-1'));

		await waitFor(() => {
			expect(fileStoreService.getFilesByIds).toHaveBeenCalledWith(['file-1']);
		});

		const getAllFiles = fileStoreService.getAllFiles as jest.Mock;
		const baseline = getAllFiles.mock.calls.length;
		jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);

		act(() => {
			window.dispatchEvent(new Event('focus'));
		});

		await waitFor(() => {
			expect(
				(fileStoreService.getFilesByIds as jest.Mock).mock.calls.length,
			).toBeGreaterThan(1);
		});
		expect(getAllFiles.mock.calls.length).toBe(baseline);
	});

	it('should not touch storage when no file is linked to disk', async () => {
		(fileHandlerService.getLinkedIds as jest.Mock).mockReturnValue([]);

		renderHook(() => useDiskFiles('yjs:project-1'));

		await waitFor(() => {
			expect(fileHandlerService.resetLinks).toHaveBeenCalled();
		});
		expect(fileStoreService.getFilesByIds).not.toHaveBeenCalled();
		expect(fileHandlerService.pullIfChanged).not.toHaveBeenCalled();
	});

	it('should re-check the disk when the window regains focus', async () => {
		const getFilesByIds = fileStoreService.getFilesByIds as jest.Mock;
		renderHook(() => useDiskFiles('yjs:project-1'));

		await waitFor(() => {
			expect(getFilesByIds).toHaveBeenCalled();
		});
		const baseline = getFilesByIds.mock.calls.length;
		jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 60_000);

		act(() => {
			window.dispatchEvent(new Event('focus'));
		});

		await waitFor(() => {
			expect(getFilesByIds.mock.calls.length).toBeGreaterThan(baseline);
		});
	});

	it('should stop listening for focus events on unmount', async () => {
		const getFilesByIds = fileStoreService.getFilesByIds as jest.Mock;
		const { unmount } = renderHook(() => useDiskFiles('yjs:project-1'));

		await waitFor(() => {
			expect(getFilesByIds).toHaveBeenCalled();
		});

		unmount();
		const baseline = getFilesByIds.mock.calls.length;
		window.dispatchEvent(new Event('focus'));
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(getFilesByIds.mock.calls.length).toBe(baseline);
	});
});
