// src/extensions/typst.ts/TypstPagedPreviewSource.ts
import type {
	PagedRendererNavigationTarget,
	PagedRendererPage,
	PagedRendererSource,
} from '../../plugins/PluginInterface';
import { sanitizeSvg } from '../../utils/svgSanitizer';
import { getTypstRenderer } from './TypstRendererRuntime';

const SAFE_SEMANTIC_TAGS = new Set(['SPAN', 'BR', 'A']);
const SAFE_STYLE_PROPERTIES = new Set([
	'font-size',
	'line-height',
	'left',
	'top',
	'width',
	'height',
	'transform',
	'transform-origin',
	'position',
	'display',
	'pointer-events',
	'z-index',
]);
const SAFE_BASE_ATTRIBUTES = new Set([
	'id',
	'class',
	'style',
	'title',
	'data-text-id',
	'data-matrix',
	'data-typst-label',
]);
const SAFE_ANCHOR_ATTRIBUTES = new Set(['href', 'target', 'rel', 'download']);
const NAVIGATION_ATTRIBUTES = new Set([
	'data-nav-page',
	'data-nav-x',
	'data-nav-y',
]);
const TYPST_LOCATION_HANDLER_RE =
	/^\s*handleTypstLocation\(this,\s*(\d+),\s*(-?(?:\d+(?:\.\d+)?|\.\d+)),\s*(-?(?:\d+(?:\.\d+)?|\.\d+))\)\s*;?\s*return false\s*;?\s*$/i;

interface TypstPagedPreviewOptions {
	allowRemoteUrls?: boolean;
}

interface TypstPageWindow extends PagedRendererPage {
	top: number;
}

interface ExtractedMediaPage {
	svg: string | null;
	reused: boolean;
	livePage: boolean;
}

let sourceSequence = 0;

function parseTypstNavigation(
	element: Element,
): PagedRendererNavigationTarget | null {
	const onclick = element.getAttribute('onclick');
	if (!onclick) return null;

	const match = onclick.match(TYPST_LOCATION_HANDLER_RE);
	if (!match) return null;

	const page = Number(match[1]);
	const x = Number(match[2]);
	const y = Number(match[3]);
	if (
		!Number.isInteger(page) ||
		page < 1 ||
		!Number.isFinite(x) ||
		!Number.isFinite(y)
	) {
		return null;
	}

	return { page, x, y };
}

function sanitizeLink(rawValue: string): string | null {
	const value = rawValue.trim();
	if (!value) return null;
	if (value.startsWith('#')) return value;

	let compact = '';
	for (const char of value) {
		const code = char.charCodeAt(0);
		if (code <= 0x1f || code === 0x7f || char.trim() === '') continue;
		compact += char;
	}
	compact = compact.toLowerCase();
	if (
		compact.startsWith('javascript:') ||
		compact.startsWith('vbscript:') ||
		compact.startsWith('file:')
	) {
		return null;
	}
	if (compact.startsWith('mailto:')) return value;

	try {
		const url = new URL(value, window.location.href);
		return url.protocol === 'http:' || url.protocol === 'https:' ? value : null;
	} catch {
		return null;
	}
}

function allowedSemanticAttribute(tagName: string, name: string): boolean {
	if (SAFE_BASE_ATTRIBUTES.has(name) || NAVIGATION_ATTRIBUTES.has(name)) {
		return true;
	}
	return tagName === 'A' && SAFE_ANCHOR_ATTRIBUTES.has(name);
}

