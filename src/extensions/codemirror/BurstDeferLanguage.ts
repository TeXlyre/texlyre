// src/extensions/codemirror/BurstDeferLanguage.ts
import type { StateEffect } from '@codemirror/state';
import type { Extension } from '@codemirror/state';
import { EditorView, type ViewUpdate } from '@codemirror/view';

export function createBurstDeferredLanguage(
	detach: () => StateEffect<unknown>[],
	reattach: () => StateEffect<unknown>[],
): Extension {
	let deferred = false;
	let lastChangeAt = 0;
	let reattachTimer: ReturnType<typeof setTimeout> | null = null;

	return EditorView.updateListener.of((update: ViewUpdate) => {
		if (!update.docChanged) return;

		const view = update.view;
		const now = Date.now();
		const isBurst = now - lastChangeAt < 100;
		lastChangeAt = now;

		if (isBurst && !deferred) {
			deferred = true;
			queueMicrotask(() => view.dispatch({ effects: detach() }));
		}

		if (deferred) {
			if (reattachTimer) clearTimeout(reattachTimer);
			reattachTimer = setTimeout(() => {
				reattachTimer = null;
				if (!view.dom.isConnected) return;
				deferred = false;
				view.dispatch({ effects: reattach() });
			}, 150);
		}
	});
}
