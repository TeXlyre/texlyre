// src/extensions/codemirror/toolbar/types.ts
import type { EditorView } from '@codemirror/view';

export interface ToolbarItem {
	key: string;
	label: string;
	icon?: string;
	command: (view: EditorView) => boolean;
}
