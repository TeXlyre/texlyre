// src/extensions/codemirror/lsp/lspDocumentSync.ts
import type { EditorState, Extension, Text } from '@codemirror/state';
import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view';
import type { LSPClient } from '@codemirror/lsp-client';

import { genericLSPService } from '../../../services/GenericLSPService';
import {
	getAnnotationMaskRanges,
	maskAnnotationTags,
	maskAnnotationText,
} from '../annotations/annotationMasking';
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

function createIncrementalChanges(update: ViewUpdate) {
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

	const changedFromB = firstFromB;
	const startDoc: Text = update.startState.doc;
	const masks = getAnnotationMaskRanges(update.state)
		.filter((range) => range.from < lastToB && range.to > changedFromB)
		.map((range) => ({
			from: Math.max(0, range.from - changedFromB),
			to: Math.min(lastToB - changedFromB, range.to - changedFromB),
		}));
	return [
		{
			range: {
				start: offsetToPosition(startDoc, firstFromA),
				end: offsetToPosition(startDoc, lastToA),
			},
			text: maskAnnotationTags(
				update.state.doc.sliceString(firstFromB, lastToB),
				masks,
			),
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
				if (!update.docChanged || this.openedFor.size === 0) return;

				version++;
				let incrementalChanges: ReturnType<
					typeof createIncrementalChanges
				> | null = null;
				let fullText: string | null = null;
				this.openedFor.forEach((client) => {
					const syncKind = getSyncKind(client);
					if (syncKind === 0) return;
					if (syncKind === 2) {
						incrementalChanges ??= createIncrementalChanges(update);
					} else {
						fullText ??= maskAnnotationText(update.state);
					}

					notify(client, 'textDocument/didChange', {
						textDocument: { uri: fileUri, version },
						contentChanges:
							syncKind === 2 && incrementalChanges?.length
								? incrementalChanges
								: [{ text: (fullText ??= maskAnnotationText(update.state)) }],
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
