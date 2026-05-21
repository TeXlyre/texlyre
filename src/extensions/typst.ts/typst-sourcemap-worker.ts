/// <reference lib="webworker" />
export {};

declare const self: DedicatedWorkerGlobalScope;

interface PageInfo {
	pageOffset: number;
	width: number;
	height: number;
}
interface Overlay {
	text: string;
	page: number;
	x: number;
	y: number;
	width: number;
	height: number;
}

interface BuildMessage {
	id: string;
	type: 'build';
	payload: {
		svg: string;
		pageInfos: PageInfo[];
		sources: Record<string, string>;
		mainFile?: string;
	};
}

interface AnnotatedRect {
	page: number;
	file: string;
	line: number;
	x: number;
	y: number;
	width: number;
	height: number;
}

interface BuildResult {
	forwardEntries: Array<[string, AnnotatedRect[]]>;
	reverseEntries: Array<[number, AnnotatedRect[]]>;
	fileInCodeBlock: Array<[string, boolean[]]>;
}

type SourceKind = 'heading' | 'list' | 'prose' | 'raw' | 'impl';
type OverlayKind = 'prose' | 'codeish' | 'short';

interface SourceFile {
	lines: string[];
	code: boolean[];
	kind: SourceKind[];
	shingles: Map<string, number[]>;
}

interface Candidate {
	file: string;
	line: number;
	score: number;
	hits: number;
	left: number;
	right: number;
	window: string;
	exact: boolean;
	tight: boolean;
	kind: SourceKind;
}

interface Window {
	text: string;
	start: number;
}

const FENCE = /^\s*```/;
const RAW = /#raw\s*\(/;
const TAG = /<(\/?)([a-zA-Z][\w:-]*)\b([^>]*?)(\/?)>/g;
const ATTR = /(\w[\w:-]*)\s*=\s*"([^"]*)"/g;
const TEXT = />([^<]+)</g;
const TR = /translate\(\s*(-?[\d.]+)(?:\s*[, ]\s*(-?[\d.]+))?\s*\)/;
const SC = /scale\(\s*(-?[\d.]+)(?:\s*[, ]\s*(-?[\d.]+))?\s*\)/;

const CONTEXT = 10;
const SOURCE_CONTEXT = 6;
const SHORT = 12;
const MARGIN = 4;
const SHINGLE = 6;

const WEAK = new Set([
	'the',
	'a',
	'an',
	'and',
	'or',
	'is',
	'are',
	'to',
	'in',
	'of',
	'with',
	'for',
	'from',
	'true',
	'false',
	'none',
	'auto',
	'default',
	'width',
	'height',
	'title',
	'description',
	'audio',
	'video',
	'media',
	'source',
	'sources',
	'fallback',
	'background',
	'local',
	'remote',
]);

function norm(s: string): string {
	return s
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/[“”]/g, '"')
		.replace(/[‘’]/g, "'")
		.replace(/[‐-‒–—]/g, '-')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

function commandLike(s: string): boolean {
	return /^[a-z_][\w-]*(?:\(\))?$/.test(s);
}

function overlayKind(s: string): OverlayKind {
	if (s.length < 10) return 'short';
	if (/[#{}();=<>]|:\s*["\w-]/.test(s)) return 'codeish';
	return 'prose';
}

function usefulContext(s: string): boolean {
	const words = s.split(/\s+/).filter((w) => w.length > 2 && !WEAK.has(w));
	return s.length >= 18 || words.length >= 2 || /[`#:/.-]/.test(s);
}

function stripComment(s: string): string {
	let quoted = false;

	for (let i = 0; i < s.length - 1; i++) {
		if (s[i] === '"' && s[i - 1] !== '\\') quoted = !quoted;
		if (
			!quoted &&
			s[i] === '/' &&
			s[i + 1] === '/' &&
			(i === 0 || /\s/.test(s[i - 1]))
		) {
			return s.slice(0, i);
		}
	}

	return s;
}

function sourceKind(raw: string, code: boolean): SourceKind {
	const t = raw.trim();

	if (code) return 'raw';
	if (/^\s*=+\s+\S/.test(raw)) return 'heading';
	if (/^\s*[-+*]\s+\S/.test(raw)) return 'list';

	if (
		!t ||
		t.startsWith('#') ||
		/^let\s+/.test(t) ||
		/^if\s+/.test(t) ||
		/^else\b/.test(t) ||
		/^[a-zA-Z_]\w*\s*=/.test(t) ||
		/^[a-zA-Z_][\w-]*\s*:/.test(t) ||
		/"\s*\+|\+\s*"/.test(t) ||
		/<\/?\w+[^>]*>/.test(t) ||
		/^[\]})],?$/.test(t)
	) {
		return 'impl';
	}

	return 'prose';
}

