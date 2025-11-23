// src/extensions/codemirror/toolbar/codemirrorItems.tsx
import type { EditorView } from '@codemirror/view';
import type { ToolbarItem } from 'codemirror-toolbar';
import { renderToString } from 'react-dom/server';
import { undo, redo } from '@codemirror/commands';

import { ExpandIcon, MinimizeIcon, UndoIcon, RedoIcon } from '../../../components/common/Icons';

export const createUndo = (): ToolbarItem => ({
    label: 'Undo',
    key: 'undo',
    icon: renderToString(<UndoIcon />),
    command: (view: EditorView) => undo(view),
});

export const createRedo = (): ToolbarItem => ({
    label: 'Redo',
    key: 'redo',
    icon: renderToString(<RedoIcon />),
    command: (view: EditorView) => redo(view),
});

export const createFullScreen = (isFullScreen: boolean): ToolbarItem => ({
    label: isFullScreen ? 'Exit Full Screen' : 'Full Screen',
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