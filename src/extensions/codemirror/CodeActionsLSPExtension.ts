// src/extension/codemirror/CodeActionsLSPExtension.ts
import { type Extension, StateField, StateEffect } from '@codemirror/state';
import { EditorView, ViewPlugin, showTooltip, type Tooltip } from '@codemirror/view';
import { diagnosticCount, forEachDiagnostic as cmForEachDiagnostic } from '@codemirror/lint';
import type { LSPClient } from '@codemirror/lsp-client';

import { genericLSPService } from '../../services/GenericLSPService';

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
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
    newText: string;
}

interface LspDiagnostic {
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
    message: string;
    severity?: number;
    source?: string;
    info?: { replacements: string[]; raw: unknown };
}

function resolveDiagnosticActions(diagnostic: LspDiagnostic, fileUri: string): ResolvedAction[] {
    const actions: ResolvedAction[] = [];
    if (diagnostic.info?.replacements?.length) {
        for (const replacement of diagnostic.info.replacements.slice(0, 3)) {
            actions.push({
                title: `Replace with "${replacement}"`,
                edit: {
                    changes: {
                        [fileUri]: [
                            {
                                range: diagnostic.range,
                                newText: replacement,
                            },
                        ],
                    },
                },
            });
        }
    }
    return actions;
}

interface ResolvedAction {
    title: string;
    edit?: WorkspaceEdit;
    command?: LspCommand;
}

function isBareCommand(item: CodeActionOrCommand): item is LspCommand {
    return 'command' in item && typeof item.command === 'string';
}

function resolveAction(item: CodeActionOrCommand): ResolvedAction {
    if (isBareCommand(item)) {
        return {
            title: item.title,
            command: item,
        };
    }
    return {
        title: item.title,
        edit: item.edit,
        command: item.command,
    };
}

function posToOffset(doc: any, pos: { line: number; character: number }): number | null {
    if (pos.line < 0 || pos.line >= doc.lines) return null;
    const line = doc.line(pos.line + 1);
    return Math.min(line.from + pos.character, line.to);
}

function offsetToPos(doc: any, offset: number): { line: number; character: number } {
    const line = doc.lineAt(offset);
    return { line: line.number - 1, character: offset - line.from };
}

function getDiagnosticsAtPosition(state: any, pos: number): LspDiagnostic[] {
    const results: LspDiagnostic[] = [];
    if (diagnosticCount(state) === 0) return results;

    const doc = state.doc;
    cmForEachDiagnostic(state, (d, from, to) => {
        if (pos >= from && pos <= to) {
            results.push({
                range: {
                    start: offsetToPos(doc, from),
                    end: offsetToPos(doc, to),
                },
                message: d.message,
                severity: d.severity === 'error' ? 1 : d.severity === 'warning' ? 2 : 3,
                source: d.source,
                info: (d as any).info,
            });
        }
    });

    return results;
}

function applyTextEdits(edits: TextEdit[], view: EditorView) {
    const doc = view.state.doc;
    const changes = edits
        .map(edit => {
            const from = posToOffset(doc, edit.range.start);
            const to = posToOffset(doc, edit.range.end);
            if (from === null || to === null) return null;
            return { from, to, insert: edit.newText };
        })
        .filter((c): c is { from: number; to: number; insert: string } => c !== null)
        .sort((a, b) => b.from - a.from);

    if (changes.length > 0) {
        view.dispatch({ changes });
    }
}

function applyWorkspaceEdit(edit: WorkspaceEdit, view: EditorView, fileUri: string) {
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

function executeCommand(command: LspCommand, view: EditorView, fileUri: string, clients: LSPClient[]) {
    clients.forEach(client => {
        try {
            (client as any).request('workspace/executeCommand', {
                command: command.command,
                arguments: command.arguments,
            }).then((result: any) => {
                if (result?.changes || result?.documentChanges) {
                    applyWorkspaceEdit(result, view, fileUri);
                }
            }).catch(() => { });
        } catch { }
    });
}

function applyAction(action: ResolvedAction, view: EditorView, fileUri: string, clients: LSPClient[]) {
    if (action.edit) {
        applyWorkspaceEdit(action.edit, view, fileUri);
    }

    if (action.command) {
        executeCommand(action.command, view, fileUri, clients);
    }
}

const setCodeActions = StateEffect.define<{ pos: number; actions: ResolvedAction[]; fileUri: string; clients: LSPClient[]; message?: string; showTooltip?: boolean } | null>();

interface CodeActionState {
    pos: number;
    actions: ResolvedAction[];
    fileUri: string;
    clients: LSPClient[];
    message?: string;
    showTooltip?: boolean;
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
            if (!value || !value.showTooltip) return null;
            if (value.actions.length === 0 && !value.message) return null;

            return {
                pos: value.pos,
                above: false,
                create(view: EditorView) {
                    const dom = document.createElement('div');
                    dom.className = 'cm-code-actions-tooltip';

                    if (value.message) {
                        const messageDom = document.createElement('div');
                        messageDom.className = 'cm-code-action-message';
                        messageDom.textContent = value.message;
                        dom.appendChild(messageDom);
                    }

                    value.actions.forEach(action => {
                        const button = document.createElement('button');
                        button.className = 'cm-code-action-button';
                        button.textContent = action.title;
                        button.addEventListener('mousedown', (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            applyAction(action, view, value.fileUri, value.clients);
                            view.dispatch({ effects: setCodeActions.of(null) });
                        });
                        dom.appendChild(button);
                    });

                    return { dom };
                },
            } satisfies Tooltip;
        });
    },
});

