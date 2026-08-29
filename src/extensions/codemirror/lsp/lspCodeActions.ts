// src/extensions/codemirror/lsp/lspCodeActions.ts
import { type Extension, StateField, StateEffect } from '@codemirror/state';
import {
	type EditorView,
	ViewPlugin,
	showTooltip,
	type Tooltip,
	type ViewUpdate,
} from '@codemirror/view';
import {
	diagnosticCount,
	forEachDiagnostic as cmForEachDiagnostic,
} from '@codemirror/lint';
import type { LSPClient } from '@codemirror/lsp-client';

import { genericLSPService } from '../../../services/GenericLSPService';
import { toLSPSeverity, type LSPDiagnostic } from './lspDiagnostics';
import {
	createDebouncer,
	getClientLabel,
	getClientsForFile,
	getServerCapabilities,
	offsetToPosition,
	requestFrom,
	textEditsToChanges,
	toFileUri,
	type LSPRange,
} from './lspProtocol';

const REQUEST_DELAY = 300;

interface WorkspaceEdit {
	changes?: Record<string, TextEdit[]>;
	documentChanges?: any[];
}

interface CodeAction {
	title: string;
	kind?: string;
	edit?: WorkspaceEdit;
	command?: LspCommand;
}

interface LspCommand {
	title: string;
	command: string;
	arguments?: any[];
}

type CodeActionOrCommand = CodeAction | LspCommand;

interface TextEdit {
	range: LSPRange;
	newText: string;
}

interface LspDiagnostic {
	range: LSPRange;
	message: string;
	severity?: number;
	source?: string;
	code?: string | number;
	data?: unknown;
}

interface ResolvedAction {
	title: string;
	edit?: WorkspaceEdit;
	command?: LspCommand;
	client?: LSPClient;
}

function isBareCommand(item: CodeActionOrCommand): item is LspCommand {
	return 'command' in item && typeof item.command === 'string';
}

function resolveAction(
	item: CodeActionOrCommand,
	client?: LSPClient,
): ResolvedAction {
	if (isBareCommand(item)) {
		return { title: item.title, command: item, client };
	}
	return { title: item.title, edit: item.edit, command: item.command, client };
}

function getDiagnosticsAtPosition(state: any, pos: number): LspDiagnostic[] {
	const results: LspDiagnostic[] = [];
	if (diagnosticCount(state) === 0) return results;

	const doc = state.doc;
	cmForEachDiagnostic(state, (d, from, to) => {
		if (pos >= from && pos <= to) {
			const lsp = d as LSPDiagnostic;
			results.push({
				range: {
					start: offsetToPosition(doc, from),
					end: offsetToPosition(doc, to),
				},
				message: d.message,
				severity: d.severity === 'error' ? 1 : d.severity === 'warning' ? 2 : 3,
				source: d.source,
				...(lsp.code !== undefined ? { code: lsp.code } : {}),
				...(lsp.data !== undefined ? { data: lsp.data } : {}),
			});
		}
	});

	return results;
}

function applyTextEdits(edits: TextEdit[], view: EditorView) {
	const changes = textEditsToChanges(view.state.doc, edits).sort(
		(a, b) => b.from - a.from,
	);

	if (changes.length > 0) {
		view.dispatch({ changes });
	}
}

function applyWorkspaceEdit(
	edit: WorkspaceEdit,
	view: EditorView,
	fileUri: string,
) {
	if (edit.changes) {
		const edits = edit.changes[fileUri];
		if (edits && edits.length > 0) {
			applyTextEdits(edits, view);
		}
	}

	if (edit.documentChanges) {
		for (const docChange of edit.documentChanges) {
			if (docChange.textDocument?.uri === fileUri && docChange.edits) {
				applyTextEdits(docChange.edits, view);
				return;
			}
		}
	}
}

function executeCommand(
	command: LspCommand,
	view: EditorView,
	fileUri: string,
	clients: LSPClient[],
) {
	clients.forEach((client) => {
		try {
			(client as any)
				.request('workspace/executeCommand', {
					command: command.command,
					arguments: command.arguments,
				})
				.then((result: any) => {
					if (result?.changes || result?.documentChanges) {
						applyWorkspaceEdit(result, view, fileUri);
					}
				})
				.catch(() => {});
		} catch {}
	});
}

function applyAction(
	action: ResolvedAction,
	view: EditorView,
	fileUri: string,
	clients: LSPClient[],
) {
	if (action.edit) {
		applyWorkspaceEdit(action.edit, view, fileUri);
	}
	if (action.command) {
		executeCommand(action.command, view, fileUri, clients);
	}
}

const setCodeActions = StateEffect.define<{
	pos: number;
	actions: ResolvedAction[];
	fileUri: string;
	clients: LSPClient[];
} | null>();

