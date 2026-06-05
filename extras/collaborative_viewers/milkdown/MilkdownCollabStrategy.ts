// extras/collaborative_viewers/milkdown/MilkdownCollabStrategy.ts
import type { Editor } from '@milkdown/kit/core';
import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';

export interface MilkdownCollabStrategy {
	bind(editor: Editor, doc: Y.Doc, awareness?: Awareness): void;
	pushMarkdown(markdown: string): void;
	destroy(): void;
}