function visibleTypst(s: string, kind: SourceKind): string {
	if (kind === 'raw') return norm(s);
	if (kind === 'impl') return '';

	return norm(
		stripComment(s)
			.replace(/#(?:link|text|emph|strong)(?:\([^)]*\))?\[([^\]]*)\]/g, '$1')
			.replace(/^\s*=+\s*/, '')
			.replace(/^\s*[-+*]\s+/, '')
			.replace(/^\s*\d+[.)]\s+/, '')
			.replace(/^[)\]]*\s*\[([^\]]*)\]\s*,?$/, '$1')
			.replace(/<[^>]+>/g, '')
			.replace(/[`*_~]/g, ''),
	);
}

function buildSourceIndex(
	sources: Record<string, string>,
): Map<string, SourceFile> {
	const out = new Map<string, SourceFile>();

	for (const [file, content] of Object.entries(sources)) {
		const raw = content.split(/\r?\n/);
		const code = new Array(raw.length).fill(false);
		const kind = new Array<SourceKind>(raw.length);
		let fenced = false;

		for (let i = 0; i < raw.length; i++) {
			if (FENCE.test(raw[i])) {
				code[i] = true;
				fenced = !fenced;
			} else {
				code[i] = fenced || RAW.test(raw[i]);
			}
			kind[i] = sourceKind(raw[i], code[i]);
		}

		const lines = raw.map((line, i) => visibleTypst(line, kind[i]));
		const shingles = new Map<string, number[]>();

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			for (let p = 0; p + SHINGLE <= line.length; p++) {
				const key = line.slice(p, p + SHINGLE);
				const bucket = shingles.get(key);
				if (bucket) {
					if (bucket[bucket.length - 1] !== i) bucket.push(i);
				} else {
					shingles.set(key, [i]);
				}
			}
		}

		out.set(file, { lines, code, kind, shingles });
	}

	return out;
}

function parseAttrs(s: string): Map<string, string> {
	const out = new Map<string, string>();
	let m: RegExpExecArray | null;

	ATTR.lastIndex = 0;
	while ((m = ATTR.exec(s))) out.set(m[1], m[2]);

	return out;
}

function textFromHtml(s: string): string {
	const parts: string[] = [];
	let m: RegExpExecArray | null;

	TEXT.lastIndex = 0;
	while ((m = TEXT.exec(s))) {
		const part = norm(m[1]);
		if (part) parts.push(part);
	}

	return norm(parts.join(' '));
}

function pageAt(
	pages: PageInfo[],
	y: number,
): { page: number; offset: number } {
	let offset = 0;

	for (let i = 0; i < pages.length; i++) {
		if (y < offset + pages[i].height) return { page: i + 1, offset };
		offset += pages[i].height;
	}

	const last = Math.max(0, pages.length - 1);
	return { page: last + 1, offset: offset - (pages[last]?.height ?? 0) };
}

function transformOf(
	parent: { tx: number; ty: number; sx: number; sy: number },
	attrs: string,
): { tx: number; ty: number; sx: number; sy: number } {
	const transform = /transform\s*=\s*"([^"]*)"/.exec(attrs);
	let { tx, ty, sx, sy } = parent;

	if (!transform) return { tx, ty, sx, sy };

	const t = TR.exec(transform[1]);
	const s = SC.exec(transform[1]);

	if (t) {
		tx += Number.parseFloat(t[1]) * parent.sx;
		ty += Number.parseFloat(t[2] ?? '0') * parent.sy;
	}

	if (s) {
		sx *= Number.parseFloat(s[1]);
		sy *= Number.parseFloat(s[2] ?? s[1]);
	}

	return { tx, ty, sx, sy };
}

function collectOverlays(svg: string, pages: PageInfo[]): Overlay[] {
	const overlays: Overlay[] = [];
	const stack = [{ tx: 0, ty: 0, sx: 1, sy: 1 }];
	let m: RegExpExecArray | null;

	TAG.lastIndex = 0;

	while ((m = TAG.exec(svg))) {
		const closing = m[1] === '/';
		const tag = m[2].toLowerCase();
		const attrs = m[3];
		const selfClosing = m[4] === '/';

		if (closing) {
			if (stack.length > 1) stack.pop();
			continue;
		}

		const current = transformOf(stack[stack.length - 1], attrs);

		if (tag === 'foreignobject') {
			const close = svg.indexOf('</foreignObject>', TAG.lastIndex);
			if (close === -1) continue;

			const attr = parseAttrs(attrs);
			const text = textFromHtml(svg.slice(TAG.lastIndex, close));
			TAG.lastIndex = close + '</foreignObject>'.length;

			if (!text) continue;

			const x = Number.parseFloat(attr.get('x') ?? '0');
			const y = Number.parseFloat(attr.get('y') ?? '0');
			const w = Number.parseFloat(attr.get('width') ?? '0');
			const h = Number.parseFloat(attr.get('height') ?? '0');
			const docY = current.ty + y * current.sy;
			const page = pageAt(pages, docY);

			overlays.push({
				text,
				page: page.page,
				x: current.tx + x * current.sx,
				y: docY - page.offset,
				width: Math.abs(w * current.sx),
				height: Math.abs(h * current.sy),
			});

			continue;
		}

		if (!selfClosing) stack.push(current);
	}

	return overlays;
}

function sourceWindow(lines: string[], i: number): Window {
	const from = Math.max(0, i - SOURCE_CONTEXT);
	const to = Math.min(lines.length, i + SOURCE_CONTEXT + 1);
	let text = '';
	let start = 0;

	for (let j = from; j < to; j++) {
		if (text) text += ' ';
		if (j === i) start = text.length;
		text += lines[j];
	}

	return { text, start };
}

function candidateScore(
	src: SourceFile,
	i: number,
	base: number,
	exact: boolean,
	tight: boolean,
): number {
	const kind =
		src.kind[i] === 'heading'
			? 1000
			: src.kind[i] === 'list'
				? 100
				: src.kind[i] === 'prose'
					? 40
					: src.kind[i] === 'raw'
						? -20
						: -300;

	return base + kind + (exact ? 30 : tight ? 8 : 1);
}

function seed(
	index: Map<string, SourceFile>,
	target: string,
	command: boolean,
	oKind: OverlayKind,
	mainFile?: string,
): Candidate[] {
	const out: Candidate[] = [];
	const key = target.length >= SHINGLE ? target.slice(0, SHINGLE) : null;
	const tightBound = command ? target.length + 3 : target.length * 1.4;
	const mainDir = mainFile?.slice(0, mainFile.lastIndexOf('/') + 1) ?? '';
	const windowCache = new Map<string, Window>();

	const visit = (
		file: string,
		src: SourceFile,
		i: number,
		base: number,
	): void => {
		const line = src.lines[i];
		if (!line) return;

		let at = line.indexOf(target);
		if (at === -1) return;

		const exact = line === target;
		const tight = line.length <= tightBound;
		const kind = src.kind[i];

		if (command && !exact && !tight && kind !== 'raw' && kind !== 'list')
			return;
		if (oKind === 'prose' && kind === 'impl') return;

		const cacheKey = `${file}:${i}`;
		let win = windowCache.get(cacheKey);
		if (!win) {
			win = sourceWindow(src.lines, i);
			windowCache.set(cacheKey, win);
		}

		const score = candidateScore(src, i, base, exact, tight);

		while (at !== -1) {
			const left = win.start + at;
			out.push({
				file,
				line: i + 1,
				score,
				hits: 0,
				left,
				right: left + target.length,
				window: win.text,
				exact,
				tight,
				kind,
			});
			at = line.indexOf(target, at + target.length);
		}
	};

	for (const [file, src] of index) {
		const isLocal = mainDir
			? file.startsWith(mainDir)
			: !file.includes('/packages/') && !file.startsWith('@');
		const base = file === mainFile ? 100 : isLocal ? 50 : 0;

		if (key) {
			const bucket = src.shingles.get(key);
			if (!bucket) continue;
			for (const i of bucket) visit(file, src, i, base);
		} else {
			for (let i = 0; i < src.lines.length; i++) visit(file, src, i, base);
		}
	}

	const exactHeadings = out.filter((c) => c.kind === 'heading' && c.exact);
	if (exactHeadings.length) return exactHeadings;

	const exact = out.filter((c) => c.exact);
	return exact.length ? exact : out;
}

function walk(
	candidates: Candidate[],
	before: string[],
	after: string[],
): Candidate[] {
	let current = candidates;

	for (let d = 1; d <= CONTEXT; d++) {
		const prev = before[before.length - d] ?? '';
		const next = after[d - 1] ?? '';
		if (!prev && !next) break;

		const usePrev = prev && usefulContext(prev) ? prev : '';
		const useNext = next && usefulContext(next) ? next : '';
		if (!usePrev && !useNext) continue;

		const bonus = CONTEXT + 1 - d;
		const walked: Candidate[] = [];

		for (const c of current) {
			let { left, right, score, hits } = c;
			let matched = false;

			if (usePrev) {
				const found = c.window.lastIndexOf(usePrev, left - 1);
				if (found !== -1) {
					left = found;
					score += bonus;
					hits++;
					matched = true;
				}
			}
			if (useNext) {
				const found = c.window.indexOf(useNext, right);
				if (found !== -1) {
					right = found + useNext.length;
					score += bonus;
					hits++;
					matched = true;
				}
			}

			if (matched) walked.push({ ...c, left, right, score, hits });
		}

		if (walked.length) current = walked;
		if (current.length <= 1) break;
	}

	return current;
}

function choose(
	candidates: Candidate[],
	target: string,
	command: boolean,
): Candidate | null {
	candidates.sort(
		(a, b) =>
			b.hits - a.hits ||
			b.score - a.score ||
			a.file.localeCompare(b.file) ||
			a.line - b.line,
	);

	const best = candidates[0];
	const second = candidates[1];

	if (!best) return null;

	if (!second) {
		if (command)
			return best.exact || best.tight || best.hits >= 2 ? best : null;
		if (best.kind === 'raw' && target.length < 10 && best.hits < 2) return null;
		if (target.length < 8 && !best.exact && best.hits < 2) return null;
		return target.length >= SHORT ||
			best.hits > 0 ||
			best.kind === 'heading' ||
			best.kind === 'list'
			? best
			: null;
	}

	if (best.kind === 'heading' && second.kind !== 'heading' && best.exact)
		return best;

	if (command) {
		if (best.kind === 'raw' && best.hits < 2) return null;
		if (!best.exact && !best.tight && best.kind !== 'list' && best.hits < 2)
			return null;
		if (best.hits === second.hits && best.score - second.score < MARGIN + 2)
			return null;
		return best;
	}

	if (target.length < 8 && !best.exact && best.hits < 2) return null;
	if (best.kind === 'raw' && target.length < 10 && best.hits < 2) return null;
	if (best.hits === 0 && best.kind !== 'heading' && best.kind !== 'list')
		return null;
	if (best.hits === second.hits && best.score - second.score < MARGIN)
		return null;

	return best;
}

function findLine(
	index: Map<string, SourceFile>,
	target: string,
	before: string[],
	after: string[],
	mainFile?: string,
): { file: string; line: number } | null {
	if (!target) return null;

	const command = commandLike(target);
	const oKind = overlayKind(target);
	const best = choose(
		walk(seed(index, target, command, oKind, mainFile), before, after),
		target,
		command,
	);
	return best ? { file: best.file, line: best.line } : null;
}

function context(
	overlays: Overlay[],
	i: number,
): { before: string[]; after: string[] } {
	const before: string[] = [];
	const after: string[] = [];
	const page = overlays[i].page;

	for (
		let k = i - 1, d = 0;
		k >= 0 && d < CONTEXT && overlays[k].page === page;
		k--, d++
	) {
		before.push(overlays[k].text);
	}
	before.reverse();

	for (
		let k = i + 1, d = 0;
		k < overlays.length && d < CONTEXT && overlays[k].page === page;
		k++, d++
	) {
		after.push(overlays[k].text);
	}

	return { before, after };
}

function addRect(
	forward: Map<string, AnnotatedRect[]>,
	reverse: Map<number, AnnotatedRect[]>,
	rect: AnnotatedRect,
): void {
	const key = `${rect.file}:${rect.line}`;
	let f = forward.get(key);
	if (!f) {
		f = [];
		forward.set(key, f);
	}
	f.push(rect);

	let r = reverse.get(rect.page);
	if (!r) {
		r = [];
		reverse.set(rect.page, r);
	}
	r.push(rect);
}

function build(
	svg: string,
	pageInfos: PageInfo[],
	sources: Record<string, string>,
	mainFile?: string,
): BuildResult {
	const index = buildSourceIndex(sources);
	const overlays = collectOverlays(svg, pageInfos);
	const forward = new Map<string, AnnotatedRect[]>();
	const reverse = new Map<number, AnnotatedRect[]>();

	for (let i = 0; i < overlays.length; i++) {
		const entry = overlays[i];
		const ctx = context(overlays, i);
		const match = findLine(index, entry.text, ctx.before, ctx.after, mainFile);
		if (!match) continue;

		addRect(forward, reverse, {
			page: entry.page,
			file: match.file,
			line: match.line,
			x: entry.x,
			y: entry.y,
			width: entry.width,
			height: entry.height,
		});
	}

	return {
		forwardEntries: Array.from(forward.entries()),
		reverseEntries: Array.from(reverse.entries()),
		fileInCodeBlock: Array.from(index.entries()).map(
			([file, src]) => [file, src.code] as [string, boolean[]],
		),
	};
}

self.addEventListener('message', (e: MessageEvent<BuildMessage>) => {
	const { id, type, payload } = e.data;
	if (type !== 'build') return;

	try {
		self.postMessage({
			id,
			type: 'done',
			result: build(
				payload.svg,
				payload.pageInfos,
				payload.sources,
				payload.mainFile,
			),
		});
	} catch (error) {
		self.postMessage({
			id,
			type: 'error',
			error: error instanceof Error ? error.message : String(error),
		});
	}
});
