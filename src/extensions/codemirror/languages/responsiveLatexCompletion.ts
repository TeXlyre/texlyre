// src/extensions/codemirror/languages/responsiveLatexCompletion.ts
import type { CompletionSource } from '@codemirror/autocomplete';
import { latexCompletionSource } from 'codemirror-lang-latex';

const LARGE_DOCUMENT = 50_000;
const COMPLETION_DELAY = 120;

export function responsiveLatexCompletion(
	autoCloseTags: boolean,
): CompletionSource {
	const complete = latexCompletionSource(autoCloseTags);
	return (context) => {
		if (context.explicit || context.state.doc.length < LARGE_DOCUMENT) {
			return complete(context);
		}
		return new Promise((resolve) => {
			if (context.aborted) {
				resolve(null);
				return;
			}
			const timer = setTimeout(() => {
				resolve(context.aborted ? null : complete(context));
			}, COMPLETION_DELAY);
			context.addEventListener(
				'abort',
				() => {
					clearTimeout(timer);
					resolve(null);
				},
				{ onDocChange: true },
			);
		});
	};
}
