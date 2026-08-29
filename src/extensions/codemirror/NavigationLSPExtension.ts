import { EditorView } from '@codemirror/view';
import type { LSPClient } from '@codemirror/lsp-client';

import { genericLSPService } from '../../services/GenericLSPService';
import { linkNavigationService } from '../../services/LinkNavigationService';

interface LSPPosition {
	line: number;
	character: number;
}

interface LSPRange {
	start: LSPPosition;
	end: LSPPosition;
}

interface Location {
	uri: string;
	range: LSPRange;
}

interface LocationLink {
	targetUri: string;
	targetRange: LSPRange;
	targetSelectionRange?: LSPRange;
}

export type LSPNavigationKind =
	| 'declaration'
	| 'definition'
	| 'typeDefinition'
	| 'implementation';

const navigationKinds: readonly LSPNavigationKind[] = [
	'definition',
	'declaration',
	'typeDefinition',
	'implementation',
];

const providerKeys: Record<LSPNavigationKind, string> = {
	declaration: 'declarationProvider',
	definition: 'definitionProvider',
	typeDefinition: 'typeDefinitionProvider',
	implementation: 'implementationProvider',
};

function offsetToPosition(view: EditorView, offset: number): LSPPosition {
	const line = view.state.doc.lineAt(offset);
	return { line: line.number - 1, character: offset - line.from };
}

function positionToOffset(view: EditorView, position: LSPPosition): number | null {
	if (position.line < 0 || position.line >= view.state.doc.lines) return null;
	const line = view.state.doc.line(position.line + 1);
	return Math.min(line.from + Math.max(0, position.character), line.to);
}

function normalizeLocation(value: Location | LocationLink): Location {
	if ('targetUri' in value) {
		return {
			uri: value.targetUri,
			range: value.targetSelectionRange ?? value.targetRange,
		};
	}
	return value;
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

function supportsNavigation(client: LSPClient, kind: LSPNavigationKind): boolean {
	return Boolean((client as any).serverCapabilities?.[providerKeys[kind]]);
}

export function getSupportedLSPNavigationKinds(
	fileName: string,
): LSPNavigationKind[] {
	if (!fileName) return [];
	const clients = genericLSPService.getAllClientsForFile(fileName);
	return navigationKinds.filter((kind) =>
		clients.some((client) => supportsNavigation(client, kind)),
	);
}

export async function goToLSPLocation(
	view: EditorView,
	fileName: string,
	kind: LSPNavigationKind,
): Promise<boolean> {
	const clients = genericLSPService
		.getAllClientsForFile(fileName)
		.filter((client) => supportsNavigation(client, kind));
	if (clients.length === 0) return false;

	const head = view.state.selection.main.head;
	const position = offsetToPosition(view, head);
	const currentUri = `file:///${fileName}`;

	for (const client of clients) {
		try {
			const response = await (client as any).request(`textDocument/${kind}`, {
				textDocument: { uri: currentUri },
				position,
			});
			const first = Array.isArray(response) ? response[0] : response;
			if (!first) continue;

			const location = normalizeLocation(first);
			if (normalizeFileUri(location.uri) === normalizeFileUri(currentUri)) {
				const target = positionToOffset(view, location.range.start);
				if (target === null) continue;
				view.dispatch({
					selection: { anchor: target },
					effects: EditorView.scrollIntoView(target, { y: 'center' }),
					userEvent: `select.${kind}`,
				});
				view.focus();
				return true;
			}

			linkNavigationService.navigateToFileAndLine(
				normalizeFileUri(location.uri),
				location.range.start.line + 1,
			);
			return true;
		} catch {}
	}

	return false;
}

export function goToLSPDeclaration(
	view: EditorView,
	fileName: string,
): Promise<boolean> {
	return goToLSPLocation(view, fileName, 'declaration');
}

export function goToLSPDefinition(
	view: EditorView,
	fileName: string,
): Promise<boolean> {
	return goToLSPLocation(view, fileName, 'definition');
}

export function goToLSPTypeDefinition(
	view: EditorView,
	fileName: string,
): Promise<boolean> {
	return goToLSPLocation(view, fileName, 'typeDefinition');
}

export function goToLSPImplementation(
	view: EditorView,
	fileName: string,
): Promise<boolean> {
	return goToLSPLocation(view, fileName, 'implementation');
}
