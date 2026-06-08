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
import {
	codeBlockComponent,
	codeBlockConfig,
} from '@milkdown/kit/component/code-block';
import {
	LanguageDescription,
	defaultHighlightStyle,
	syntaxHighlighting,
} from '@codemirror/language';
import { languages as allLanguages } from '@codemirror/language-data';
import { latex } from 'codemirror-lang-latex';
import { bibtex } from 'codemirror-lang-bib';

import { safeTypst as typst } from '@/extensions/codemirror/SafeTypstPatch';
import { createLinkClickHandler } from './linkClick';
import {
	mathBlockInputRule,
	mathBlockSchema,
	mathBlockView,
	mathInlineInputRule,
	mathInlineSchema,
	mathInlineView,
	remarkMathPlugin,
} from './plugins/math';

export const MILKDOWN_THEME_CLASS = 'texlyre-milkdown';

interface MilkdownConfigOptions {
	root: HTMLElement;
	defaultValue: string;
	editable: () => boolean;
	onMarkdownUpdated: (markdown: string) => void;
	plugins?: MilkdownPlugin[];
	getCurrentFilePath: () => string;
	enabledPlugins?: Set<string>;
}

const codeBlockLanguages: LanguageDescription[] = [
	...allLanguages,

	LanguageDescription.of({
		name: 'LaTeX',
		alias: ['latex', 'tex'],
		extensions: ['latex', 'ltx', 'tex', 'sty', 'cls'],
		support: latex(),
	}),

	LanguageDescription.of({
		name: 'Typst',
		alias: ['typst', 'typ'],
		extensions: ['typst', 'typ'],
		support: typst(),
	}),

	LanguageDescription.of({
		name: 'BibTeX',
		alias: ['bibtex', 'bib', 'biblatex'],
		extensions: ['bibtex', 'biblatex', 'bib'],
		support: bibtex(),
	}),
];

export function configureMilkdownEditor(
	options: MilkdownConfigOptions,
): Editor {
	const {
		root,
		defaultValue,
		editable,
		onMarkdownUpdated,
		plugins,
		getCurrentFilePath,
		enabledPlugins,
	} = options;

	const isEnabled = (id: string) => enabledPlugins?.has(id) ?? true;

	const editor = Editor.make()
		.config((ctx) => {
			ctx.set(rootCtx, root);
			ctx.set(defaultValueCtx, defaultValue);

			ctx.update(editorViewOptionsCtx, (prev) => ({
				...prev,
				attributes: {
					class: MILKDOWN_THEME_CLASS,
					spellcheck: 'true',
				},
				editable,
				handleClick: createLinkClickHandler(getCurrentFilePath),
			}));

			if (isEnabled('link-tooltip')) {
				configureLinkTooltip(ctx);
			}

			if (isEnabled('code-block')) {
				ctx.update(codeBlockConfig.key, (defaultConfig) => ({
					...defaultConfig,
					languages: codeBlockLanguages,

					extensions: [
						...(defaultConfig.extensions ?? []),
						syntaxHighlighting(defaultHighlightStyle),
					],
				}));
			}

			const l = ctx.get(listenerCtx);

			l.markdownUpdated((_ctx, markdown, prevMarkdown) => {
				if (markdown !== prevMarkdown) {
					onMarkdownUpdated(markdown);
				}
			});
		})
		.use(commonmark)
		.use(history)
		.use(listener)
		.use(listItemBlockComponent);

	if (isEnabled('code-block')) {
		editor.use(codeBlockComponent);
	}

	if (isEnabled('math-inline')) {
		editor
			.use(remarkMathPlugin)
			.use(mathInlineSchema)
			.use(mathInlineView)
			.use(mathInlineInputRule)
			.use(mathBlockSchema)
			.use(mathBlockView)
			.use(mathBlockInputRule);
	}

	if (isEnabled('gfm')) {
		editor.use(gfm);
	}

	if (isEnabled('table-block')) {
		editor.use(tableBlock);
	}

	if (isEnabled('link-tooltip')) {
		editor.use(linkTooltipPlugin);
	}

	if (plugins) {
		for (const plugin of plugins) {
			editor.use(plugin);
		}
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
