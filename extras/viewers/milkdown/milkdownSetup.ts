// extras/viewers/milkdown/milkdownSetup.ts
import {
	Editor,
	rootCtx,
	defaultValueCtx,
	editorViewCtx,
	editorViewOptionsCtx,
	serializerCtx,
	parserCtx,
} from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { tableBlock } from '@milkdown/kit/component/table-block';
import { listItemBlockComponent } from '@milkdown/kit/component/list-item-block';
import {
	linkTooltipPlugin,
	configureLinkTooltip,
} from '@milkdown/kit/component/link-tooltip';
import { Slice } from '@milkdown/kit/prose/model';
import { TextSelection } from '@milkdown/kit/prose/state';
import type { Ctx } from '@milkdown/kit/ctx';
import type { EditorView } from '@milkdown/kit/prose/view';
import type { MilkdownPlugin } from '@milkdown/kit/ctx';

export const MILKDOWN_THEME_CLASS = 'texlyre-milkdown';

interface MilkdownConfigOptions {
	root: HTMLElement;
	defaultValue: string;
	editable: () => boolean;
	onMarkdownUpdated: (markdown: string) => void;
	plugins?: MilkdownPlugin[];
}

export function configureMilkdownEditor(
	options: MilkdownConfigOptions,
): Editor {
	const { root, defaultValue, editable, onMarkdownUpdated, plugins } = options;

	const editor = Editor.make()
		.config((ctx) => {
			ctx.set(rootCtx, root);
			ctx.set(defaultValueCtx, defaultValue);
			ctx.update(editorViewOptionsCtx, (prev) => ({
				...prev,
				attributes: { class: MILKDOWN_THEME_CLASS, spellcheck: 'true' },
				editable,
			}));
			configureLinkTooltip(ctx);
			const l = ctx.get(listenerCtx);
			l.markdownUpdated((_ctx, markdown, prevMarkdown) => {
				if (markdown !== prevMarkdown) onMarkdownUpdated(markdown);
			});
		})
		.use(commonmark)
		.use(gfm)
		.use(history)
		.use(listener)
		.use(tableBlock)
		.use(listItemBlockComponent)
		.use(linkTooltipPlugin);

	if (plugins) {
		for (const plugin of plugins) editor.use(plugin);
	}

	return editor;
}

export function readMarkdown(ctx: Ctx): string {
	const view = ctx.get(editorViewCtx);
	const serializer = ctx.get(serializerCtx);
	return serializer(view.state.doc);
}

export function replaceMarkdown(ctx: Ctx, markdown: string): void {
	const view: EditorView = ctx.get(editorViewCtx);
	const parser = ctx.get(parserCtx);
	const doc = parser(markdown);
	if (!doc) return;

	const state = view.state;
	const tr = state.tr;
	tr.replace(0, state.doc.content.size, new Slice(doc.content, 0, 0));

	const anchor = Math.min(state.selection.anchor, tr.doc.content.size);
	tr.setSelection(TextSelection.create(tr.doc, anchor));
	view.dispatch(tr.setMeta('addToHistory', false));
}
