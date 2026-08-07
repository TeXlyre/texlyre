// src/hooks/editor/editorEvents.ts
import type { RefObject } from 'react';
import type { EditorView as CompatEditorView } from 'codemirror';
import { EditorView as CMEditorView } from '@codemirror/view';

import { createNamedLogger } from '@/logging';

const moduleLog = createNamedLogger('EditorEvents');

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
	viewRef: RefObject<CompatEditorView | null>,
	opts: EditorEventHandlerOptions,
) => {
	const {
		isViewOnly,
		isEditingFile,
		currentFileId,
		documentId,
		enableComments,
		updateComments,
		saveFileToStorage,
		saveDocumentToLinkedFile,
		setShowSaveIndicator,
	} = opts;

	const refreshCommentsSoon = (delay = 50) => {
		setTimeout(() => {
			if (!viewRef.current) return;
			updateComments(viewRef.current.state.doc.toString());
		}, delay);
	};

	const locateCommentTags = (content: string, commentId: string) => {
		const openTagRegex = new RegExp(
			`<###(?:\\s|%)*comment(?:\\s|%)*id:(?:\\s|%)*${commentId}`,
			'g',
		);

		const openMatch = openTagRegex.exec(content);
		if (!openMatch) return null;

		const openTagStart =
			openMatch.index > 0 && content[openMatch.index - 1] === '`'
				? openMatch.index - 1
				: openMatch.index;

		const openTagCoreEnd = content.indexOf('###>', openMatch.index) + 4;
		if (openTagCoreEnd < 4) return null;

		const openTagEnd =
			content[openTagCoreEnd] === '`' ? openTagCoreEnd + 1 : openTagCoreEnd;

		const closeTagRegex = new RegExp(
			`<\\/###(?:\\s|%)*comment(?:\\s|%)*id:(?:\\s|%)*${commentId}(?:\\s|%)*###>`,
			'g',
		);
		closeTagRegex.lastIndex = openTagEnd;

		const closeMatch = closeTagRegex.exec(content);
		if (!closeMatch) return null;

		const closeTagStart =
			content[closeMatch.index - 1] === '`'
				? closeMatch.index - 1
				: closeMatch.index;

		const closeTagCoreEnd = closeMatch.index + closeMatch[0].length;

		const closeTagEnd =
			content[closeTagCoreEnd] === '`' ? closeTagCoreEnd + 1 : closeTagCoreEnd;

		return { openTagStart, openTagEnd, closeTagStart, closeTagEnd };
	};

	const handleCommentResponseAdded = (event: Event) => {
		const customEvent = event as CustomEvent<{
			commentId: string;
			rawComment: { openTag: string; closeTag: string };
		}>;

		if (!viewRef.current || isViewOnly || !enableComments) return;

		try {
			const { commentId, rawComment } = customEvent.detail;
			const view = viewRef.current;
			const tags = locateCommentTags(view.state.doc.toString(), commentId);

			if (!tags) {
				moduleLog.warn('Comment tags not found, skipping response');
				return;
			}

			view.dispatch({
				changes: [
					{
						from: tags.openTagStart,
						to: tags.openTagEnd,
						insert: rawComment.openTag,
					},
					{
						from: tags.closeTagStart,
						to: tags.closeTagEnd,
						insert: rawComment.closeTag,
					},
				],
			});

			refreshCommentsSoon(10);
		} catch (error) {
			moduleLog.error('Error processing comment response:', error);
		}
	};

	const handleCommentDelete = (event: Event) => {
		const customEvent = event as CustomEvent<{ commentId: string }>;

		if (!viewRef.current || isViewOnly || !enableComments) return;

		try {
			const view = viewRef.current;
			const tags = locateCommentTags(
				view.state.doc.toString(),
				customEvent.detail.commentId,
			);

			if (!tags) {
				moduleLog.warn('Comment tags not found, skipping deletion');
				return;
			}

			view.dispatch({
				changes: [
					{ from: tags.openTagStart, to: tags.openTagEnd, insert: '' },
					{ from: tags.closeTagStart, to: tags.closeTagEnd, insert: '' },
				],
			});

			refreshCommentsSoon();
		} catch (error) {
			moduleLog.error('Error processing comment deletion:', error);
		}
	};

	const handleCommentUpdate = (event: Event) => {
		const customEvent = event as CustomEvent<{
			commentId: string;
			rawComment: { openTag: string; closeTag: string };
		}>;

		if (!viewRef.current || isViewOnly || !enableComments) return;

		try {
			const { commentId, rawComment } = customEvent.detail;
			const view = viewRef.current;
			const tags = locateCommentTags(view.state.doc.toString(), commentId);

			if (!tags) {
				moduleLog.warn('Comment tags not found, skipping update');
				return;
			}

			view.dispatch({
				changes: [
					{
						from: tags.openTagStart,
						to: tags.openTagEnd,
						insert: rawComment.openTag,
					},
					{
						from: tags.closeTagStart,
						to: tags.closeTagEnd,
						insert: rawComment.closeTag,
					},
				],
			});

			refreshCommentsSoon();
		} catch (error) {
			moduleLog.error('Error processing comment update:', error);
		}
	};

	const handleGotoLine = (event: Event) => {
		const customEvent = event as CustomEvent<{
			line?: number;
			fileId?: string;
			documentId?: string;
			tabId?: string;
			attempt?: number;
		}>;

		if (!viewRef.current) return;

		try {
			const {
				line,
				fileId,
				documentId: eventDocId,
				tabId,
				attempt = 0,
			} = customEvent.detail;
			const view = viewRef.current;
			const doc = view.state.doc;

			if (tabId) {
				const isTargetFile =
					isEditingFile && fileId && currentFileId === fileId;
				const isTargetDoc =
					!isEditingFile && eventDocId && documentId === eventDocId;

				if (!isTargetFile && !isTargetDoc) return;
			} else if (isEditingFile) {
				if (fileId && currentFileId && currentFileId !== fileId) return;
			} else if (eventDocId && documentId && eventDocId !== documentId) {
				return;
			}

			if (line && line > 0) {
				if (line > doc.lines && attempt < 40) {
					setTimeout(() => {
						document.dispatchEvent(
							new CustomEvent('codemirror-goto-line', {
								detail: { ...customEvent.detail, attempt: attempt + 1 },
							}),
						);
					}, 100);
					return;
				}

				const lineNumber = Math.max(1, Math.min(line, doc.lines)) - 1;
				const linePos = doc.line(lineNumber + 1).from;

				view.dispatch({
					selection: { anchor: linePos, head: linePos },
					effects: [CMEditorView.scrollIntoView(linePos, { y: 'center' })],
				});

				view.focus();
			}
		} catch (error) {
			moduleLog.error('Error in Codemirror line navigation:', error);
		}
	};

	const handleGotoChar = (event: Event) => {
		const customEvent = event as CustomEvent<{
			position?: number;
			fileId?: string;
			documentId?: string;
			tabId?: string;
		}>;

		if (!viewRef.current) return;

		try {
			const {
				position,
				fileId,
				documentId: eventDocId,
				tabId,
			} = customEvent.detail;
			const view = viewRef.current;
			const doc = view.state.doc;

			if (tabId) {
				const isTargetFile =
					isEditingFile && fileId && currentFileId === fileId;
				const isTargetDoc =
					!isEditingFile && eventDocId && documentId === eventDocId;

				if (!isTargetFile && !isTargetDoc) return;
			} else if (isEditingFile) {
				if (fileId && currentFileId && currentFileId !== fileId) return;
			} else if (eventDocId && documentId && eventDocId !== documentId) {
				return;
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
			moduleLog.error('Error in Codemirror character navigation:', error);
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
		const {
			fileId: eventFileId,
			documentId: eventDocumentId,
			isFile,
		} = customEvent.detail;

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
