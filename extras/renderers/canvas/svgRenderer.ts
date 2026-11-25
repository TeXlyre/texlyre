// extras/renderers/canvas/svgRenderer.ts
import type { RefObject } from 'react';

let workerInstance: Worker | null = null;

function getWorker(): Worker {
	if (!workerInstance) {
		workerInstance = new Worker(
			new URL('./svg-worker.ts?worker', import.meta.url),
			{ type: 'module' },
		);
	}
	return workerInstance;
}

export function invalidateSvgOverlayCache(container: HTMLDivElement): void {
	svgOverlayCache.delete(container);
}

export function parseSvgPages(
	svgBuffer: ArrayBuffer,
	options: { trusted?: boolean; allowRemoteUrls?: boolean } = {},
): Promise<{
	pages: Map<number, string>;
	metadata: Map<number, { width: number; height: number }>;
}> {
	return new Promise((resolve, reject) => {
		const worker = getWorker();

		const handleMessage = (e: MessageEvent) => {
			if (e.data.type === 'parsed') {
				worker.removeEventListener('message', handleMessage);

				const pages = new Map<number, string>(e.data.pages);
				const metadata = new Map<number, { width: number; height: number }>(
					e.data.metadata,
				);

				resolve({ pages, metadata });
			} else if (e.data.type === 'error') {
				worker.removeEventListener('message', handleMessage);
				reject(new Error(e.data.error));
			}
		};

		worker.addEventListener('message', handleMessage);
		worker.postMessage({
			type: 'parse',
			svgBuffer,
			trusted: options.trusted,
			allowRemoteUrls: options.allowRemoteUrls,
		});
	});
}

export interface SvgRenderContext {
	svgPagesRef: RefObject<Map<number, string>>;
	canvasRefs: RefObject<Map<number, HTMLCanvasElement>>;
	pageMetadata: Map<number, { width: number; height: number }>;
	scale: number;
	interactive: boolean;
	renderingRef: RefObject<Set<number>>;
	pendingRenderRef: RefObject<Set<number>>;
	renderTokensRef: RefObject<Map<number, number>>;
}

export function renderSvgPageToCanvas(
	ctx: SvgRenderContext,
	pageNumber: number,
) {
	const {
		svgPagesRef,
		canvasRefs,
		pageMetadata,
		scale,
		interactive,
		renderingRef,
		pendingRenderRef,
		renderTokensRef,
	} = ctx;

	const token = (renderTokensRef.current.get(pageNumber) || 0) + 1;
	renderTokensRef.current.set(pageNumber, token);

	if (renderingRef.current.has(pageNumber)) {
		pendingRenderRef.current.add(pageNumber);
		return;
	}

	const canvas = canvasRefs.current.get(pageNumber);
	if (!canvas) return;

	const svgString = svgPagesRef.current.get(pageNumber);
	if (!svgString) return;

	const meta = pageMetadata.get(pageNumber);
	const width = meta?.width || 595;
	const height = meta?.height || 842;

	renderingRef.current.add(pageNumber);

	const canvasCtx = canvas.getContext('2d');
	if (!canvasCtx) {
		renderingRef.current.delete(pageNumber);
		return;
	}

	const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
	const scaledWidth = width * scale;
	const scaledHeight = height * scale;
	const newCanvasWidth = Math.floor(scaledWidth * pixelRatio);
	const newCanvasHeight = Math.floor(scaledHeight * pixelRatio);

	if (canvas.width !== newCanvasWidth || canvas.height !== newCanvasHeight) {
		canvas.width = newCanvasWidth;
		canvas.height = newCanvasHeight;
		canvas.style.width = `${scaledWidth}px`;
		canvas.style.height = `${scaledHeight}px`;
	}

	if (interactive) {
		canvasCtx.setTransform(1, 0, 0, 1, 0, 0);
		canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
		renderingRef.current.delete(pageNumber);
		return;
	}

	const img = new Image();
	const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
	const url = URL.createObjectURL(blob);

	img.onload = () => {
		URL.revokeObjectURL(url);
		renderingRef.current.delete(pageNumber);

		if (renderTokensRef.current.get(pageNumber) !== token) {
			if (pendingRenderRef.current.has(pageNumber)) {
				pendingRenderRef.current.delete(pageNumber);
				requestAnimationFrame(() => renderSvgPageToCanvas(ctx, pageNumber));
			}
			return;
		}

		canvasCtx.setTransform(1, 0, 0, 1, 0, 0);
		canvasCtx.scale(pixelRatio, pixelRatio);
		canvasCtx.fillStyle = 'white';
		canvasCtx.fillRect(0, 0, scaledWidth, scaledHeight);
		canvasCtx.drawImage(img, 0, 0, scaledWidth, scaledHeight);

		if (pendingRenderRef.current.has(pageNumber)) {
			pendingRenderRef.current.delete(pageNumber);
			requestAnimationFrame(() => renderSvgPageToCanvas(ctx, pageNumber));
		}
	};

	img.onerror = () => {
		URL.revokeObjectURL(url);
		renderingRef.current.delete(pageNumber);
		pendingRenderRef.current.delete(pageNumber);
	};

	img.src = url;
}

