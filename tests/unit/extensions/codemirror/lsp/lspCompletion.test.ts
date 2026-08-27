import type { CompletionContext } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import {
	getGenericLSPCompletionSources,
	getGenericLSPExtensionsForFile,
} from '@src/extensions/codemirror/GenericLSPExtension';
import { genericLSPService } from '@src/services/GenericLSPService';

let views: EditorView[] = [];

afterEach(() => {
	for (const view of views) view.destroy();
	views = [];
	jest.restoreAllMocks();
});

function createClient(capabilities: Record<string, unknown>, request?: jest.Mock) {
	const sent: any[] = [];
	return {
		client: {
			serverCapabilities: capabilities,
			transport: {
				send: (message: string) => sent.push(JSON.parse(message)),
			},
			request: request ?? jest.fn(),
		} as any,
		sent,
	};
}

function createSyncView(client: any, doc = 'alpha\nbeta') {
	jest.spyOn(genericLSPService, 'getAllClientsForFile').mockReturnValue([client]);
	const syncExtension = getGenericLSPExtensionsForFile('test.tex')[0];
	const view = new EditorView({
		state: EditorState.create({ doc, extensions: [syncExtension] }),
		parent: document.body,
	});
	views.push(view);
	return view;
}

describe('generic LSP document synchronization', () => {
	it('uses incremental didChange when the server requests it', () => {
		const { client, sent } = createClient({
			textDocumentSync: { change: 2 },
		});
		const view = createSyncView(client);
		sent.length = 0;

		view.dispatch({ changes: { from: 6, to: 10, insert: 'BETA' } });

		expect(sent).toHaveLength(1);
		expect(sent[0]).toMatchObject({
			method: 'textDocument/didChange',
			params: {
				contentChanges: [
					{
						range: {
							start: { line: 1, character: 0 },
							end: { line: 1, character: 4 },
						},
						text: 'BETA',
					},
				],
			},
		});
	});

	it('collapses multiple transaction edits into one valid incremental change', () => {
		const { client, sent } = createClient({
			textDocumentSync: { change: 2 },
		});
		const view = createSyncView(client, 'one\ntwo\nthree');
		sent.length = 0;

		view.dispatch({
			changes: [
				{ from: 0, to: 3, insert: 'ONE\nEXTRA' },
				{ from: 8, to: 13, insert: 'THREE' },
			],
		});

		expect(sent).toHaveLength(1);
		expect(sent[0].params.contentChanges).toEqual([
			{
				range: {
					start: { line: 0, character: 0 },
					end: { line: 2, character: 5 },
				},
				text: 'ONE\nEXTRA\ntwo\nTHREE',
			},
		]);
	});

	it('keeps full didChange for servers requesting full synchronization', () => {
		const { client, sent } = createClient({
			textDocumentSync: { change: 1 },
		});
		const view = createSyncView(client);
		sent.length = 0;

		view.dispatch({ changes: { from: 6, to: 10, insert: 'BETA' } });

		expect(sent[0].params.contentChanges).toEqual([
			{ text: 'alpha\nBETA' },
		]);
	});

	it('does not send didChange when synchronization is disabled', () => {
		const { client, sent } = createClient({ textDocumentSync: 0 });
		const view = createSyncView(client);
		sent.length = 0;

		view.dispatch({ changes: { from: 0, to: 5, insert: 'ALPHA' } });

		expect(sent).toHaveLength(0);
	});
});

