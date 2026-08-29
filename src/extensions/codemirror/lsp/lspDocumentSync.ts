// src/extensions/codemirror/lsp/lspDocumentSync.ts
import type { EditorState, Extension, Text } from '@codemirror/state';
import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view';
import type { LSPClient } from '@codemirror/lsp-client';

import { genericLSPService } from '../../../services/GenericLSPService';
import { maskAnnotationText } from '../annotations/annotationMasking';
import {
	getClientsForFile,
	getServerCapabilities,
	notify,
	offsetToPosition,
	toFileUri,
} from './lspProtocol';

const FALLBACK_LANGUAGE_IDS: Record<string, string> = {
	tex: 'latex',
	latex: 'latex',
	typ: 'typst',
	bib: 'bibtex',
	md: 'markdown',
};

function detectLanguageId(fileName: string, client: LSPClient): string {
	const extension = fileName.split('.').pop()?.toLowerCase() || '';
	const configId = genericLSPService.getConfigId(client);
	const languageIdMap = configId
		? genericLSPService.getLanguageIdMap(configId)
		: undefined;

	return (
		languageIdMap?.[extension] ??
		FALLBACK_LANGUAGE_IDS[extension] ??
		'plaintext'
	);
}

function getSyncKind(client: LSPClient): number | undefined {
	const sync = getServerCapabilities(client)?.textDocumentSync;
	return typeof sync === 'number' ? sync : sync?.change;
}

function isMaskedInPlace(state: EditorState, masked: string): boolean {
	return masked.length === state.doc.length;
}

function createIncrementalChanges(update: ViewUpdate, maskedText: string) {
	let firstFromA: number | null = null;
	let firstFromB: number | null = null;
	let lastToA = 0;
	let lastToB = 0;

	update.changes.iterChanges((fromA, toA, fromB, toB) => {
		if (firstFromA === null) {
			firstFromA = fromA;
			firstFromB = fromB;
		}
		lastToA = toA;
		lastToB = toB;
	});

	if (firstFromA === null || firstFromB === null) return [];

	const startDoc: Text = update.startState.doc;
	return [
		{
			range: {
				start: offsetToPosition(startDoc, firstFromA),
				end: offsetToPosition(startDoc, lastToA),
			},
			text: maskedText.slice(firstFromB, lastToB),
		},
	];
}

export function createLSPDocumentSyncExtension(fileName: string): Extension {
	if (!fileName) return [];

	const fileUri = toFileUri(fileName);
	let version = 1;

	return ViewPlugin.fromClass(
		class {
			private readonly openedFor = new Set<LSPClient>();
			private readonly handleFileSaved: () => void;

			constructor(private readonly view: EditorView) {
				this.handleFileSaved = () => this.notifySaved();
				this.syncOpenState(view.state);
				document.addEventListener('file-saved', this.handleFileSaved);
			}

			update(update: ViewUpdate) {
				this.syncOpenState(update.state);
				if (!update.docChanged) return;

				version++;
				const text = maskAnnotationText(update.state);
				const incrementalChanges =
					isMaskedInPlace(update.state, text) &&
					isMaskedInPlace(
						update.startState,
						maskAnnotationText(update.startState),
					)
						? createIncrementalChanges(update, text)
						: [];

				this.openedFor.forEach((client) => {
					const syncKind = getSyncKind(client);
					if (syncKind === 0) return;

					notify(client, 'textDocument/didChange', {
						textDocument: { uri: fileUri, version },
						contentChanges:
							syncKind === 2 && incrementalChanges.length > 0
								? incrementalChanges
								: [{ text }],
					});
				});
			}

			destroy() {
				document.removeEventListener('file-saved', this.handleFileSaved);
				this.openedFor.forEach((client) => {
					notify(client, 'textDocument/didClose', {
						textDocument: { uri: fileUri },
					});
				});
				this.openedFor.clear();
			}

			private syncOpenState(state: EditorState) {
				const clients = getClientsForFile(fileName);
				if (clients.every((client) => this.openedFor.has(client))) return;

				const text = maskAnnotationText(state);
				clients.forEach((client) => {
					if (this.openedFor.has(client)) return;
					notify(client, 'textDocument/didOpen', {
						textDocument: {
							uri: fileUri,
							languageId: detectLanguageId(fileName, client),
							version,
							text,
						},
					});
					this.openedFor.add(client);
				});
			}

			private notifySaved() {
				const text = maskAnnotationText(this.view.state);
				this.openedFor.forEach((client) => {
					const save = getServerCapabilities(client)?.textDocumentSync?.save;
					if (!save) return;

					notify(client, 'textDocument/didSave', {
						textDocument: { uri: fileUri },
						...(save.includeText ? { text } : {}),
					});
				});
			}
		},
	);
}
