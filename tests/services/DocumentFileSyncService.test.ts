import * as Y from 'yjs';

import type { FileNode } from '@src/types/files';

const mockGetAllFiles = jest.fn();
const mockGetFile = jest.fn();
const mockUpdateFileContent = jest.fn();

jest.mock('@src/services/FileStoreService', () => ({
	fileStoreService: {
		getAllFiles: (...args: unknown[]) => mockGetAllFiles(...args),
		getFile: (...args: unknown[]) => mockGetFile(...args),
		updateFileContent: (...args: unknown[]) => mockUpdateFileContent(...args),
	},
}));

type ServiceModule = typeof import('@src/services/DocumentFileSyncService');

describe('DocumentFileSyncService', () => {
	const PROJECT_ID = 'project-1';
	const DOCUMENT_ID = 'doc-1';

	let module: ServiceModule;
	let doc: Y.Doc;

	const linkedFile = (content: string | ArrayBuffer): FileNode => ({
		id: 'file-1',
		name: 'main.tex',
		path: '/main.tex',
		type: 'file',
		lastModified: 1_000,
		documentId: DOCUMENT_ID,
		content,
	});

	const applyRemoteEdit = (text: string) => {
		const remote = new Y.Doc();
		remote.getText('codemirror').insert(0, text);
		Y.applyUpdate(doc, Y.encodeStateAsUpdate(remote));
	};

	const flushSync = async () => {
		await jest.advanceTimersByTimeAsync(2000);
	};

	beforeEach(async () => {
		jest.useFakeTimers();
		mockGetAllFiles.mockReset().mockResolvedValue([linkedFile('')]);
		mockGetFile.mockReset().mockResolvedValue(linkedFile(''));
		mockUpdateFileContent.mockReset().mockResolvedValue(undefined);

		jest.resetModules();
		module = await import('@src/services/DocumentFileSyncService');
		doc = new Y.Doc();
	});

	afterEach(() => {
		jest.useRealTimers();
		if (!doc.isDestroyed) doc.destroy();
	});

	it('writes remote updates of a background document to its linked file', async () => {
		module.documentFileSyncService.watch(PROJECT_ID, DOCUMENT_ID, doc);
		applyRemoteEdit('\\section{From a collaborator}');

		expect(mockUpdateFileContent).not.toHaveBeenCalled();

		await flushSync();

		expect(mockUpdateFileContent).toHaveBeenCalledTimes(1);
		expect(mockUpdateFileContent).toHaveBeenCalledWith(
			'file-1',
			'\\section{From a collaborator}',
		);
	});

	it('debounces bursts of remote updates into a single write', async () => {
		module.documentFileSyncService.watch(PROJECT_ID, DOCUMENT_ID, doc);

		for (const chunk of ['a', 'b', 'c']) {
			applyRemoteEdit(chunk);
			await jest.advanceTimersByTimeAsync(100);
		}

		await flushSync();

		expect(mockUpdateFileContent).toHaveBeenCalledTimes(1);
		expect(mockGetAllFiles).toHaveBeenCalledTimes(1);
	});

	it('resolves the linked file once and then reads only that record', async () => {
		module.documentFileSyncService.watch(PROJECT_ID, DOCUMENT_ID, doc);

		applyRemoteEdit('first');
		await flushSync();
		applyRemoteEdit('second');
		await flushSync();

		expect(mockGetAllFiles).toHaveBeenCalledTimes(1);
		expect(mockGetFile).toHaveBeenCalledTimes(2);
		expect(mockUpdateFileContent).toHaveBeenCalledTimes(2);
	});

	it('skips the write when the linked file already holds the content', async () => {
		mockGetFile.mockResolvedValue(linkedFile('already on disk'));
		module.documentFileSyncService.watch(PROJECT_ID, DOCUMENT_ID, doc);

		applyRemoteEdit('already on disk');
		await flushSync();

		expect(mockUpdateFileContent).not.toHaveBeenCalled();
	});

	it('does not resurrect a linked file that was deleted locally', async () => {
		mockGetFile.mockResolvedValue({ ...linkedFile(''), isDeleted: true });
		module.documentFileSyncService.watch(PROJECT_ID, DOCUMENT_ID, doc);

		applyRemoteEdit('late edit');
		await flushSync();

		expect(mockUpdateFileContent).not.toHaveBeenCalled();
	});

	it('flushes pending changes on unwatch and stops syncing afterwards', async () => {
		module.documentFileSyncService.watch(PROJECT_ID, DOCUMENT_ID, doc);
		applyRemoteEdit('unsaved tail');

		module.documentFileSyncService.unwatch(PROJECT_ID, DOCUMENT_ID);
		await Promise.resolve();
		await Promise.resolve();

		expect(mockUpdateFileContent).toHaveBeenCalledWith('file-1', 'unsaved tail');

		mockUpdateFileContent.mockClear();
		applyRemoteEdit('after unwatch');
		await flushSync();

		expect(mockUpdateFileContent).not.toHaveBeenCalled();
	});

	it('never writes once the document has been destroyed', async () => {
		module.documentFileSyncService.watch(PROJECT_ID, DOCUMENT_ID, doc);
		applyRemoteEdit('edit before teardown');
		if (!doc.isDestroyed) doc.destroy();

		await flushSync();

		expect(mockUpdateFileContent).not.toHaveBeenCalled();
	});
});
