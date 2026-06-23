// extras/viewers/milkdown/plugins/math.ts
import katex from 'katex';
import remarkMath from 'remark-math';
import type { Node as ProseNode, NodeType } from '@milkdown/kit/prose/model';
import type {
	EditorView as ProseMirrorEditorView,
	NodeView,
} from '@milkdown/kit/prose/view';
import { Selection } from '@milkdown/kit/prose/state';
import { InputRule } from '@milkdown/kit/prose/inputrules';
import { $inputRule, $nodeSchema, $remark, $view } from '@milkdown/kit/utils';
import { EditorState } from '@codemirror/state';
import { EditorView as CodeMirrorEditorView } from '@codemirror/view';
import {
	defaultHighlightStyle,
	syntaxHighlighting,
} from '@codemirror/language';
import { latex } from 'codemirror-lang-latex';

export const remarkMathPlugin = $remark('remarkMath', () => remarkMath);

type GetPos = (() => number) | boolean;
type MathKind = 'inline' | 'block';

const isEditable = (view: ProseMirrorEditorView): boolean =>
	view.props.editable?.(view.state) ?? true;

const getPos = (getPos: GetPos): number | null => {
	if (typeof getPos !== 'function') return null;

	try {
		return getPos();
	} catch {
		return null;
	}
};

const updateAttr = (
	view: ProseMirrorEditorView,
	getNodePos: GetPos,
	type: NodeType,
	value: string,
): void => {
	const pos = getPos(getNodePos);
	const node = pos === null ? null : view.state.doc.nodeAt(pos);

	if (!node || node.type !== type || node.attrs.value === value) return;

	view.dispatch(
		view.state.tr.setNodeMarkup(pos, type, {
			...node.attrs,
			value,
			autofocus: false,
		}),
	);
};

const clearAutofocus = (
	view: ProseMirrorEditorView,
	getNodePos: GetPos,
	type: NodeType,
): void => {
	const pos = getPos(getNodePos);
	const node = pos === null ? null : view.state.doc.nodeAt(pos);

	if (!node || node.type !== type || !node.attrs.autofocus) return;

	view.dispatch(
		view.state.tr.setNodeMarkup(pos, type, {
			...node.attrs,
			autofocus: false,
		}),
	);
};

const renderKatex = (
	target: HTMLElement,
	value: string,
	displayMode: boolean,
): void => {
	target.innerHTML = '';
	target.classList.toggle('is-empty', !value.trim());

	if (!value.trim()) {
		target.textContent = displayMode ? 'Empty math block' : '$$';
		return;
	}

	try {
		katex.render(value, target, {
			displayMode,
			throwOnError: false,
		});
	} catch {
		target.textContent = displayMode ? value : `$${value}$`;
	}
};

const mathAttrs = (dom: HTMLElement) => ({
	value: dom.dataset.value ?? dom.textContent ?? '',
	autofocus: false,
});

const mathNodeSpec = (
	name: 'math_inline' | 'math_block',
	markdownType: 'inlineMath' | 'math',
) => ({
	attrs: {
		value: { default: '' },
		autofocus: { default: false },
	},

	parseMarkdown: {
		match: (node) => node.type === markdownType,
		runner: (state, node, type) => {
			state.addNode(type, {
				value: String(node.value ?? ''),
				autofocus: false,
			});
		},
	},

	toMarkdown: {
		match: (node) => node.type.name === name,
		runner: (state, node) => {
			state.addNode(markdownType, undefined, node.attrs.value);
		},
	},
});

export const mathInlineSchema = $nodeSchema('math_inline', () => ({
	...mathNodeSpec('math_inline', 'inlineMath'),

	group: 'inline',
	inline: true,
	atom: true,
	selectable: true,

	parseDOM: [
		{
			tag: 'span[data-type="math-inline"]',
			getAttrs: (dom) => (dom instanceof HTMLElement ? mathAttrs(dom) : false),
		},
	],

	toDOM: (node) => [
		'span',
		{
			'data-type': 'math-inline',
			'data-value': node.attrs.value,
			class: 'milkdown-math-inline',
		},
		node.attrs.value,
	],
}));

export const mathBlockSchema = $nodeSchema('math_block', () => ({
	...mathNodeSpec('math_block', 'math'),

	group: 'block',
	atom: true,
	selectable: true,
	isolating: true,
	defining: true,

	parseDOM: [
		{
			tag: 'div[data-type="math-block"]',
			getAttrs: (dom) => (dom instanceof HTMLElement ? mathAttrs(dom) : false),
		},
	],

	toDOM: (node) => [
		'div',
		{
			'data-type': 'math-block',
			'data-value': node.attrs.value,
			class: 'milkdown-math-block',
		},
		node.attrs.value,
	],
}));

