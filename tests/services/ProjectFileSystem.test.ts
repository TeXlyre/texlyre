import * as Y from 'yjs';

import type { FileNode } from '@src/types/files';

const mockGetFileByPath = jest.fn();
const mockGetAllFiles = jest.fn();
const mockUpdateFileContent = jest.fn();
const mockStoreFile = jest.fn();
const mockCreateDirectoryPath = jest.fn();
const mockConnect = jest.fn();
const mockDisconnect = jest.fn();

jest.mock('@src/services/FileStoreService', () => ({
	fileStoreService: {
		getCurrentProjectId: () => 'project-1',
		getFileByPath: (...args: unknown[]) => mockGetFileByPath(...args),
		getAllFiles: (...args: unknown[]) => mockGetAllFiles(...args),
		updateFileContent: (...args: unknown[]) => mockUpdateFileContent(...args),
		storeFile: (...args: unknown[]) => mockStoreFile(...args),
		createDirectoryPath: (...args: unknown[]) =>
			mockCreateDirectoryPath(...args),
	},
}));

jest.mock('@src/services/CollabService', () => ({
	collabService: {
		connect: (...args: unknown[]) => mockConnect(...args),
		disconnect: (...args: unknown[]) => mockDisconnect(...args),
		getDocContainer: () => ({ persistence: { whenSynced: Promise.resolve() } }),
	},
}));

type FsModule = typeof import('@src/services/ProjectFileSystem');

const file = (overrides: Partial<FileNode>): FileNode => ({
	id: 'file-1',
	name: 'main.tex',
	path: '/main.tex',
	type: 'file',
	lastModified: 1,
	...overrides,
});