export function svgHasInteractivity(svg: string): boolean {
	return /<(?:[\w.-]+:)?(?:animate(?:Motion|Transform|Color)?|set)\b|begin\s*=\s*["'][^"']*\.(click|mouseover|mouseout|focus)|@(?:-webkit-)?keyframes\b|\banimation(?:-[\w-]+)?\s*:/i.test(
		svg,
	);
}

const svgOverlayCache = new WeakMap<
	HTMLDivElement,
	{
		svg: SVGSVGElement;
		source: string;
		onNavigate?: (target: SvgNavigationTarget) => void;
	}
>();

export interface SvgNavigationTarget {
	page: number;
	x?: number;
	y?: number;
}

export function renderSvgOverlay(
	textLayerSvg: string,
	container: HTMLDivElement,
	scale: number,
	pageWidth: number,
	pageHeight: number,
	onNavigate?: (target: SvgNavigationTarget) => void,
): void {
	if (!textLayerSvg) return;

	const scaledWidth = pageWidth * scale;
	const scaledHeight = pageHeight * scale;

	container.style.width = `${scaledWidth}px`;
	container.style.height = `${scaledHeight}px`;

	const cached = svgOverlayCache.get(container);
	if (cached?.source === textLayerSvg) {
		cached.svg.setAttribute('width', String(scaledWidth));
		cached.svg.setAttribute('height', String(scaledHeight));
		cached.onNavigate = onNavigate;
		return;
	}

	const shadow =
		container.shadowRoot ?? container.attachShadow({ mode: 'open' });

	const doc = new DOMParser().parseFromString(textLayerSvg, 'image/svg+xml');
	const svg = doc.documentElement as unknown as SVGSVGElement;

	if (!svg.hasAttribute('viewBox')) {
		svg.setAttribute('viewBox', `0 0 ${pageWidth} ${pageHeight}`);
	}

	svg.setAttribute('width', String(scaledWidth));
	svg.setAttribute('height', String(scaledHeight));
	svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
	svg.style.pointerEvents = 'none';
	svg.style.lineHeight = 'normal';

	svg
		.querySelectorAll(
			'a, [id], text, [data-text], video, audio, foreignObject, foreignObject *',
		)
		.forEach((el) => {
			(el as HTMLElement).style.pointerEvents = 'auto';

			const tag = el.tagName.toLowerCase();
			if (tag === 'text' || el.hasAttribute('data-text')) {
				(el as HTMLElement).style.cursor = 'text';
				(el as HTMLElement).style.userSelect = 'text';
			} else if (tag === 'a' || el.hasAttribute('id')) {
				(el as HTMLElement).style.cursor = 'pointer';
			} else {
				(el as HTMLElement).style.cursor = 'auto';
			}
		});

	const entry = { svg, source: textLayerSvg, onNavigate };
	svg.addEventListener('click', (event) => {
		if (!entry.onNavigate) return;
		const target = event.target as Element | null;
		const anchor = target?.closest<SVGAElement>('a[data-nav-page]');

		if (!anchor) return;

		const page = Number(anchor.dataset.navPage);
		const x =
			anchor.dataset.navX === undefined
				? undefined
				: Number(anchor.dataset.navX);
		const y =
			anchor.dataset.navY === undefined
				? undefined
				: Number(anchor.dataset.navY);

		if (
			!Number.isInteger(page) ||
			page < 1 ||
			(x !== undefined && !Number.isFinite(x)) ||
			(y !== undefined && !Number.isFinite(y))
		) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		entry.onNavigate?.({ page, x, y });
	});

	shadow.replaceChildren(svg);

	svgOverlayCache.set(container, entry);
}
