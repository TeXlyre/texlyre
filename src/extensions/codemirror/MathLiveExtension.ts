import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { MathDetector, type MathRegion } from './mathlive/MathDetector';
import { MathPreviewWidget, MathEditWidget } from './mathlive/MathWidget';
import { MathfieldElement } from 'mathlive';
import { setMathEditRegion } from './BidiExtension';

const BASE_PATH = __BASE_PATH__;

const setFileType = StateEffect.define<'latex' | 'typst'>();
const setEditingRegion = StateEffect.define<MathRegion | null>();
const setPreviewMode = StateEffect.define<'hover' | 'always' | 'never'>();
const setMathDecorations = StateEffect.define<DecorationSet>();

const fileTypeField = StateField.define<'latex' | 'typst'>({
    create() {
        return 'latex';
    },
    update(value, tr) {
        for (const effect of tr.effects) {
            if (effect.is(setFileType)) {
                return effect.value;
            }
        }
        return value;
    },
});

const editingRegionField = StateField.define<MathRegion | null>({
    create() {
        return null;
    },
    update(value, tr) {
        for (const effect of tr.effects) {
            if (effect.is(setEditingRegion)) {
                return effect.value;
            }
        }
        return value;
    },
});

const previewModeField = StateField.define<'hover' | 'always' | 'never'>({
    create() {
        return 'hover';
    },
    update(value, tr) {
        for (const effect of tr.effects) {
            if (effect.is(setPreviewMode)) {
                return effect.value;
            }
        }
        return value;
    },
});

const mathDecorations = StateField.define<DecorationSet>({
    create() {
        return Decoration.none;
    },
    update(decorations, tr) {
        for (const effect of tr.effects) {
            if (effect.is(setMathDecorations)) {
                return effect.value;
            }
        }

        return decorations.map(tr.changes);
    },
    provide: field => EditorView.decorations.from(field),
});

class MathLiveProcessor {
    private detector: MathDetector;
    private hoveredRegion: MathRegion | null = null;
    private hoverTimeout: NodeJS.Timeout | null = null;
    private editingRegion: MathRegion | null = null;
    protected pendingEditWidget: MathRegion | null = null;

    constructor(private view: EditorView) {
        this.detector = new MathDetector();
        this.updateFileType();
        this.setupEventListeners();
        this.refreshDecorations();
    }

    update(update: ViewUpdate): void {
        const fileType = update.state.field(fileTypeField, false);
        if (fileType) {
            this.detector.setFileType(fileType);
        }

        const newEditingRegion = update.state.field(editingRegionField, false);
        const previewMode = update.state.field(previewModeField, false);

        if (newEditingRegion && newEditingRegion !== this.editingRegion) {
            this.editingRegion = newEditingRegion;
            this.pendingEditWidget = newEditingRegion;
        } else if (!newEditingRegion && this.editingRegion) {
            this.editingRegion = null;
            this.pendingEditWidget = null;
        } else if (!newEditingRegion) {
            if (previewMode === 'always') {
                if (update.docChanged || update.viewportChanged) {
                    this.renderAllPreviews();
                }
            } else if (previewMode === 'never') {
                if (update.state.field(mathDecorations).size > 0) {
                    this.clearPreviews();
                }
            }
        }
    }

    private refreshDecorations(): void {
        const previewMode = this.view.state.field(previewModeField, false);
        if (previewMode === 'always') {
            this.renderAllPreviews();
        }
    }

    private updateFileType(): void {
        const fileType = this.view.state.field(fileTypeField, false);
        if (fileType) {
            this.detector.setFileType(fileType);
        }
    }

    private setupEventListeners(): void {
        this.view.dom.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.view.dom.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
    }

    private handleMouseMove(event: MouseEvent): void {
        const previewMode = this.view.state.field(previewModeField, false);
        if (previewMode !== 'hover') return;

        const editingRegion = this.view.state.field(editingRegionField, false);
        if (editingRegion) return;

        if (this.hoverTimeout) {
            clearTimeout(this.hoverTimeout);
        }

        this.hoverTimeout = setTimeout(() => {
            const pos = this.view.posAtCoords({ x: event.clientX, y: event.clientY });
            if (pos === null) {
                const currentEditingRegion = this.view.state.field(editingRegionField, false);
                if (!currentEditingRegion && this.hoveredRegion) {
                    this.hoveredRegion = null;
                    this.clearPreviews();
                }
                return;
            }

            const region = this.detector.detectMathAtPosition(this.view, pos);

            if (region) {
                const isSameRegion = this.hoveredRegion &&
                    region.from === this.hoveredRegion.from &&
                    region.to === this.hoveredRegion.to;

                if (!isSameRegion) {
                    this.hoveredRegion = region;
                    this.renderPreview(region);
                }
            } else if (this.hoveredRegion) {
                this.hoveredRegion = null;
                this.clearPreviews();
            }
        }, 150);
    }

    private handleMouseLeave(): void {
        if (this.hoverTimeout) {
            clearTimeout(this.hoverTimeout);
            this.hoverTimeout = null;
        }

        const editingRegion = this.view.state.field(editingRegionField, false);
        if (editingRegion) return;

        const previewMode = this.view.state.field(previewModeField, false);
        if (previewMode === 'hover' && this.hoveredRegion) {
            this.hoveredRegion = null;
            this.clearPreviews();
        }
    }

