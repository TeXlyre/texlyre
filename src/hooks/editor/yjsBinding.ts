// src/hooks/editor/yjsBinding.ts
import type * as Y from 'yjs';
import type { MutableRefObject } from 'react';
import type { EditorView } from 'codemirror';

interface YjsBindingOptions {
    enableComments: boolean;
    onUpdateContent: (content: string) => void;
    updateComments: (content: string) => void;
    autoSaveRef: MutableRefObject<(() => void) | null>;
    isUpdatingRef: MutableRefObject<boolean>;
    viewRef: MutableRefObject<EditorView | null>;
    hasEmittedReadyRef: MutableRefObject<boolean>;
    currentFileId?: string;
    documentId?: string;
    isEditingFile: boolean;
}

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
