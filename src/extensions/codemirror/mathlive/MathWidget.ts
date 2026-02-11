import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { WidgetType } from '@codemirror/view';
import type { EditorView } from '@codemirror/view';
import { MathfieldElement } from 'mathlive';

import { EditIcon } from '../../../components/common/Icons';
import type { MathRegion } from './MathDetector';


const renderIcon = (IconComponent: React.FC<any>, props = {}) => {
    return renderToStaticMarkup(createElement(IconComponent, props));
};

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
        const wrapper = document.createElement('div');
        wrapper.className = `cm-math-preview-overlay cm-math-${this.region.type}`;

        const mf = new MathfieldElement();
        mf.readOnly = true;
        mf.className = 'cm-math-preview-field';

        wrapper.appendChild(mf);

        setTimeout(() => {
            mf.value = this.region.content;
            mf.menuItems = [];
        }, 0);

        const editBtn = document.createElement('button');
        editBtn.innerHTML = renderIcon(EditIcon, {});;
        editBtn.className = 'cm-math-edit-btn';
        editBtn.title = 'Edit equation';

        editBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.onEdit();
        });

        wrapper.appendChild(editBtn);

        return wrapper;
    }

    ignoreEvent(event: Event): boolean {
        return event.type === 'mousedown' || event.type === 'click';
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
        wrapper.className = 'cm-math-editor-overlay';

        const mathfield = new MathfieldElement();
        mathfield.readOnly = false;
        mathfield.className = 'cm-math-editor-field';

        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'cm-math-editor-buttons';

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save';
        saveBtn.className = 'cm-math-editor-btn cm-math-editor-btn-save';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'cm-math-editor-btn cm-math-editor-btn-cancel';

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

        buttonContainer.appendChild(cancelBtn);
        buttonContainer.appendChild(saveBtn);

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