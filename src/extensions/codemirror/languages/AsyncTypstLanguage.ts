// src/extensions/codemirror/languages/AsyncTypstLanguage.ts
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
	type Input,
	type NodeSet,
	type Parser as ParserType,
	type PartialParse,
	type TreeFragment,
	Parser,
} from '@lezer/common';
import { highlightTree, type Highlighter } from '@lezer/highlight';

import { getAnnotationMaskRanges } from '../annotations/annotationMasking';
import { safeTypst } from './safeTypstPatch';

type MaskRange = { from: number; to: number };

type WorkerResult = {
	id: number;
	buffer?: number[];
	topID?: number;
	length?: number;
	error?: string;
};

const PARSE_DELAY = 350;
export const TYPST_WORKER_THRESHOLD = 50_000;

class TypstWorkerClient {
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
		if (view.state.doc.length >= TYPST_WORKER_THRESHOLD) this.schedule(view, 0);
	}

	private ensureWorker(): void {
		if (this.worker || this.unavailable) return;
		try {
			this.worker = new Worker(
				new URL('./typstParsing.worker.ts', import.meta.url),
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
			return;
		}
	}

	schedule(view: EditorView, delay = PARSE_DELAY): void {
		if (view.state.doc.length < TYPST_WORKER_THRESHOLD) {
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
				} satisfies { id: number; text: string; masks: MaskRange[] });
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

class WorkerBackedParser extends Parser {
	constructor(
		private readonly client: TypstWorkerClient,
		private readonly fallback: ParserType,
	) {
		super();
	}

	createParse(
		input: Input,
		fragments: readonly TreeFragment[],
		ranges: readonly { from: number; to: number }[],
	): PartialParse {
		if (input.length < TYPST_WORKER_THRESHOLD || this.client.unavailable) {
			return this.fallback.createParse(input, fragments, ranges);
		}
		const doc = ParseContext.get()?.state.doc;
		const ready = doc ? this.client.getTree(doc) : null;
		if (ready) {
			return {
				parsedPos: input.length,
				stoppedAt: null,
				stopAt() {},
				advance() {
					return ready;
				},
			};
		}
		return ParseContext.getSkippingParser(this.client.wait()).createParse(
			input,
			fragments,
			ranges,
		);
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

export function asyncTypstLanguage(enableLinting: boolean): LanguageSupport {
	const upstream = safeTypst({ enableLinting });
	const source = upstream.language;
	const client = new TypstWorkerClient(
		(source.parser as Parser & { nodeSet: NodeSet }).nodeSet,
	);
	const language = new Language(
		source.data,
		new WorkerBackedParser(client, source.parser),
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

			update(update: ViewUpdate) {
				if (
					update.state.doc.length < TYPST_WORKER_THRESHOLD ||
					client.unavailable
				) {
					this.decorations = Decoration.none;
					if (update.docChanged) client.schedule(update.view);
					this.previousRanges = update.view.visibleRanges;
					return;
				}
				const oldTree = syntaxTree(update.startState);
				if (update.docChanged) {
					if (
						syntaxTreeAvailable(update.startState) &&
						this.decorations === Decoration.none
					) {
						this.decorations = buildHighlights(
							update.startState,
							oldTree,
							this.previousRanges,
						);
					}
					this.decorations = this.decorations.map(update.changes);
					client.schedule(update.view);
				} else if (syntaxTreeAvailable(update.state)) {
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
