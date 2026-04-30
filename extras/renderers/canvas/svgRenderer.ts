// extras/renderers/canvas/svgRenderer.ts
import type { RefObject } from 'react';

let workerInstance: Worker | null = null;

function getWorker(): Worker {
    if (!workerInstance) {
        workerInstance = new Worker(new URL('./worker.ts?worker', import.meta.url), { type: 'module' });
    }
    return workerInstance;
}

export function invalidateSvgOverlayCache(container: HTMLDivElement): void {
    svgOverlayScaleCache.delete(container);
}

export function parseSvgPages(svgBuffer: ArrayBuffer): Promise<{
    pages: Map<number, string>;
    metadata: Map<number, { width: number; height: number }>;
    textLayers: Map<number, string>;
}> {
    return new Promise((resolve, reject) => {
        const worker = getWorker();

        const handleMessage = (e: MessageEvent) => {
            if (e.data.type === 'parsed') {
                worker.removeEventListener('message', handleMessage);
                const pages = new Map<number, string>(e.data.pages);
                const metadata = new Map<number, { width: number; height: number }>(e.data.metadata);
                const textLayers = new Map<number, string>(e.data.textLayers);
                resolve({ pages, metadata, textLayers });
            } else if (e.data.type === 'error') {
                worker.removeEventListener('message', handleMessage);
                reject(new Error(e.data.error));
            }
        };

        worker.addEventListener('message', handleMessage);
        worker.postMessage({ type: 'parse', svgBuffer });
    });
}

export interface SvgRenderContext {
    svgPagesRef: RefObject<Map<number, string>>;
    canvasRefs: RefObject<Map<number, HTMLCanvasElement>>;
    pageMetadata: Map<number, { width: number; height: number }>;
    scale: number;
    renderingRef: RefObject<Set<number>>;
    pendingRenderRef: RefObject<Set<number>>;
    renderTokensRef: RefObject<Map<number, number>>;
}

export function renderSvgPageToCanvas(ctx: SvgRenderContext, pageNumber: number) {
    const { svgPagesRef, canvasRefs, pageMetadata, scale, renderingRef, pendingRenderRef, renderTokensRef } = ctx;

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

    const img = new Image();
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    img.onload = () => {
        URL.revokeObjectURL(url);
        renderingRef.current.delete(pageNumber);

        if (renderTokensRef.current.get(pageNumber) !== token) {
            pendingRenderRef.current.delete(pageNumber);
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

const svgOverlayScaleCache = new WeakMap<HTMLDivElement, number>();

export function renderSvgOverlay(
    textLayerSvg: string,
    container: HTMLDivElement,
    scale: number,
    pageWidth: number,
    pageHeight: number
): void {
    if (!textLayerSvg) return;
    if (svgOverlayScaleCache.get(container) === scale) return;

    const scaledWidth = pageWidth * scale;
    const scaledHeight = pageHeight * scale;

    container.style.width = `${scaledWidth}px`;
    container.style.height = `${scaledHeight}px`;

    const shadow = container.shadowRoot ?? container.attachShadow({ mode: 'open' });

    const doc = new DOMParser().parseFromString(textLayerSvg, 'image/svg+xml');
    const svg = doc.documentElement as unknown as SVGSVGElement;

    if (!svg.hasAttribute('viewBox')) {
        svg.setAttribute('viewBox', `0 0 ${pageWidth} ${pageHeight}`);
    }
    svg.setAttribute('width', String(scaledWidth));
    svg.setAttribute('height', String(scaledHeight));
    svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
    svg.style.pointerEvents = 'none';

    svg.querySelectorAll('text, [data-text]').forEach((el) => {
        (el as HTMLElement).style.pointerEvents = 'auto';
        (el as HTMLElement).style.cursor = 'text';
    });

    shadow.replaceChildren(svg);

    svgOverlayScaleCache.set(container, scale);
}