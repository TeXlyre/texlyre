// src/extensions/codemirror/MathLiveExtension.ts
import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { MathfieldElement } from 'mathlive';

import { MathDetector, type MathRegion } from './mathlive/MathDetector';
import { MathPreviewWidget, MathEditWidget } from './mathlive/MathWidget';
import { setMathEditRegion } from './BidiExtension';

const BASE_PATH = __BASE_PATH__;

const setFileType = StateEffect.define<'latex' | 'typst'>();
const setEditingRegion = StateEffect.define<MathRegion | null>();
const setPreviewMode = StateEffect.define<'hover' | 'cursor' | 'hover-cursor' | 'never'>();
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

const previewModeField = StateField.define<'hover' | 'cursor' | 'hover-cursor' | 'never'>({
    create() {
        return 'hover-cursor';
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
    private editingRegion: MathRegion | null = null;
    protected pendingEditWidget: MathRegion | null = null;
    private currentOverlay: HTMLElement | null = null;
    private checkTimer: number | null = null;
    private isDestroyed: boolean = false;
    private outsideClickHandler: ((e: MouseEvent) => void) | null = null;

    constructor(private view: EditorView) {
        this.detector = new MathDetector();
        this.updateFileType();
        this.setupEventListeners();
        this.startChecking();
    }

    private startChecking(): void {
        const check = () => {
            if (this.isDestroyed) return;

            const previewMode = this.view.state.field(previewModeField, false);
            const editingRegion = this.view.state.field(editingRegionField, false);

            if (previewMode !== 'never' && !editingRegion) {
                this.view.requestMeasure({
                    read: () => {
                        if (this.isDestroyed) return null;
                        return this.checkForMath(previewMode);
                    },
                    write: (result) => {
                        if (this.isDestroyed || !result) return;

                        const { region, x, y } = result;

                        const isSameRegion = this.hoveredRegion &&
                            region.replaceFrom === this.hoveredRegion.replaceFrom &&
                            region.replaceTo === this.hoveredRegion.replaceTo;

                        if (!isSameRegion) {
                            this.hoveredRegion = region;
                            this.renderPreview(region, x, y);
                        }
                    }
                });
            }

            this.checkTimer = window.setTimeout(check, 200);
        };

        check();
    }

    private checkForMath(previewMode: 'hover' | 'cursor' | 'hover-cursor' | 'never'): { region: MathRegion; x: number; y: number } | null {
        const checkCursor = previewMode === 'cursor' || previewMode === 'hover-cursor';
        const checkMouse = previewMode === 'hover' || previewMode === 'hover-cursor';

        if (checkCursor) {
            const cursorPos = this.view.state.selection.main.from;
            const cursorMath = this.detector.detectMathAtPosition(this.view, cursorPos);

            if (cursorMath) {
                const coords = this.view.coordsAtPos(cursorPos);
                if (coords) {
                    return {
                        region: cursorMath,
                        x: coords.left,
                        y: coords.top
                    };
                }
            }
        }

        if (checkMouse) {
            const mousePos = this.getMousePosition();
            if (mousePos !== null) {
                const mouseMath = this.detector.detectMathAtPosition(this.view, mousePos);
                if (mouseMath) {
                    const coords = this.view.coordsAtPos(mousePos);
                    if (coords) {
                        return {
                            region: mouseMath,
                            x: coords.left,
                            y: coords.top
                        };
                    }
                }
            }
        }

        if (this.hoveredRegion && this.currentOverlay && !this.currentOverlay.matches(':hover')) {
            this.hoveredRegion = null;
            this.clearOverlay();
        }

        return null;
    }

    private getMousePosition(): number | null {
        const rect = this.view.dom.getBoundingClientRect();
        const lastMouseEvent = (window as any).lastMouseEvent;

        if (lastMouseEvent &&
            lastMouseEvent.clientX >= rect.left &&
            lastMouseEvent.clientX <= rect.right &&
            lastMouseEvent.clientY >= rect.top &&
            lastMouseEvent.clientY <= rect.bottom) {

            return this.view.posAtCoords({
                x: lastMouseEvent.clientX,
                y: lastMouseEvent.clientY
            });
        }

        return null;
    }

    private isClickInMathLiveUI(target: Element): boolean {
        return !!(
            target.closest('math-field') ||
            target.closest('.ML__keyboard') ||
            target.closest('.ML__popover') ||
            target.closest('.ML__menu') ||
            target.closest('.ML__tooltip') ||
            target.closest('.ML__container') ||
            target.classList.contains('ML__keyboard') ||
            target.classList.contains('ML__popover') ||
            target.classList.contains('ML__menu')
        );
    }

    update(update: ViewUpdate): void {
        const fileType = update.state.field(fileTypeField, false);
        if (fileType) {
            this.detector.setFileType(fileType);
        }

        const newEditingRegion = update.state.field(editingRegionField, false);

        if (newEditingRegion && newEditingRegion !== this.editingRegion) {
            this.editingRegion = newEditingRegion;
            this.pendingEditWidget = newEditingRegion;
        } else if (!newEditingRegion && this.editingRegion) {
            this.editingRegion = null;
            this.pendingEditWidget = null;
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
        (window as any).lastMouseEvent = event;
    }

    private handleMouseLeave(): void {
        (window as any).lastMouseEvent = null;
    }

    private startEdit(region: MathRegion): void {
        this.view.dispatch({
            effects: setEditingRegion.of(region),
        });
    }

    private renderPreview(region: MathRegion, mouseX: number, mouseY: number): void {
        this.clearOverlay();

        const previewWidget = new MathPreviewWidget(region, () => this.startEdit(region));
        const dom = previewWidget.toDOM();

        dom.style.visibility = 'hidden';
        dom.style.left = '0px';
        dom.style.top = '0px';

        document.body.appendChild(dom);
        this.currentOverlay = dom;

        setTimeout(() => {
            if (!this.currentOverlay || this.isDestroyed) return;

            this.view.dispatch({
                effects: setMathEditRegion.of({ from: region.from, to: region.to }),
            });
        }, 0);

        setTimeout(() => {
            if (!this.currentOverlay) return;

            const domRect = dom.getBoundingClientRect();
            const spacing = 12;
            const padding = 8;

            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            let left = mouseX + 20;
            let top = mouseY + 20;

            if (left + domRect.width + spacing > viewportWidth) {
                left = Math.max(padding, viewportWidth - domRect.width - padding);
            }

            if (top + domRect.height + spacing > viewportHeight) {
                top = Math.max(padding, viewportHeight - domRect.height - padding);
            }

            left = Math.max(padding, left);
            top = Math.max(padding, top);

            dom.style.left = `${left}px`;
            dom.style.top = `${top}px`;
            dom.style.visibility = 'visible';
        }, 50);

        dom.addEventListener('click', (e) => {
            if (!(e.target as Element).closest('.cm-math-edit-btn')) {
                this.startEdit(region);
            }
        });

        this.outsideClickHandler = (e: MouseEvent) => {
            const target = e.target as Element;

            if (this.currentOverlay && (this.currentOverlay.contains(target) || this.isClickInMathLiveUI(target))) {
                return;
            }

            this.clearOverlay();
            this.hoveredRegion = null;
        };

        setTimeout(() => {
            document.addEventListener('mousedown', this.outsideClickHandler!, true);
        }, 100);
    }

    protected renderEditWidget(region: MathRegion): void {
        this.clearOverlay();

        setTimeout(() => {
            const editWidget = new MathEditWidget(
                region,
                this.view,
                (content: string) => this.handleSave(region, content),
                () => this.handleCancel(),
            );

            const dom = editWidget.toDOM();

            dom.style.visibility = 'hidden';
            dom.style.left = '0px';
            dom.style.top = '0px';

            document.body.appendChild(dom);
            this.currentOverlay = dom;

            setTimeout(() => {
                if (!this.currentOverlay) return;

                const domRect = dom.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                const padding = 16;

                const left = Math.max(padding, (viewportWidth - domRect.width) / 2);
                const top = Math.max(50, (viewportHeight - domRect.height) / 2);

                dom.style.left = `${left}px`;
                dom.style.top = `${top}px`;
                dom.style.visibility = 'visible';
            }, 50);

            this.view.dispatch({
                effects: setMathEditRegion.of({ from: region.from, to: region.to }),
            });

            this.outsideClickHandler = (e: MouseEvent) => {
                const target = e.target as Element;

                if (this.currentOverlay && (this.currentOverlay.contains(target) || this.isClickInMathLiveUI(target))) {
                    return;
                }

                this.handleCancel();
            };

            setTimeout(() => {
                document.addEventListener('mousedown', this.outsideClickHandler!, true);
            }, 100);
        }, 0);
    }

    private handleSave(region: MathRegion, newContent: string): void {
        const shouldUnescapeAmp = () => {
            if (region.fileType === 'typst') return true;

            if (region.fileType !== 'latex') return false;

            if (!region.delimiterStart.startsWith('\\begin{')) return false;

            return (
                region.delimiterStart.includes('{align') ||
                region.delimiterStart.includes('{aligned') ||
                region.delimiterStart.includes('{array') ||
                region.delimiterStart.includes('{matrix') ||
                region.delimiterStart.includes('{pmatrix') ||
                region.delimiterStart.includes('{bmatrix') ||
                region.delimiterStart.includes('{Bmatrix') ||
                region.delimiterStart.includes('{vmatrix') ||
                region.delimiterStart.includes('{Vmatrix') ||
                region.delimiterStart.includes('{cases')
            );
        };

        const normalizedContent = shouldUnescapeAmp()
            ? newContent.replace(/\\&/g, '&')
            : newContent;

        const isRowEdit = region.replaceFrom !== region.from || region.replaceTo !== region.to;

        const insert = isRowEdit
            ? `${region.leadingWS || ''}${normalizedContent}${region.trailingWS || ''}`
            : (() => {
                const isBeginEndEnv =
                    region.fileType === 'latex' &&
                    region.delimiterStart.startsWith('\\begin{') &&
                    region.delimiterEnd.startsWith('\\end{');

                const leading = isBeginEndEnv ? (region.leadingWS || '\n') : region.leadingWS;
                const trailing = isBeginEndEnv ? (region.trailingWS || '\n') : region.trailingWS;

                return `${region.delimiterStart}${leading}${normalizedContent}${trailing}${region.delimiterEnd}`;
            })();

        this.view.dispatch({
            changes: {
                from: isRowEdit ? region.replaceFrom : region.from,
                to: isRowEdit ? region.replaceTo : region.to,
                insert
            },
        });

        setTimeout(() => {
            this.view.dispatch({
                effects: [
                    setEditingRegion.of(null),
                    setMathEditRegion.of(null),
                    setMathDecorations.of(Decoration.none),
                ],
            });

            this.clearOverlay();
            this.view.focus();
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

            this.clearOverlay();
            this.view.focus();
        }, 0);
    }

    private clearOverlay(): void {
        if (this.outsideClickHandler) {
            document.removeEventListener('mousedown', this.outsideClickHandler, true);
            this.outsideClickHandler = null;
        }

        if (this.currentOverlay) {
            this.currentOverlay.remove();
            this.currentOverlay = null;

            setTimeout(() => {
                if (this.isDestroyed) return;
                this.view.dispatch({
                    effects: setMathEditRegion.of(null),
                });
            }, 0);
        }
    }

    destroy(): void {
        this.isDestroyed = true;

        if (this.checkTimer) {
            clearTimeout(this.checkTimer);
            this.checkTimer = null;
        }
        this.clearOverlay();
    }
}

if (typeof window !== 'undefined') {
    document.addEventListener('mousemove', (e) => {
        (window as any).lastMouseEvent = e;
    });
}

let mathLiveFontsConfigured = false;

export function createMathLiveExtension(
    fileType: 'latex' | 'typst',
    previewMode: 'hover' | 'cursor' | 'hover-cursor' | 'never' = 'hover-cursor',
    locale: string
): Extension {
    if (!mathLiveFontsConfigured) {
        MathfieldElement.fontsDirectory = `${BASE_PATH}/assets/fonts/`;
        MathfieldElement.locale = normalizeLocale(locale);
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
    ];
}

function normalizeLocale(locale: string): string {
    const normalized = locale.trim().replace(/_/g, '-').toLowerCase();

    const map: Record<string, string> = {
        zh: 'zh-cn',
    };

    const base = normalized.split('-').slice(0, 2).join('-');
    return map[base] ?? normalized;
}

export function updateMathLiveFileType(view: EditorView, fileType: 'latex' | 'typst'): void {
    view.dispatch({
        effects: setFileType.of(fileType),
    });
}

export function updateMathLivePreviewMode(
    view: EditorView,
    previewMode: 'hover' | 'cursor' | 'hover-cursor' | 'never',
): void {
    view.dispatch({
        effects: setPreviewMode.of(previewMode),
    });
}
