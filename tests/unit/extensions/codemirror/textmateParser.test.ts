import fs from 'node:fs';

import {
	defineLanguageFacet,
	ensureSyntaxTree,
	Language,
	languageDataProp,
} from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import {
	type Input,
	IterMode,
	NodeType,
	type PartialParse,
	Parser,
	Tree,
	type TreeFragment,
} from '@lezer/common';
import { tags } from '@lezer/highlight';
import { createOnigScanner, createOnigString, loadWASM } from 'vscode-oniguruma';
import { type IGrammar, parseRawGrammar, Registry } from 'vscode-textmate';

import { CompletionContext } from '@codemirror/autocomplete';
import {
	completeTextMateSymbols,
	createTextMateParser,
	embeddedLanguageForScopes,
	TOKEN_TABLE,
	tokenNameForScopes,
} from '@/extensions/codemirror/languages/textmateParser';

const tagFor = (scopes: string[]) => {
	const token = tokenNameForScopes(scopes);
	return token ? TOKEN_TABLE[token] : null;
};

const GRAMMAR = JSON.stringify({
	scopeName: 'text.test',
	patterns: [
		{
			begin: '^```\\{(\\w+)\\}$',
			beginCaptures: { 0: { name: 'punctuation.definition.test' } },
			end: '^```$',
			endCaptures: { 0: { name: 'punctuation.definition.test' } },
			contentName: 'meta.embedded.block.$1',
		},
		{ match: '^#.*$', name: 'markup.heading.test' },
		{ match: '\\bTODO\\b', name: 'keyword.test' },
	],
});

const innerData = defineLanguageFacet({ commentTokens: { line: '#' } });
const innerTop = NodeType.define({
	id: 0,
	name: 'Inner',
	top: true,
	props: [[languageDataProp, innerData]],
});

class InnerParser extends Parser {
	createParse(
		_input: Input,
		_fragments: readonly TreeFragment[],
		ranges: readonly { from: number; to: number }[],
	): PartialParse {
		const from = ranges[0].from;
		const to = ranges[ranges.length - 1].to;

		const parse = {
			parsedPos: from,
			stoppedAt: null as number | null,
			stopAt(pos: number) {
				parse.stoppedAt = pos;
			},
			advance() {
				parse.parsedPos = to;
				return new Tree(innerTop, [], [], to - from);
			},
		};

		return parse;
	}
}

let grammar: IGrammar;
let tokenized = 0;

beforeAll(async () => {
	await loadWASM(
		fs.readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm')).buffer,
	);

	const registry = new Registry({
		onigLib: Promise.resolve({ createOnigScanner, createOnigString }),
		loadGrammar: async (scope) =>
			scope === 'text.test' ? parseRawGrammar(GRAMMAR, 'test.tmLanguage.json') : null,
	});

	const loaded = await registry.loadGrammar('text.test');
	if (!loaded) throw new Error('grammar failed to load');

	const tokenizeLine = loaded.tokenizeLine.bind(loaded);
	grammar = Object.assign(Object.create(loaded), {
		tokenizeLine: (line: string, stack: never) => {
			tokenized++;
			return tokenizeLine(line, stack);
		},
	});
});

const outerData = defineLanguageFacet({ commentTokens: { line: '%' } });

const createState = (doc: string) => {
	const parser = createTextMateParser(grammar, outerData, (language) =>
		language === 'python' ? new InnerParser() : null,
	);
	const language = new Language(outerData, parser, [], 'text.test');
	const state = EditorState.create({ doc, extensions: [language] });

	ensureSyntaxTree(state, doc.length, 5000);
	return state;
};

const tree = (state: EditorState) =>
	ensureSyntaxTree(state, state.doc.length, 5000) ?? new Tree(NodeType.none, [], [], 0);

