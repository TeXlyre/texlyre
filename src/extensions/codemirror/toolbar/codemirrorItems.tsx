// src/extensions/codemirror/toolbar/codemirrorItems.tsx
import { t } from '@/i18n';
import type { EditorView } from '@codemirror/view';
import type { ToolbarItem } from 'codemirror-toolbar';
import { renderToString } from 'react-dom/server';
import { undo, redo } from '@codemirror/commands';
import type { UndoManager } from 'yjs';

import { ExpandIcon, MinimizeIcon, UndoIcon, RedoIcon } from '../../../components/common/Icons';

export const createUndo = (undoManager?: UndoManager): ToolbarItem => ({
    label: t('Undo'),
    key: 'undo',
    icon: renderToString(<UndoIcon />),
    command: (view: EditorView) => {
        if (undoManager) {
            undoManager.undo();
            return true;
        }
        return undo(view);
    },
});

export const createRedo = (undoManager?: UndoManager): ToolbarItem => ({
    label: t('Redo'),
    key: 'redo',
    icon: renderToString(<RedoIcon />),
    command: (view: EditorView) => {
        if (undoManager) {
            undoManager.redo();
            return true;
        }
        return redo(view);
    },
});

export const createFullScreen = (isFullScreen: boolean): ToolbarItem => ({
    label: isFullScreen ? t('Exit Fullscreen') : t('Fullscreen'),
    key: 'fullScreen',
    icon: renderToString(isFullScreen ? <MinimizeIcon /> : <ExpandIcon />),
    command: (view: EditorView) => {
        if (view.dom.ownerDocument.fullscreenElement) {
            view.dom.ownerDocument.exitFullscreen();
        } else {
            view.dom.requestFullscreen();
        }
        return true;
    },
});