describe('generic LSP completion', () => {
	it('accepts CompletionItem[] responses', async () => {
		const request = jest.fn().mockResolvedValue([
			{ label: 'alpha', insertText: 'alpha' },
		]);
		const { client } = createClient({ completionProvider: {} }, request);
		jest.spyOn(genericLSPService, 'getAllClientsForFile').mockReturnValue([client]);
		const state = EditorState.create({ doc: 'a' });
		const source = getGenericLSPCompletionSources('test.tex')[0];

		const result = await source({ state, pos: 1, explicit: true } as CompletionContext);

		expect(result?.options.map((option) => option.label)).toEqual(['alpha']);
		expect(request).toHaveBeenCalledWith('textDocument/completion', {
			textDocument: { uri: 'file:///test.tex' },
			position: { line: 0, character: 1 },
			context: { triggerKind: 1 },
		});
	});

	it('uses server trigger characters in CompletionContext', async () => {
		const request = jest.fn().mockResolvedValue({
			items: [{ label: 'member', insertText: 'member' }],
		});
		const { client } = createClient(
			{ completionProvider: { triggerCharacters: ['.'] } },
			request,
		);
		jest.spyOn(genericLSPService, 'getAllClientsForFile').mockReturnValue([client]);
		const state = EditorState.create({ doc: 'foo.' });
		const source = getGenericLSPCompletionSources('test.tex')[0];

		await source({ state, pos: 4, explicit: false } as CompletionContext);

		expect(request).toHaveBeenCalledWith('textDocument/completion',
			expect.objectContaining({
				context: { triggerKind: 2, triggerCharacter: '.' },
			}),
		);
	});

	it('retriggers incomplete completion lists as the user types', async () => {
		const request = jest
			.fn()
			.mockResolvedValueOnce({
				isIncomplete: true,
				items: [{ label: 'alpha', insertText: 'alpha' }],
			})
			.mockResolvedValueOnce({
				isIncomplete: false,
				items: [{ label: 'about', insertText: 'about' }],
			});
		const { client } = createClient({ completionProvider: {} }, request);
		jest.spyOn(genericLSPService, 'getAllClientsForFile').mockReturnValue([client]);
		const source = getGenericLSPCompletionSources('test.tex')[0];

		await source({
			state: EditorState.create({ doc: 'a' }),
			pos: 1,
			explicit: false,
		} as CompletionContext);
		await source({
			state: EditorState.create({ doc: 'ab' }),
			pos: 2,
			explicit: false,
		} as CompletionContext);

		expect(request.mock.calls[1][1].context).toEqual({ triggerKind: 3 });
	});

	it('applies InsertReplaceEdit using its replace range', async () => {
		const request = jest.fn().mockResolvedValue({
			items: [
				{
					label: 'bar',
					textEdit: {
						insert: {
							start: { line: 0, character: 0 },
							end: { line: 0, character: 3 },
						},
						replace: {
							start: { line: 0, character: 0 },
							end: { line: 0, character: 4 },
						},
						newText: 'bar',
					},
				},
			],
		});
		const { client } = createClient({ completionProvider: {} }, request);
		jest.spyOn(genericLSPService, 'getAllClientsForFile').mockReturnValue([client]);
		const state = EditorState.create({ doc: 'fooz' });
		const source = getGenericLSPCompletionSources('test.tex')[0];
		const result = await source({ state, pos: 3, explicit: true } as CompletionContext);
		const option = result!.options[0];
		const view = new EditorView({ state, parent: document.body });
		views.push(view);

		expect(typeof option.apply).toBe('function');
		if (typeof option.apply === 'function') {
			option.apply(view, option, 0, 3);
		}

		expect(view.state.doc.toString()).toBe('bar');
	});

	it('applies additionalTextEdits together with the primary completion edit', async () => {
		const request = jest.fn().mockResolvedValue({
			items: [
				{
					label: 'foo',
					textEdit: {
						range: {
							start: { line: 1, character: 0 },
							end: { line: 1, character: 3 },
						},
						newText: 'foo',
					},
					additionalTextEdits: [
						{
							range: {
								start: { line: 0, character: 0 },
								end: { line: 0, character: 0 },
							},
							newText: 'import x\n',
						},
					],
				},
			],
		});
		const { client } = createClient({ completionProvider: {} }, request);
		jest.spyOn(genericLSPService, 'getAllClientsForFile').mockReturnValue([client]);
		const state = EditorState.create({ doc: '\nbar' });
		const source = getGenericLSPCompletionSources('test.tex')[0];
		const result = await source({ state, pos: 4, explicit: true } as CompletionContext);
		const option = result!.options[0];
		const view = new EditorView({ state, parent: document.body });
		views.push(view);

		expect(typeof option.apply).toBe('function');
		if (typeof option.apply === 'function') {
			option.apply(view, option, 1, 4);
		}

		expect(view.state.doc.toString()).toBe('import x\n\nfoo');
	});

	it('applies snippet completions and selects the first placeholder', async () => {
		const request = jest.fn().mockResolvedValue({
			items: [
				{
					label: 'fn',
					insertText: 'fn(${1:arg}, $2)',
					insertTextFormat: 2,
				},
			],
		});
		const { client } = createClient({ completionProvider: {} }, request);
		jest.spyOn(genericLSPService, 'getAllClientsForFile').mockReturnValue([client]);
		const state = EditorState.create({ doc: '' });
		const source = getGenericLSPCompletionSources('test.tex')[0];
		const result = await source({ state, pos: 0, explicit: true } as CompletionContext);
		const option = result!.options[0];
		const view = new EditorView({ state, parent: document.body });
		views.push(view);

		expect(typeof option.apply).toBe('function');
		if (typeof option.apply === 'function') {
			option.apply(view, option, 0, 0);
		}

		expect(view.state.doc.toString()).toBe('fn(arg, )');
		expect(
			view.state.sliceDoc(
				view.state.selection.main.from,
				view.state.selection.main.to,
			),
		).toBe('arg');
	});

	it('keeps snippet placeholders when applying additionalTextEdits', async () => {
		const request = jest.fn().mockResolvedValue({
			items: [
				{
					label: 'foo',
					textEdit: {
						range: {
							start: { line: 1, character: 0 },
							end: { line: 1, character: 2 },
						},
						newText: 'foo(${1:x})',
					},
					insertTextFormat: 2,
					additionalTextEdits: [
						{
							range: {
								start: { line: 0, character: 0 },
								end: { line: 0, character: 0 },
							},
							newText: 'import x\n',
						},
					],
				},
			],
		});
		const { client } = createClient({ completionProvider: {} }, request);
		jest.spyOn(genericLSPService, 'getAllClientsForFile').mockReturnValue([client]);
		const state = EditorState.create({ doc: '\nfo' });
		const source = getGenericLSPCompletionSources('test.tex')[0];
		const result = await source({ state, pos: 3, explicit: true } as CompletionContext);
		const option = result!.options[0];
		const view = new EditorView({ state, parent: document.body });
		views.push(view);

		expect(typeof option.apply).toBe('function');
		if (typeof option.apply === 'function') {
			option.apply(view, option, 1, 3);
		}

		expect(view.state.doc.toString()).toBe('import x\n\nfoo(x)');
		expect(
			view.state.sliceDoc(
				view.state.selection.main.from,
				view.state.selection.main.to,
			),
		).toBe('x');
	});
});
