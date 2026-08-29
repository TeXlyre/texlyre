// src/extensions/codemirror/lsp/lspNavigation.ts
import { EditorView } from '@codemirror/view';

import { linkNavigationService } from '../../../services/LinkNavigationService';
import {
	getClientsForFile,
	isSameDocument,
	normalizeUri,
	offsetToPosition,
	positionToOffset,
	requestFrom,
	toFileUri,
	type LSPRange,
} from './lspProtocol';

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
	| 'definition'
	| 'declaration'
	| 'typeDefinition'
	| 'implementation';

const NAVIGATION_PROVIDERS: Record<LSPNavigationKind, string> = {
	definition: 'definitionProvider',
	declaration: 'declarationProvider',
	typeDefinition: 'typeDefinitionProvider',
	implementation: 'implementationProvider',
};

const NAVIGATION_KINDS = Object.keys(
	NAVIGATION_PROVIDERS,
) as LSPNavigationKind[];

function toLocation(value: Location | LocationLink): Location {
	return 'targetUri' in value
		? {
				uri: value.targetUri,
				range: value.targetSelectionRange ?? value.targetRange,
			}
		: value;
}

export function getSupportedLSPNavigationKinds(
	fileName: string,
): LSPNavigationKind[] {
	return NAVIGATION_KINDS.filter(
		(kind) =>
			getClientsForFile(fileName, NAVIGATION_PROVIDERS[kind]).length > 0,
	);
}

export async function resolveLSPNavigationTarget(
	view: EditorView,
	fileName: string,
	kind: LSPNavigationKind,
): Promise<Location | null> {
	const clients = getClientsForFile(fileName, NAVIGATION_PROVIDERS[kind]);
	if (clients.length === 0) return null;

	const position = offsetToPosition(
		view.state.doc,
		view.state.selection.main.head,
	);

	for (const client of clients) {
		const response = await requestFrom<Location | LocationLink | unknown[]>(
			client,
			`textDocument/${kind}`,
			{ textDocument: { uri: toFileUri(fileName) }, position },
		);
		const first = Array.isArray(response) ? response[0] : response;
		if (first) return toLocation(first as Location | LocationLink);
	}

	return null;
}

export async function goToLSPLocation(
	view: EditorView,
	fileName: string,
	kind: LSPNavigationKind,
): Promise<boolean> {
	const location = await resolveLSPNavigationTarget(view, fileName, kind);
	if (!location) return false;

	if (isSameDocument(location.uri, fileName)) {
		const target = positionToOffset(view.state.doc, location.range.start);
		if (target === null) return false;

		view.dispatch({
			selection: { anchor: target },
			effects: EditorView.scrollIntoView(target, { y: 'center' }),
			userEvent: `select.${kind}`,
		});
		view.focus();
		return true;
	}

	linkNavigationService.navigateToFileAndLine(
		normalizeUri(location.uri),
		location.range.start.line + 1,
	);
	return true;
}
