import type { Extension } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
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

function supportsDefinition(client: LSPClient): boolean {
	return Boolean((client as any).serverCapabilities?.definitionProvider);
}

export async function goToLSPDefinition(
	view: EditorView,
	fileName: string,
): Promise<boolean> {
	const clients = genericLSPService
		.getAllClientsForFile(fileName)
		.filter(supportsDefinition);
	if (clients.length === 0) return false;

	const head = view.state.selection.main.head;
	const position = offsetToPosition(view, head);
	const currentUri = `file:///${fileName}`;

	for (const client of clients) {
		try {
			const response = await (client as any).request('textDocument/definition', {
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
					userEvent: 'select.definition',
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

export function createLSPNavigationExtension(fileName: string): Extension {
	return keymap.of([
		{
			key: 'F12',
			preventDefault: true,
			run: (view) => {
				const supported = genericLSPService
					.getAllClientsForFile(fileName)
					.some(supportsDefinition);
				if (!supported) return false;
				void goToLSPDefinition(view, fileName);
				return true;
			},
		},
	]);
}
