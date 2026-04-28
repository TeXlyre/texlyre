// src/extensions/codemirror/GenericLSPExtension.ts
import { type Extension } from '@codemirror/state';
import { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { ViewPlugin, type EditorView, hoverTooltip } from '@codemirror/view';
import type { Tooltip } from '@codemirror/view';
import { linter, setDiagnostics, forEachDiagnostic, type Diagnostic } from '@codemirror/lint';

import { genericLSPService } from '../../services/GenericLSPService';
import type { LSPClient } from '@codemirror/lsp-client';

function detectLanguageId(fileName: string, client?: LSPClient): string {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    if (client) {
        const configId = genericLSPService.getConfigId(client);
        if (configId) {
            const langMap = genericLSPService.getLanguageIdMap(configId);
            if (langMap && langMap[ext]) {
                return langMap[ext];
            }
        }
    }

    switch (ext) {
        case 'tex':
        case 'latex':
            return 'latex';
        case 'typ':
            return 'typst';
        case 'bib':
            return 'bibtex';
        case 'md':
            return 'markdown';
        case 'txt':
            return 'plaintext';
        default:
            return 'plaintext';
    }
}

function lspSeverityToCodeMirror(severity?: number): 'error' | 'warning' | 'info' | 'hint' {
    switch (severity) {
        case 1: return 'error';
        case 2: return 'warning';
        case 3: return 'info';
        case 4: return 'hint';
        default: return 'warning';
    }
}

function sendNotification(client: LSPClient, method: string, params: any) {
    try {
        const transport = (client as any).transport;
        if (transport?.send) {
            transport.send(JSON.stringify({ jsonrpc: '2.0', method, params }));
        }
    } catch { }
}

function createLSPDiagnosticsExtension(fileName: string): Extension {
    const fileUri = `file:///${fileName}`;
    const diagnosticsByConfig = new Map<string, Diagnostic[]>();
    let mergedDiagnostics: Diagnostic[] = [];

    const diagnosticsPlugin = ViewPlugin.fromClass(
        class {
            private unsubscribe: () => void;
            private view: EditorView;

            constructor(view: EditorView) {
                this.view = view;
                this.unsubscribe = genericLSPService.onDiagnostics((configId, params) => {
                    if (params.uri !== fileUri) return;

                    const doc = this.view.state.doc;
                    const mapped: Diagnostic[] = (params.diagnostics || []).map((d: any) => {
                        const fromLine = Math.min(d.range.start.line, doc.lines - 1);
                        const toLine = Math.min(d.range.end.line, doc.lines - 1);
                        const lineFrom = doc.line(fromLine + 1);
                        const lineTo = doc.line(toLine + 1);
                        const from = Math.min(lineFrom.from + d.range.start.character, lineFrom.to);
                        const to = Math.min(lineTo.from + d.range.end.character, lineTo.to);

                        return {
                            from: Math.max(0, from),
                            to: Math.max(from, to),
                            severity: lspSeverityToCodeMirror(d.severity),
                            message: d.message,
                            source: d.source || genericLSPService.getConfigName(configId) || configId,
                        } satisfies Diagnostic;
                    });

                    diagnosticsByConfig.set(configId, mapped);
                    mergedDiagnostics = Array.from(diagnosticsByConfig.values()).flat();

                    queueMicrotask(() => {
                        if (!this.view.dom.isConnected) return;

                        const lspSources = new Set(mergedDiagnostics.map(d => d.source).filter(Boolean));

                        const preserved: Diagnostic[] = [];
                        forEachDiagnostic(this.view.state, (d, from, to) => {
                            if (!lspSources.has(d.source ?? '')) {
                                preserved.push({ ...d, from, to });
                            }
                        });

                        this.view.dispatch(setDiagnostics(this.view.state, [...preserved, ...mergedDiagnostics]));
                    });
                });
            }

            destroy() {
                this.unsubscribe();
                diagnosticsByConfig.clear();
                mergedDiagnostics = [];
            }
        }
    );

    const diagnosticsLinter = linter(() => mergedDiagnostics, { delay: 0 });

    return [diagnosticsPlugin, diagnosticsLinter];
}

function renderHoverContent(content: string): HTMLElement {
    const container = document.createElement('div');
    container.style.whiteSpace = 'pre-wrap';
    container.innerHTML = content
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
    return container;
}

function createAggregatedHoverExtension(fileName: string): Extension {
    return hoverTooltip(async (view, pos) => {
        const clients = genericLSPService.getAllClientsForFile(fileName);
        if (clients.length === 0) return null;

        const doc = view.state.doc;
        const line = doc.lineAt(pos);
        const character = pos - line.from;

        const hoverPromises = clients.map(async client => {
            try {
                const capabilities = (client as any).serverCapabilities;
                if (capabilities && capabilities.hoverProvider === false) return null;

                const result = await (client as any).request('textDocument/hover', {
                    textDocument: { uri: `file:///${fileName}` },
                    position: { line: line.number - 1, character }
                });

                if (!result?.contents) return null;

                let content = '';
                const contents = result.contents;

                if (typeof contents === 'string') {
                    content = contents;
                } else if (contents.kind === 'markdown' || contents.kind === 'plaintext') {
                    content = contents.value;
                } else if (Array.isArray(contents)) {
                    content = contents
                        .map((c: any) => typeof c === 'string' ? c : (c.value || ''))
                        .filter(Boolean)
                        .join('\n\n');
                } else if (contents.value) {
                    content = contents.value;
                }

                const trimmed = content.trim();
                if (!trimmed) return null;

                const configId = genericLSPService.getConfigId(client);
                const label = (configId && genericLSPService.getConfigName(configId)) || configId || 'LSP';
                return { label, content: trimmed };
            } catch {
                return null;
            }
        });

        const results = await Promise.all(hoverPromises);
        const validResults = results.filter((r): r is { label: string; content: string } => r !== null);
        if (validResults.length === 0) return null;

        const seen = new Set<string>();
        const uniqueResults = validResults.filter(r => {
            const key = `${r.label}::${r.content}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        const dom = document.createElement('div');
        dom.className = 'cm-tooltip-hover';

        uniqueResults.forEach((entry, i) => {
            if (i > 0) dom.appendChild(document.createElement('hr'));

            const header = document.createElement('div');
            header.className = 'cm-tooltip-hover-source';
            header.textContent = entry.label;
            dom.appendChild(header);

            dom.appendChild(renderHoverContent(entry.content));
        });

        return {
            pos,
            create: () => ({ dom }),
            above: true
        } as Tooltip;
    });
}

function createDocumentSyncExtension(fileName: string): Extension {
    const fileUri = `file:///${fileName}`;
    let version = 1;

    return ViewPlugin.fromClass(
        class {
            private openedFor = new Set<LSPClient>();

            constructor(view: EditorView) {
                this.syncOpenState(view);
            }

            private syncOpenState(view: EditorView) {
                const clients = genericLSPService.getAllClientsForFile(fileName);
                const text = view.state.doc.toString();

                clients.forEach(client => {
                    if (this.openedFor.has(client)) return;
                    const languageId = detectLanguageId(fileName, client);
                    sendNotification(client, 'textDocument/didOpen', {
                        textDocument: { uri: fileUri, languageId, version, text },
                    });
                    this.openedFor.add(client);
                });
            }

            update(update: any) {
                this.syncOpenState(update.view);

                if (!update.docChanged) return;
                version++;
                const text = update.state.doc.toString();
                this.openedFor.forEach(client => {
                    sendNotification(client, 'textDocument/didChange', {
                        textDocument: { uri: fileUri, version },
                        contentChanges: [{ text }],
                    });
                });
            }

            destroy() {
                this.openedFor.forEach(client => {
                    sendNotification(client, 'textDocument/didClose', {
                        textDocument: { uri: fileUri },
                    });
                });
                this.openedFor.clear();
            }
        }
    );
}

export function getGenericLSPExtensionsForFile(fileName: string): Extension[] {
    if (!fileName) return [];

    return [
        createDocumentSyncExtension(fileName),
        createAggregatedHoverExtension(fileName),
        createLSPDiagnosticsExtension(fileName),
    ];
}

export function getGenericLSPCompletionSources(fileName: string) {
    if (!fileName) return [];

    return [
        async (context: CompletionContext): Promise<CompletionResult | null> => {
            const clients = genericLSPService.getAllClientsForFile(fileName);
            if (clients.length === 0) return null;

            for (const client of clients) {
                const capabilities = (client as any).serverCapabilities;
                if (capabilities && capabilities.completionProvider === undefined) {
                    continue;
                }

                try {
                    const doc = context.state.doc;
                    const line = doc.lineAt(context.pos);
                    const character = context.pos - line.from;

                    const result = await (client as any).request('textDocument/completion', {
                        textDocument: { uri: `file:///${fileName}` },
                        position: { line: line.number - 1, character }
                    });

                    if (!result || !result.items || result.items.length === 0) {
                        continue;
                    }

                    const options = result.items.map((item: any) => ({
                        label: item.label,
                        type: item.kind === 1 ? 'text' : 'keyword',
                        detail: item.detail,
                        info: item.documentation,
                        apply: item.insertText || item.label,
                    }));

                    return {
                        from: context.pos,
                        options
                    };
                } catch {
                    continue;
                }
            }

            return null;
        }
    ];
}