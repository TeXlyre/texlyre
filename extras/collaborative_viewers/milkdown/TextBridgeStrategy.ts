// extras/collaborative_viewers/milkdown/TextBridgeStrategy.ts
import type { Editor } from '@milkdown/kit/core';
import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';

import { replaceMarkdown } from '../../viewers/milkdown/milkdownSetup';
import type { MilkdownCollabStrategy } from './MilkdownCollabStrategy';

export class TextBridgeStrategy implements MilkdownCollabStrategy {
	private editor: Editor | null = null;
	private ytext: Y.Text | null = null;
	private observer: ((event: Y.YTextEvent) => void) | null = null;
	private applyingRemote = false;

	bind(editor: Editor, doc: Y.Doc, _awareness?: Awareness): void {
		this.editor = editor;
		this.ytext = doc.getText('codemirror');

		editor.action((ctx) => {
			const current = this.ytext!.toString();
			if (current) replaceMarkdown(ctx, current);
		});

		this.observer = (event) => {
			if (event.transaction.local) return;
			this.applyingRemote = true;
			editor.action((ctx) => {
				replaceMarkdown(ctx, this.ytext!.toString());
			});
			this.applyingRemote = false;
		};
		this.ytext.observe(this.observer);
	}

	pushMarkdown(markdown: string): void {
		if (!this.ytext || this.applyingRemote) return;
		const prev = this.ytext.toString();
		if (prev === markdown) return;
		this.ytext.doc?.transact(() => {
			this.applyStringPatch(this.ytext!, prev, markdown);
		});
	}

	private applyStringPatch(ytext: Y.Text, prev: string, next: string): void {
		let start = 0;
		const prevLen = prev.length;
		const nextLen = next.length;
		const minLen = Math.min(prevLen, nextLen);

		while (start < minLen && prev.charCodeAt(start) === next.charCodeAt(start))
			start++;

		let endPrev = prevLen;
		let endNext = nextLen;
		while (
			endPrev > start &&
			endNext > start &&
			prev.charCodeAt(endPrev - 1) === next.charCodeAt(endNext - 1)
		) {
			endPrev--;
			endNext--;
		}

		const deleteCount = endPrev - start;
		const insertText = next.slice(start, endNext);

		if (deleteCount > 0) ytext.delete(start, deleteCount);
		if (insertText) ytext.insert(start, insertText);
	}

	destroy(): void {
		if (this.ytext && this.observer) {
			this.ytext.unobserve(this.observer);
		}
		this.editor = null;
		this.ytext = null;
		this.observer = null;
	}
}