const createMathView = (kind: MathKind, getType: () => NodeType) => {
	return (
		node: ProseNode,
		view: ProseMirrorEditorView,
		getNodePos: GetPos,
	): NodeView => {
		const type = getType();
		const displayMode = kind === 'block';
		const dom = document.createElement(kind === 'inline' ? 'span' : 'div');

		let value = String(node.attrs.value ?? '');
		let cm: CodeMirrorEditorView | null = null;

		const destroyCm = () => {
			cm?.destroy();
			cm = null;
		};

		const renderPreview = () => {
			destroyCm();

			dom.className =
				kind === 'inline'
					? 'milkdown-math-inline is-preview'
					: 'milkdown-math-block is-preview';

			dom.dataset.type = kind === 'inline' ? 'math-inline' : 'math-block';
			dom.dataset.value = value;
			dom.title = kind === 'inline' ? `$${value}$` : '$$...$$';

			renderKatex(dom, value, displayMode);
		};

		const commit = (nextValue: string) => {
			if (nextValue === value) return;

			value = nextValue;
			updateAttr(view, getNodePos, type, value);
		};

		const closeEditor = (save: boolean) => {
			if (save && cm) {
				commit(cm.state.doc.toString());
			}

			renderPreview();

			const pos = getPos(getNodePos);

			if (pos !== null) {
				const resolved = view.state.doc.resolve(
					Math.min(pos + node.nodeSize, view.state.doc.content.size),
				);
				const selection = Selection.near(resolved, 1);

				view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
			}

			view.focus();
		};

		const renderEditor = () => {
			if (cm || !isEditable(view)) return;

			const shell = document.createElement('span');
			const host = document.createElement('span');
			const preview = document.createElement('span');

			dom.className =
				kind === 'inline'
					? 'milkdown-math-inline is-editing'
					: 'milkdown-math-block is-editing';

			shell.className =
				kind === 'inline'
					? 'milkdown-math-editor milkdown-math-editor-inline'
					: 'milkdown-math-editor milkdown-math-editor-block';

			host.className = 'milkdown-math-editor-host';

			preview.className =
				kind === 'inline'
					? 'milkdown-math-preview milkdown-math-preview-inline'
					: 'milkdown-math-preview milkdown-math-preview-block milkdown-latex-preview';

			if (kind === 'block') {
				const header = document.createElement('span');
				header.className = 'milkdown-math-editor-header';
				header.textContent = 'LaTeX';
				shell.append(header);
			}

			shell.append(host);
			dom.replaceChildren(shell, preview);

			cm = new CodeMirrorEditorView({
				parent: host,
				state: EditorState.create({
					doc: value,
					extensions: [
						latex(),
						syntaxHighlighting(defaultHighlightStyle),
						CodeMirrorEditorView.lineWrapping,

						CodeMirrorEditorView.updateListener.of((update) => {
							if (update.docChanged) {
								renderKatex(preview, update.state.doc.toString(), displayMode);
							}
						}),

						CodeMirrorEditorView.domEventHandlers({
							keydown: (event) => {
								const isSubmit =
									kind === 'inline'
										? event.key === 'Enter'
										: (event.ctrlKey || event.metaKey) && event.key === 'Enter';

								if (isSubmit) {
									event.preventDefault();
									closeEditor(true);
									return true;
								}

								if (event.key === 'Escape') {
									event.preventDefault();
									closeEditor(false);
									return true;
								}

								return false;
							},

							focusout: (event) => {
								const nextTarget = event.relatedTarget as Node | null;

								if (nextTarget && dom.contains(nextTarget)) return false;

								event.preventDefault();

								queueMicrotask(() => {
									if (cm) closeEditor(true);
								});

								return true;
							},
						}),
					],
				}),
			});

			renderKatex(preview, value, displayMode);
			cm.focus();
		};

		dom.addEventListener('dblclick', (event) => {
			event.preventDefault();
			event.stopPropagation();
			renderEditor();
		});

		renderPreview();

		queueMicrotask(() => {
			if (!node.attrs.autofocus || !isEditable(view)) return;

			renderEditor();
			clearAutofocus(view, getNodePos, type);
		});

		return {
			dom,

			update: (nextNode) => {
				if (nextNode.type !== node.type) return false;

				const nextValue = String(nextNode.attrs.value ?? '');

				if (nextValue === value) return true;

				value = nextValue;

				if (!cm) {
					renderPreview();
					return true;
				}

				const current = cm.state.doc.toString();

				if (current !== value) {
					cm.dispatch({
						changes: {
							from: 0,
							to: current.length,
							insert: value,
						},
					});
				}

				return true;
			},

			ignoreMutation: () => true,

			stopEvent: (event) => {
				const target = event.target as HTMLElement | null;

				return Boolean(
					target?.closest('.milkdown-math-editor, .milkdown-math-preview'),
				);
			},

			destroy: destroyCm,
		};
	};
};

export const mathInlineView = $view(mathInlineSchema.node, (ctx) =>
	createMathView('inline', () => mathInlineSchema.type(ctx)),
);

export const mathBlockView = $view(mathBlockSchema.node, (ctx) =>
	createMathView('block', () => mathBlockSchema.type(ctx)),
);

export const mathInlineInputRule = $inputRule((ctx) => {
	return new InputRule(/\$([^$\n]+)\$$/, (state, match, start, end) => {
		const value = match[1]?.trim();
		const type = mathInlineSchema.type(ctx) as NodeType | undefined;

		return value && type
			? state.tr.replaceWith(start, end, type.create({ value }))
			: null;
	});
});

export const mathBlockInputRule = $inputRule((ctx) => {
	return new InputRule(/^\$\$\s$/, (state, _match, start, end) => {
		const type = mathBlockSchema.type(ctx) as NodeType | undefined;

		return type
			? state.tr.replaceWith(
					start,
					end,
					type.create({
						value: '',
						autofocus: true,
					}),
				)
			: null;
	});
});