    private startEdit(region: MathRegion): void {
        this.view.dispatch({
            effects: setEditingRegion.of(region),
        });
    }

    private renderPreview(region: MathRegion): void {
        const widget = Decoration.widget({
            widget: new MathPreviewWidget(region, () => this.startEdit(region)),
            side: 1,
            block: region.type === 'display',
        });

        this.view.dispatch({
            effects: setMathDecorations.of(Decoration.set([widget.range(region.to)])),
        });
    }

    private renderAllPreviews(): void {
        const doc = this.view.state.doc.toString();
        const fileType = this.view.state.field(fileTypeField, false) || 'latex';
        const regions = this.detector.findAllMathRegions(doc, fileType);

        const decorations = regions.map(region =>
            Decoration.widget({
                widget: new MathPreviewWidget(region, () => this.startEdit(region)),
                side: 1,
                block: region.type === 'display',
            }).range(region.to)
        );

        this.view.dispatch({
            effects: setMathDecorations.of(Decoration.set(decorations)),
        });
    }

    protected renderEditWidget(region: MathRegion): void {
        const widget = Decoration.replace({
            widget: new MathEditWidget(
                region,
                this.view,
                (content: string) => this.handleSave(region, content),
                () => this.handleCancel(),
            ),
            inclusive: false,
            block: region.type === 'display',
        });

        this.view.dispatch({
            effects: [
                setMathEditRegion.of({ from: region.from, to: region.to }),
                setMathDecorations.of(Decoration.set([widget.range(region.from, region.to)])),
            ],
        });
    }

    private handleSave(region: MathRegion, newContent: string): void {
        const fullContent = `${region.delimiterStart}${newContent}${region.delimiterEnd}`;

        this.view.dispatch({
            changes: { from: region.from, to: region.to, insert: fullContent },
        });

        setTimeout(() => {
            this.view.dispatch({
                effects: [
                    setEditingRegion.of(null),
                    setMathEditRegion.of(null),
                    setMathDecorations.of(Decoration.none),
                ],
            });

            this.view.focus();

            setTimeout(() => {
                this.refreshDecorations();
            }, 10);
        }, 0);
    }

    private handleCancel(): void {
        setTimeout(() => {
            this.view.dispatch({
                effects: [
                    setEditingRegion.of(null),
                    setMathEditRegion.of(null),
                    setMathDecorations.of(Decoration.none),
                ],
            });

            this.view.focus();

            setTimeout(() => {
                this.refreshDecorations();
            }, 10);
        }, 0);
    }

    private clearPreviews(): void {
        this.view.dispatch({
            effects: setMathDecorations.of(Decoration.none),
        });
    }

    destroy(): void {
        if (this.hoverTimeout) {
            clearTimeout(this.hoverTimeout);
        }
    }
}

let mathLiveFontsConfigured = false;

export function createMathLiveExtension(
    fileType: 'latex' | 'typst',
    previewMode: 'hover' | 'always' | 'never' = 'hover',
): Extension {
    if (!mathLiveFontsConfigured) {
        MathfieldElement.fontsDirectory = `${BASE_PATH}/assets/fonts/`;
        mathLiveFontsConfigured = true;
    }

    const plugin = ViewPlugin.fromClass(
        class extends MathLiveProcessor {
            private renderTimeout: NodeJS.Timeout | null = null;

            update(update: ViewUpdate): void {
                super.update(update);

                if (this.pendingEditWidget) {
                    const region = this.pendingEditWidget;
                    this.pendingEditWidget = null;

                    if (this.renderTimeout) {
                        clearTimeout(this.renderTimeout);
                    }

                    this.renderTimeout = setTimeout(() => {
                        this.renderEditWidget(region);
                        this.renderTimeout = null;
                    }, 50);
                }
            }

            destroy(): void {
                if (this.renderTimeout) {
                    clearTimeout(this.renderTimeout);
                    this.renderTimeout = null;
                }
                super.destroy();
            }
        }
    );

    return [
        fileTypeField.init(() => fileType),
        editingRegionField,
        previewModeField.init(() => previewMode),
        mathDecorations,
        plugin,
        EditorView.baseTheme({
            '.cm-math-preview': {
                padding: '4px 8px',
                margin: '2px',
                backgroundColor: 'var(--pico-secondary-background)',
                borderRadius: '4px',
                cursor: 'pointer',
            },
            '.cm-math-display': {
                padding: '12px',
                margin: '12px 0',
            },
            '.cm-math-editor': {
                zIndex: '1000',
            },
            '.cm-math-edit-btn:hover': {
                backgroundColor: 'var(--pico-secondary-background)',
            },
        }),
    ];
}

export function updateMathLiveFileType(view: EditorView, fileType: 'latex' | 'typst'): void {
    view.dispatch({
        effects: setFileType.of(fileType),
    });
}

export function updateMathLivePreviewMode(
    view: EditorView,
    previewMode: 'hover' | 'always' | 'never',
): void {
    view.dispatch({
        effects: setPreviewMode.of(previewMode),
    });
}