describe('TextMate parser', () => {
	const doc = '# Title\n\n```{python}\nTODO x\n```\n\nTODO y\n';

	it('should emit a region node for embedded blocks', () => {
		const state = createState(doc);
		const names: string[] = [];
		tree(state).iterate({
			mode: IterMode.IgnoreMounts,
			enter: (node) => void names.push(node.name),
		});

		expect(names).toContain('Embedded_python');
	});

	it('should mount the inner parser over the embedded range', () => {
		const state = createState(doc);
		const inside = doc.indexOf('TODO x') + 1;

		expect(tree(state).resolveInner(inside, 1).name).toBe('Inner');
	});

	it('should resolve language data per region', () => {
		const state = createState(doc);

		expect(state.languageDataAt('commentTokens', doc.indexOf('TODO x') + 1)).toEqual([
			{ line: '#' },
		]);
		expect(state.languageDataAt('commentTokens', 1)).toEqual([{ line: '%' }]);
	});

	it('should highlight outer tokens from the scope table', () => {
		const state = createState(doc);
		const outer = tree(state).resolveInner(doc.lastIndexOf('TODO y') + 1, 1);

		expect(outer.name).toBe('keyword');
	});

	it('should finish parsing a region larger than one chunk', () => {
		const body = Array.from({ length: 80 }, (_, index) => `TODO ${index}`).join('\n');
		const long = `# Title\n\n\`\`\`{python}\n${body}\n\`\`\`\n`;
		const state = createState(long);

		const parsed = ensureSyntaxTree(state, long.length, 5000);
		expect(parsed).not.toBeNull();
		expect(parsed?.length).toBe(long.length);
		expect(parsed?.resolveInner(long.indexOf('TODO 60') + 1, 1).name).toBe('Inner');
	});

	it('should complete only tokens the grammar names', () => {
		const source = '# Title\n\nTODO plainword here\n\nTO';
		const state = createState(source);
		ensureSyntaxTree(state, source.length, 5000);

		const result = completeTextMateSymbols(
			new CompletionContext(state, source.length, false),
		);

		expect(result?.options.map((option) => option.label)).toEqual(['TODO']);
	});

	it('should not complete inside prose without a word', () => {
		const source = '# Title\n\nTODO here\n\n';
		const state = createState(source);
		ensureSyntaxTree(state, source.length, 5000);

		expect(
			completeTextMateSymbols(new CompletionContext(state, source.length, false)),
		).toBeNull();
	});

	it('should reuse parse state across edits', () => {
		const lines = Array.from({ length: 400 }, (_, index) => `line ${index}`);
		const state = createState(`${lines.join('\n')}\n`);

		tokenized = 0;
		const edited = state.update({
			changes: { from: state.doc.length - 1, insert: ' TODO' },
		}).state;
		ensureSyntaxTree(edited, edited.doc.length, 5000);

		expect(tokenized).toBeGreaterThan(0);
		expect(tokenized).toBeLessThan(lines.length / 2);
	});
});

