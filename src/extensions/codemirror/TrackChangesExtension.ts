// src/extensions/codemirror/TrackChangesExtension.ts
import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import * as Y from 'yjs';
import { TrackChangesManager } from './trackChanges/TrackChangesManager';
import { buildDecorations } from './trackChanges/decorations';

export const updateTrackChangesEnabled = StateEffect.define<boolean>();
export const updateTrackChangesDecorations = StateEffect.define<DecorationSet>();

const trackChangesEnabledField = StateField.define<boolean>({
    create() {
        return false;
    },
    update(enabled, tr) {
        for (const effect of tr.effects) {
            if (effect.is(updateTrackChangesEnabled)) {
                return effect.value;
            }
        }
        return enabled;
    }
});

const trackChangesDecorations = StateField.define<DecorationSet>({
    create() {
        return Decoration.none;
    },
    update(decorations, tr) {
        decorations = decorations.map(tr.changes);

        for (const effect of tr.effects) {
            if (effect.is(updateTrackChangesDecorations)) {
                return effect.value;
            }
        }

        return decorations;
    },
    provide: field => EditorView.decorations.from(field)
});

class TrackChangesProcessor {
    private manager: TrackChangesManager;
    private yDoc: Y.Doc;
    private yText: Y.Text;
    private view: EditorView;
    private yObserver: (() => void) | null = null;

    constructor(view: EditorView, yDoc: Y.Doc, yText: Y.Text, userId: string) {
        this.view = view;
        this.yDoc = yDoc;
        this.yText = yText;
        this.manager = new TrackChangesManager(yDoc, yText, userId);

        this.yObserver = () => {
            setTimeout(() => this.updateDecorations(), 0);
        };

        this.yText.observe(this.yObserver);
    }

    update(update: any) {
        const enabled = update.state.field(trackChangesEnabledField, false);

        if (enabled !== this.manager.isEnabled()) {
            if (enabled) {
                this.manager.enable();
            } else {
                this.manager.disable();
            }
        }

        if (update.docChanged && this.manager.isEnabled()) {
            const isFromTrackChanges = update.transactions.some((tr: any) =>
                tr.effects.some((e: any) => e.is(updateTrackChangesDecorations))
            );

            // Skip if it's from our own decoration updates
            if (isFromTrackChanges) {
                return;
            }

            // Check if it's NOT from yjs sync (undo/redo uses yjs sync)
            const isYjsSync = update.transactions.some((tr: any) => {
                const yjsSync = tr.annotation('y-sync$');
                return yjsSync !== undefined;
            });

            if (!isYjsSync) {
                let insertionOffset = 0;

                update.changes.iterChanges((fromA: number, toA: number, fromB: number, toB: number, inserted: any) => {
                    if (toA > fromA) {
                        const deletedText = update.startState.doc.sliceString(fromA, toA);
                        this.manager.trackDeletion(fromB + insertionOffset, fromB + insertionOffset, deletedText);
                    }

                    if (inserted.length > 0) {
                        this.manager.trackInsertion(fromB + insertionOffset, inserted.toString());
                        insertionOffset += inserted.length;
                    }
                });

                setTimeout(() => this.updateDecorations(), 0);
            }
        }
    }

    private updateDecorations() {
        const changes = this.manager.getChanges();
        const decorations = buildDecorations(this.view, changes);

        this.view.dispatch({
            effects: updateTrackChangesDecorations.of(decorations)
        });
    }

    getManager(): TrackChangesManager {
        return this.manager;
    }

    destroy() {
        this.manager.destroy();
        if (this.yObserver) {
            this.yText.unobserve(this.yObserver);
            this.yObserver = null;
        }
    }
}

let globalProcessor: TrackChangesProcessor | null = null;

export function createTrackChangesExtension(yDoc: Y.Doc, yText: Y.Text, userId: string): Extension {
    const plugin = ViewPlugin.fromClass(
        class {
            processor: TrackChangesProcessor;

            constructor(view: EditorView) {
                this.processor = new TrackChangesProcessor(view, yDoc, yText, userId);
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

    return [
        trackChangesEnabledField,
        trackChangesDecorations,
        plugin,
        EditorView.baseTheme({
            '.tracked-insertion': {
                backgroundColor: 'rgba(0, 200, 0, 0.2)',
                textDecoration: 'underline',
                textDecorationColor: 'green'
            },
            '.tracked-deletion': {
                backgroundColor: 'rgba(200, 0, 0, 0.2)',
                textDecoration: 'line-through',
                textDecorationColor: 'red',
                cursor: 'pointer'
            }
        })
    ];
}

export function enableTrackChanges(view: EditorView, enabled: boolean): void {
    view.dispatch({
        effects: updateTrackChangesEnabled.of(enabled)
    });
}

export function clearAllTrackedChanges(): void {
    if (globalProcessor) {
        globalProcessor.getManager().clearAllChanges();
    }
}

export function getTrackChangesManager(): TrackChangesManager | null {
    return globalProcessor?.getManager() || null;
}