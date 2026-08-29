import { StateEffect, StateField, type Extension } from '@codemirror/state';
import {
	Decoration,
	type DecorationSet,
	EditorView,
	type ViewUpdate,
} from '@codemirror/view';
import type { LSPClient } from '@codemirror/lsp-client';

import { genericLSPService } from '../../services/GenericLSPService';

interface DocumentHighlight {
	range: {
		start: { line: number; character: number };
		end: { line: number; character: number };
	};
	kind?: number;
}

interface HighlightDecoration {
	from: number;
	to: number;
	kind: number | undefined;
}

const setDocumentHighlights = StateEffect.define<HighlightDecoration[]>();

function positionToOffset(
	view: EditorView,
	position: { line: number; character: number },
): number | null {
	if (position.line < 0 || position.line >= view.state.doc.lines) return null;
	const line = view.state.doc.line(position.line + 1);
	return Math.min(line.from + Math.max(0, position.character), line.to);
}

function toDecorations(view: EditorView, highlights: DocumentHighlight[]) {
	return highlights
		.map((highlight) => {
			const from = positionToOffset(view, highlight.range.start);
			const to = positionToOffset(view, highlight.range.end);
			return from === null || to === null || to <= from
				? null
				: { from, to, kind: highlight.kind };
		})
		.filter(
			(value): value is HighlightDecoration => value !== null,
		);
}

function buildDecorationSet(highlights: HighlightDecoration[]): DecorationSet {
	return Decoration.set(
		highlights
			.map(({ from, to, kind }) =>
				Decoration.mark({
					class: [
						'cm-lsp-document-highlight',
						kind === 2
							? 'cm-lsp-document-highlight-read'
							: kind === 3
								? 'cm-lsp-document-highlight-write'
								: 'cm-lsp-document-highlight-text',
					].join(' '),
				}).range(from, to),
			)
			.sort((a, b) => a.from - b.from || a.to - b.to),
	);
}

const documentHighlightField = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update(highlights, transaction) {
		highlights = highlights.map(transaction.changes);
		for (const effect of transaction.effects) {
			if (effect.is(setDocumentHighlights)) {
				highlights = buildDecorationSet(effect.value);
			}
		}
		return highlights;
	},
	provide: (field) => EditorView.decorations.from(field),
});

function supportsDocumentHighlight(client: LSPClient): boolean {
	return Boolean((client as any).serverCapabilities?.documentHighlightProvider);
}

export async function requestLSPDocumentHighlights(
	view: EditorView,
	fileName: string,
): Promise<HighlightDecoration[]> {
	const clients = genericLSPService
		.getAllClientsForFile(fileName)
		.filter(supportsDocumentHighlight);
	if (clients.length === 0) return [];

	const pos = view.state.selection.main.head;
	const line = view.state.doc.lineAt(pos);
	const results = await Promise.all(
		clients.map(async (client) => {
			try {
				const response = await (client as any).request(
					'textDocument/documentHighlight',
					{
						textDocument: { uri: `file:///${fileName}` },
						position: {
							line: line.number - 1,
							character: pos - line.from,
						},
					},
				);
				return Array.isArray(response)
					? toDecorations(view, response as DocumentHighlight[])
					: [];
			} catch {
				return [];
			}
		}),
	);

	const seen = new Set<string>();
	return results.flat().filter((highlight) => {
		const key = `${highlight.from}:${highlight.to}:${highlight.kind ?? 1}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

export function createLSPDocumentHighlightExtension(fileName: string): Extension {
	if (!fileName) return [];
	let generation = 0;

	const refresh = async (view: EditorView) => {
		const current = ++generation;
		const highlights = await requestLSPDocumentHighlights(view, fileName);
		if (current !== generation || !view.dom.isConnected) return;
		view.dispatch({ effects: setDocumentHighlights.of(highlights) });
	};

	const listener = EditorView.updateListener.of((update: ViewUpdate) => {
		if (!update.selectionSet && !update.docChanged) return;
		void refresh(update.view);
	});

	return [
		documentHighlightField,
		listener,
		EditorView.baseTheme({
			'.cm-lsp-document-highlight': {
				backgroundColor: 'var(--pico-primary-focus)',
			},
			'.cm-lsp-document-highlight-write': {
				textDecoration: 'underline',
			},
		}),
	];
}
