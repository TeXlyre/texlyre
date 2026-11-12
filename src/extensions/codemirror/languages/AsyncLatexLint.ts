// src/extensions/codemirror/languages/AsyncLatexLint.ts
import { linter, type Diagnostic } from '@codemirror/lint';
import type { Extension, Text } from '@codemirror/state';
import { type EditorView, ViewPlugin } from '@codemirror/view';
import { latexLinter, type LatexLinterOptions } from 'codemirror-lang-latex';

import { maskAnnotationText } from '../annotations/annotationMasking';

export function asyncLatexLint(options: LatexLinterOptions): Extension {
	let worker: Worker | null = null;
	let fallback = false;
	let nextId = 0;
	const pending = new Map<
		number,
		{
			resolve: (value: readonly Diagnostic[]) => void;
			view: EditorView;
			doc: Text;
		}
	>();

	function dispose() {
		worker?.terminate();
		worker = null;
		for (const request of pending.values()) request.resolve([]);
		pending.clear();
	}

	function initWorker() {
		if (worker || fallback) return;
		try {
			worker = new Worker(new URL('./latexLint.worker.ts', import.meta.url), {
				type: 'module',
			});
			worker.onmessage = (
				event: MessageEvent<{
					id: number;
					diagnostics?: Diagnostic[];
					error?: string;
				}>,
			) => {
				const { id, diagnostics, error } = event.data;
				const request = pending.get(id);
				if (!request) return;
				pending.delete(id);
				if (error) {
					fallback = true;
					dispose();
					request.resolve(latexLinter(options)(request.view));
				} else
					request.resolve(
						request.view.state.doc === request.doc ? (diagnostics ?? []) : [],
					);
			};
			worker.onerror = () => {
				fallback = true;
				const outstanding = [...pending.values()];
				pending.clear();
				worker?.terminate();
				worker = null;
				for (const request of outstanding)
					request.resolve(latexLinter(options)(request.view));
			};
		} catch {
			fallback = true;
		}
	}

	return [
		linter(
			(view) => {
				initWorker();
				if (fallback || !worker) return latexLinter(options)(view);
				return new Promise<readonly Diagnostic[]>((resolve) => {
					const id = ++nextId;
					pending.set(id, { resolve, view, doc: view.state.doc });
					try {
						worker?.postMessage({
							id,
							text: maskAnnotationText(view.state),
							options,
						});
					} catch {
						pending.delete(id);
						resolve(latexLinter(options)(view));
					}
				});
			},
			{ delay: 900 },
		),
		ViewPlugin.fromClass(
			class {
				destroy() {
					dispose();
				}
			},
		),
	];
}
