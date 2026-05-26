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

const THEME_WRAP = Symbol.for('texlyre.yjsAwarenessThemeWrap');

const wrapAwarenessForTheme = (awareness: Awareness): Awareness => {
	if ((awareness as unknown as Record<symbol, boolean>)[THEME_WRAP]) {
		return awareness;
	}

	const origGetStates = awareness.getStates.bind(awareness);
	const root = document.documentElement;

	awareness.getStates = () => {
		const states = origGetStates();
		if (root.getAttribute('data-theme-mode') !== 'light') return states;

		const out = new Map<number, Record<string, unknown>>();
		states.forEach((state, clientId) => {
			const user = state?.user as
				| { color?: string; colorLight?: string }
				| undefined;
			if (user?.colorLight && user.colorLight !== user.color) {
				out.set(clientId, {
					...state,
					user: { ...user, color: user.colorLight },
				});
			} else {
				out.set(clientId, state);
			}
		});
		return out;
	};

	(awareness as unknown as Record<symbol, boolean>)[THEME_WRAP] = true;
	return awareness;
};

export const createYjsEditorBindingExtensions = (
	yText: Y.Text,
	providerAwareness: Awareness | null | undefined,
	undoManager: UndoManager,
): YjsEditorBindingResult => {
	const localAwareness = providerAwareness ? null : new Awareness(yText.doc!);
	const awareness = wrapAwarenessForTheme(providerAwareness ?? localAwareness!);

	const themeObserver = new MutationObserver(() => {
		const remoteIds = Array.from(awareness.getStates().keys()).filter(
			(id) => id !== awareness.clientID,
		);
		if (remoteIds.length > 0) {
			awareness.emit('change', [
				{ added: [], updated: remoteIds, removed: [] },
				'local',
			]);
		}
	});
	themeObserver.observe(document.documentElement, {
		attributes: true,
		attributeFilter: ['data-theme-mode'],
	});

	return {
		extensions: [
			yCollab(yText, awareness, { undoManager }),
			keymap.of(yUndoManagerKeymap),
		],
		cleanup: () => {
			themeObserver.disconnect();
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

	const emit = (content: string) => {
		isUpdatingRef.current = true;
		try {
			onUpdateContent(content);
			if (enableComments) {
				updateComments(content);
			}

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

	const observer = () => {
		if (isUpdatingRef.current) return;
		emit(yText.toString() || '');
		if (autoSaveRef.current) autoSaveRef.current();
	};

	yText.observe(observer);

	const initial = yText.toString() || '';
	if (initial) emit(initial);

	return () => {
		yText.unobserve(observer);
		isUpdatingRef.current = false;
	};
};