function sanitizeSemanticHtml(html: string): DocumentFragment {
	const template = document.createElement('template');
	template.innerHTML = html;

	for (const element of Array.from(template.content.querySelectorAll('*'))) {
		if (element.matches('video, audio, source, track')) {
			element.remove();
			continue;
		}

		if (!SAFE_SEMANTIC_TAGS.has(element.tagName)) {
			element.replaceWith(...Array.from(element.childNodes));
			continue;
		}

		if (element instanceof HTMLAnchorElement) {
			const target = parseTypstNavigation(element);
			if (target) {
				element.setAttribute('href', '#');
				element.dataset.navPage = String(target.page);
				if (target.x !== undefined) element.dataset.navX = String(target.x);
				if (target.y !== undefined) element.dataset.navY = String(target.y);
			}
		}

		for (const attribute of Array.from(element.attributes)) {
			const name = attribute.name.toLowerCase();
			if (!allowedSemanticAttribute(element.tagName, name)) {
				element.removeAttribute(attribute.name);
				continue;
			}

			if (name === 'href' && !element.hasAttribute('data-nav-page')) {
				const href = sanitizeLink(attribute.value);
				if (href === null) element.removeAttribute(attribute.name);
				else element.setAttribute(attribute.name, href);
			}
		}

		if (element instanceof HTMLElement) {
			for (const property of Array.from(element.style)) {
				if (!SAFE_STYLE_PROPERTIES.has(property)) {
					element.style.removeProperty(property);
				}
			}
		}

		if (element instanceof HTMLAnchorElement) {
			const target = element.getAttribute('target');
			if (target && !/^_(?:blank|self|parent|top)$/i.test(target)) {
				element.removeAttribute('target');
			}
			if (element.target === '_blank') {
				element.rel = 'noopener noreferrer';
			}
		}
	}

	return template.content;
}

function installSemanticInteractions(
	container: HTMLDivElement,
	onNavigate?: (target: PagedRendererNavigationTarget) => void,
): void {
	container.onclick = (event) => {
		const target = event.target instanceof Element ? event.target : null;
		if (!target) return;

		if (target.closest('video, audio')) {
			event.stopPropagation();
			return;
		}

		const anchor = target.closest<HTMLAnchorElement>('a');
		if (!anchor) return;

		event.stopPropagation();

		const page = Number(anchor.dataset.navPage);
		if (!Number.isInteger(page) || page < 1) return;

		const x =
			anchor.dataset.navX === undefined
				? undefined
				: Number(anchor.dataset.navX);
		const y =
			anchor.dataset.navY === undefined
				? undefined
				: Number(anchor.dataset.navY);
		if (
			(x !== undefined && !Number.isFinite(x)) ||
			(y !== undefined && !Number.isFinite(y))
		) {
			return;
		}

		event.preventDefault();
		onNavigate?.({ page, x, y });
	};
}

function mediaElements(root: ParentNode): Element[] {
	return Array.from(root.querySelectorAll('*')).filter((element) => {
		const name = element.localName.toLowerCase();
		return name === 'video' || name === 'audio';
	});
}

function containsMedia(element: Element): boolean {
	const name = element.localName.toLowerCase();
	if (name === 'video' || name === 'audio') return true;

	for (const child of Array.from(element.children)) {
		if (containsMedia(child)) return true;
	}

	return false;
}

function pruneToMedia(element: Element): boolean {
	const name = element.localName.toLowerCase();
	if (name === 'video' || name === 'audio') return true;

	let hasMedia = false;
	for (const child of Array.from(element.children)) {
		if (pruneToMedia(child)) {
			hasMedia = true;
		} else {
			child.remove();
		}
	}

	return hasMedia;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_ANIMATION_RE =
	/<(?:[\w.-]+:)?(?:animate(?:Motion|Transform|Color)?|set)\b|@(?:-webkit-)?keyframes\b|\banimation(?:-[\w-]+)?\s*:/i;
const DEFINITION_ELEMENTS = 'defs, symbol, clipPath, mask, pattern, marker';

function hrefOf(element: Element): string | null {
	return element.getAttribute('href') ?? element.getAttribute('xlink:href');
}

function embeddedSvg(element: Element): SVGSVGElement | null {
	const href = hrefOf(element);
	if (
		element.localName !== 'image' ||
		!href?.startsWith('data:image/svg+xml,')
	) {
		return null;
	}
	try {
		const source = decodeURIComponent(href.slice('data:image/svg+xml,'.length));
		const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
		if (
			parsed.documentElement.localName !== 'svg' ||
			parsed.documentElement.namespaceURI !== SVG_NS ||
			parsed.querySelector('parsererror')
		)
			return null;
		if (
			!SVG_ANIMATION_RE.test(source) &&
			!parsed.querySelector('text, foreignObject')
		) {
			return null;
		}
		return parsed.documentElement as unknown as SVGSVGElement;
	} catch {
		return null;
	}
}

function completeDefinitions(
	document: Document,
	page: Element,
	cache: Map<string, Element>,
): void {
	const definitions = new Map<string, Element>();
	for (const element of document.querySelectorAll('defs [id]')) {
		definitions.set(element.id, element);
		if (!cache.has(element.id))
			cache.set(element.id, element.cloneNode(true) as Element);
	}
	const visited = new Set<string>();
	const defs = document.createElementNS(SVG_NS, 'defs');
	function visit(element: Element): void {
		for (const node of [
			element,
			...Array.from(element.querySelectorAll('*')),
		]) {
			for (const attribute of Array.from(node.attributes)) {
				const ids = Array.from(
					attribute.value.matchAll(/url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)/g),
					(match) => match[1],
				);
				if (attribute.localName === 'href' && attribute.value.startsWith('#')) {
					ids.push(attribute.value.slice(1));
				}
				for (const id of ids) {
					if (visited.has(id)) continue;
					visited.add(id);
					let target = definitions.get(id);
					if (!target) {
						const cached = cache.get(id);
						if (!cached) continue;
						target = document.importNode(cached, true);
						defs.append(target);
						definitions.set(id, target);
					}
					visit(target);
				}
			}
		}
	}
	visit(page);
	for (const element of document.querySelectorAll('defs.glyph > [id]')) {
		if (!visited.has(element.id)) element.remove();
	}
	if (defs.childElementCount) document.documentElement.prepend(defs);
}

