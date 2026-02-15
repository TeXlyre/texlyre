// src/extensions/codemirror/GenericLSPExtension.ts
import { type Extension } from '@codemirror/state';
import { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { ViewPlugin, type EditorView, hoverTooltip } from '@codemirror/view';
import type { Tooltip } from '@codemirror/view';
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

const openedFiles = new Map<LSPClient, Set<string>>();
const documentVersions = new Map<string, number>();

function detectLanguageId(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'tex':
        case 'latex':
            return 'latex';
        case 'typ':
            return 'typst';
        case 'bib':
        case 'bibtex':
            return 'bibtex';
        case 'md':
            return 'markdown';
        case 'json':
            return 'json';
        case 'yaml':
            return 'yaml';
        case 'txt':
            return 'plaintext';
        default:
            return 'plaintext';
    }
}

function createDocumentSyncExtension(fileName: string, clients: LSPClient[]): Extension {
    return ViewPlugin.fromClass(
        class {
            private version: number;

            constructor(view: EditorView) {
                this.version = documentVersions.get(fileName) || 1;
                const text = view.state.doc.toString();
                clients.forEach(client => {
                    try {
                        (client as any).request('textDocument/didOpen', {
                            textDocument: {
                                uri: `file:///${fileName}`,
                                languageId: detectLanguageId(fileName),
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
                                uri: `file:///${fileName}`,
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
                            textDocument: { uri: `file:///${fileName}` }
                        }).catch(() => { });
                    } catch { }
                });
            }
        }
    );
}

function filterOutHoverExtension(extension: Extension, seen = new WeakSet<object>()): Extension {
    if (typeof extension !== 'object' || extension === null) return extension;
    if (seen.has(extension)) return [];
    seen.add(extension);

    if (Array.isArray(extension)) {
        return extension.map(e => filterOutHoverExtension(e, seen)).filter(Boolean);
    }

    const ext = extension as any;
    if (ext?.extension) {
        return filterOutHoverExtension(ext.extension, seen);
    }

    if (ext?.field?.id === 'hoverTooltip') {
        return [];
    }

    if (ext?.value?.constructor?.name === 'HoverPlugin') {
        return [];
    }

    return extension;
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

export function getGenericLSPExtensionsForFile(fileName: string): Extension[] {
    const clients = genericLSPService.getAllClientsForFile(fileName);
    if (clients.length === 0) return [];

    const extensions: Extension[] = [];

    clients.forEach(client => {
        if (!openedFiles.has(client)) {
            openedFiles.set(client, new Set());
        }
        openedFiles.get(client)!.add(fileName);
    });

    if (clients.length > 0) {
        extensions.push(createAggregatedHoverExtension(fileName, clients));
        extensions.push(createDocumentSyncExtension(fileName, clients));
    }

    return extensions;
}

export function releaseGenericLSPFile(fileName: string) {
    for (const [client, opened] of openedFiles) {
        if (opened.has(fileName)) {
            opened.delete(fileName);
            try {
                (client as any).request('textDocument/didClose', {
                    textDocument: { uri: `file:///${fileName}` }
                }).catch(() => { });
            } catch { }
        }
    }
    documentVersions.delete(fileName);
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