// src/extensions/codemirror/SemanticTokensLSPExtension.ts
import { highlightingFor } from '@codemirror/language';
import {
	Prec,
	RangeSetBuilder,
	type EditorState,
	type Extension,
} from '@codemirror/state';
import {
	Decoration,
	type DecorationSet,
	type EditorView,
	ViewPlugin,
	type ViewUpdate,
} from '@codemirror/view';
import type { LSPClient } from '@codemirror/lsp-client';
import { type Tag, tags } from '@lezer/highlight';

import { genericLSPService } from '../../services/GenericLSPService';

const REQUEST_DELAY = 300;

interface SemanticTokensLegend {
	tokenTypes: string[];
	tokenModifiers: string[];
}

interface SemanticTokensTarget {
	client: LSPClient;
	legend: SemanticTokensLegend;
}

const TOKEN_TYPE_TAGS: Record<string, Tag> = {
	namespace: tags.namespace,
	type: tags.typeName,
	class: tags.className,
	enum: tags.typeName,
	interface: tags.typeName,
	struct: tags.typeName,
	typeParameter: tags.typeName,
	parameter: tags.local(tags.variableName),
	variable: tags.variableName,
	property: tags.propertyName,
	enumMember: tags.constant(tags.variableName),
	event: tags.propertyName,
	function: tags.function(tags.variableName),
	method: tags.function(tags.propertyName),
	macro: tags.macroName,
	keyword: tags.keyword,
	modifier: tags.modifier,
	comment: tags.comment,
	string: tags.string,
	number: tags.number,
	regexp: tags.regexp,
	operator: tags.operator,
	decorator: tags.annotation,
};

const TOKEN_MODIFIER_TAGS: Record<string, (tag: Tag) => Tag> = {
	declaration: tags.definition,
	definition: tags.definition,
	readonly: tags.constant,
	defaultLibrary: tags.standard,
};

function resolveTarget(fileName: string): SemanticTokensTarget | null {
	for (const client of genericLSPService.getAllClientsForFile(fileName)) {
		const provider = (client as any).serverCapabilities?.semanticTokensProvider;
		const legend = provider?.legend;
		if (provider?.full && Array.isArray(legend?.tokenTypes)) {
			return {
				client,
				legend: {
					tokenTypes: legend.tokenTypes,
					tokenModifiers: legend.tokenModifiers ?? [],
				},
			};
		}
	}
	return null;
}

function resolveClass(
	state: EditorState,
	legend: SemanticTokensLegend,
	typeIndex: number,
	modifierBits: number,
): string | null {
	const typeName = legend.tokenTypes[typeIndex];
	let tag = typeName ? TOKEN_TYPE_TAGS[typeName] : undefined;
	if (!tag) return null;

	const extra: Tag[] = [];
	for (
		let index = 0;
		index < legend.tokenModifiers.length && index < 31;
		index++
	) {
		if ((modifierBits & (1 << index)) === 0) continue;
		const modifier = legend.tokenModifiers[index];
		const wrap = TOKEN_MODIFIER_TAGS[modifier];
		if (wrap) tag = wrap(tag);
		else if (modifier === 'deprecated') extra.push(tags.strikethrough);
	}

	return highlightingFor(state, [tag, ...extra]);
}

function buildDecorations(
	view: EditorView,
	data: number[],
	legend: SemanticTokensLegend,
): DecorationSet {
	const doc = view.state.doc;
	const ranges: Array<{ from: number; to: number; decoration: Decoration }> =
		[];
	let line = 0;
	let character = 0;

	for (let index = 0; index + 4 < data.length; index += 5) {
		const deltaLine = data[index];
		line += deltaLine;
		character = deltaLine === 0 ? character + data[index + 1] : data[index + 1];

		const length = data[index + 2];
		if (length <= 0 || line >= doc.lines) continue;

		const className = resolveClass(
			view.state,
			legend,
			data[index + 3],
			data[index + 4],
		);
		if (!className) continue;

		const docLine = doc.line(line + 1);
		const from = Math.min(docLine.from + character, docLine.to);
		const to = Math.min(from + length, docLine.to);
		if (to <= from) continue;

		ranges.push({
			from,
			to,
			decoration: Decoration.mark({ class: className }),
		});
	}

	ranges.sort((a, b) => a.from - b.from || a.to - b.to);

	const builder = new RangeSetBuilder<Decoration>();
	for (const range of ranges)
		builder.add(range.from, range.to, range.decoration);
	return builder.finish();
}

export function createSemanticTokensExtension(fileName: string): Extension {
	if (!fileName) return [];

	const fileUri = `file:///${fileName}`;

	return Prec.highest(
		ViewPlugin.fromClass(
			class {
				decorations: DecorationSet = Decoration.none;

				private readonly unsubscribe: () => void;
				private timer: ReturnType<typeof setTimeout> | null = null;
				private generation = 0;
				private answered = false;

				constructor(private readonly view: EditorView) {
					this.unsubscribe = genericLSPService.onSemanticTokensRefresh(() => {
						this.answered = false;
						this.schedule(0);
					});
					this.schedule(REQUEST_DELAY);
				}

				update(update: ViewUpdate) {
					if (
						update.transactions.some((transaction) => transaction.reconfigured)
					) {
						this.decorations = Decoration.none;
						this.answered = false;
						this.schedule(0);
						return;
					}

					if (update.docChanged) {
						this.decorations = this.decorations.map(update.changes);
						this.schedule(REQUEST_DELAY);
					} else if (!this.answered) {
						this.schedule(REQUEST_DELAY);
					}
				}

				destroy() {
					this.unsubscribe();
					if (this.timer !== null) clearTimeout(this.timer);
					this.decorations = Decoration.none;
				}

				private schedule(delay: number) {
					if (this.timer !== null) clearTimeout(this.timer);
					this.timer = setTimeout(() => {
						this.timer = null;
						void this.requestTokens();
					}, delay);
				}

				private async requestTokens() {
					const target = resolveTarget(fileName);
					if (!target) return;

					const generation = ++this.generation;
					try {
						const result = await (target.client as any).request(
							'textDocument/semanticTokens/full',
							{ textDocument: { uri: fileUri } },
						);
						if (generation !== this.generation || !this.view.dom.isConnected)
							return;
						if (!Array.isArray(result?.data)) return;

						this.answered = true;
						this.decorations = buildDecorations(
							this.view,
							result.data,
							target.legend,
						);
						this.view.dispatch({});
					} catch {}
				}
			},
			{ decorations: (plugin) => plugin.decorations },
		),
	);
}
