import { WidgetType } from '@codemirror/view';
import type { EditorView } from '@codemirror/view';
import type { MathRegion } from './MathDetector';
import { MathfieldElement } from 'mathlive';

export class MathPreviewWidget extends WidgetType {
    constructor(
        private region: MathRegion,
        private onEdit: () => void,
    ) {
        super();
    }

    eq(other: MathPreviewWidget): boolean {
        return (
            this.region.from === other.region.from &&
            this.region.to === other.region.to &&
            this.region.content === other.region.content
        );
    }

    toDOM(): HTMLElement {
        const wrapper = document.createElement('span');
        wrapper.className = `cm-math-preview cm-math-${this.region.type}`;
        wrapper.style.position = 'relative';
        wrapper.style.display = this.region.type === 'display' ? 'block' : 'inline-block';

        const mf = new MathfieldElement();
        mf.readOnly = true;
        mf.style.display = this.region.type === 'display' ? 'block' : 'inline-block';
        mf.style.fontSize = 'inherit';

        wrapper.appendChild(mf);

        setTimeout(() => {
            mf.value = this.region.content;
            mf.menuItems = [];
        }, 0);

        const editBtn = document.createElement('button');
        editBtn.textContent = '✏️';
        editBtn.className = 'cm-math-edit-btn';
        editBtn.style.position = 'absolute';
        editBtn.style.top = '2px';
        editBtn.style.right = '2px';
        editBtn.style.padding = '2px 6px';
        editBtn.style.fontSize = '12px';
        editBtn.style.border = '1px solid var(--pico-muted-border-color)';
        editBtn.style.borderRadius = '4px';
        editBtn.style.backgroundColor = 'var(--pico-background-color)';
        editBtn.style.cursor = 'pointer';
        editBtn.style.opacity = '0';
        editBtn.style.transition = 'opacity 0.2s';
        editBtn.title = 'Edit equation';

        editBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.onEdit();
        });

        wrapper.addEventListener('mouseenter', () => {
            editBtn.style.opacity = '1';
        });

        wrapper.addEventListener('mouseleave', () => {
            editBtn.style.opacity = '0';
        });

        wrapper.appendChild(editBtn);

        return wrapper;
    }

    ignoreEvent(event: Event): boolean {
        return event.type === 'mousedown';
    }
}

export class MathEditWidget extends WidgetType {
    private mathfield: MathfieldElement | null = null;

    constructor(
        private region: MathRegion,
        private view: EditorView,
        private onSave: (content: string) => void,
        private onCancel: () => void,
    ) {
        super();
    }

    eq(other: MathEditWidget): boolean {
        return false;
    }

    toDOM(): HTMLElement {
        const wrapper = document.createElement('div');
        wrapper.className = 'cm-math-editor';
        wrapper.style.display = this.region.type === 'display' ? 'block' : 'inline-block';
        wrapper.style.margin = this.region.type === 'display' ? '8px 0' : '0';

        const mathfield = new MathfieldElement();
        mathfield.style.display = 'block';
        mathfield.style.minWidth = this.region.type === 'display' ? '100%' : '200px';
        mathfield.style.padding = '8px';
        mathfield.style.border = '2px solid var(--pico-primary)';
        mathfield.style.borderRadius = '4px';
        mathfield.style.backgroundColor = 'var(--pico-background-color)';

        const buttonContainer = document.createElement('div');
        buttonContainer.style.marginTop = '4px';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '8px';

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save';
        saveBtn.style.padding = '4px 12px';
        saveBtn.style.fontSize = '12px';
        saveBtn.style.border = '1px solid var(--pico-primary)';
        saveBtn.style.borderRadius = '4px';
        saveBtn.style.backgroundColor = 'var(--pico-primary)';
        saveBtn.style.color = 'var(--pico-primary-inverse)';
        saveBtn.style.cursor = 'pointer';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.padding = '4px 12px';
        cancelBtn.style.fontSize = '12px';
        cancelBtn.style.border = '1px solid var(--pico-muted-border-color)';
        cancelBtn.style.borderRadius = '4px';
        cancelBtn.style.backgroundColor = 'var(--pico-background-color)';
        cancelBtn.style.cursor = 'pointer';

        saveBtn.addEventListener('click', () => {
            this.onSave(mathfield.value);
        });

        cancelBtn.addEventListener('click', () => {
            this.onCancel();
        });

        mathfield.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                this.onCancel();
            }
        });

        buttonContainer.appendChild(saveBtn);
        buttonContainer.appendChild(cancelBtn);

        wrapper.appendChild(mathfield);
        wrapper.appendChild(buttonContainer);
        this.mathfield = mathfield;

        setTimeout(() => {
            mathfield.value = this.region.content;
            mathfield.focus();
        }, 0);

        return wrapper;
    }

    destroy(): void {
        if (this.mathfield) {
            this.mathfield = null;
        }
    }

    ignoreEvent(): boolean {
        return true;
    }
}