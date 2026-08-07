// src/extensions/codemirror/comments/contentProcessor.ts
import { ViewPlugin } from '@codemirror/view';
import type { EditorView } from '@codemirror/view';

const PROCESS_DEBOUNCE_DELAY = 150;

class ContentProcessor {
	private lastContent = '';
	private contentChangeTimeout: number | null = null;
	private lastProcessTime = 0;

	constructor(private view: EditorView) {
		this.scheduleProcess();
	}

	scheduleProcess() {
		if (this.contentChangeTimeout !== null) {
			clearTimeout(this.contentChangeTimeout);
		}

		this.contentChangeTimeout = window.setTimeout(() => {
			this.contentChangeTimeout = null;
			this.checkContent();
		}, PROCESS_DEBOUNCE_DELAY);
	}

	checkContent() {
		const content = this.view.state.doc.toString();

		if (content === this.lastContent) return;

		const now = Date.now();

		if (now - this.lastProcessTime < 100) {
			this.scheduleProcess();
			return;
		}

		this.lastContent = content;
		this.lastProcessTime = now;

		document.dispatchEvent(
			new CustomEvent('codemirror-content-changed', {
				detail: { content, view: this.view },
			}),
		);
	}

	update(update: { docChanged: boolean }) {
		if (update.docChanged) {
			this.scheduleProcess();
		}
	}

	destroy() {
		if (this.contentChangeTimeout !== null) {
			clearTimeout(this.contentChangeTimeout);
			this.contentChangeTimeout = null;
		}
	}
}

export const contentProcessorExtension = ViewPlugin.define(
	(view) => new ContentProcessor(view),
);
