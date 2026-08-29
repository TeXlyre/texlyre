import {
	getCurrentLSPOutlineSection,
	hasLSPDocumentSymbolProvider,
	requestLSPDocumentSymbols,
} from '@src/extensions/codemirror/DocumentSymbolLSPExtension';
import { genericLSPService } from '@src/services/GenericLSPService';

afterEach(() => {
	jest.restoreAllMocks();
});

describe('LSP document symbols', () => {
	it('preserves DocumentSymbol hierarchy and uses selectionRange for navigation', async () => {
		const request = jest.fn().mockResolvedValue([
			{
				name: 'Outer',
				detail: 'class',
				kind: 5,
				range: {
					start: { line: 1, character: 0 },
					end: { line: 8, character: 1 },
				},
				selectionRange: {
					start: { line: 1, character: 6 },
					end: { line: 1, character: 11 },
				},
				children: [
					{
						name: 'method',
						kind: 6,
						range: {
							start: { line: 3, character: 1 },
							end: { line: 5, character: 2 },
						},
						selectionRange: {
							start: { line: 3, character: 5 },
							end: { line: 3, character: 11 },
						},
					},
				],
			},
		]);
		const client = {
			serverCapabilities: { documentSymbolProvider: true },
			request,
		} as any;
		jest.spyOn(genericLSPService, 'getAllClientsForFile').mockReturnValue([client]);

		const sections = await requestLSPDocumentSymbols('src/test.ts');

		expect(request).toHaveBeenCalledWith('textDocument/documentSymbol', {
			textDocument: { uri: 'file:///src/test.ts' },
		});
		expect(sections).toHaveLength(1);
		expect(sections[0]).toMatchObject({
			title: 'Outer',
			detail: 'class',
			kind: 5,
			line: 2,
			column: 6,
			endLine: 9,
		});
		expect(sections[0].children[0]).toMatchObject({
			title: 'method',
			kind: 6,
			line: 4,
			column: 5,
			endLine: 6,
		});
	});

	it('accepts legacy SymbolInformation responses for the current document', async () => {
		const request = jest.fn().mockResolvedValue([
			{
				name: 'later',
				kind: 12,
				containerName: 'module',
				location: {
					uri: 'file:///src/test.ts',
					range: {
						start: { line: 7, character: 2 },
						end: { line: 7, character: 7 },
					},
				},
			},
			{
				name: 'other',
				kind: 12,
				location: {
					uri: 'file:///src/other.ts',
					range: {
						start: { line: 0, character: 0 },
						end: { line: 0, character: 5 },
					},
				},
			},
			{
				name: 'earlier',
				kind: 12,
				location: {
					uri: 'file:///src/test.ts',
					range: {
						start: { line: 2, character: 1 },
						end: { line: 2, character: 8 },
					},
				},
			},
		]);
		jest.spyOn(genericLSPService, 'getAllClientsForFile').mockReturnValue([
			{ serverCapabilities: { documentSymbolProvider: true }, request } as any,
		]);

		const sections = await requestLSPDocumentSymbols('src/test.ts');

		expect(sections.map((section) => section.title)).toEqual([
			'earlier',
			'later',
		]);
		expect(sections[1].detail).toBe('module');
	});

	it('tries the next capable LSP when an earlier server returns no symbols', async () => {
		const firstRequest = jest.fn().mockResolvedValue([]);
		const secondRequest = jest.fn().mockResolvedValue([
			{
				name: 'fallback',
				kind: 12,
				range: {
					start: { line: 0, character: 0 },
					end: { line: 0, character: 8 },
				},
				selectionRange: {
					start: { line: 0, character: 0 },
					end: { line: 0, character: 8 },
				},
			},
		]);
		jest.spyOn(genericLSPService, 'getAllClientsForFile').mockReturnValue([
			{
				serverCapabilities: { documentSymbolProvider: true },
				request: firstRequest,
			} as any,
			{
				serverCapabilities: { documentSymbolProvider: true },
				request: secondRequest,
			} as any,
		]);

		const sections = await requestLSPDocumentSymbols('src/test.ts');

		expect(firstRequest).toHaveBeenCalledTimes(1);
		expect(secondRequest).toHaveBeenCalledTimes(1);
		expect(sections.map((section) => section.title)).toEqual(['fallback']);
	});

	it('reports capability availability and avoids unsupported requests', async () => {
		const request = jest.fn();
		jest.spyOn(genericLSPService, 'getAllClientsForFile').mockReturnValue([
			{ serverCapabilities: {}, request } as any,
		]);

		expect(hasLSPDocumentSymbolProvider('src/test.ts')).toBe(false);
		await expect(requestLSPDocumentSymbols('src/test.ts')).resolves.toEqual([]);
		expect(request).not.toHaveBeenCalled();
	});

	it('selects the deepest current hierarchical symbol', () => {
		const sections = [
			{
				id: 'outer',
				title: 'Outer',
				kind: 5,
				line: 2,
				column: 0,
				endLine: 10,
				endColumn: 0,
				children: [
					{
						id: 'inner',
						title: 'Inner',
						kind: 6,
						line: 4,
						column: 0,
						endLine: 6,
						endColumn: 0,
						children: [],
					},
				],
			},
		];

		expect(getCurrentLSPOutlineSection(sections, 5)?.id).toBe('inner');
		expect(getCurrentLSPOutlineSection(sections, 8)?.id).toBe('outer');
		expect(getCurrentLSPOutlineSection(sections, 1)).toBeNull();
	});
});
