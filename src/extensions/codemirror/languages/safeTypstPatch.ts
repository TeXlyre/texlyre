// src/extensions/codemirror/languages/safeTypstPatch.ts
// codemirror-lang-typst@0.4.0's incremental WASM edit() panics (Rust unwrap) on
// document changes and the trap is not catchable from JS. We force every change
// through a full reparse: edit() never enters WASM (always returns full_update),
// and createParse() always rebuilds a fresh TypstWasmParser from the current doc.
// edit() keeps returning a valid object so the package's update listener never
// dereferences undefined. Incremental tree reuse is sacrificed; highlighting works.
// The package has its own syntaxHighlighting(TypstHighlightSytle) into the
// Language's extraExtensions, hardcoding colors that ignore the app theme. We
// rebuild the Language with only the parser's update listener so Typst renders
// through the host's resolveHighlightTheme like LaTeX does.
// Finally, the WASM parser never attaches languageDataProp to its top node, so
// Language's own languageData provider always resolves to nothing and comment
// commands find no tokens. We supply the language data directly instead.
import { Language, LanguageSupport } from '@codemirror/language';
import { EditorState, type Extension } from '@codemirror/state';
import { typst } from 'codemirror-lang-typst';

type WasmParser = { edit: (...a: unknown[]) => unknown } | null;

type TypstParser = {
	parser: WasmParser;
	createParse: (input: unknown, fragments: unknown, ranges: unknown) => unknown;
	updateListener: () => Extension;
};

const FULL_REPARSE = { full_update: true, edits: [] };

const TYPST_LANGUAGE_DATA = {
	commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
};

export function safeTypst(): LanguageSupport {
	const support = typst();
	const original = support.language as Language;
	const ctx = original.parser as unknown as TypstParser;

	let backing: WasmParser = null;

	Object.defineProperty(ctx, 'parser', {
		configurable: true,
		enumerable: true,
		get() {
			return backing;
		},
		set(value: WasmParser) {
			if (value && typeof value.edit === 'function') {
				value.edit = () => FULL_REPARSE;
			}
			backing = value;
		},
	});

	const originalCreateParse = ctx.createParse.bind(ctx);
	ctx.createParse = (input: unknown, fragments: unknown, ranges: unknown) => {
		backing = null;
		return originalCreateParse(input, fragments, ranges);
	};

	const themedLanguage = new Language(
		original.data,
		ctx as unknown as ConstructorParameters<typeof Language>[1],
		[ctx.updateListener()],
		original.name,
	);

	return new LanguageSupport(themedLanguage, [
		EditorState.languageData.of(() => [TYPST_LANGUAGE_DATA]),
	]);
}
