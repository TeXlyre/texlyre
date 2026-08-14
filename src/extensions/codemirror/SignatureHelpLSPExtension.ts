// src/extensions/codemirror/SignatureHelpLSPExtension.ts
import { type Extension, StateEffect, StateField } from '@codemirror/state';
import {
    EditorView,
    type Tooltip,
    type ViewUpdate,
    showTooltip,
} from '@codemirror/view';
import type { LSPClient } from '@codemirror/lsp-client';

import { genericLSPService } from '../../services/GenericLSPService';

interface SignatureHelpState {
    pos: number;
    label: string;
    activeRange: [number, number] | null;
    index: number;
    total: number;
}

interface SignatureHelpTarget {
    client: LSPClient;
    triggerCharacters: string[];
}

const setSignatureHelp = StateEffect.define<SignatureHelpState | null>();

const signatureHelpField = StateField.define<SignatureHelpState | null>({
    create() {
        return null;
    },
    update(value, tr) {
        for (const effect of tr.effects) {
            if (effect.is(setSignatureHelp)) {
                return effect.value;
            }
        }
        if (value && tr.docChanged) {
            return { ...value, pos: tr.changes.mapPos(value.pos) };
        }
        return value;
    },
    provide(field) {
        return showTooltip.compute([field], (state) => {
            const value = state.field(field);
            if (!value) return null;

            return {
                pos: value.pos,
                above: true,
                create() {
                    const dom = document.createElement('div');
                    dom.className = 'cm-signature-tooltip';

                    if (value.activeRange) {
                        const [from, to] = value.activeRange;
                        dom.append(document.createTextNode(value.label.slice(0, from)));
                        const active = document.createElement('span');
                        active.className = 'cm-signature-active';
                        active.textContent = value.label.slice(from, to);
                        dom.append(active);
                        dom.append(document.createTextNode(value.label.slice(to)));
                    } else {
                        dom.textContent = value.label;
                    }

                    if (value.total > 1) {
                        const counter = document.createElement('span');
                        counter.className = 'cm-signature-count';
                        counter.textContent = ` (${value.index + 1}/${value.total})`;
                        dom.append(counter);
                    }

                    return { dom };
                },
            } satisfies Tooltip;
        });
    },
});

function resolveTarget(fileName: string): SignatureHelpTarget | null {
    for (const client of genericLSPService.getAllClientsForFile(fileName)) {
        const provider = (client as any).serverCapabilities?.signatureHelpProvider;
        if (!provider) continue;
        return {
            client,
            triggerCharacters: [
                ...(provider.triggerCharacters ?? []),
                ...(provider.retriggerCharacters ?? []),
            ],
        };
    }
    return null;
}

function insertedText(update: ViewUpdate): string {
    let text = '';
    update.changes.iterChanges((_fromA, _toA, _fromB, _toB, inserted) => {
        text += inserted.toString();
    });
    return text;
}

function activeParameterRange(
    label: string,
    parameters: any,
    active: unknown,
): [number, number] | null {
    if (!Array.isArray(parameters) || typeof active !== 'number') return null;

    const parameter = parameters[active];
    if (!parameter) return null;

    if (Array.isArray(parameter.label) && parameter.label.length === 2) {
        const [from, to] = parameter.label;
        return typeof from === 'number' && typeof to === 'number' ? [from, to] : null;
    }
    if (typeof parameter.label === 'string') {
        const from = label.indexOf(parameter.label);
        return from === -1 ? null : [from, from + parameter.label.length];
    }
    return null;
}

function toSignatureHelpState(result: any, pos: number): SignatureHelpState | null {
    const signatures = result?.signatures;
    if (!Array.isArray(signatures) || signatures.length === 0) return null;

    const index =
        typeof result.activeSignature === 'number' &&
            signatures[result.activeSignature]
            ? result.activeSignature
            : 0;
    const signature = signatures[index];
    const label = typeof signature?.label === 'string' ? signature.label : '';
    if (!label) return null;

    const active =
        typeof signature.activeParameter === 'number'
            ? signature.activeParameter
            : result.activeParameter;

    return {
        pos,
        label,
        activeRange: activeParameterRange(label, signature.parameters, active),
        index,
        total: signatures.length,
    };
}

export function createSignatureHelpExtension(fileName: string): Extension {
    if (!fileName) return [];

    const fileUri = `file:///${fileName}`;
    let generation = 0;

    const requestSignatureHelp = async (
        view: EditorView,
        target: SignatureHelpTarget,
    ) => {
        const current = ++generation;
        const pos = view.state.selection.main.head;
        const line = view.state.doc.lineAt(pos);

        try {
            const result = await (target.client as any).request(
                'textDocument/signatureHelp',
                {
                    textDocument: { uri: fileUri },
                    position: { line: line.number - 1, character: pos - line.from },
                },
            );
            if (current !== generation || !view.dom.isConnected) return;

            view.dispatch({
                effects: setSignatureHelp.of(toSignatureHelpState(result, pos)),
            });
        } catch { }
    };

    const listener = EditorView.updateListener.of((update) => {
        if (!update.docChanged && !update.selectionSet) return;

        const target = resolveTarget(fileName);
        if (!target) return;

        const isOpen = update.state.field(signatureHelpField) !== null;
        if (!isOpen) {
            if (!update.docChanged) return;
            const typed = insertedText(update);
            if (!target.triggerCharacters.some((char) => typed.includes(char))) return;
        }

        void requestSignatureHelp(update.view, target);
    });

    return [signatureHelpField, listener];
}