function interactiveImages(root: Element) {
	const definitions = new Map(
		Array.from(root.querySelectorAll('[id]'), (element) => [
			element.id,
			element,
		]),
	);
	const images = new Map<string, SVGSVGElement | null>();
	const memo = new Map<Element, boolean>();
	function image(element: Element): SVGSVGElement | null {
		if (element.localName !== 'image') return null;
		const href = hrefOf(element) ?? '';
		if (!images.has(href)) images.set(href, embeddedSvg(element));
		return images.get(href) ?? null;
	}
	function reference(element: Element): Element | undefined {
		const href = hrefOf(element);
		return element.localName === 'use' && href?.startsWith('#')
			? definitions.get(href.slice(1))
			: undefined;
	}
	function contains(element: Element): boolean {
		if (memo.has(element)) return memo.get(element)!;
		memo.set(element, false);
		const target = reference(element);
		const result =
			!!image(element) ||
			(!!target && contains(target)) ||
			Array.from(element.children).some(
				(child) => !child.matches(DEFINITION_ELEMENTS) && contains(child),
			);
		memo.set(element, result);
		return result;
	}
	return { image, reference, contains };
}

function copyAttributes(from: Element, to: Element, excluded: string[]): void {
	for (const attribute of Array.from(from.attributes)) {
		if (!excluded.includes(attribute.localName)) {
			to.setAttributeNS(
				attribute.namespaceURI,
				attribute.name,
				attribute.value,
			);
		}
	}
}

