// src/hooks/editor/editorEvents.ts
import type { MutableRefObject } from 'react';
import type { EditorView as CompatEditorView } from 'codemirror';
import { EditorView as CMEditorView } from '@codemirror/view';

interface EditorEventHandlerOptions {
    isViewOnly: boolean;
    isEditingFile: boolean;
    currentFileId?: string;
    documentId?: string;
    enableComments: boolean;
    updateComments: (content: string) => void;
    saveFileToStorage: (content: string) => void | Promise<void>;
    saveDocumentToLinkedFile: (content: string) => void | Promise<void>;
    setShowSaveIndicator: (value: boolean) => void;
}

export const registerEditorEventHandlers = (
    viewRef: MutableRefObject<CompatEditorView | null>,
    opts: EditorEventHandlerOptions,
) => {
    const {
        isViewOnly,
        isEditingFile,
        currentFileId,
        documentId,
        enableComments, // currently just part of the shape; logic is in main hook
        updateComments,
        saveFileToStorage,
        saveDocumentToLinkedFile,
        setShowSaveIndicator,
    } = opts;

    const handleCommentResponseAdded = (event: Event) => {
        const customEvent = event as CustomEvent<{
            commentId: string;
            rawComment: { openTag: string; closeTag: string };
        }>;

        if (!viewRef.current || isViewOnly) return;

        try {
            const { commentId, rawComment } = customEvent.detail;
            const view = viewRef.current;
            const currentContent = view.state.doc.toString();

            const openTagRegex = new RegExp(
                `<###(?:\\s|%)*comment(?:\\s|%)*id:(?:\\s|%)*${commentId}`,
                'g',
            );
            const openMatch = openTagRegex.exec(currentContent);

            if (!openMatch) return;

            let openTagStart = openMatch.index;
            const backtickBefore =
                openTagStart > 0 && currentContent[openTagStart - 1] === '`';

            if (backtickBefore) {
                openTagStart = openTagStart - 1;
            }

            const openTagCoreEnd =
                currentContent.indexOf('###>', openMatch.index) + 4;
            const backtickAfter =
                openTagCoreEnd < currentContent.length &&
                currentContent[openTagCoreEnd] === '`';

            const openTagEnd = backtickAfter
                ? openTagCoreEnd + 1
                : openTagCoreEnd;

            const closeTagRegex = new RegExp(
                `<\\/###(?:\\s|%)*comment(?:\\s|%)*id:(?:\\s|%)*${commentId}(?:\\s|%)*###>`,
                'g',
            );
            closeTagRegex.lastIndex = openTagEnd;
            const closeMatch = closeTagRegex.exec(currentContent);

            if (!closeMatch) return;

            let closeTagStart = closeMatch.index;
            const closeTagBeforeBacktick =
                closeTagStart > 0 && currentContent[closeTagStart - 1] === '`';

            if (closeTagBeforeBacktick) {
                closeTagStart = closeTagStart - 1;
            }

            const closeTagCoreEnd = closeMatch.index + closeMatch[0].length;
            const closeTagAfterBacktick =
                closeTagCoreEnd < currentContent.length &&
                currentContent[closeTagCoreEnd] === '`';

            const closeTagEnd = closeTagAfterBacktick
                ? closeTagCoreEnd + 1
                : closeTagCoreEnd;

            const commentedTextStart = backtickAfter
                ? openTagCoreEnd + 1
                : openTagCoreEnd;
            const commentedTextEnd = closeTagBeforeBacktick
                ? closeTagStart
                : closeMatch.index;

            const commentedText = currentContent.slice(
                commentedTextStart,
                commentedTextEnd,
            );

            const newContent = `${rawComment.openTag}${commentedText}${rawComment.closeTag}`;

            const transaction = view.state.update({
                changes: [
                    {
                        from: openTagStart,
                        to: closeTagEnd,
                        insert: newContent,
                    },
                ],
            });

            view.dispatch(transaction);

            setTimeout(() => {
                if (viewRef.current) {
                    const finalContent = viewRef.current.state.doc.toString();
                    updateComments(finalContent);
                }
            }, 10);
        } catch (error) {
            console.error('Error processing comment response:', error);
        }
    };

    const handleCommentDelete = (event: Event) => {
        const customEvent = event as CustomEvent<{
            openTagStart: number;
            openTagEnd: number;
            closeTagStart: number;
            closeTagEnd: number;
        }>;

        if (!viewRef.current || isViewOnly) return;

        try {
            const { openTagStart, openTagEnd, closeTagStart, closeTagEnd } =
                customEvent.detail;
            const view = viewRef.current;

            const transaction = view.state.update({
                changes: [
                    { from: closeTagStart, to: closeTagEnd },
                    { from: openTagStart, to: openTagEnd },
                ],
            });

            view.dispatch(transaction);

            setTimeout(() => {
                if (viewRef.current) {
                    const updatedContent = viewRef.current.state.doc.toString();
                    updateComments(updatedContent);
                }
            }, 50);
        } catch (error) {
            console.error('Error processing comment deletion:', error);
        }
    };

    const handleCommentUpdate = (event: Event) => {
        const customEvent = event as CustomEvent<{
            openTagStart: number;
            openTagEnd: number;
            closeTagStart: number;
            closeTagEnd: number;
            rawComment: { openTag: string; closeTag: string };
        }>;

        if (!viewRef.current || isViewOnly) return;

        try {
            const {
                openTagStart,
                openTagEnd,
                closeTagStart,
                closeTagEnd,
                rawComment,
            } = customEvent.detail;
            const view = viewRef.current;

            const transaction = view.state.update({
                changes: [
                    {
                        from: closeTagStart,
                        to: closeTagEnd,
                        insert: rawComment.closeTag,
                    },
                    { from: openTagStart, to: openTagEnd, insert: rawComment.openTag },
                ],
            });

            view.dispatch(transaction);

            setTimeout(() => {
                if (viewRef.current) {
                    const updatedContent = viewRef.current.state.doc.toString();
                    updateComments(updatedContent);
                }
            }, 50);
        } catch (error) {
            console.error('Error processing comment update:', error);
        }
    };

    const handleGotoLine = (event: Event) => {
        const customEvent = event as CustomEvent<{
            line?: number;
            fileId?: string;
            filePath?: string;
            documentId?: string;
            tabId?: string;
        }>;
        if (!viewRef.current) return;

        try {
            const { line, fileId, filePath, documentId: eventDocId, tabId } =
                customEvent.detail;
            const view = viewRef.current;
            const doc = view.state.doc;

            if (
                isEditingFile &&
                fileId &&
                currentFileId &&
                currentFileId !== fileId
            ) {
                return;
            }

            if (!isEditingFile && filePath && documentId && !filePath.includes(documentId)) {
                return;
            }

            if (tabId) {
                const isTargetFile =
                    isEditingFile && fileId && currentFileId === fileId;
                const isTargetDoc =
                    !isEditingFile && eventDocId && documentId === eventDocId;

                if (!isTargetFile && !isTargetDoc) return;
            }

            if (line && line > 0) {
                const lineNumber = Math.max(1, Math.min(line, doc.lines)) - 1;
                const linePos = doc.line(lineNumber + 1).from;

                view.dispatch({
                    selection: { anchor: linePos, head: linePos },
                    effects: [CMEditorView.scrollIntoView(linePos, { y: 'center' })],
                });

                view.focus();
            }
        } catch (error) {
            console.error('Error in Codemirror line navigation:', error);
        }
    };

    const handleGotoChar = (event: Event) => {
        const customEvent = event as CustomEvent<{
            position?: number;
            fileId?: string;
            filePath?: string;
            documentId?: string;
            tabId?: string;
        }>;
        if (!viewRef.current) return;

        try {
            const { position, fileId, filePath, documentId: eventDocId, tabId } =
                customEvent.detail;
            const view = viewRef.current;
            const doc = view.state.doc;

            if (tabId) {
                const isTargetFile =
                    isEditingFile && fileId && currentFileId === fileId;
                const isTargetDoc =
                    !isEditingFile && eventDocId && documentId === eventDocId;

                if (!isTargetFile && !isTargetDoc) return;
            } else {
                if (
                    isEditingFile &&
                    fileId &&
                    currentFileId &&
                    currentFileId !== fileId
                ) {
                    return;
                }

                if (!isEditingFile && filePath && documentId && !filePath.includes(documentId)) {
                    return;
                }
            }

            if (position !== undefined && position >= 0) {
                const validPosition = Math.max(0, Math.min(position, doc.length));

                view.dispatch({
                    selection: { anchor: validPosition, head: validPosition },
                    effects: [
                        CMEditorView.scrollIntoView(validPosition, { y: 'center' }),
                    ],
                });

                view.focus();
            }
        } catch (error) {
            console.error('Error in Codemirror character navigation:', error);
        }
    };

    const handleFileSaved = (event: Event) => {
        const customEvent = event as CustomEvent<{ fileId?: string }>;
        const { fileId: eventFileId } = customEvent.detail;

        if (eventFileId === currentFileId && isEditingFile) {
            setShowSaveIndicator(true);
            setTimeout(() => setShowSaveIndicator(false), 1500);
        }
    };

    const handleTriggerSave = (event: Event) => {
        const customEvent = event as CustomEvent<{
            fileId?: string;
            documentId?: string;
            isFile: boolean;
        }>;

        if (!viewRef.current || isViewOnly) return;

        const content = viewRef.current.state.doc.toString();
        const { fileId: eventFileId, documentId: eventDocumentId, isFile } =
            customEvent.detail;

        if (isFile && eventFileId === currentFileId && isEditingFile) {
            void saveFileToStorage(content);
        } else if (!isFile && eventDocumentId === documentId && !isEditingFile) {
            void saveDocumentToLinkedFile(content);
        }
    };

    document.addEventListener(
        'comment-response-added',
        handleCommentResponseAdded,
    );
    document.addEventListener('comment-delete', handleCommentDelete);
    document.addEventListener('comment-update', handleCommentUpdate);
    document.addEventListener('codemirror-goto-line', handleGotoLine);
    document.addEventListener('codemirror-goto-char', handleGotoChar);
    document.addEventListener('file-saved', handleFileSaved);
    document.addEventListener('trigger-save', handleTriggerSave);

    return () => {
        document.removeEventListener(
            'comment-response-added',
            handleCommentResponseAdded,
        );
        document.removeEventListener('comment-delete', handleCommentDelete);
        document.removeEventListener('comment-update', handleCommentUpdate);
        document.removeEventListener('codemirror-goto-line', handleGotoLine);
        document.removeEventListener('codemirror-goto-char', handleGotoChar);
        document.removeEventListener('file-saved', handleFileSaved);
        document.removeEventListener('trigger-save', handleTriggerSave);
    };
};
