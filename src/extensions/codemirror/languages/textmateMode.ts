// src/extensions/codemirror/languages/textmateMode.ts
import {
	type Completion,
	type CompletionContext,
	snippetCompletion,
} from '@codemirror/autocomplete';
import { StreamLanguage, type StreamParser } from '@codemirror/language';
import { Compartment, type Extension } from '@codemirror/state';
import { type EditorView, ViewPlugin } from '@codemirror/view';
import { type Tag, tags } from '@lezer/highlight';
import {
	createOnigScanner,
	createOnigString,
	loadWASM,
} from 'vscode-oniguruma';
import {
	INITIAL,
	type IGrammar,
	type IToken,
	parseRawGrammar,
	Registry,
	type StateStack,
} from 'vscode-textmate';

import { createNamedLogger } from '@/logging';
import {
	getTextMateGrammars,
	getTextMateLanguageForFile,
	type TextMateGrammarEntry,
	whenGrammarsReady,
} from './textmateRegistry';

const moduleLog = createNamedLogger('TextMateMode');

const BASE_PATH = __BASE_PATH__;
const ONIG_WASM_PATH = `${BASE_PATH}/core/oniguruma/onig.wasm`;

interface TextMateState {
	stack: StateStack;
	tokens: IToken[];
	index: number;
}

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
	['entity.name', tags.name],
	['entity.other.attribute-name', tags.attributeName],
	['entity.other', tags.punctuation],
	['invalid', tags.invalid],
	['keyword.operator', tags.operator],
	['keyword', tags.keyword],
	['markup.bold', tags.strong],
	['markup.italic', tags.emphasis],
	['markup.heading', tags.heading],
	['punctuation.definition.string', tags.string],
	['punctuation', tags.punctuation],
	['storage.type', tags.typeName],
	['storage', tags.modifier],
	['string', tags.string],
	['support.function', tags.function(tags.variableName)],
	['support', tags.standard(tags.variableName)],
	['variable.parameter', tags.local(tags.variableName)],
	['variable', tags.variableName],
];

const TOKEN_TABLE = Object.fromEntries(SCOPE_TAGS);

const grammarSources = new Map<string, string>();
const grammarCache = new Map<string, Promise<IGrammar | null>>();
const injections = new Map<string, string[]>();

let onigurumaLoad: Promise<void> | null = null;
let registry: Registry | null = null;

export function registerTextMateGrammar(source: TextMateGrammarEntry): void {
	grammarSources.set(source.scopeName, source.url);

	for (const target of source.injectTo ?? []) {
		const existing = injections.get(target) ?? [];
		if (!existing.includes(source.scopeName)) {
			existing.push(source.scopeName);
		}
		injections.set(target, existing);
	}
}

function loadOniguruma(): Promise<void> {
	if (!onigurumaLoad) {
		onigurumaLoad = fetch(ONIG_WASM_PATH)
			.then((response) => response.arrayBuffer())
			.then((buffer) => loadWASM(buffer));
	}
	return onigurumaLoad;
}

function getRegistry(): Registry {
	if (!registry) {
		registry = new Registry({
			onigLib: loadOniguruma().then(() => ({
				createOnigScanner,
				createOnigString,
			})),
			getInjections: (scopeName) => injections.get(scopeName),
			loadGrammar: async (scopeName) => {
				const url = grammarSources.get(scopeName);
				if (!url) return null;

				const response = await fetch(url);
				if (!response.ok) {
					moduleLog.warn(`Grammar ${scopeName} unavailable at ${url}`);
					return null;
				}
				return parseRawGrammar(await response.text(), url);
			},
		});
	}
	return registry;
}

function loadGrammar(scopeName: string): Promise<IGrammar | null> {
	const cached = grammarCache.get(scopeName);
	if (cached) return cached;

	const pending = getRegistry()
		.loadGrammar(scopeName)
		.catch((error) => {
			moduleLog.error(`Failed to load grammar ${scopeName}:`, error);
			return null;
		});
	grammarCache.set(scopeName, pending);
	return pending;
}

