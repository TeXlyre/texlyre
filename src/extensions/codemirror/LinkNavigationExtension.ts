// src/extensions/codemirror/linkNavigationExtention.ts
import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

import { LinkDetector, type DetectedLink } from './linkNavigation/LinkDetector';
import { LinkNavigator } from './linkNavigation/LinkNavigator';

const setCurrentFilePath = StateEffect.define<string>();
const setFileName = StateEffect.define<string>();
const highlightLink = StateEffect.define<{ from: number; to: number } | null>();

const currentFilePathField = StateField.define<string>({
    create() {
        return '';
    },
    update(path, tr) {
        for (const effect of tr.effects) {
            if (effect.is(setCurrentFilePath)) {
                return effect.value;
            }
        }
        return path;
    }
});

const fileNameField = StateField.define<string>({
    create() {
        return '';
    },
    update(name, tr) {
        for (const effect of tr.effects) {
            if (effect.is(setFileName)) {
                return effect.value;
            }
        }
        return name;
    }
});

const linkMark = Decoration.mark({
    class: 'cm-link-hover'
});

const linkHighlightField = StateField.define<DecorationSet>({
    create() {
        return Decoration.none;
    },
    update(decorations, tr) {
        decorations = decorations.map(tr.changes);

        for (const effect of tr.effects) {
            if (effect.is(highlightLink)) {
                if (effect.value) {
                    const decoration = linkMark.range(effect.value.from, effect.value.to);
                    decorations = Decoration.set([decoration]);
                } else {
                    decorations = Decoration.none;
                }
            }
        }

        return decorations;
    },
    provide: field => EditorView.decorations.from(field)
});

class LinkNavigationPlugin {
    private detector: LinkDetector;
    private navigator: LinkNavigator;
    private currentLink: DetectedLink | null = null;
    private ctrlPressed: boolean = false;

    constructor(private view: EditorView) {
        this.detector = new LinkDetector();
        this.navigator = new LinkNavigator();

        this.view.dom.addEventListener('mousemove', this.handleMouseMove);
        this.view.dom.addEventListener('click', this.handleClick);
        this.view.dom.addEventListener('mouseleave', this.handleMouseLeave);
        document.addEventListener('keydown', this.handleKeyDown);
        document.addEventListener('keyup', this.handleKeyUp);

        this.updateDetectorFileType();
    }

    update(update: ViewUpdate): void {
        const filePath = update.state.field(currentFilePathField, false);
        if (filePath) {
            this.navigator.setCurrentFilePath(filePath);
        }

        const fileName = update.state.field(fileNameField, false);
        if (fileName || update.docChanged || update.viewportChanged) {
            this.updateDetectorFileType();
        }
    }

    private updateDetectorFileType(): void {
        const fileName = this.view.state.field(fileNameField, false);
        const content = this.view.state.doc.toString();
        this.detector.setFileType(fileName, content);
    }

    private handleKeyDown = (event: KeyboardEvent): void => {
        if (event.key === 'Control' || event.key === 'Meta') {
            this.ctrlPressed = true;
            this.updateHighlightIfNeeded();
        }
    };

    private handleKeyUp = (event: KeyboardEvent): void => {
        if (event.key === 'Control' || event.key === 'Meta') {
            this.ctrlPressed = false;
            this.clearHighlight();
        }
    };

    private handleMouseMove = (event: MouseEvent): void => {
        const pos = this.view.posAtCoords({ x: event.clientX, y: event.clientY });
        if (pos === null) {
            this.currentLink = null;
            this.clearHighlight();
            return;
        }

        const link = this.detector.detectLinkAtPosition(this.view, pos);

        if (link) {
            const linkChanged = !this.currentLink ||
                link.from !== this.currentLink.from ||
                link.to !== this.currentLink.to;

            this.currentLink = link;

            if (this.ctrlPressed) {
                if (linkChanged) {
                    this.highlightCurrentLink();
                }
            } else {
                this.clearHighlight();
            }
        } else {
            this.currentLink = null;
            this.clearHighlight();
        }
    };

    private handleClick = async (event: MouseEvent): Promise<void> => {
        if (!this.currentLink) return;

        const isCtrlOrCmd = event.ctrlKey || event.metaKey;
        if (!isCtrlOrCmd) return;

        event.preventDefault();
        event.stopPropagation();

        await this.navigator.navigate(this.view, this.currentLink);
    };

    private handleMouseLeave = (): void => {
        this.currentLink = null;
        this.clearHighlight();
    };

    private updateHighlightIfNeeded(): void {
        if (this.currentLink && this.ctrlPressed) {
            this.highlightCurrentLink();
        }
    }

    private highlightCurrentLink(): void {
        if (!this.currentLink) return;

        this.view.dispatch({
            effects: highlightLink.of({
                from: this.currentLink.from,
                to: this.currentLink.to
            })
        });
    }

    private clearHighlight(): void {
        this.view.dispatch({
            effects: highlightLink.of(null)
        });
    }

    destroy(): void {
        this.view.dom.removeEventListener('mousemove', this.handleMouseMove);
        this.view.dom.removeEventListener('click', this.handleClick);
        this.view.dom.removeEventListener('mouseleave', this.handleMouseLeave);
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('keyup', this.handleKeyUp);
    }
}

export function createLinkNavigationExtension(fileName?: string, content?: string): Extension {
    const plugin = ViewPlugin.fromClass(LinkNavigationPlugin);

    const initialFileName = fileName || '';

    return [
        currentFilePathField,
        fileNameField.init(() => initialFileName),
        linkHighlightField,
        plugin,
        EditorView.baseTheme({
            '.cm-link-hover': {
                cursor: 'pointer',
                textDecoration: 'underline',
                textDecorationStyle: 'solid',
                textDecorationColor: 'var(--primary-color, #0066cc)'
            }
        })
    ];
}

export function updateLinkNavigationFilePath(view: EditorView, filePath: string): void {
    view.dispatch({
        effects: setCurrentFilePath.of(filePath)
    });
}

export function updateLinkNavigationFileName(view: EditorView, fileName: string): void {
    view.dispatch({
        effects: setFileName.of(fileName)
    });
}