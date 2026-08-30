// src/extensions/codemirror/lsp/lspDocumentSymbols.ts
import {
	getClientsForFile,
	normalizeUri,
	requestFrom,
	toFileUri,
	type LSPRange,
} from './lspProtocol';

interface DocumentSymbol {
	name: string;
	detail?: string;
	kind: number;
	range: LSPRange;
	selectionRange: LSPRange;
	children?: DocumentSymbol[];
}

interface SymbolInformation {
	name: string;
	kind: number;
	containerName?: string;
	location: { uri: string; range: LSPRange };
}

export interface LSPOutlineSection {
	id: string;
	title: string;
	detail?: string;
	kind: number;
	line: number;
	column: number;
	endLine: number;
	endColumn: number;
	children: LSPOutlineSection[];
}

export function hasLSPDocumentSymbolProvider(fileName: string): boolean {
	return getClientsForFile(fileName, 'documentSymbolProvider').length > 0;
}

function isDocumentSymbol(value: unknown): value is DocumentSymbol {
	const symbol = value as Partial<DocumentSymbol> | null;
	return Boolean(
		symbol &&
			typeof symbol.name === 'string' &&
			typeof symbol.kind === 'number' &&
			symbol.range &&
			symbol.selectionRange,
	);
}

function isSymbolInformation(value: unknown): value is SymbolInformation {
	const symbol = value as Partial<SymbolInformation> | null;
	return Boolean(
		symbol &&
			typeof symbol.name === 'string' &&
			typeof symbol.kind === 'number' &&
			symbol.location?.uri &&
			symbol.location?.range,
	);
}

function toSection(
	id: string,
	title: string,
	detail: string | undefined,
	kind: number,
	start: LSPRange['start'],
	end: LSPRange['end'],
	children: LSPOutlineSection[],
): LSPOutlineSection {
	return {
		id,
		title,
		detail,
		kind,
		line: start.line + 1,
		column: start.character,
		endLine: end.line + 1,
		endColumn: end.character,
		children,
	};
}

function fromDocumentSymbol(
	symbol: DocumentSymbol,
	path: number[],
): LSPOutlineSection {
	const start = symbol.selectionRange.start;
	return toSection(
		`lsp-symbol-${path.join('-')}-${start.line}-${start.character}-${symbol.kind}`,
		symbol.name,
		symbol.detail,
		symbol.kind,
		start,
		symbol.range.end,
		(symbol.children ?? []).map((child, index) =>
			fromDocumentSymbol(child, [...path, index]),
		),
	);
}

function fromSymbolInformation(
	symbol: SymbolInformation,
	index: number,
): LSPOutlineSection {
	const start = symbol.location.range.start;
	return toSection(
		`lsp-symbol-${index}-${start.line}-${start.character}-${symbol.kind}`,
		symbol.name,
		symbol.containerName,
		symbol.kind,
		start,
		symbol.location.range.end,
		[],
	);
}

function normalizeSymbols(
	response: unknown,
	fileName: string,
): LSPOutlineSection[] {
	if (!Array.isArray(response) || response.length === 0) return [];

	if (response.every(isDocumentSymbol)) {
		return response.map((symbol, index) => fromDocumentSymbol(symbol, [index]));
	}

	const currentUri = normalizeUri(toFileUri(fileName));
	return response
		.filter(isSymbolInformation)
		.filter((symbol) => normalizeUri(symbol.location.uri) === currentUri)
		.map(fromSymbolInformation)
		.sort((a, b) => a.line - b.line || a.column - b.column);
}

export async function requestLSPDocumentSymbols(
	fileName: string,
): Promise<LSPOutlineSection[]> {
	for (const client of getClientsForFile(fileName, 'documentSymbolProvider')) {
		const response = await requestFrom<unknown>(
			client,
			'textDocument/documentSymbol',
			{ textDocument: { uri: toFileUri(fileName) } },
		);
		const sections = normalizeSymbols(response, fileName);
		if (sections.length > 0) return sections;
	}

	return [];
}

export function getCurrentLSPOutlineSection(
	sections: LSPOutlineSection[],
	currentLine: number,
): LSPOutlineSection | null {
	let preceding: LSPOutlineSection | null = null;

	for (const section of sections) {
		if (section.line > currentLine) break;
		preceding = section;
		if (currentLine > section.endLine) continue;

		const child = getCurrentLSPOutlineSection(section.children, currentLine);
		return child && currentLine <= child.endLine ? child : section;
	}

	return preceding;
}
