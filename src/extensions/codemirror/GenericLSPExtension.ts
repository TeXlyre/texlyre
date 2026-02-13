// src/extensions/codemirror/GenericLSPExtension.ts
import { type Extension } from '@codemirror/state';
import { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { ViewPlugin, type EditorView } from '@codemirror/view';
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
export function getGenericLSPExtensionsForFile(fileName: string): Extension[] {
    const clients = genericLSPService.getAllClientsForFile(fileName);
    if (clients.length === 0) return [];

    const extensions = clients.flatMap(client => {
        if (!openedFiles.has(client)) {
            openedFiles.set(client, new Set());
        }

        const opened = openedFiles.get(client)!;
        if (opened.has(fileName)) {
            return [];
        }

        opened.add(fileName);
        try {
            return [client.plugin(fileName)];
        } catch (error) {
            console.warn(`[GenericLSPExtension] Failed to create plugin for ${fileName}:`, error);
            opened.delete(fileName);
            return [];
        }
    });

    return extensions;
}

export function releaseGenericLSPFile(fileName: string) {
    for (const [_, opened] of openedFiles) {
        opened.delete(fileName);
    }
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