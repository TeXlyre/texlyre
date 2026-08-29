import type { LSPClient } from '@codemirror/lsp-client';

import { genericLSPService } from '../../services/GenericLSPService';

interface LSPPosition {
	line: number;
	character: number;
}

interface LSPRange {
	start: LSPPosition;
	end: LSPPosition;
}

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
	location: {
		uri: string;
		range: LSPRange;
	};
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

function supportsDocumentSymbols(client: LSPClient): boolean {
	return Boolean((client as any).serverCapabilities?.documentSymbolProvider);
}

export function hasLSPDocumentSymbolProvider(fileName: string): boolean {
	if (!fileName) return false;
	return genericLSPService
		.getAllClientsForFile(fileName)
		.some(supportsDocumentSymbols);
}

function normalizeFileUri(uri: string): string {
	try {
		return decodeURIComponent(uri)
			.replace(/^file:\/{2,3}/, '')
			.replace(/^\/+/, '');
	} catch {
		return uri.replace(/^file:\/{2,3}/, '').replace(/^\/+/, '');
	}
}

function isDocumentSymbol(value: unknown): value is DocumentSymbol {
	if (!value || typeof value !== 'object') return false;
	const symbol = value as Partial<DocumentSymbol>;
	return Boolean(
		typeof symbol.name === 'string' &&
			typeof symbol.kind === 'number' &&
			symbol.range &&
			symbol.selectionRange,
	);
}

function isSymbolInformation(value: unknown): value is SymbolInformation {
	if (!value || typeof value !== 'object') return false;
	const symbol = value as Partial<SymbolInformation>;
	return Boolean(
		typeof symbol.name === 'string' &&
			typeof symbol.kind === 'number' &&
			symbol.location?.uri &&
			symbol.location?.range,
	);
}

function documentSymbolToSection(
	symbol: DocumentSymbol,
	path: number[],
): LSPOutlineSection {
	const start = symbol.selectionRange.start;
	const end = symbol.range.end;
	return {
		id: `lsp-symbol-${path.join('-')}-${start.line}-${start.character}-${symbol.kind}`,
		title: symbol.name,
		detail: symbol.detail,
		kind: symbol.kind,
		line: start.line + 1,
		column: start.character,
		endLine: end.line + 1,
		endColumn: end.character,
		children: (symbol.children ?? []).map((child, index) =>
			documentSymbolToSection(child, [...path, index]),
		),
	};
}

function symbolInformationToSection(
	symbol: SymbolInformation,
	index: number,
): LSPOutlineSection {
	const start = symbol.location.range.start;
	const end = symbol.location.range.end;
	return {
		id: `lsp-symbol-${index}-${start.line}-${start.character}-${symbol.kind}`,
		title: symbol.name,
		detail: symbol.containerName,
		kind: symbol.kind,
		line: start.line + 1,
		column: start.character,
		endLine: end.line + 1,
		endColumn: end.character,
		children: [],
	};
}

function normalizeSymbols(
	response: unknown,
	fileName: string,
): LSPOutlineSection[] {
	if (!Array.isArray(response) || response.length === 0) return [];

	if (response.every(isDocumentSymbol)) {
		return response.map((symbol, index) =>
			documentSymbolToSection(symbol, [index]),
		);
	}

	const currentUri = normalizeFileUri(`file:///${fileName}`);
	return response
		.filter(isSymbolInformation)
		.filter(
			(symbol) => normalizeFileUri(symbol.location.uri) === currentUri,
		)
		.map(symbolInformationToSection)
		.sort((a, b) => a.line - b.line || a.column - b.column);
}

export async function requestLSPDocumentSymbols(
	fileName: string,
): Promise<LSPOutlineSection[]> {
	if (!fileName) return [];
	const clients = genericLSPService
		.getAllClientsForFile(fileName)
		.filter(supportsDocumentSymbols);

	for (const client of clients) {
		try {
			const response = await (client as any).request(
				'textDocument/documentSymbol',
				{ textDocument: { uri: `file:///${fileName}` } },
			);
			if (Array.isArray(response)) return normalizeSymbols(response, fileName);
		} catch {}
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
		if (currentLine <= section.endLine && section.children.length > 0) {
			const child = getCurrentLSPOutlineSection(section.children, currentLine);
			if (child && currentLine <= child.endLine) return child;
		}
		if (currentLine <= section.endLine) return section;
	}

	return preceding;
}
