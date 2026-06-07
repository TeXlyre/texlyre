// extras/collaborative_viewers/milkdown/TextBridgeStrategy.ts
import type { Editor } from '@milkdown/kit/core';
import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';

import { replaceMarkdown } from '../../viewers/milkdown/milkdownSetup';
import type {
	MilkdownCollabStrategy,
	MilkdownCollabStrategyOptions,
} from './MilkdownCollabStrategy';

const isMissingEditorViewError = (error: unknown): boolean =>
	error instanceof Error &&
	error.message.includes('Context "editorView" not found');

export class TextBridgeStrategy implements MilkdownCollabStrategy {
	private editor: Editor | null = null;
	private ytext: Y.Text | null = null;
	private observer: ((event: Y.YTextEvent) => void) | null = null;
	private onRemoteUpdate?: (markdown: string) => void;
	private currentMarkdown = '';
	private applyingRemote = false;
	private pendingFrame: number | null = null;
	private bindVersion = 0;

	bind(
		editor: Editor,
		doc: Y.Doc,
		_awareness?: Awareness,
		options?: MilkdownCollabStrategyOptions,
	): void {
		this.destroy();

		this.bindVersion += 1;
		this.editor = editor;
		this.ytext = doc.getText('codemirror');
		this.onRemoteUpdate = options?.onRemoteUpdate;
		this.currentMarkdown = this.ytext.toString();

		if (this.currentMarkdown) {
			this.scheduleReplaceMarkdown(this.currentMarkdown, true);
		}

		this.observer = (event) => {
			if (event.transaction.local) return;
			if (!this.editor || !this.ytext) return;

			const markdown = this.ytext.toString();
			if (markdown === this.currentMarkdown) return;

			this.currentMarkdown = markdown;
			this.scheduleReplaceMarkdown(markdown, true);
		};

		this.ytext.observe(this.observer);
	}

	pushMarkdown(markdown: string): void {
		if (!this.ytext || this.applyingRemote) return;
		if (markdown === this.currentMarkdown) return;

		const previous = this.ytext.toString();
		this.currentMarkdown = markdown;

		if (previous === markdown) return;

		this.ytext.doc?.transact(() => {
			this.applyStringPatch(this.ytext!, previous, markdown);
		}, 'milkdown');
	}

	private scheduleReplaceMarkdown(markdown: string, notify: boolean): void {
		const editor = this.editor;
		const version = this.bindVersion;
		let attempts = 0;

		if (this.pendingFrame !== null) {
			cancelAnimationFrame(this.pendingFrame);
			this.pendingFrame = null;
		}

		const run = () => {
			this.pendingFrame = null;

			if (
				!this.editor ||
				this.editor !== editor ||
				this.bindVersion !== version
			) {
				return;
			}

			this.applyingRemote = true;

			try {
				editor.action((ctx) => {
					replaceMarkdown(ctx, markdown);
				});

				if (notify) this.onRemoteUpdate?.(markdown);
			} catch (error) {
				if (isMissingEditorViewError(error) && attempts < 5) {
					attempts += 1;
					this.pendingFrame = requestAnimationFrame(run);
					return;
				}

				console.warn('Milkdown collaborative replace failed:', error);
			} finally {
				if (this.pendingFrame === null) {
					this.applyingRemote = false;
				}
			}
		};

		this.pendingFrame = requestAnimationFrame(run);
	}

	private applyStringPatch(
		ytext: Y.Text,
		previous: string,
		next: string,
	): void {
		let start = 0;
		const previousLength = previous.length;
		const nextLength = next.length;
		const sharedLength = Math.min(previousLength, nextLength);

		while (
			start < sharedLength &&
			previous.charCodeAt(start) === next.charCodeAt(start)
		) {
			start += 1;
		}

		let previousEnd = previousLength;
		let nextEnd = nextLength;

		while (
			previousEnd > start &&
			nextEnd > start &&
			previous.charCodeAt(previousEnd - 1) === next.charCodeAt(nextEnd - 1)
		) {
			previousEnd -= 1;
			nextEnd -= 1;
		}

		const deleteCount = previousEnd - start;
		const insertText = next.slice(start, nextEnd);

		if (deleteCount > 0) ytext.delete(start, deleteCount);
		if (insertText) ytext.insert(start, insertText);
	}

	destroy(): void {
		if (this.pendingFrame !== null) {
			cancelAnimationFrame(this.pendingFrame);
			this.pendingFrame = null;
		}

		if (this.ytext && this.observer) {
			this.ytext.unobserve(this.observer);
		}

		this.bindVersion += 1;
		this.editor = null;
		this.ytext = null;
		this.observer = null;
		this.onRemoteUpdate = undefined;
		this.currentMarkdown = '';
		this.applyingRemote = false;
	}
}
