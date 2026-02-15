// src/extensions/codemirror/GenericLSPExtension.ts
import { type Extension } from '@codemirror/state';
import { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { ViewPlugin, type EditorView, hoverTooltip } from '@codemirror/view';
import type { Tooltip } from '@codemirror/view';
import { linter, forceLinting, type Diagnostic } from '@codemirror/lint';

import { genericLSPService } from '../../services/GenericLSPService';
import type { LSPClient } from '@codemirror/lsp-client';

class GenericLSPProcessor {
    private view: EditorView;
    private currentFileName: string = '';

    constructor(view: EditorView) {
        this.view = view;
    }

    setCurrentFileName(fileName: string) {
        this.currentFileName = fileName;
    }

    update(_update: any) {
    }

    destroy() {
    }
}

let globalProcessor: GenericLSPProcessor | null = null;

export function createGenericLSPExtension(fileName?: string): Extension {
    const plugin = ViewPlugin.fromClass(
        class {
            processor: GenericLSPProcessor;

            constructor(view: EditorView) {
                this.processor = new GenericLSPProcessor(view);
                if (fileName) {
                    this.processor.setCurrentFileName(fileName);
                }
                globalProcessor = this.processor;
            }

            update(update: any) {
                this.processor?.update(update);
            }

            destroy() {
                this.processor?.destroy();
                if (globalProcessor === this.processor) {
                    globalProcessor = null;
                }
            }
        }
    );

    return [plugin];
}

export function setCurrentFileNameInGenericLSP(fileName: string) {
    if (globalProcessor) {
        globalProcessor.setCurrentFileName(fileName);
    }
}

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

function createLSPDiagnosticsExtension(fileName: string): Extension {
    const fileUri = `file:///${fileName}`;
    let currentDiagnostics: Diagnostic[] = [];

    const diagnosticsPlugin = ViewPlugin.fromClass(
        class {
            private unsubscribe: () => void;
            private view: EditorView;

            constructor(view: EditorView) {
                this.view = view;
                this.unsubscribe = genericLSPService.onDiagnostics((_configId, params) => {
                    if (params.uri !== fileUri) return;

                    const doc = this.view.state.doc;
                    currentDiagnostics = (params.diagnostics || []).map((d: any) => {
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
                            source: d.source || 'lsp',
                        } satisfies Diagnostic;
                    });

                    forceLinting(this.view);
                });
            }

            destroy() {
                this.unsubscribe();
            }
        }
    );

    const diagnosticsLinter = linter(() => currentDiagnostics, { delay: 0 });

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

function createAggregatedHoverExtension(fileName: string, clients: LSPClient[]): Extension {
    return hoverTooltip(async (view, pos) => {
        const doc = view.state.doc;
        const line = doc.lineAt(pos);
        const character = pos - line.from;

        const hoverPromises = clients.map(async client => {
            try {
                const capabilities = (client as any).serverCapabilities;
                if (!capabilities?.hoverProvider) return null;

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

                return content.trim();
            } catch (error) {
                return null;
            }
        });

        const results = await Promise.all(hoverPromises);
        const validResults = results.filter((r): r is string => r !== null && r !== '');

        if (validResults.length === 0) return null;

        const uniqueResults = Array.from(new Set(validResults));

        const dom = document.createElement('div');
        dom.className = 'cm-tooltip-hover';

        uniqueResults.forEach((content, i) => {
            if (i > 0) {
                dom.appendChild(document.createElement('hr'));
            }
            dom.appendChild(renderHoverContent(content));
        });

        return {
            pos,
            create: () => ({ dom }),
            above: true
        } as Tooltip;
    });
}

function createDocumentSyncExtension(fileName: string, clients: LSPClient[]): Extension {
    const fileUri = `file:///${fileName}`;
    const documentVersions = new Map<string, number>();

    return ViewPlugin.fromClass(
        class {
            private version: number;

            constructor(view: EditorView) {
                this.version = documentVersions.get(fileName) || 1;
                const text = view.state.doc.toString();
                clients.forEach(client => {
                    const languageId = detectLanguageId(fileName, client);
                    try {
                        (client as any).request('textDocument/didOpen', {
                            textDocument: {
                                uri: fileUri,
                                languageId,
                                version: this.version,
                                text,
                            }
                        }).catch(() => { });
                    } catch { }
                });
            }

            update(update: any) {
                if (!update.docChanged) return;
                this.version++;
                documentVersions.set(fileName, this.version);
                const text = update.state.doc.toString();
                clients.forEach(client => {
                    try {
                        (client as any).request('textDocument/didChange', {
                            textDocument: {
                                uri: fileUri,
                                version: this.version,
                            },
                            contentChanges: [{ text }],
                        }).catch(() => { });
                    } catch { }
                });
            }

            destroy() {
                clients.forEach(client => {
                    try {
                        (client as any).request('textDocument/didClose', {
                            textDocument: { uri: fileUri }
                        }).catch(() => { });
                    } catch { }
                });
                documentVersions.delete(fileName);
            }
        }
    );
}

export function getGenericLSPExtensionsForFile(fileName: string): Extension[] {
    const clients = genericLSPService.getAllClientsForFile(fileName);
    if (clients.length === 0) return [];

    const extensions: Extension[] = [];

    extensions.push(createDocumentSyncExtension(fileName, clients));
    extensions.push(createAggregatedHoverExtension(fileName, clients));
    extensions.push(createLSPDiagnosticsExtension(fileName));

    return extensions;
}

export function releaseGenericLSPFile(_fileName: string) {
}

export function getGenericLSPCompletionSources(fileName: string) {
    const clients = genericLSPService.getAllClientsForFile(fileName);
    console.log(`[GenericLSPExtension] Getting completion sources for ${fileName}, found ${clients.length} clients`);

    if (clients.length === 0) return [];

    return clients.map(client => {
        return async (context: CompletionContext): Promise<CompletionResult | null> => {
            console.log(`[GenericLSPExtension] Completion triggered at position ${context.pos}`);

            const capabilities = (client as any).serverCapabilities;
            if (!capabilities?.completionProvider) {
                console.log('[GenericLSPExtension] No completion provider in server capabilities');
                return null;
            }

            try {
                const doc = context.state.doc;
                const line = doc.lineAt(context.pos);
                const character = context.pos - line.from;

                console.log('[GenericLSPExtension] Requesting completion at line', line.number, 'character', character);

                const result = await (client as any).request('textDocument/completion', {
                    textDocument: { uri: `file:///${fileName}` },
                    position: { line: line.number - 1, character }
                });

                console.log('[GenericLSPExtension] Completion result:', result);

                if (!result || !result.items || result.items.length === 0) {
                    return null;
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
            } catch (error) {
                console.error('[GenericLSPExtension] Completion error:', error);
                return null;
            }
        };
    });
}