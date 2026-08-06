// src/extensions/codemirror/languages/textmateParser.ts
import {
	type Input,
	NodeProp,
	NodeSet,
	NodeType,
	type PartialParse,
	Parser,
	type ParseWrapper,
	Tree,
	type TreeFragment,
	parseMixed,
} from '@lezer/common';
import type {
	Completion,
	CompletionContext,
	CompletionResult,
} from '@codemirror/autocomplete';
import { languageDataProp, syntaxTree } from '@codemirror/language';
import type { Facet } from '@codemirror/state';
import { type Tag, styleTags, tags } from '@lezer/highlight';
import { INITIAL, type IGrammar, type StateStack } from 'vscode-textmate';

const CHUNK_SIZE = 512;
const MAX_LINE_LENGTH = 10000;
const EMBEDDED_PREFIX = 'Embedded_';

const SCOPE_TAGS: Array<[string, Tag]> = [
	['comment', tags.comment],
	['constant.character.escape', tags.escape],
	['constant.numeric', tags.number],
	['constant.language', tags.atom],
	['constant', tags.constant(tags.name)],
	['entity.name.class', tags.className],
	['entity.name.function', tags.function(tags.variableName)],
	['entity.name.tag', tags.tagName],
	['entity.name.type', tags.typeName],
	['entity.name.section', tags.heading],
	['entity.name', tags.name],
	['entity.other.attribute-name', tags.attributeName],
	['entity.other', tags.punctuation],
	['invalid', tags.invalid],
	['keyword.operator', tags.operator],
	['keyword', tags.keyword],
	['markup.bold', tags.strong],
	['markup.italic', tags.emphasis],
	['markup.heading', tags.heading],
	['markup.inline.raw', tags.monospace],
	['markup.fenced_code', tags.monospace],
	['markup.raw', tags.monospace],
	['markup.code', tags.monospace],
	['markup.monospace', tags.monospace],
	['markup.strong', tags.strong],
	['markup.emphasis', tags.emphasis],
	['markup.strikethrough', tags.strikethrough],
	['markup.list', tags.list],
	['markup.quote', tags.quote],
	['markup.underline.link', tags.link],
	['markup.link', tags.link],
	['markup.other.url', tags.url],
	['markup.inserted', tags.inserted],
	['markup.deleted', tags.deleted],
	['markup.changed', tags.changed],
	['markup.table.delimiter', tags.separator],
	['markup.table.cell.delimiter', tags.separator],
	['markup.meta', tags.meta],
	['markup.macro', tags.macroName],
	['markup', tags.content],
	['fenced_code.block.language', tags.labelName],
	['punctuation', tags.punctuation],
	['storage.type', tags.definitionKeyword],
	['storage', tags.modifier],
	['string', tags.string],
	['support.function', tags.function(tags.variableName)],
	['support', tags.standard(tags.variableName)],
	['variable.parameter', tags.local(tags.variableName)],
	['variable', tags.variableName],
	['comment punctuation.definition', tags.comment],
	['string punctuation.definition', tags.string],
	['markup.heading punctuation.definition', tags.heading],
	['markup.heading entity.name', tags.heading],
];

interface ScopeRule {
	token: string;
	scope: string;
	parents: string[];
	rank: number;
}

const tokenName = (selector: string): string => selector.replace(/\W/g, '_');

const SCOPE_RULES: ScopeRule[] = SCOPE_TAGS.map(([selector]) => {
	const parts = selector.split(' ');
	const scope = parts[parts.length - 1];

	return {
		token: tokenName(selector),
		scope,
		parents: parts.slice(0, -1),
		rank: parts.length * 100 + scope.split('.').length,
	};
}).sort((first, second) => second.rank - first.rank);

const scopeTokens = new Map<string, string | null>();
const embeddedScopes = new Map<string, string | null>();

const nodeIds = new Map<string, number>();
const nodeTypes: NodeType[] = [NodeType.none];

for (const [selector] of SCOPE_TAGS) {
	const name = tokenName(selector);
	if (nodeIds.has(name)) continue;

	nodeIds.set(name, nodeTypes.length);
	nodeTypes.push(NodeType.define({ id: nodeTypes.length, name }));
}

