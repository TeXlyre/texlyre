// src/extensions/codemirror/languages/AsyncLatexLanguage.ts
import {
	highlightingFor,
	Language,
	LanguageSupport,
	ParseContext,
	syntaxTree,
	syntaxTreeAvailable,
} from '@codemirror/language';
import { RangeSetBuilder, type Text } from '@codemirror/state';
import {
	Decoration,
	type DecorationSet,
	type EditorView,
	ViewPlugin,
	type ViewUpdate,
} from '@codemirror/view';
import {
	Tree,
	Parser,
	parseMixed,
	type Input,
	type NodeSet,
	type PartialParse,
	type TreeFragment,
} from '@lezer/common';
import { highlightTree, type Highlighter } from '@lezer/highlight';
import { latex } from 'codemirror-lang-latex';

import { getAnnotationMaskRanges } from '../annotations/annotationMasking';

type WorkerResult = {
	id: number;
	buffer?: number[];
	topID?: number;
	length?: number;
	error?: string;
};

const PARSE_DELAY = 350;
const LATEX_WORKER_THRESHOLD = 50_000;

class LatexWorkerClient {
	worker: Worker | null = null;
	unavailable = false;
	private generation = 0;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private view: EditorView | null = null;
	private currentDoc: Text | null = null;
	private parsedDoc: Text | null = null;
	private parsedTree: Tree | null = null;
	private waiters: Array<() => void> = [];

	constructor(private readonly nodeSet: NodeSet) {}

	getTree(doc: Text): Tree | null {
		return this.parsedDoc === doc ? this.parsedTree : null;
	}

	wait(): Promise<void> {
		return new Promise((resolve) => this.waiters.push(resolve));
	}

	private notify(): void {
		for (const resolve of this.waiters.splice(0)) resolve();
	}

	attach(view: EditorView): void {
		this.view = view;
		if (view.state.doc.length >= LATEX_WORKER_THRESHOLD) this.schedule(view, 0);
	}

	private ensureWorker(): void {
		if (this.worker || this.unavailable) return;
		try {
			this.worker = new Worker(
				new URL('./latexParsing.worker.ts', import.meta.url),
				{ type: 'module' },
			);
			this.worker.onmessage = (event: MessageEvent<WorkerResult>) => {
				const result = event.data;
				if (result.id !== this.generation) return;
				if (
					result.error ||
					result.buffer == null ||
					result.topID == null ||
					result.length == null
				) {
					this.disable();
					return;
				}
				try {
					this.parsedTree = Tree.build({
						buffer: result.buffer,
						nodeSet: this.nodeSet,
						topID: result.topID,
						length: result.length,
					});
					this.parsedDoc = this.currentDoc;
					this.notify();
				} catch {
					this.disable();
				}
			};
			this.worker.onerror = () => this.disable();
		} catch {
			this.disable();
		}
	}

	schedule(view: EditorView, delay = PARSE_DELAY): void {
		if (view.state.doc.length < LATEX_WORKER_THRESHOLD) {
			clearTimeout(this.timer);
			this.parsedDoc = null;
			this.parsedTree = null;
			this.generation++;
			this.notify();
			return;
		}
		this.ensureWorker();
		if (this.unavailable) return;
		this.currentDoc = view.state.doc;
		this.parsedDoc = null;
		this.parsedTree = null;
		const id = ++this.generation;
		clearTimeout(this.timer);
		this.timer = setTimeout(() => {
			if (!this.worker || !this.view || id !== this.generation) return;
			try {
				this.worker.postMessage({
					id,
					text: this.view.state.doc.toString(),
					masks: getAnnotationMaskRanges(this.view.state),
				});
			} catch {
				this.disable();
			}
		}, delay);
	}

	private disable(): void {
		this.unavailable = true;
		clearTimeout(this.timer);
		this.worker?.terminate();
		this.worker = null;
		this.notify();
	}

	destroy(): void {
		clearTimeout(this.timer);
		this.worker?.terminate();
		this.worker = null;
		this.view = null;
		this.notify();
	}
}

class WorkerBackedLatexParser extends Parser {
	private readonly nest;

