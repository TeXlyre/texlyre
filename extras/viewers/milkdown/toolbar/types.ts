// extras/viewers/milkdown/toolbar/types.ts
import type { EditorView } from '@milkdown/kit/prose/view';

export interface MilkdownToolbarButton {
	key: string;
	label: string;
	title: string;
	command: (view: EditorView) => boolean;
}

export interface MilkdownToolbarSplit {
	type: 'split';
}

export interface MilkdownToolbarSpace {
	type: 'space';
}

export type MilkdownToolbarEntry =
	| MilkdownToolbarButton
	| MilkdownToolbarSplit
	| MilkdownToolbarSpace;

export const split: MilkdownToolbarSplit = { type: 'split' };
export const space: MilkdownToolbarSpace = { type: 'space' };

export const isToolbarButton = (
	entry: MilkdownToolbarEntry,
): entry is MilkdownToolbarButton => !('type' in entry);