describe('TextMate scope resolution', () => {
	describe('token table', () => {
		it('should only use token names CodeMirror resolves through the table', () => {
			for (const [token, tag] of Object.entries(TOKEN_TABLE)) {
				expect(token).toMatch(/^\w+$/);
				expect(tag).toBeDefined();
			}
		});
	});

	describe('embeddedLanguageForScopes', () => {
		it('should read the language from the embedded scope', () => {
			expect(
				embeddedLanguageForScopes([
					'text.html.quarto',
					'markup.fenced_code.block.markdown',
					'meta.embedded.block.python',
					'keyword.control.flow.python',
				]),
			).toBe('python');
		});

		it('should return null outside embedded blocks', () => {
			expect(
				embeddedLanguageForScopes([
					'text.html.quarto',
					'markup.fenced_code.block.markdown',
					'punctuation.definition.markdown',
				]),
			).toBeNull();
		});
	});

	describe('tokenNameForScopes', () => {
		it('should return null when no rule matches', () => {
			expect(tokenNameForScopes(['source.js', 'meta.function.js'])).toBeNull();
		});

		it('should match a scope prefix', () => {
			expect(tagFor(['source.js', 'constant.numeric.decimal.js'])).toBe(
				tags.number,
			);
		});

		it('should match an exact scope', () => {
			expect(tagFor(['source.js', 'comment'])).toBe(tags.comment);
		});

		it('should prefer the innermost matching scope', () => {
			expect(
				tagFor(['text.tex.latex', 'meta.function.tex', 'comment.line.tex']),
			).toBe(tags.comment);
		});

		it('should prefer the most specific rule regardless of table order', () => {
			expect(tagFor(['text.html.basic', 'entity.other.attribute-name.html'])).toBe(
				tags.attributeName,
			);
			expect(tagFor(['source.js', 'keyword.operator.assignment.js'])).toBe(
				tags.operator,
			);
			expect(tagFor(['source.js', 'constant.character.escape.js'])).toBe(
				tags.escape,
			);
		});

		it('should resolve a scope through an ancestor selector', () => {
			expect(
				tagFor([
					'source.js',
					'comment.line.double-slash.js',
					'punctuation.definition.comment.js',
				]),
			).toBe(tags.comment);
			expect(
				tagFor([
					'source.js',
					'string.quoted.double.js',
					'punctuation.definition.string.begin.js',
				]),
			).toBe(tags.string);
		});

		it('should fall back to the bare rule without a matching ancestor', () => {
			expect(tagFor(['source.js', 'punctuation.terminator.statement.js'])).toBe(
				tags.punctuation,
			);
		});

		it('should match ancestors at any depth', () => {
			expect(
				tagFor([
					'text.html.markdown',
					'markup.heading.1.markdown',
					'meta.paragraph.markdown',
					'entity.name.section.markdown',
				]),
			).toBe(tags.heading);
		});

		it('should not match an ancestor that appears inside the scope itself', () => {
			expect(
				tagFor(['source.js', 'punctuation.definition.string.begin.js']),
			).toBe(tags.punctuation);
		});

		it('should match ancestors on whole scope segments only', () => {
			expect(
				tagFor([
					'source.js',
					'meta.comment-block.js',
					'punctuation.definition.js',
				]),
			).toBe(tags.punctuation);
		});

		it('should map markup scopes used by prose grammars', () => {
			expect(
				tagFor(['text.html.markdown', 'markup.fenced_code.block.markdown']),
			).toBe(tags.monospace);
			expect(
				tagFor([
					'text.asciidoc',
					'markup.monospace.constrained.asciidoc',
					'markup.inline.raw.monospace.asciidoc',
				]),
			).toBe(tags.monospace);
			expect(
				tagFor(['text.html.markdown', 'markup.list.unnumbered.markdown']),
			).toBe(tags.list);
			expect(tagFor(['text.asciidoc', 'markup.link.asciidoc'])).toBe(tags.link);
			expect(
				tagFor([
					'text.html.markdown',
					'fenced_code.block.language.markdown',
				]),
			).toBe(tags.labelName);
		});

		it('should fall back to content for unlisted markup scopes', () => {
			expect(tagFor(['text.asciidoc', 'markup.admonition.asciidoc'])).toBe(
				tags.content,
			);
		});


		it('should map storage scopes to keyword tags', () => {
			expect(tagFor(['source.js', 'storage.type.js'])).toBe(
				tags.definitionKeyword,
			);
			expect(tagFor(['source.js', 'storage.modifier.js'])).toBe(tags.modifier);
		});

		it('should return cached results for repeated scope stacks', () => {
			const scopes = ['source.js', 'variable.parameter.js'];

			expect(tokenNameForScopes(scopes)).toBe(tokenNameForScopes([...scopes]));
			expect(tagFor(scopes)).toBe(tags.local(tags.variableName));
		});
	});
});
