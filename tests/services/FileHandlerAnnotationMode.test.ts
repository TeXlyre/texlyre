jest.mock('../../src/services/FileStoreService', () => ({
	fileStoreService: {
		getCurrentProjectId: jest.fn(() => 'annotation-mode-project'),
	},
}));

import { fileHandlerService } from '../../src/services/FileHandlerService';
import type { FileNode } from '../../src/types/files';

const projectId = 'annotation-mode-project';
const tagged = '<### comment id:test ###>Hello</### comment id:test ###>';

const file: FileNode = {
	id: 'file-1',
	name: 'main.tex',
	path: '/main.tex',
	type: 'file',
	content: tagged,
	lastModified: 1,
};

const makeWorkspace = () => ({
	stat: jest.fn(async () => ({ lastModified: 10, size: tagged.length })),
	readFile: jest.fn(async () => tagged),
	writeFile: jest.fn(async () => undefined),
	deleteEntry: jest.fn(async () => undefined),
	createDirectory: jest.fn(async () => undefined),
});

describe('FileHandlerService workspace annotation representation', () => {
	beforeEach(() => {
		localStorage.removeItem(`texlyre-workspace-clean-annotations:${projectId}`);
		fileHandlerService.detachWorkspace();
	});

	afterEach(() => {
		fileHandlerService.detachWorkspace();
		localStorage.removeItem(`texlyre-workspace-clean-annotations:${projectId}`);
	});

	it('writes clean text to the linked folder by default', async () => {
		const workspace = makeWorkspace();
		fileHandlerService.attachWorkspace(workspace as never);

		expect(fileHandlerService.getWorkspaceCleanAnnotations(projectId)).toBe(true);
		expect(await fileHandlerService.writeBack(file, tagged)).toBe(true);
		expect(workspace.writeFile).toHaveBeenCalledWith('/main.tex', 'Hello');
	});

	it('writes exact annotated text when clean annotations is disabled', async () => {
		const workspace = makeWorkspace();
		fileHandlerService.attachWorkspace(workspace as never);
		fileHandlerService.setWorkspaceCleanAnnotations(projectId, false);

		expect(fileHandlerService.getWorkspaceCleanAnnotations(projectId)).toBe(false);
		expect(await fileHandlerService.writeBack(file, tagged)).toBe(true);
		expect(workspace.writeFile).toHaveBeenCalledWith('/main.tex', tagged);
	});
});
