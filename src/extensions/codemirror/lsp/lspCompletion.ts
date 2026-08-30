// src/extensions/codemirror/lsp/lspCompletion.ts
import {
	snippet,
	type Completion,
	type CompletionContext,
	type CompletionResult,
	type CompletionSource,
} from '@codemirror/autocomplete';
import type { Text } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';
import type { LSPClient } from '@codemirror/lsp-client';

import { createLSPCompletionInfo } from './lspHover';
import {
	getClientsForFile,
	getServerCapabilities,
	offsetToPosition,
	rangeToOffsets,
	requestFrom,
	textEditsToChanges,
	toFileUri,
	type DocumentOffsets,
	type LSPRange,
} from './lspProtocol';

const TRIGGER_INVOKED = 1;
const TRIGGER_CHARACTER = 2;
const TRIGGER_INCOMPLETE = 3;
const FORMAT_SNIPPET = 2;

function resolveTargetRange(
	doc: Text,
	range: LSPRange | undefined,
	fallback: DocumentOffsets,
): DocumentOffsets | null {
	return range ? rangeToOffsets(doc, range) : fallback;
}

function applyTextEdit(
	view: EditorView,
	insert: string,
	range: LSPRange | undefined,
	additionalTextEdits: unknown,
	from: number,
	to: number,
) {
	const doc = view.state.doc;
	const target = resolveTargetRange(doc, range, { from, to });
	if (!target) return;

	const changes = [
		...textEditsToChanges(doc, additionalTextEdits),
		{ ...target, insert },
	].sort((a, b) => a.from - b.from || a.to - b.to);

	try {
		const changeSet = view.state.changes(changes);
		view.dispatch({
			changes: changeSet,
			selection: { anchor: changeSet.mapPos(target.to, 1) },
		});
	} catch {
		view.dispatch({
			changes: { ...target, insert },
			selection: { anchor: target.from + insert.length },
		});
	}
}

function applySnippetEdit(
	view: EditorView,
	completion: Completion,
	template: string,
	range: LSPRange | undefined,
	additionalTextEdits: unknown,
	from: number,
	to: number,
) {
	const doc = view.state.doc;
	const target = resolveTargetRange(doc, range, { from, to });
	if (!target) return;

	let start = target.from;
	let end = target.to;
	const extra = textEditsToChanges(doc, additionalTextEdits);

	if (extra.length > 0) {
		try {
			const changeSet = view.state.changes(extra);
			start = changeSet.mapPos(start, 1);
			end = changeSet.mapPos(end, -1);
			view.dispatch({ changes: changeSet });
		} catch {}
	}

	snippet(template.replace(/\$(\d+)/g, '${$1}'))(view, completion, start, end);
}

function toCompletionContext(
	context: CompletionContext,
	client: LSPClient,
	previousCharacter: string,
	incomplete: boolean,
) {
	if (context.explicit) return { triggerKind: TRIGGER_INVOKED };

	const triggerCharacters =
		getServerCapabilities(client)?.completionProvider?.triggerCharacters;
	if (
		Array.isArray(triggerCharacters) &&
		triggerCharacters.includes(previousCharacter)
	) {
		return {
			triggerKind: TRIGGER_CHARACTER,
			triggerCharacter: previousCharacter,
		};
	}

	return { triggerKind: incomplete ? TRIGGER_INCOMPLETE : TRIGGER_INVOKED };
}

function toCompletion(client: LSPClient, item: any): Completion {
	const textEdit = item.textEdit;
	const range: LSPRange | undefined =
		textEdit?.range ?? textEdit?.replace ?? textEdit?.insert;
	const insert: string =
		textEdit?.newText ?? item.insertText ?? item.label ?? '';
	const additionalTextEdits = item.additionalTextEdits;
	const hasEdits =
		Boolean(range) ||
		(Array.isArray(additionalTextEdits) && additionalTextEdits.length > 0);

	const apply =
		item.insertTextFormat === FORMAT_SNIPPET
			? (view: EditorView, completion: Completion, from: number, to: number) =>
					applySnippetEdit(
						view,
						completion,
						insert,
						range,
						additionalTextEdits,
						from,
						to,
					)
			: hasEdits
				? (
						view: EditorView,
						_completion: Completion,
						from: number,
						to: number,
					) => applyTextEdit(view, insert, range, additionalTextEdits, from, to)
				: insert;

	return {
		label: item.label,
		type: item.kind === 1 ? 'text' : 'keyword',
		detail: item.detail,
		info: createLSPCompletionInfo(client, item),
		apply,
	};
}

export function createLSPCompletionSource(fileName: string): CompletionSource {
	const fileUri = toFileUri(fileName);
	const incompleteByClient = new WeakMap<LSPClient, boolean>();

	return async (
		context: CompletionContext,
	): Promise<CompletionResult | null> => {
		const doc = context.state.doc;
		const previousCharacter =
			context.pos > 0 ? doc.sliceString(context.pos - 1, context.pos) : '';

		for (const client of getClientsForFile(fileName)) {
			const capabilities = getServerCapabilities(client);
			if (capabilities && capabilities.completionProvider === undefined) {
				continue;
			}

			const result = await requestFrom<any>(client, 'textDocument/completion', {
				textDocument: { uri: fileUri },
				position: offsetToPosition(doc, context.pos),
				context: toCompletionContext(
					context,
					client,
					previousCharacter,
					incompleteByClient.get(client) === true,
				),
			});

			incompleteByClient.set(
				client,
				!Array.isArray(result) && result?.isIncomplete === true,
			);

			const items = Array.isArray(result) ? result : result?.items;
			if (!Array.isArray(items) || items.length === 0) continue;

			return {
				from: context.pos,
				options: items.map((item) => toCompletion(client, item)),
			};
		}

		return null;
	};
}
