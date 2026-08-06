// src/extensions/codemirror/languages/textmateMode.ts
import {
	type Completion,
	type CompletionContext,
	snippetCompletion,
} from '@codemirror/autocomplete';
import {
	defineLanguageFacet,
	Language,
	LanguageDescription,
	syntaxTree,
} from '@codemirror/language';
import { languages } from '@codemirror/language-data';
import {
	Compartment,
	type EditorState,
	type Extension,
} from '@codemirror/state';
import { type EditorView, ViewPlugin } from '@codemirror/view';
import type { Parser, SyntaxNode } from '@lezer/common';
import {
	createOnigScanner,
	createOnigString,
	loadWASM,
} from 'vscode-oniguruma';
import { type IGrammar, parseRawGrammar, Registry } from 'vscode-textmate';

import { createNamedLogger } from '@/logging';
import {
	completeTextMateSymbols,
	createTextMateParser,
	isEmbeddedNode,
} from './textmateParser';
import {
	getTextMateGrammars,
	getTextMateLanguageForFile,
	type TextMateGrammarEntry,
	whenGrammarsReady,
} from './textmateRegistry';

const moduleLog = createNamedLogger('TextMateMode');

const SNIPPET_BOOST = -20;

const BASE_PATH = __BASE_PATH__;
const ONIG_WASM_PATH = `${BASE_PATH}/core/oniguruma/onig.wasm`;

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

export function isEmbeddedAt(state: EditorState, pos: number): boolean {
	let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);

	for (; node; node = node.parent) {
		if (isEmbeddedNode(node.name)) return true;
	}
	return false;
}

function createLanguageExtension(
	scopeName: string,
	grammar: IGrammar,
	languageData: Record<string, unknown>,
	used: Set<string>,
	reconfigure: () => void,
): Extension[] {
	const data = defineLanguageFacet(languageData);

	const describe = (name: string) =>
		LanguageDescription.matchLanguageName(languages, name, true);

	const innerParser = (name: string): Parser | null => {
		const description = describe(name);
		if (!description) return null;

		if (!used.has(name)) {
			used.add(name);
			const ready = description.support
				? Promise.resolve()
				: description.load().then(() => undefined);
			void ready.then(reconfigure, () => undefined);
		}
		return description.support?.language.parser ?? null;
	};

	const support = [...used]
		.map((name) => describe(name)?.support?.support)
		.filter((extension): extension is Extension => Boolean(extension));

	return [
		new Language(
			data,
			createTextMateParser(grammar, data, innerParser),
			[],
			scopeName,
		),
		data.of({ autocomplete: completeTextMateSymbols }),
		support,
	];
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
				type: 'snippet',
				boost: SNIPPET_BOOST,
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
			if (isEmbeddedAt(context.state, context.pos)) return null;

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

					const used = new Set<string>();
					const reconfigure = () => {
						if (!view.dom.isConnected) return;

						view.dispatch({
							effects: compartment.reconfigure(
								createLanguageExtension(
									resolved.language.scopeName,
									resolved.grammar,
									withSnippets(
										resolved.language.languageData,
										resolved.snippets,
									),
									used,
									reconfigure,
								),
							),
						});
					};

					reconfigure();
				});
			return {};
		}),
	];
}