function tokenNameForScopes(scopes: string[]): string | null {
	for (let index = scopes.length - 1; index >= 0; index--) {
		const scope = scopes[index];
		for (const [prefix] of SCOPE_TAGS) {
			if (scope === prefix || scope.startsWith(`${prefix}.`)) return prefix;
		}
	}
	return null;
}

function createParser(
	scopeName: string,
	grammar: IGrammar,
	languageData?: Record<string, unknown>,
): StreamParser<TextMateState> {
	return {
		name: scopeName,
		startState: () => ({ stack: INITIAL, tokens: [], index: 0 }),
		copyState: (state) => ({ ...state }),
		blankLine(state) {
			const result = grammar.tokenizeLine('', state.stack);
			state.stack = result.ruleStack;
			state.tokens = [];
			state.index = 0;
		},
		token(stream, state) {
			if (stream.sol()) {
				const result = grammar.tokenizeLine(stream.string, state.stack);
				state.stack = result.ruleStack;
				state.tokens = result.tokens;
				state.index = 0;
			}

			const token = state.tokens[state.index];
			if (!token) {
				stream.skipToEnd();
				return null;
			}

			state.index++;
			stream.pos =
				token.endIndex > stream.pos ? token.endIndex : stream.pos + 1;
			return tokenNameForScopes(token.scopes);
		},
		tokenTable: TOKEN_TABLE,
		languageData,
	};
}

async function loadSnippets(url?: string): Promise<Completion[]> {
	if (!url) return [];

	try {
		const response = await fetch(url);
		if (!response.ok) return [];

		const raw: Array<{ label: string; detail?: string; template: string }> =
			await response.json();
		return raw.map((entry) =>
			snippetCompletion(entry.template, {
				label: entry.label,
				detail: entry.detail,
				type: 'keyword',
			}),
		);
	} catch {
		return [];
	}
}

function withSnippets(
	languageData: Record<string, unknown>,
	options: Completion[],
): Record<string, unknown> {
	if (options.length === 0) return languageData;

	return {
		...languageData,
		autocomplete: (context: CompletionContext) => {
			const word = context.matchBefore(/[\\@<#\w:-]+$/);
			if (!word || (word.from === word.to && !context.explicit)) return null;

			return { from: word.from, options, validFor: /^[\\@<#\w:-]*$/ };
		},
	};
}

export async function getTextMateGrammar(
	fileName: string | undefined,
): Promise<IGrammar | null> {
	await whenGrammarsReady();

	for (const grammar of getTextMateGrammars()) {
		registerTextMateGrammar(grammar);
	}

	const language = getTextMateLanguageForFile(fileName);
	return language ? loadGrammar(language.scopeName) : null;
}

export function createTextMateLanguageForFile(
	fileName: string | undefined,
): Extension[] {
	const compartment = new Compartment();

	return [
		compartment.of([]),
		ViewPlugin.define((view: EditorView) => {
			void whenGrammarsReady()
				.then(() => {
					for (const grammar of getTextMateGrammars()) {
						registerTextMateGrammar(grammar);
					}

					const language = getTextMateLanguageForFile(fileName);
					if (!language) return null;

					return Promise.all([
						loadGrammar(language.scopeName),
						loadSnippets(language.snippetsUrl),
					]).then(([grammar, snippets]) =>
						grammar ? { grammar, language, snippets } : null,
					);
				})
				.then((resolved) => {
					if (!resolved || !view.dom.isConnected) return;

					view.dispatch({
						effects: compartment.reconfigure(
							StreamLanguage.define(
								createParser(
									resolved.language.scopeName,
									resolved.grammar,
									withSnippets(
										resolved.language.languageData,
										resolved.snippets,
									),
								),
							),
						),
					});
				});
			return {};
		}),
	];
}
