// src/extensions/codemirror/toolbar/codemirrorItems.tsx
import type { EditorView } from '@codemirror/view';
import type { ToolbarItem } from 'codemirror-toolbar';
import { renderToString } from 'react-dom/server';

import { ExpandIcon } from '../../../components/common/Icons';

export const ToolbarfullScreen: ToolbarItem = {
    label: 'Full Screen',
    key: 'fullScreen',
    icon: renderToString(<ExpandIcon />),
    command: (view: EditorView) => {
        if (view.dom.ownerDocument.fullscreenElement) {
            view.dom.ownerDocument.exitFullscreen();
        } else {
            view.dom.requestFullscreen();
        }

        return true;
    },
};