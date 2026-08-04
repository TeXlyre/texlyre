// src/extensions/codemirror/languages/textmateRegistry.ts
import { createNamedLogger } from '@/logging';

const moduleLog = createNamedLogger('TextMateRegistry');

const BASE_PATH = __BASE_PATH__;
const GRAMMARS_PATH = `${BASE_PATH}/assets/grammars`;

export interface TextMateGrammarEntry {
	scopeName: string;
	url: string;
	injectTo?: string[];
}

export interface TextMateLanguageEntry {
	id: string;
	scopeName: string;
	extensions: string[];
	languageData: Record<string, unknown>;
	snippetsUrl?: string;
}

interface GrammarIndexEntry {
	id: string;
	folder: string;
	scopeName?: string;
	extensions?: string[];
	languageData?: Record<string, unknown>;
	snippets?: string;
	grammars: Array<{ scopeName: string; file: string; injectTo?: string[] }>;
}

let grammarEntries: TextMateGrammarEntry[] = [];
let languageEntries: TextMateLanguageEntry[] = [];
let indexLoad: Promise<void> | null = null;

function loadIndex(): Promise<void> {
	if (typeof fetch !== 'function') return Promise.resolve();

	return fetch(`${GRAMMARS_PATH}/grammars.json`)
		.then((response) => (response.ok ? response.json() : []))
		.then((index: GrammarIndexEntry[]) => {
			for (const entry of index) {
				for (const grammar of entry.grammars) {
					grammarEntries.push({
						scopeName: grammar.scopeName,
						url: `${GRAMMARS_PATH}/${entry.folder}/${grammar.file}`,
						injectTo: grammar.injectTo,
					});
				}

				if (entry.scopeName && entry.extensions?.length) {
					languageEntries.push({
						id: entry.id,
						scopeName: entry.scopeName,
						extensions: entry.extensions,
						languageData: entry.languageData ?? {},
						snippetsUrl: entry.snippets
							? `${GRAMMARS_PATH}/${entry.folder}/${entry.snippets}`
							: undefined,
					});
				}
			}
		})
		.catch(() => {
			moduleLog.warn('grammars.json not found, TextMate languages disabled');
			grammarEntries = [];
			languageEntries = [];
		});
}

export function whenGrammarsReady(): Promise<void> {
	if (!indexLoad) {
		indexLoad = loadIndex();
	}
	return indexLoad;
}

export function getTextMateGrammars(): TextMateGrammarEntry[] {
	return grammarEntries;
}

export function getTextMateLanguageForFile(
	fileName: string | undefined,
): TextMateLanguageEntry | null {
	if (!fileName) return null;

	const lower = fileName.toLowerCase();
	return (
		languageEntries.find((language) =>
			language.extensions.some((extension) => lower.endsWith(extension)),
		) ?? null
	);
}