function mountEmbeddedSvgs(
	root: SVGSVGElement,
	page: Element,
	allowRemoteUrls: boolean,
): void {
	const { image, reference, contains } = interactiveImages(root);
	const doc = root.ownerDocument;
	function visit(element: Element, ancestors = new Set<Element>()): void {
		const svg = image(element)?.cloneNode(true) as SVGSVGElement | undefined;
		if (svg) {
			const foreign = doc.createElementNS(SVG_NS, 'foreignObject');
			copyAttributes(element, foreign, ['href', 'preserveAspectRatio']);
			const width = svg.getAttribute('width');
			const height = svg.getAttribute('height');
			if (!svg.hasAttribute('viewBox') && width && height) {
				const w = Number.parseFloat(width);
				const h = Number.parseFloat(height);
				if (w > 0 && h > 0 && !width.includes('%') && !height.includes('%')) {
					svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
				}
			}
			svg.setAttribute('width', '100%');
			svg.setAttribute('height', '100%');
			svg.setAttribute(
				'preserveAspectRatio',
				element.getAttribute('preserveAspectRatio') ?? 'xMidYMid meet',
			);
			svg.style.display = 'block';
			const frame = document.createElement('iframe');
			frame.setAttribute('sandbox', '');
			frame.title =
				svg.querySelector('title')?.textContent || 'SVG illustration';
			frame.style.cssText =
				'display:block;width:100%;height:100%;border:0;pointer-events:auto;background:transparent;color-scheme:light dark';
			const resources = allowRemoteUrls
				? 'data: blob: https: http:'
				: 'data: blob:';
			const csp = `default-src 'none'; style-src 'unsafe-inline'; img-src ${resources}; media-src ${resources}; font-src ${resources};`;
			frame.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="${csp}"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;user-select:text;color-scheme:light dark}</style>${new XMLSerializer().serializeToString(svg)}`;
			const viewport = ['x', 'y', 'width', 'height'].map((name) =>
				Number(element.getAttribute(name) ?? '0'),
			);
			const [x, y, w, h] = viewport;
			if (viewport.every(Number.isFinite) && w > 0 && h > 0) {
				const factor =
					Math.min(w, h) < 32
						? Math.min(4096 / Math.max(w, h), 512 / Math.min(w, h))
						: 1;
				if (factor > 1) {
					foreign.setAttribute('x', '0');
					foreign.setAttribute('y', '0');
					foreign.setAttribute('width', String(w * factor));
					foreign.setAttribute('height', String(h * factor));
					foreign.setAttribute(
						'transform',
						`${element.getAttribute('transform') ?? ''} translate(${x} ${y}) scale(${1 / factor})`,
					);
				}
			}
			foreign.style.pointerEvents = 'auto';
			foreign.append(frame);
			element.replaceWith(foreign);
			return;
		}
		const target = reference(element);
		if (target && !ancestors.has(target) && contains(target)) {
			const wrapper = doc.createElementNS(SVG_NS, 'g');
			copyAttributes(element, wrapper, ['href', 'x', 'y', 'width', 'height']);
			let clone = target.cloneNode(true) as Element;
			if (target.localName === 'symbol') {
				clone = doc.createElementNS(SVG_NS, 'svg');
				copyAttributes(target, clone, ['id']);
				clone.append(
					...Array.from(target.childNodes, (node) => node.cloneNode(true)),
				);
			}
			clone.removeAttribute('id');
			const x = element.getAttribute('x') ?? '0';
			const y = element.getAttribute('y') ?? '0';
			if (clone.localName === 'svg') {
				for (const name of ['width', 'height']) {
					const value = element.getAttribute(name);
					if (value !== null) clone.setAttribute(name, value);
				}
				clone.setAttribute('x', x);
				clone.setAttribute('y', y);
			} else {
				const transform = wrapper.getAttribute('transform') ?? '';
				wrapper.setAttribute('transform', `${transform} translate(${x} ${y})`);
			}
			wrapper.append(clone);
			element.replaceWith(wrapper);
			visit(clone, new Set([...ancestors, target]));
			return;
		}
		for (const child of Array.from(element.children)) {
			if (!child.matches(DEFINITION_ELEMENTS)) visit(child, ancestors);
		}
	}
	visit(page);
}

function isolateMediaPage(document: Document, page: Element): void {
	for (const candidate of Array.from(
		document.querySelectorAll('.typst-page'),
	)) {
		if (candidate !== page) candidate.remove();
	}

	pruneToMedia(page);

	const root = document.documentElement;
	for (const child of Array.from(root.children)) {
		if (child === page) continue;

		const name = child.localName.toLowerCase();
		if (name === 'defs' || name === 'style') continue;
		if (containsMedia(child)) {
			pruneToMedia(child);
			continue;
		}

		child.remove();
	}
}

function extractMediaPage(
	svg: string,
	pageNumber: number,
	allowRemoteUrls: boolean,
	definitions: Map<string, Element>,
): ExtractedMediaPage {
	const sanitized = sanitizeSvg(svg, {
		baseUrl: window.location.href,
		allowRemoteUrls,
	});
	const document = new DOMParser().parseFromString(sanitized, 'image/svg+xml');
	if (document.querySelector('parsererror')) {
		return { svg: null, reused: false, livePage: false };
	}

	const page = document.querySelectorAll('.typst-page')[pageNumber - 1];
	if (!page) return { svg: null, reused: false, livePage: false };

	completeDefinitions(document, page, definitions);
	if (
		(page.hasAttribute('data-reuse-from') && !page.firstElementChild) ||
		Array.from(page.querySelectorAll('[data-reuse-from]')).some(
			(element) => !element.firstElementChild,
		)
	) {
		return { svg: null, reused: true, livePage: false };
	}
	const livePage =
		SVG_ANIMATION_RE.test(page.outerHTML) ||
		Array.from(
			document.documentElement.querySelectorAll(':scope > style'),
		).some((style) => SVG_ANIMATION_RE.test(style.textContent ?? '')) ||
		interactiveImages(document.documentElement).contains(page);
	if (livePage) {
		for (const candidate of Array.from(
			document.querySelectorAll('.typst-page'),
		)) {
			if (candidate !== page) candidate.remove();
		}
		for (const element of page.querySelectorAll(
			'foreignObject, .typst-content-hint',
		)) {
			if (
				!containsMedia(element) &&
				(element.matches(
					'.typst-text foreignObject, foreignObject.typst-text, .typst-content-hint',
				) ||
					!!element.querySelector('.tsel'))
			) {
				element.remove();
			}
		}
		for (const element of page.querySelectorAll('.pseudo-link'))
			element.remove();
	} else {
		if (!containsMedia(page))
			return { svg: null, reused: false, livePage: false };
		isolateMediaPage(document, page);
	}
	return {
		svg: new XMLSerializer().serializeToString(document.documentElement),
		reused: false,
		livePage,
	};
}

function prepareMediaSvg(
	svg: string,
	pageNumber: number,
	page: TypstPageWindow,
	scale: number,
	livePage: boolean,
	allowRemoteUrls: boolean,
): SVGSVGElement | null {
	const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
	if (document.querySelector('parsererror')) return null;

	const pages = Array.from(document.querySelectorAll('.typst-page'));
	const target = pages[pageNumber - 1] ?? pages[0];
	if (!target || (!livePage && !containsMedia(target))) return null;

	const root = document.documentElement as unknown as SVGSVGElement;
	root.classList.add('typst-media-overlay');
	target.removeAttribute('transform');
	root.setAttribute('viewBox', `0 0 ${page.width} ${page.height}`);
	root.setAttribute('width', String(page.width * scale));
	root.setAttribute('height', String(page.height * scale));
	root.setAttribute('preserveAspectRatio', 'xMinYMin meet');
	root.style.pointerEvents = 'none';
	root.style.lineHeight = 'normal';
	if (livePage) mountEmbeddedSvgs(root, target, allowRemoteUrls);

	for (const element of Array.from(root.querySelectorAll('*'))) {
		let current: Element | null = element;
		let insideForeignObject = false;
		while (current) {
			if (current.localName.toLowerCase() === 'foreignobject') {
				insideForeignObject = true;
				break;
			}
			current = current.parentElement;
		}
		if (insideForeignObject || (livePage && element.matches('text, a'))) {
			if (element instanceof HTMLElement || element instanceof SVGElement) {
				element.style.pointerEvents = 'auto';
			}
		}
		if (livePage && element instanceof SVGElement && element.matches('text')) {
			element.style.userSelect = 'text';
			element.style.cursor = 'text';
		}
	}

	return root;
}

function activateMedia(root: ParentNode): void {
	for (const element of mediaElements(root)) {
		const media = element as HTMLMediaElement;
		media.style.pointerEvents = 'auto';
		try {
			if (typeof media.load === 'function') media.load();
		} catch {}
	}
}

function mountMediaOverlay(
	container: HTMLDivElement,
	svg: string,
	pageNumber: number,
	page: TypstPageWindow,
	scale: number,
	livePage: boolean,
	allowRemoteUrls: boolean,
	renderKey: string,
): boolean {
	const existing = container.firstElementChild as HTMLDivElement | null;
	const root = existing?.shadowRoot?.querySelector('svg');
	if (container.dataset.renderKey === renderKey && existing && root) {
		existing.style.width = `${page.width * scale}px`;
		existing.style.height = `${page.height * scale}px`;
		root.setAttribute('width', String(page.width * scale));
		root.setAttribute('height', String(page.height * scale));
		return true;
	}
	const overlay = prepareMediaSvg(
		svg,
		pageNumber,
		page,
		scale,
		livePage,
		allowRemoteUrls,
	);
	if (!overlay) {
		container.replaceChildren();
		return false;
	}

	const host = document.createElement('div');
	host.className = 'typst-media-host';
	host.style.all = 'initial';
	host.style.display = 'block';
	host.style.pointerEvents = 'none';
	host.style.width = `${page.width * scale}px`;
	host.style.height = `${page.height * scale}px`;
	const shadow = host.attachShadow({ mode: 'open' });
	shadow.replaceChildren(overlay);
	container.replaceChildren(host);
	container.dataset.renderKey = renderKey;

	requestAnimationFrame(() => activateMedia(shadow));
	return true;
}

export class TypstPagedPreviewSource implements PagedRendererSource {
	readonly id = `typst-preview-${++sourceSequence}`;
	readonly typeLabel = 'Typst Vector';
	readonly mimeType = 'application/x-texlyre-typst-vector';
	readonly byteLength: number;

	private renderer: any = null;
	private session: any = null;
	private pages: PagedRendererPage[] | null = null;
	private pageWindows: TypstPageWindow[] = [];
	private readyPromise: Promise<void>;
	private releaseSession: (() => void) | null = null;
	private disposed = false;
	private queue: Promise<void> = Promise.resolve();
	private semantics = new Map<number, string>();
	private mediaPages = new Map<number, ExtractedMediaPage>();
	private definitions = new Map<string, Element>();

	constructor(
		private readonly artifact: Uint8Array,
		private readonly options: TypstPagedPreviewOptions = {},
	) {
		this.byteLength = artifact.byteLength;
		this.readyPromise = this.initialize();
	}

	async getPages(signal?: AbortSignal): Promise<readonly PagedRendererPage[]> {
		await this.readyPromise;
		this.throwIfCancelled(signal);
		return this.pages ?? [];
	}

	async renderPage(options: {
		page: number;
		canvas: HTMLCanvasElement;
		interactiveContainer?: HTMLDivElement;
		scale: number;
		signal: AbortSignal;
	}): Promise<void> {
		await this.readyPromise;
		this.throwIfCancelled(options.signal);

		const container = options.interactiveContainer;
		const pageWindow = this.pageWindows[options.page - 1];
		if (!pageWindow) return;
		if (container) {
			const media = await this.getMediaPage(options.page, options.signal);
			this.throwIfCancelled(options.signal);
			container.style.width = `${pageWindow.width * options.scale}px`;
			container.style.height = `${pageWindow.height * options.scale}px`;
			const mounted =
				media.svg &&
				mountMediaOverlay(
					container,
					media.svg,
					options.page,
					pageWindow,
					options.scale,
					media.livePage,
					this.options.allowRemoteUrls !== false,
					`${this.id}:${options.page}`,
				);
			if (!mounted) {
				container.replaceChildren();
				delete container.dataset.renderKey;
			}
			container.style.visibility = 'visible';
			if (mounted && media.livePage) {
				options.canvas.style.visibility = 'hidden';
				if (options.canvas.width) options.canvas.width = 0;
				if (options.canvas.height) options.canvas.height = 0;
				return;
			}
		}
		options.canvas.style.visibility = '';

		await this.enqueue(async () => {
			this.throwIfCancelled(options.signal);
			const page = this.pages?.[options.page - 1];
			if (!page) return;

			const dpr = Math.max(1, window.devicePixelRatio || 1);
			const pixelPerPt = Math.max(0.5, options.scale * dpr);
			const width = Math.max(1, Math.ceil(page.width * pixelPerPt));
			const height = Math.max(1, Math.ceil(page.height * pixelPerPt));
			const context = options.canvas.getContext('2d', { alpha: false });
			if (!context) throw new Error('Canvas 2D context unavailable');

			if (options.canvas.width !== width) options.canvas.width = width;
			if (options.canvas.height !== height) options.canvas.height = height;

			await this.renderer.renderCanvas({
				renderSession: this.session,
				pageOffset: options.page - 1,
				canvas: context,
				pixelPerPt,
				backgroundColor: '#ffffff',
				dataSelection: { body: true, semantics: false },
			});

			this.throwIfCancelled(options.signal);
		});
	}

	async renderTextLayer(options: {
		page: number;
		container: HTMLDivElement;
		scale: number;
		signal: AbortSignal;
		onNavigate?: (target: PagedRendererNavigationTarget) => void;
	}): Promise<void> {
		await this.readyPromise;
		this.throwIfCancelled(options.signal);

		const html = await this.getSemantics(options.page, options.signal);

		this.throwIfCancelled(options.signal);
		const page = this.pageWindows[options.page - 1];
		if (!page) return;

		options.container.onclick = null;
		options.container.replaceChildren(sanitizeSemanticHtml(html));
		installSemanticInteractions(options.container, options.onNavigate);
		options.container.classList.add('typst-html-semantics');
		options.container.style.width = `${page.width * options.scale}px`;
		options.container.style.height = `${page.height * options.scale}px`;
		options.container.style.setProperty(
			'--data-text-width',
			`${options.scale}px`,
		);
		options.container.style.setProperty(
			'--data-text-height',
			`${options.scale}px`,
		);
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		this.semantics.clear();
		this.mediaPages.clear();
		this.definitions.clear();
		this.releaseSession?.();
		this.releaseSession = null;
	}

	private async getSemantics(
		page: number,
		signal: AbortSignal,
	): Promise<string> {
		const cached = this.semantics.get(page);
		if (cached !== undefined) return cached;

		await this.enqueue(async () => {
			this.throwIfCancelled(signal);
			if (this.semantics.has(page)) return;

			const result = await this.renderer.renderCanvas({
				renderSession: this.session,
				pageOffset: page - 1,
				dataSelection: { body: false, semantics: true },
			});
			const html = result.htmlSemantics?.[0] ?? '';
			this.semantics.set(page, html);
		});

		return this.semantics.get(page) ?? '';
	}

	private async getMediaPage(
		pageNumber: number,
		signal: AbortSignal,
	): Promise<ExtractedMediaPage> {
		const empty = { svg: null, reused: false, livePage: false };
		const cached = this.mediaPages.get(pageNumber);
		if (cached) return cached;

		await this.enqueue(async () => {
			this.throwIfCancelled(signal);
			if (this.mediaPages.has(pageNumber)) return;

			const page = this.pageWindows[pageNumber - 1];
			if (!page) {
				this.mediaPages.set(pageNumber, empty);
				return;
			}

			let extracted = this.extractMediaWindow(pageNumber, page);
			if (extracted.reused && extracted.svg === null) {
				this.renderer.renderSvgDiff({
					renderSession: this.session,
					window: {
						lo: { x: 0, y: -2 },
						hi: { x: 1, y: -1 },
					},
				});
				extracted = this.extractMediaWindow(pageNumber, page);
			}

			this.mediaPages.set(pageNumber, extracted);
		});

		return this.mediaPages.get(pageNumber) ?? empty;
	}

	private extractMediaWindow(
		pageNumber: number,
		page: TypstPageWindow,
	): ExtractedMediaPage {
		const epsilon = Math.min(0.01, page.height / 1000);
		const svg = this.renderer.renderSvgDiff({
			renderSession: this.session,
			window: {
				lo: { x: 0, y: page.top + epsilon },
				hi: {
					x: page.width,
					y: Math.max(page.top + epsilon, page.top + page.height - epsilon),
				},
			},
		});

		return extractMediaPage(
			String(svg),
			pageNumber,
			this.options.allowRemoteUrls !== false,
			this.definitions,
		);
	}

	private async initialize(): Promise<void> {
		this.renderer = await getTypstRenderer();
		if (this.disposed) return;

		let readyResolve!: () => void;
		let readyReject!: (error: unknown) => void;
		const ready = new Promise<void>((resolve, reject) => {
			readyResolve = resolve;
			readyReject = reject;
		});
		const hold = new Promise<void>((resolve) => {
			this.releaseSession = resolve;
		});

		void this.renderer
			.runWithSession(
				{ format: 'vector', artifactContent: this.artifact },
				async (session: any) => {
					this.session = session;
					const rawPages = session.retrievePagesInfo?.() ?? [];
					let top = 0;
					this.pageWindows = rawPages.map((page: any) => {
						const window = {
							top,
							width: page.width,
							height: page.height,
						};
						top += page.height;
						return window;
					});
					this.pages = this.pageWindows.map(({ width, height }) => ({
						width,
						height,
					}));
					readyResolve();
					await hold;
				},
			)
			.catch(readyReject);

		await ready;
	}

	private enqueue(task: () => Promise<void>): Promise<void> {
		const next = this.queue.then(task, task);
		this.queue = next.catch(() => undefined);
		return next;
	}

	private throwIfCancelled(signal?: AbortSignal): void {
		if (this.disposed || signal?.aborted) {
			throw new DOMException('Aborted', 'AbortError');
		}
	}
}

export const createTypstPagedPreviewSource = (
	artifact: Uint8Array,
	options?: TypstPagedPreviewOptions,
) => new TypstPagedPreviewSource(artifact, options);
