import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { requestLSPDocumentHighlights } from '@src/extensions/codemirror/lsp/lspDocumentHighlight';
import { genericLSPService } from '@src/services/GenericLSPService';

let views: EditorView[] = [];

afterEach(() => {
	for (const view of views) view.destroy();
	views = [];
	jest.restoreAllMocks();
});

describe('LSP document highlights', () => {
	it('requests and maps documentHighlight ranges', async () => {
		const request = jest.fn().mockResolvedValue([
			{
				range: {
					start: { line: 0, character: 0 },
					end: { line: 0, character: 5 },
				},
				kind: 2,
			},
			{
				range: {
					start: { line: 1, character: 0 },
					end: { line: 1, character: 4 },
				},
				kind: 3,
			},
		]);
		const client = {
			serverCapabilities: { documentHighlightProvider: true },
			request,
		} as any;
		jest.spyOn(genericLSPService, 'getAllClientsForFile').mockReturnValue([client]);
		const view = new EditorView({
			state: EditorState.create({ doc: 'alpha\nbeta' }),
			parent: document.body,
		});
		views.push(view);

		const highlights = await requestLSPDocumentHighlights(view, 'test.tex');

		expect(request).toHaveBeenCalledWith('textDocument/documentHighlight', {
			textDocument: { uri: 'file:///test.tex' },
			position: { line: 0, character: 0 },
		});
		expect(highlights).toEqual([
			{ from: 0, to: 5, kind: 2 },
			{ from: 6, to: 10, kind: 3 },
		]);
	});

	it('does not request highlights when the server does not provide them', async () => {
		const request = jest.fn();
		jest.spyOn(genericLSPService, 'getAllClientsForFile').mockReturnValue([
			{ serverCapabilities: {}, request } as any,
		]);
		const view = new EditorView({
			state: EditorState.create({ doc: 'alpha' }),
			parent: document.body,
		});
		views.push(view);

		await expect(requestLSPDocumentHighlights(view, 'test.tex')).resolves.toEqual(
			[],
		);
		expect(request).not.toHaveBeenCalled();
	});
});
