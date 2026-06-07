// src/extensions/codemirror/ToolbarExtension.ts
import type { Extension } from '@codemirror/state';
import { type EditorView, ViewPlugin } from '@codemirror/view';
import type { UndoManager } from 'yjs';

import type { ToolbarEntry } from '@/components/common/PluginToolbar';
import * as CodeMirrorItems from './toolbar/codemirrorItems';
import * as LaTeXItems from './toolbar/latexItems';
import * as TypstItems from './toolbar/typstItems';
import * as TableScopeItems from './toolbar/tableScopeItems';
import { detectTableScope } from './toolbar/tableScope';
import * as ColorScopeItems from './toolbar/colorScopeItems';
import { detectColorScope } from './toolbar/colorScope';
import { buildToolbarEntries } from './toolbar/toolbarItems';

export type FileType = 'latex' | 'typst';

const commandsByView = new WeakMap<
	EditorView,
	Map<string, (view: EditorView) => boolean>
>();

function registerCommands(view: EditorView, entries) {
	const commands = commandsByView.get(view) ?? new Map();
	for (const entry of entries) {
		if (!('type' in entry)) commands.set(entry.key, entry.command);
	}
	commandsByView.set(view, commands);
}

export function runToolbarCommand(view: EditorView, key: string): boolean {
	return commandsByView.get(view)?.get(key)?.(view) ?? false;
}

const toButtons = (entries: ToolbarEntry[]): ToolbarEntry[] =>
	entries.map((entry) =>
		'type' in entry
			? entry
			: { key: entry.key, label: entry.label, icon: entry.icon },
	);

export interface ToolbarController {
	extension: Extension;
	subscribe: (listener: () => void) => () => void;
	getItems: () => ToolbarEntry[];
	run: (key: string) => boolean;
}

export const createToolbarController = (
	fileType: FileType,
	undoManager?: UndoManager,
): ToolbarController => {
	const scopeState = { inTable: false, inColor: false, isFullScreen: false };
	const listeners = new Set<() => void>();
	let view: EditorView | null = null;

	const factories = {
		CodeMirrorItems,
		LaTeXItems,
		TypstItems,
		TableScopeItems,
		ColorScopeItems,
		undoManager,
	};

	let entries = buildToolbarEntries(fileType, scopeState, factories);
	let items = toButtons(entries);

	const rebuild = () => {
		entries = buildToolbarEntries(fileType, scopeState, factories);
		items = toButtons(entries);
		if (view) registerCommands(view, entries);
		for (const listener of listeners) listener();
	};

	const extension = ViewPlugin.fromClass(
		class {
			private boundFullScreen: () => void;

			constructor(v: EditorView) {
				view = v;
				registerCommands(v, entries);
				this.boundFullScreen = () => {
					const now = !!v.dom.ownerDocument.fullscreenElement;
					if (now !== scopeState.isFullScreen) {
						scopeState.isFullScreen = now;
						rebuild();
					}
				};
				v.dom.ownerDocument.addEventListener(
					'fullscreenchange',
					this.boundFullScreen,
				);
			}

			update() {
				if (!view) return;
				const inTable = detectTableScope(view, fileType) !== null;
				const inColor = detectColorScope(view, fileType) !== null;
				if (inTable !== scopeState.inTable || inColor !== scopeState.inColor) {
					scopeState.inTable = inTable;
					scopeState.inColor = inColor;
					rebuild();
				}
			}

			destroy() {
				view?.dom.ownerDocument.removeEventListener(
					'fullscreenchange',
					this.boundFullScreen,
				);
				view = null;
			}
		},
	);

	return {
		extension,
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		getItems: () => items,
		run: (key) => {
			return view ? runToolbarCommand(view, key) : false;
		},
	};
};
