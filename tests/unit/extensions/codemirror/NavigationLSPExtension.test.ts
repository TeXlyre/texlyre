import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import {
	getSupportedLSPNavigationKinds,
	goToLSPDefinition,
	goToLSPLocation,
	type LSPNavigationKind,
} from '@src/extensions/codemirror/NavigationLSPExtension';
import { genericLSPService } from '@src/services/GenericLSPService';
import { linkNavigationService } from '@src/services/LinkNavigationService';

let views: EditorView[] = [];

afterEach(() => {
	for (const view of views) view.destroy();
	views = [];
	jest.restoreAllMocks();
});

function createView(doc = 'first\nsecond\nthird') {
	const view = new EditorView({
		state: EditorState.create({ doc }),
		parent: document.body,
	});
	views.push(view);
	return view;
}

function createClient(
	result: unknown,
	provider: string = 'definitionProvider',
) {
	return {
		serverCapabilities: { [provider]: true },
		request: jest.fn().mockResolvedValue(result),
	} as any;
}

describe('LSP location navigation', () => {
	it('reports only navigation capabilities provided by connected servers', () => {
		jest.spyOn(genericLSPService, 'getAllClientsForFile').mockReturnValue([
			{
				serverCapabilities: {
					definitionProvider: true,
					implementationProvider: true,
				},
			} as any,
			{
				serverCapabilities: { declarationProvider: true },
			} as any,
		]);

		expect(getSupportedLSPNavigationKinds('test.tex')).toEqual([
			'definition',
			'declaration',
			'implementation',
		]);
	});

	it('moves the cursor for a definition in the current file', async () => {
		const client = createClient({
			uri: 'file:///test.tex',
			range: {
				start: { line: 1, character: 2 },
				end: { line: 1, character: 5 },
			},
		});
		jest.spyOn(genericLSPService, 'getAllClientsForFile').mockReturnValue([client]);
		const view = createView();

		const handled = await goToLSPDefinition(view, 'test.tex');

		expect(handled).toBe(true);
		expect(view.state.selection.main.head).toBe(8);
		expect(client.request).toHaveBeenCalledWith('textDocument/definition', {
			textDocument: { uri: 'file:///test.tex' },
			position: { line: 0, character: 0 },
		});
	});

	it.each<[
		LSPNavigationKind,
		string,
	]>([
		['declaration', 'declarationProvider'],
		['typeDefinition', 'typeDefinitionProvider'],
		['implementation', 'implementationProvider'],
	])('requests textDocument/%s when the server provides it', async (kind, provider) => {
		const client = createClient(
			{
				uri: 'file:///test.tex',
				range: {
					start: { line: 1, character: 0 },
					end: { line: 1, character: 1 },
				},
			},
			provider,
		);
		jest.spyOn(genericLSPService, 'getAllClientsForFile').mockReturnValue([client]);
		const view = createView();

		const handled = await goToLSPLocation(view, 'test.tex', kind);

		expect(handled).toBe(true);
		expect(client.request).toHaveBeenCalledWith(`textDocument/${kind}`, {
			textDocument: { uri: 'file:///test.tex' },
			position: { line: 0, character: 0 },
		});
	});

	it('uses targetSelectionRange from LocationLink responses', async () => {
		const client = createClient({
			targetUri: 'file:///test.tex',
			targetRange: {
				start: { line: 0, character: 0 },
				end: { line: 2, character: 5 },
			},
			targetSelectionRange: {
				start: { line: 2, character: 1 },
				end: { line: 2, character: 3 },
			},
		});
		jest.spyOn(genericLSPService, 'getAllClientsForFile').mockReturnValue([client]);
		const view = createView();

		await goToLSPDefinition(view, 'test.tex');

		expect(view.state.selection.main.head).toBe(14);
	});

	it('opens a cross-file definition at the reported line', async () => {
		const client = createClient([
			{
				uri: 'file:///chapters/intro.tex',
				range: {
					start: { line: 6, character: 3 },
					end: { line: 6, character: 8 },
				},
			},
		]);
		jest.spyOn(genericLSPService, 'getAllClientsForFile').mockReturnValue([client]);
		const navigate = jest
			.spyOn(linkNavigationService, 'navigateToFileAndLine')
			.mockImplementation(() => {});
		const view = createView();

		const handled = await goToLSPDefinition(view, 'main.tex');

		expect(handled).toBe(true);
		expect(navigate).toHaveBeenCalledWith('chapters/intro.tex', 7);
	});

	it('returns false when the requested provider is unavailable', async () => {
		jest.spyOn(genericLSPService, 'getAllClientsForFile').mockReturnValue([
			{ serverCapabilities: {}, request: jest.fn() } as any,
		]);
		const view = createView();

		await expect(goToLSPDefinition(view, 'test.tex')).resolves.toBe(false);
	});
});
