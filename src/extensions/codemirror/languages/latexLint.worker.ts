// src/extensions/codemirror/languages/latexLint.worker.ts
import { StreamLanguage } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { lua } from '@codemirror/legacy-modes/mode/lua';
import type { EditorView } from '@codemirror/view';
import {
	latex,
	latexLinter,
	type LatexLinterOptions,
} from 'codemirror-lang-latex';

const luaLanguage = StreamLanguage.define(lua);

self.onmessage = (
	event: MessageEvent<{
		id: number;
		text: string;
		options: LatexLinterOptions;
	}>,
) => {
	const { id, text, options } = event.data;
	try {
		const state = EditorState.create({
			doc: text,
			extensions: [
				latex({
					enableLinting: false,
					enableTooltips: false,
					enableAutocomplete: false,
					autoCloseBrackets: false,
					autoCloseTags: false,
					nestedEnvironments: { luacode: luaLanguage, 'luacode*': luaLanguage },
				}),
			],
		});
		const diagnostics = latexLinter(options)({ state } as EditorView);
		self.postMessage({ id, diagnostics });
	} catch (error) {
		self.postMessage({ id, error: String(error) });
	}
};