describe('YjsProjectFileSystem', () => {
	let module: FsModule;
	let doc: Y.Doc;

	beforeEach(async () => {
		jest.resetModules();
		module = await import('@src/services/ProjectFileSystem');
		doc = new Y.Doc();
		mockGetFileByPath.mockReset();
		mockUpdateFileContent.mockReset().mockResolvedValue(undefined);
		mockStoreFile.mockReset().mockResolvedValue('new-id');
		mockCreateDirectoryPath.mockReset().mockResolvedValue(undefined);
		mockConnect.mockReset().mockReturnValue({ doc, provider: null });
		mockDisconnect.mockReset();
	});

	it('reads linked documents from Yjs rather than the trailing file copy', async () => {
		doc.getText('codemirror').insert(0, 'live text');
		mockGetFileByPath.mockResolvedValue(
			file({ documentId: 'doc-1', content: 'stale text' }),
		);

		const fs = new module.YjsProjectFileSystem();
		await expect(fs.readTextFile('/main.tex')).resolves.toBe('live text');
		expect(mockConnect).toHaveBeenCalledWith('project-1', 'yjs_doc-1', undefined);
		expect(mockDisconnect).toHaveBeenCalledWith('project-1', 'yjs_doc-1');
	});

	it('writes linked documents into the Y.Text', async () => {
		doc.getText('codemirror').insert(0, 'Hello world');
		mockGetFileByPath.mockResolvedValue(file({ documentId: 'doc-1' }));

		await new module.YjsProjectFileSystem().writeTextFile(
			'/main.tex',
			'Hello there world',
		);

		expect(doc.getText('codemirror').toString()).toBe('Hello there world');
		expect(mockUpdateFileContent).not.toHaveBeenCalled();
		expect(mockDisconnect).toHaveBeenCalledTimes(1);
	});

	it('writes unlinked text files to the file store', async () => {
		mockGetFileByPath.mockResolvedValue(file({ content: 'old' }));

		await new module.YjsProjectFileSystem().writeTextFile('/main.tex', 'new');

		expect(mockUpdateFileContent).toHaveBeenCalledWith('file-1', 'new');
		expect(mockConnect).not.toHaveBeenCalled();
	});

	it('creates missing files with their parent directories', async () => {
		mockGetFileByPath.mockResolvedValue(undefined);

		await new module.YjsProjectFileSystem().writeTextFile(
			'/chapters/intro.tex',
			'\\section{Intro}',
		);

		expect(mockCreateDirectoryPath).toHaveBeenCalledWith('/chapters/intro.tex');
		expect(mockStoreFile).toHaveBeenCalledWith(
			expect.objectContaining({
				name: 'intro.tex',
				path: '/chapters/intro.tex',
				content: '\\section{Intro}',
				isBinary: false,
			}),
			{ showConflictDialog: false },
		);
	});

	it('refuses binary files', async () => {
		mockGetFileByPath.mockResolvedValue(file({ name: 'fig.png', isBinary: true }));

		const fs = new module.YjsProjectFileSystem();
		await expect(fs.readTextFile('/fig.png')).rejects.toThrow('not a text file');
		await expect(fs.writeTextFile('/fig.png', 'x')).rejects.toThrow(
			'not a text file',
		);
	});

	it('lists live files sorted by path without loading content', async () => {
		mockGetAllFiles.mockResolvedValue([
			file({ path: '/z.tex', size: 3 }),
			file({ id: 'd', name: 'figs', path: '/figs', type: 'directory' }),
			file({ id: 'p', name: 'a.png', path: '/figs/a.png', isBinary: true }),
			file({ id: 'c', name: 'main.aux', path: '/.texlyre_cache/__tex/main.aux' }),
			file({ id: 'o', name: '__output', path: '/.texlyre_src/__output', type: 'directory' }),
		]);

		await expect(new module.YjsProjectFileSystem().listFiles()).resolves.toEqual([
			{ path: '/figs', type: 'directory', binary: false },
			{ path: '/figs/a.png', type: 'file', binary: true },
			{ path: '/z.tex', type: 'file', size: 3, binary: false },
		]);
		expect(mockGetAllFiles).toHaveBeenCalledWith(false, false, false);
	});

	it("refuses to change TeXlyre's internal files", async () => {
		const fs = new module.YjsProjectFileSystem();
		await expect(fs.writeTextFile('/.texlyre_cache/__tex/x.sty', 'x')).rejects.toThrow(
			'managed by TeXlyre',
		);
		await expect(fs.editTextFile('/.texlyre_src/main.tex', 'a', 'b')).rejects.toThrow(
			'managed by TeXlyre',
		);
		expect(mockGetFileByPath).not.toHaveBeenCalled();
	});

	it('edits linked documents in place, keeping concurrent text elsewhere', async () => {
		const ytext = doc.getText('codemirror');
		ytext.insert(0, 'Intro.\nHello world.\nOutro.');
		mockGetFileByPath.mockResolvedValue(file({ documentId: 'doc-1' }));
		const anchor = Y.createRelativePositionFromTypeIndex(ytext, 26);

		await new module.YjsProjectFileSystem().editTextFile(
			'/main.tex',
			'Hello world.',
			'Hi world.',
		);

		expect(ytext.toString()).toBe('Intro.\nHi world.\nOutro.');
		expect(Y.createAbsolutePositionFromRelativePosition(anchor, doc)?.index).toBe(
			23,
		);
	});

	it('edits unlinked files through the file store', async () => {
		mockGetFileByPath.mockResolvedValue(file({ content: 'a b c' }));

		await new module.YjsProjectFileSystem().editTextFile('/main.tex', 'b', 'B');

		expect(mockUpdateFileContent).toHaveBeenCalledWith('file-1', 'a B c');
	});

	it('refuses missing or ambiguous edit targets', () => {
		expect(() => module.applyUniqueEdit('a a', 'a', 'b', '/x')).toThrow(
			'more than once',
		);
		expect(() => module.applyUniqueEdit('abc', 'z', 'b', '/x')).toThrow(
			'not found',
		);
		expect(() => module.applyUniqueEdit('abc', '', 'b', '/x')).toThrow(
			'must not be empty',
		);
	});

	it('replaceYText edits only the changed span', () => {
		const ytext = doc.getText('codemirror');
		ytext.insert(0, 'alpha beta gamma');
		const anchor = Y.createRelativePositionFromTypeIndex(ytext, 14);

		module.replaceYText(ytext, 'alpha BETA gamma');

		expect(ytext.toString()).toBe('alpha BETA gamma');
		const restored = Y.createAbsolutePositionFromRelativePosition(anchor, doc);
		expect(restored?.index).toBe(14);
	});
});
