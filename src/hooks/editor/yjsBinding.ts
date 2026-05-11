// src/hooks/editor/yjsBinding.ts
import type * as Y from 'yjs';
import type { UndoManager } from 'yjs';
import type { RefObject } from 'react';
import type { EditorView } from 'codemirror';
import type { Extension } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { Awareness } from 'y-protocols/awareness';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';

interface YjsBindingOptions {
    enableComments: boolean;
    onUpdateContent: (content: string) => void;
    updateComments: (content: string) => void;
    autoSaveRef: RefObject<(() => void) | null>;
    isUpdatingRef: RefObject<boolean>;
    viewRef: RefObject<EditorView | null>;
    hasEmittedReadyRef: RefObject<boolean>;
    currentFileId?: string;
    documentId?: string;
    isEditingFile: boolean;
}

export interface YjsEditorBindingResult {
    extensions: Extension[];
    cleanup: () => void;
}

export const createYjsEditorBindingExtensions = (
    yText: Y.Text,
    providerAwareness: Awareness | null | undefined,
    undoManager: UndoManager,
): YjsEditorBindingResult => {
    const localAwareness = providerAwareness ? null : new Awareness(yText.doc!);
    const awareness = providerAwareness ?? localAwareness!;

    return {
        extensions: [
            yCollab(yText, awareness, {
                undoManager,
            }),
            keymap.of(yUndoManagerKeymap),
        ],
        cleanup: () => {
            localAwareness?.destroy();
        },
    };
};

export const registerYjsBinding = (yText: Y.Text, opts: YjsBindingOptions) => {
    const {
        enableComments,
        onUpdateContent,
        updateComments,
        autoSaveRef,
        isUpdatingRef,
        viewRef,
        hasEmittedReadyRef,
        currentFileId,
        documentId,
        isEditingFile,
    } = opts;

    const observer = () => {
        if (isUpdatingRef.current) return;
        const content = yText.toString() || '';
        isUpdatingRef.current = true;
        try {
            onUpdateContent(content);
            if (enableComments) {
                updateComments(content);
            }
            if (autoSaveRef.current) autoSaveRef.current();

            if (!hasEmittedReadyRef.current && content && viewRef.current) {
                hasEmittedReadyRef.current = true;
                setTimeout(() => {
                    document.dispatchEvent(
                        new CustomEvent('editor-ready-yjs', {
                            detail: {
                                fileId: currentFileId,
                                documentId,
                                isEditingFile,
                            },
                        }),
                    );
                }, 50);
            }
        } finally {
            isUpdatingRef.current = false;
        }
    };

    yText.observe(observer);

    return () => {
        yText.unobserve(observer);
        isUpdatingRef.current = false;
    };
};
