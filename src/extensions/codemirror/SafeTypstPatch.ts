// src/extensions/codemirror/SafeTypstPatch.ts
// codemirror-lang-typst@0.4.0's incremental WASM edit() panics (Rust unwrap) on
// document changes and the trap is not catchable from JS. We force every change
// through a full reparse: edit() never enters WASM (always returns full_update),
// and createParse() always rebuilds a fresh TypstWasmParser from the current doc.
// edit() keeps returning a valid object so the package's update listener never
// dereferences undefined. Incremental tree reuse is sacrificed; highlighting works.
import { Language, type LanguageSupport } from '@codemirror/language';
import { typst } from 'codemirror-lang-typst';

type WasmParser = { edit: (...a: unknown[]) => unknown } | null;

const FULL_REPARSE = { full_update: true, edits: [] };

export function safeTypst(): LanguageSupport {
	const support = typst();
	const ctx = support.language.parser as unknown as {
		parser: WasmParser;
		createParse: (
			input: unknown,
			fragments: unknown,
			ranges: unknown,
		) => unknown;
	};

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

	return support;
}