	constructor(
		private readonly client: LatexWorkerClient,
		private readonly fallback: Parser,
		nestedEnvironments: Record<string, Language>,
	) {
		super();
		this.nest = parseMixed((node, input) => {
			if (node.name !== 'VerbatimContent') return null;
			const before = input.read(Math.max(0, node.from - 64), node.from);
			const name = /\\begin\s*\{([^}]*)\}\s*$/.exec(before)?.[1]?.trim();
			const language = name ? nestedEnvironments[name] : undefined;
			return language ? { parser: language.parser } : null;
		});
	}

	createParse(
		input: Input,
		fragments: readonly TreeFragment[],
		ranges: readonly { from: number; to: number }[],
	): PartialParse {
		let base: PartialParse;
		if (input.length < LATEX_WORKER_THRESHOLD || this.client.unavailable) {
			base = this.fallback.createParse(input, fragments, ranges);
		} else {
			const doc = ParseContext.get()?.state.doc;
			const ready = doc ? this.client.getTree(doc) : null;
			base = ready
				? {
						parsedPos: input.length,
						stoppedAt: null,
						stopAt() {},
						advance() {
							return ready;
						},
					}
				: ParseContext.getSkippingParser(this.client.wait()).createParse(
						input,
						fragments,
						ranges,
					);
		}
		return this.nest(base, input, fragments, ranges);
	}
}

function buildHighlights(
	state: ViewUpdate['startState'],
	tree: Tree,
	ranges: readonly { from: number; to: number }[],
): DecorationSet {
	const highlighter: Highlighter = {
		style: (tags) => highlightingFor(state, tags),
	};
	const builder = new RangeSetBuilder<Decoration>();
	for (const range of ranges) {
		highlightTree(
			tree,
			highlighter,
			(from, to, classes) => {
				builder.add(from, to, Decoration.mark({ class: classes }));
			},
			range.from,
			range.to,
		);
	}
	return builder.finish();
}

export function asyncLatexLanguage(options: {
	fileName?: string;
	enableTooltips?: boolean;
	nestedEnvironments: Record<string, Language>;
}): LanguageSupport {
	const upstream = latex({
		autoCloseBrackets: false,
		enableAutocomplete: false,
		enableLinting: false,
		enableTooltips: options.enableTooltips,
		fileName: options.fileName,
	});
	const source = upstream.language;
	const client = new LatexWorkerClient(
		(source.parser as Parser & { nodeSet: NodeSet }).nodeSet,
	);
	const language = new Language(
		source.data,
		new WorkerBackedLatexParser(
			client,
			source.parser,
			options.nestedEnvironments,
		),
		[],
		source.name,
	);

	const plugin = ViewPlugin.fromClass(
		class {
			decorations: DecorationSet = Decoration.none;
			private previousRanges: readonly { from: number; to: number }[];

			constructor(view: EditorView) {
				this.previousRanges = view.visibleRanges;
				client.attach(view);
			}

			update(update: ViewUpdate): void {
				if (
					update.state.doc.length < LATEX_WORKER_THRESHOLD ||
					client.unavailable
				) {
					this.decorations = Decoration.none;
					if (update.docChanged) client.schedule(update.view);
					this.previousRanges = update.view.visibleRanges;
					return;
				}
				if (update.docChanged) {
					if (
						syntaxTreeAvailable(
							update.startState,
							this.previousRanges.at(-1)?.to ?? 0,
						) &&
						this.decorations === Decoration.none
					) {
						this.decorations = buildHighlights(
							update.startState,
							syntaxTree(update.startState),
							this.previousRanges,
						);
					}
					this.decorations = this.decorations.map(update.changes);
					client.schedule(update.view);
				} else if (syntaxTreeAvailable(update.state, update.view.viewport.to)) {
					this.decorations = Decoration.none;
				}
				this.previousRanges = update.view.visibleRanges;
			}

			destroy() {
				client.destroy();
			}
		},
		{ decorations: (value) => value.decorations },
	);

	return new LanguageSupport(language, [upstream.support, plugin]);
}