export const TOKEN_TABLE: Record<string, Tag> = Object.fromEntries(
	SCOPE_TAGS.map(([selector, tag]) => [tokenName(selector), tag]),
);

const styles = styleTags(TOKEN_TABLE);

let nodeSet = new NodeSet(nodeTypes).extend(styles);

function refreshNodeSet(): void {
	nodeSet = new NodeSet(nodeTypes).extend(styles);
}

const stackProp = new NodeProp<StateStack>({ perNode: true });

const SYMBOL_NODES = new Set([
	'entity_name',
	'entity_name_class',
	'entity_name_function',
	'entity_name_section',
	'entity_name_tag',
	'entity_name_type',
	'keyword',
	'markup_macro',
	'storage',
	'storage_type',
	'support',
	'support_function',
	'variable',
	'variable_parameter',
]);

const SYMBOL_WORD = /[\\@][\w:.-]*$|[\w][\w:.-]*$/;
const SYMBOL_LABEL = /^[\\@]?[\w][\w:.-]*$/;
const SYMBOL_RANGE = 100000;
const SYMBOL_LIMIT = 400;

export function completeTextMateSymbols(
	context: CompletionContext,
): CompletionResult | null {
	const word = context.matchBefore(SYMBOL_WORD);
	if (!word || (word.from === word.to && !context.explicit)) return null;

	const labels = new Set<string>();
	const options: Completion[] = [];

	syntaxTree(context.state).iterate({
		from: Math.max(0, word.from - SYMBOL_RANGE),
		to: Math.min(context.state.doc.length, word.from + SYMBOL_RANGE),
		enter: (node) => {
			if (options.length >= SYMBOL_LIMIT) return false;
			if (!SYMBOL_NODES.has(node.name)) return;

			const label = context.state.sliceDoc(node.from, node.to).trim();
			if (!SYMBOL_LABEL.test(label) || labels.has(label)) return;

			labels.add(label);
			options.push({ label, type: 'keyword' });
		},
	});

	return options.length
		? { from: word.from, options, validFor: SYMBOL_WORD }
		: null;
}

function matchesScope(selector: string, scope: string): boolean {
	return scope === selector || scope.startsWith(`${selector}.`);
}

function matchesParents(
	parents: string[],
	scopes: string[],
	index: number,
): boolean {
	let cursor = index - 1;

	for (let position = parents.length - 1; position >= 0; position--) {
		while (cursor >= 0 && !matchesScope(parents[position], scopes[cursor]))
			cursor--;
		if (cursor < 0) return false;
		cursor--;
	}
	return true;
}

function matchScopes(scopes: string[]): string | null {
	for (let index = scopes.length - 1; index >= 0; index--) {
		const rule = SCOPE_RULES.find(
			(candidate) =>
				matchesScope(candidate.scope, scopes[index]) &&
				matchesParents(candidate.parents, scopes, index),
		);
		if (rule) return rule.token;
	}
	return null;
}

export function tokenNameForScopes(scopes: string[]): string | null {
	const key = scopes.join(' ');
	const cached = scopeTokens.get(key);
	if (cached !== undefined) return cached;

	const token = matchScopes(scopes);
	scopeTokens.set(key, token);
	return token;
}

