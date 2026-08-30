// src/extensions/codemirror/lsp/lspDocumentHighlight.ts
import { StateEffect, StateField, type Extension } from '@codemirror/state';
import {
	Decoration,
	EditorView,
	type DecorationSet,
	type ViewUpdate,
} from '@codemirror/view';

import {
	createDebouncer,
	createRequestGate,
	getClientsForFile,
	offsetToPosition,
	positionToOffset,
	requestFrom,
	toFileUri,
	type LSPRange,
} from './lspProtocol';

const REQUEST_DELAY = 250;

const HIGHLIGHT_CLASSES: Record<number, string> = {
	1: 'cm-lsp-document-highlight-text',
	2: 'cm-lsp-document-highlight-read',
	3: 'cm-lsp-document-highlight-write',
};

interface DocumentHighlight {
	range: LSPRange;
	kind?: number;
}

export interface HighlightRange {
	from: number;
	to: number;
	kind: number | undefined;
}

const setDocumentHighlights = StateEffect.define<HighlightRange[]>();

function buildDecorations(highlights: HighlightRange[]): DecorationSet {
	return Decoration.set(
		highlights
			.map(({ from, to, kind }) =>
				Decoration.mark({
					class: `cm-lsp-document-highlight ${
						HIGHLIGHT_CLASSES[kind ?? 1] ?? HIGHLIGHT_CLASSES[1]
					}`,
				}).range(from, to),
			)
			.sort((a, b) => a.from - b.from || a.to - b.to),
	);
}

const documentHighlightField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(highlights, transaction) {
		for (const effect of transaction.effects) {
			if (effect.is(setDocumentHighlights)) {
				return buildDecorations(effect.value);
			}
		}
		return highlights.map(transaction.changes);
	},
	provide: (field) => EditorView.decorations.from(field),
});

export async function requestLSPDocumentHighlights(
	view: EditorView,
	fileName: string,
): Promise<HighlightRange[]> {
	const clients = getClientsForFile(fileName, 'documentHighlightProvider');
	if (clients.length === 0) return [];

	const doc = view.state.doc;
	const position = offsetToPosition(doc, view.state.selection.main.head);
	const responses = await Promise.all(
		clients.map((client) =>
			requestFrom<DocumentHighlight[]>(
				client,
				'textDocument/documentHighlight',
				{ textDocument: { uri: toFileUri(fileName) }, position },
			),
		),
	);

	const seen = new Set<string>();
	return responses
		.flatMap((response) => (Array.isArray(response) ? response : []))
		.map((highlight) => {
			const from = positionToOffset(doc, highlight.range?.start);
			const to = positionToOffset(doc, highlight.range?.end);
			return from === null || to === null || to <= from
				? null
				: { from, to, kind: highlight.kind };
		})
		.filter((highlight): highlight is HighlightRange => {
			if (!highlight) return false;
			const key = `${highlight.from}:${highlight.to}:${highlight.kind ?? 1}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
}

export function createLSPDocumentHighlightExtension(
	fileName: string,
): Extension {
	if (!fileName) return [];

	const gate = createRequestGate();
	const debouncer = createDebouncer(REQUEST_DELAY);

	const refresh = async (view: EditorView) => {
		const token = gate.start();
		const highlights = await requestLSPDocumentHighlights(view, fileName);
		if (!gate.isCurrent(token) || !view.dom.isConnected) return;
		if (
			highlights.length === 0 &&
			view.state.field(documentHighlightField).size === 0
		) {
			return;
		}
		view.dispatch({ effects: setDocumentHighlights.of(highlights) });
	};

	const listener = EditorView.updateListener.of((update: ViewUpdate) => {
		if (!update.selectionSet && !update.docChanged) return;
		debouncer.schedule(() => void refresh(update.view));
	});

	return [documentHighlightField, listener];
}