interface CodeActionState {
	pos: number;
	actions: ResolvedAction[];
	fileUri: string;
	clients: LSPClient[];
}

const codeActionField = StateField.define<CodeActionState | null>({
	create() {
		return null;
	},
	update(value, tr) {
		for (const effect of tr.effects) {
			if (effect.is(setCodeActions)) {
				return effect.value;
			}
		}
		if (tr.docChanged) {
			return null;
		}
		return value;
	},
	provide(field) {
		return showTooltip.compute([field], (state) => {
			const value = state.field(field);
			if (!value || value.actions.length === 0) return null;

			return {
				pos: value.pos,
				above: false,
				create(view: EditorView) {
					const dom = document.createElement('div');
					dom.className = 'cm-code-actions-tooltip';

					const grouped = new Map<LSPClient, ResolvedAction[]>();
					value.actions.forEach((action) => {
						const key = action.client ?? (value.clients[0] as LSPClient);
						const list = grouped.get(key) ?? [];
						list.push(action);
						grouped.set(key, list);
					});

					let first = true;
					grouped.forEach((actions, client) => {
						if (!first) {
							dom.appendChild(document.createElement('hr'));
						}
						first = false;

						const header = document.createElement('div');
						header.className = 'cm-code-actions-source';
						header.textContent = getClientLabel(client);
						dom.appendChild(header);

						const buttonRow = document.createElement('div');
						buttonRow.className = 'cm-code-actions-row';

						actions.forEach((action) => {
							const button = document.createElement('button');
							button.className = 'cm-code-action-button';
							button.textContent = action.title;
							button.addEventListener('mousedown', (e) => {
								e.preventDefault();
								e.stopPropagation();
								applyAction(action, view, value.fileUri, value.clients);
								view.dispatch({ effects: setCodeActions.of(null) });
							});
							buttonRow.appendChild(button);
						});

						dom.appendChild(buttonRow);
					});

					return { dom };
				},
			} satisfies Tooltip;
		});
	},
});

export function createLSPCodeActionsExtension(fileName: string): Extension {
	if (!fileName) return [];

	const fileUri = toFileUri(fileName);

	const applyEditPlugin = ViewPlugin.fromClass(
		class {
			private readonly unsubscribe: () => void;

			constructor(private readonly view: EditorView) {
				this.unsubscribe = genericLSPService.onApplyEdit((_configId, edit) => {
					if (edit) applyWorkspaceEdit(edit, this.view, fileUri);
				});
			}

			destroy() {
				this.unsubscribe();
			}
		},
	);

	const requestPlugin = ViewPlugin.fromClass(
		class {
			private readonly debouncer = createDebouncer(REQUEST_DELAY);
			private pendingRequest = 0;

			update(update: ViewUpdate) {
				if (update.docChanged) {
					this.debouncer.cancel();
					queueMicrotask(() => {
						update.view.dispatch({ effects: setCodeActions.of(null) });
					});
					return;
				}

				if (update.selectionSet) {
					this.debouncer.schedule(() => void this.fetch(update.view));
				}
			}

			destroy() {
				this.debouncer.cancel();
			}

			private async fetch(view: EditorView) {
				const clients = getClientsForFile(fileName);
				const diagnostics =
					clients.length > 0
						? getDiagnosticsAtPosition(
								view.state,
								view.state.selection.main.head,
							)
						: [];

				if (diagnostics.length === 0) {
					view.dispatch({ effects: setCodeActions.of(null) });
					return;
				}

				const requestId = ++this.pendingRequest;
				const pos = view.state.selection.main.head;
				const lspPos = offsetToPosition(view.state.doc, pos);

				const results = await Promise.all(
					clients.map(async (client) => {
						const capabilities = getServerCapabilities(client);
						const provider = capabilities?.codeActionProvider;
						if (capabilities && !provider) return [] as ResolvedAction[];

						const advertisedKinds: string[] | undefined =
							typeof provider === 'object'
								? provider.codeActionKinds
								: undefined;

						const result = await requestFrom<CodeActionOrCommand[]>(
							client,
							'textDocument/codeAction',
							{
								textDocument: { uri: fileUri },
								range: { start: lspPos, end: lspPos },
								context: { diagnostics, only: advertisedKinds ?? [] },
							},
						);

						return (result ?? [])
							.filter((action) => action.title)
							.map((action) => resolveAction(action, client));
					}),
				);
				if (requestId !== this.pendingRequest) return;

				const seen = new Set<string>();
				const actions = results.flat().filter((action) => {
					const key = `${genericLSPService.getConfigId(action.client!) ?? ''}::${action.title}`;
					if (seen.has(key)) return false;
					seen.add(key);
					return true;
				});

				view.dispatch({
					effects: setCodeActions.of({ pos, actions, fileUri, clients }),
				});
			}
		},
	);

	return [codeActionField, requestPlugin, applyEditPlugin];
}