export function embeddedLanguageForScopes(scopes: string[]): string | null {
	const key = scopes.join(' ');
	const cached = embeddedScopes.get(key);
	if (cached !== undefined) return cached;

	let language: string | null = null;
	for (let index = scopes.length - 1; index >= 0 && !language; index--) {
		language =
			/^meta\.embedded(?:\.\w+)?\.([\w+#-]+)$/.exec(scopes[index])?.[1] ?? null;
	}

	embeddedScopes.set(key, language);
	return language;
}

function embeddedNodeId(language: string): number {
	const name = EMBEDDED_PREFIX + language;
	let id = nodeIds.get(name);
	if (id !== undefined) return id;

	id = nodeTypes.length;
	nodeIds.set(name, id);
	nodeTypes.push(NodeType.define({ id, name }));
	refreshNodeSet();
	return id;
}

export function isEmbeddedNode(name: string): boolean {
	return name.startsWith(EMBEDDED_PREFIX);
}

export function embeddedLanguageOfNode(name: string): string | null {
	return isEmbeddedNode(name) ? name.slice(EMBEDDED_PREFIX.length) : null;
}

function createTopNode(data: Facet<{ [name: string]: unknown }>): NodeType {
	const type = NodeType.define({
		id: nodeTypes.length,
		name: 'Document',
		top: true,
		props: [[languageDataProp, data]],
	});
	nodeTypes.push(type);
	refreshNodeSet();
	return type;
}

function findStack(
	tree: Tree,
	offset: number,
	startPos: number,
	before: number,
): { stack: StateStack; pos: number } | null {
	const stack =
		offset >= startPos &&
		offset + tree.length <= before &&
		tree.prop(stackProp);
	if (stack) return { stack, pos: offset + tree.length };

	for (let index = tree.children.length - 1; index >= 0; index--) {
		const child = tree.children[index];
		const pos = offset + tree.positions[index];
		const found =
			child instanceof Tree &&
			pos < before &&
			findStack(child, pos, startPos, before);
		if (found) return found;
	}
	return null;
}

function cutTree(
	topNode: NodeType,
	tree: Tree,
	from: number,
	to: number,
	inside: boolean,
): Tree | null {
	if (inside && from <= 0 && to >= tree.length) return tree;
	if (!inside && from === 0 && tree.type === topNode) inside = true;

	for (let index = tree.children.length - 1; index >= 0; index--) {
		const pos = tree.positions[index];
		const child = tree.children[index];
		if (pos >= to || !(child instanceof Tree)) continue;

		const inner = cutTree(topNode, child, from - pos, to - pos, inside);
		if (!inner) break;

		return inside
			? new Tree(
					tree.type,
					tree.children.slice(0, index).concat(inner),
					tree.positions.slice(0, index + 1),
					pos + inner.length,
				)
			: inner;
	}
	return null;
}

function findStart(
	topNode: NodeType,
	fragments: readonly TreeFragment[],
	startPos: number,
	endPos: number,
): { stack: StateStack; tree: Tree } {
	for (const fragment of fragments) {
		const from = fragment.from + (fragment.openStart ? 25 : 0);
		const to = fragment.to - (fragment.openEnd ? 25 : 0);
		const found =
			from <= startPos &&
			to > startPos &&
			findStack(fragment.tree, -fragment.offset, startPos, to);
		if (!found || found.pos > endPos) continue;

		const tree = cutTree(
			topNode,
			fragment.tree,
			startPos + fragment.offset,
			found.pos + fragment.offset,
			false,
		);
		if (tree) return { stack: found.stack, tree };
	}
	return { stack: INITIAL, tree: Tree.empty };
}

class TextMateParse implements PartialParse {
	private stack: StateStack;
	private chunks: Tree[] = [];
	private chunkPos: number[] = [];
	private chunk: number[] = [];
	private chunkStart: number;
	private region: { id: number; from: number; start: number } | null = null;
	private readonly from: number;
	private readonly to: number;

	parsedPos: number;
	stoppedAt: number | null = null;

	constructor(
		private readonly grammar: IGrammar,
		private readonly topNode: NodeType,
		private readonly input: Input,
		fragments: readonly TreeFragment[],
		ranges: readonly { from: number; to: number }[],
	) {
		this.from = ranges[0].from;
		this.to = ranges[ranges.length - 1].to;

		const { stack, tree } = findStart(
			this.topNode,
			fragments,
			this.from,
			this.to,
		);
		this.stack = stack;
		this.parsedPos = this.chunkStart = this.from + tree.length;

		for (let index = 0; index < tree.children.length; index++) {
			this.chunks.push(tree.children[index] as Tree);
			this.chunkPos.push(tree.positions[index]);
		}
	}

	advance(): Tree | null {
		const parseEnd =
			this.stoppedAt == null ? this.to : Math.min(this.to, this.stoppedAt);
		const end = Math.min(parseEnd, this.parsedPos + CHUNK_SIZE);

		while (this.parsedPos < end) this.parseLine();
		if (!this.region && this.chunkStart < this.parsedPos) this.finishChunk();

		return this.parsedPos >= parseEnd ? this.finish() : null;
	}

	stopAt(pos: number): void {
		this.stoppedAt = pos;
	}

	private nextLine(): string {
		let chunk = this.input.chunk(this.parsedPos);
		if (!this.input.lineChunks) {
			const eol = chunk.indexOf('\n');
			if (eol > -1) chunk = chunk.slice(0, eol);
		} else if (chunk === '\n') {
			chunk = '';
		}

		const line =
			this.parsedPos + chunk.length <= this.to
				? chunk
				: chunk.slice(0, this.to - this.parsedPos);
		return line.length > MAX_LINE_LENGTH
			? line.slice(0, MAX_LINE_LENGTH)
			: line;
	}

	private parseLine(): void {
		const line = this.nextLine();
		const result = this.grammar.tokenizeLine(line, this.stack);
		this.stack = result.ruleStack;

		for (const token of result.tokens) {
			const from = this.parsedPos + token.startIndex;
			const to = this.parsedPos + token.endIndex;
			if (to <= from) continue;

			this.updateRegion(embeddedLanguageForScopes(token.scopes), from);

			const name = tokenNameForScopes(token.scopes);
			const id = name ? nodeIds.get(name) : undefined;
			if (id !== undefined) this.chunk.push(id, from, to, 4);
		}

		this.parsedPos += line.length;
		if (this.parsedPos < this.to) this.parsedPos++;
	}

	private updateRegion(language: string | null, pos: number): void {
		if (
			this.region &&
			this.region.id !== (language ? embeddedNodeId(language) : null)
		) {
			this.closeRegion(pos);
		}
		if (language && !this.region) {
			this.region = {
				id: embeddedNodeId(language),
				from: pos,
				start: this.chunk.length,
			};
		}
	}

	private closeRegion(end: number): void {
		if (!this.region) return;

		this.chunk.push(
			this.region.id,
			this.region.from,
			end,
			this.chunk.length - this.region.start + 4,
		);
		this.region = null;
	}

	private finishChunk(): void {
		const tree = Tree.build({
			buffer: this.chunk,
			start: this.chunkStart,
			length: this.parsedPos - this.chunkStart,
			nodeSet,
			topID: 0,
			maxBufferLength: CHUNK_SIZE,
		});

		this.chunks.push(
			new Tree(tree.type, tree.children, tree.positions, tree.length, [
				[stackProp, this.stack],
			]),
		);
		this.chunkPos.push(this.chunkStart - this.from);
		this.chunk = [];
		this.chunkStart = this.parsedPos;
	}

	private finish(): Tree {
		this.closeRegion(this.parsedPos);
		if (this.chunkStart < this.parsedPos || this.chunk.length)
			this.finishChunk();

		return new Tree(
			this.topNode,
			this.chunks,
			this.chunkPos,
			this.parsedPos - this.from,
		).balance();
	}
}

class TextMateGrammarParser extends Parser {
	constructor(
		private readonly grammar: IGrammar,
		private readonly topNode: NodeType,
		private readonly wrap?: ParseWrapper,
	) {
		super();
	}

	createParse(
		input: Input,
		fragments: readonly TreeFragment[],
		ranges: readonly { from: number; to: number }[],
	): PartialParse {
		const parse = new TextMateParse(
			this.grammar,
			this.topNode,
			input,
			fragments,
			ranges,
		);
		return this.wrap ? this.wrap(parse, input, fragments, ranges) : parse;
	}
}

export function createTextMateParser(
	grammar: IGrammar,
	data: Facet<{ [name: string]: unknown }>,
	innerParser?: (language: string) => Parser | null,
): Parser {
	const wrap = innerParser
		? parseMixed((node) => {
				const language = embeddedLanguageOfNode(node.name);
				const parser = language ? innerParser(language) : null;
				return parser ? { parser } : null;
			})
		: undefined;

	return new TextMateGrammarParser(grammar, createTopNode(data), wrap);
}
