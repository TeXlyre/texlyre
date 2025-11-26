
// src/extensions/codemirror/toolbar/colorScopeItems.tsx
import { t } from '@/i18n';
import type { EditorView } from '@codemirror/view';
import type { ToolbarItem } from 'codemirror-toolbar';
import { renderToString } from 'react-dom/server';

import { detectColorScope, type ColorInfo, type FileType } from './colorScope';
import { ColorPicker } from './colorPicker';
import { EditIcon, TrashIcon } from '../../../components/common/Icons';

const colorPickers = new WeakMap<EditorView, ColorPicker>();

function removeColor(view: EditorView, info: ColorInfo): boolean {
    const doc = view.state.doc.toString();
    const content = doc.substring(info.contentStart, info.contentEnd - 1);

    view.dispatch({
        changes: { from: info.start, to: info.contentEnd, insert: content },
    });

    view.focus();
    return true;
}

function editColor(view: EditorView, info: ColorInfo, newColor: string): boolean {
    const doc = view.state.doc.toString();

    if (info.fileType === 'latex') {
        const prefix = info.type === 'text'
            ? `\\textcolor[HTML]{${newColor.substring(1)}}{`
            : `\\colorbox{${newColor}}{`;
        const content = doc.substring(info.contentStart, info.contentEnd - 1);
        const newText = `${prefix}${content}}`;

        view.dispatch({
            changes: { from: info.start, to: info.contentEnd, insert: newText },
        });
    } else {
        const prefix = info.type === 'text'
            ? `#text(fill: rgb("${newColor}"))[`
            : `#highlight(fill: rgb("${newColor}"))[`;
        const content = doc.substring(info.contentStart, info.contentEnd - 1);
        const newText = `${prefix}${content}]`;

        view.dispatch({
            changes: { from: info.start, to: info.contentEnd, insert: newText },
        });
    }

    view.focus();
    return true;
}

export const createColorEdit = (fileType: FileType): ToolbarItem => ({
    key: `${fileType}-color-edit`,
    label: t('Edit Color'),
    icon: renderToString(<EditIcon />),
    command: (view: EditorView): boolean => {
        const info = detectColorScope(view, fileType);
        if (!info) return false;

        const toolbar = view.dom.querySelector('.codemirror-toolbar');
        if (!toolbar) return false;

        const button = toolbar.querySelector(`[data-item="${fileType}-color-edit"]`) as HTMLElement;
        if (!button) return false;

        let picker = colorPickers.get(view);

        if (picker && !document.body.contains(picker.container) && !toolbar.contains(picker.container)) {
            picker.destroy();
            colorPickers.delete(view);
            picker = null;
        }

        if (!picker) {
            picker = new ColorPicker(view, button, {
                onSelect: (v, color) => {
                    const currentInfo = detectColorScope(v, fileType);
                    if (currentInfo) {
                        editColor(v, currentInfo, color);
                    }
                },
            });
            colorPickers.set(view, picker);
        }

        picker.toggle();
        return true;
    },
});

export const createColorRemove = (fileType: FileType): ToolbarItem => ({
    key: `${fileType}-color-remove`,
    label: t('Remove Color'),
    icon: renderToString(<TrashIcon />),
    command: (view: EditorView): boolean => {
        const info = detectColorScope(view, fileType);
        if (!info) return false;
        return removeColor(view, info);
    },
});