export function createCodeActionsExtension(fileName: string): Extension {
    const fileUri = `file:///${fileName}`;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingRequest = 0;

    const applyEditPlugin = ViewPlugin.fromClass(
        class {
            private unsubscribe: () => void;
            constructor(private view: EditorView) {
                this.unsubscribe = genericLSPService.onApplyEdit((_configId, edit) => {
                    if (edit) {
                        applyWorkspaceEdit(edit, this.view, fileUri);
                    }
                });
            }
            update() { }
            destroy() { this.unsubscribe(); }
        }
    );

    const fetchCodeActions = async (view: EditorView, pos: number, showTooltip = false) => {
        const diagnostics = getDiagnosticsAtPosition(view.state, pos);
        if (diagnostics.length === 0) {
            view.dispatch({ effects: setCodeActions.of(null) });
            return;
        }

        const requestId = ++pendingRequest;
        const clients = genericLSPService.getAllClientsForFile(fileName);

        const actionPromises = clients.length > 0
            ? clients.map(async client => {
                const lspPos = offsetToPos(view.state.doc, pos);
                try {
                    const capabilities = (client as any).serverCapabilities;
                    if (!capabilities?.codeActionProvider) return [];

                    const result = await (client as any).request('textDocument/codeAction', {
                        textDocument: { uri: fileUri },
                        range: { start: lspPos!, end: lspPos! },
                        context: {
                            diagnostics,
                            only: ['quickfix'],
                        },
                    });

                    return (result || []) as CodeActionOrCommand[];
                } catch {
                    return [];
                }
            })
            : [];

        const results = await Promise.all(actionPromises);
        if (requestId !== pendingRequest) return;

        const lspActions = results.flat().filter(a => a.title).map(resolveAction);
        const diagnosticActions = diagnostics.flatMap(d => resolveDiagnosticActions(d, fileUri));
        const allActions = [...lspActions, ...diagnosticActions];
        const uniqueActions = allActions.filter((action, index) =>
            allActions.findIndex(a => a.title === action.title) === index
        );

        view.dispatch({
            effects: setCodeActions.of({
                pos,
                actions: uniqueActions,
                fileUri,
                clients,
                message: diagnostics[0]?.message,
                showTooltip,
            }),
        });
    };

    const contextMenuHandler = EditorView.domEventHandlers({
        mousedown(event, view) {
            if (event.button !== 2) return false;

            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
            if (pos == null) return false;

            const diagnostics = getDiagnosticsAtPosition(view.state, pos);
            if (diagnostics.length === 0) return false;

            event.preventDefault();
            return true;
        },
        contextmenu(event, view) {
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
            if (pos == null) return false;

            const diagnostics = getDiagnosticsAtPosition(view.state, pos);
            if (diagnostics.length === 0) return false;

            event.preventDefault();
            event.stopImmediatePropagation();
            if (debounceTimer) clearTimeout(debounceTimer);
            void fetchCodeActions(view, pos, true);
            return true;
        },
    });

    const listener = EditorView.updateListener.of((update) => {
        if (update.docChanged) {
            if (debounceTimer) clearTimeout(debounceTimer);
            update.view.dispatch({ effects: setCodeActions.of(null) });
            return;
        }

        if (update.selectionSet) {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                fetchCodeActions(update.view, update.view.state.selection.main.head);
            }, 600);
        }
    });

    const theme = EditorView.baseTheme({
        '.cm-code-actions-tooltip': {
            padding: '0.5rem',
            backgroundColor: 'var(--pico-secondary-background)',
            color: 'var(--pico-color)',
            border: '1px solid var(--pico-border)',
            borderRadius: '0.5rem',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
            maxWidth: '320px',
            zIndex: '9999',
        },
        '.cm-code-actions-tooltip button': {
            width: '100%',
            textAlign: 'left',
            padding: '0.5rem 0.75rem',
            margin: '0.15rem 0 0 0',
            border: 'none',
            background: 'transparent',
            color: 'inherit',
            cursor: 'pointer',
            borderRadius: '0.35rem',
        },
        '.cm-code-actions-tooltip button:hover': {
            backgroundColor: 'var(--pico-primary-background)',
        },
        '.cm-code-action-message': {
            marginBottom: '0.5rem',
            whiteSpace: 'pre-wrap',
        },
    });

    return [codeActionField, listener, contextMenuHandler, theme, applyEditPlugin];
}