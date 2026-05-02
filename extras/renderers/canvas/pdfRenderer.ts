// extras/renderers/canvas/pdfRenderer.ts
import type { RefObject } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';

const BASE_PATH = __BASE_PATH__;

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
).toString();

export interface PdfRenderContext {
    pdfDocRef: RefObject<any>;
    canvasRefs: RefObject<Map<number, HTMLCanvasElement>>;
    scale: number;
    renderingRef: RefObject<Set<number>>;
    pendingRenderRef: RefObject<Set<number>>;
}

const REFERENCE_SCALE = 1;
const TEXT_LAYER_CHUNK_SIZE = 80;

type TextLayerJob = {
    cancelled: boolean;
};

const textContentCache = new Map<number, any>();
const annotationDataCache = new Map<number, any[]>();
const pageObjectCache = new Map<number, any>();

const overlayScaleCache = new WeakMap<HTMLDivElement, number>();
const annotationScaleCache = new WeakMap<HTMLDivElement, number>();
const textLayerBuiltCache = new WeakMap<HTMLDivElement, number>();
const textLayerJobs = new WeakMap<HTMLDivElement, TextLayerJob>();

export function invalidatePdfOverlayCaches(container: HTMLDivElement): void {
    overlayScaleCache.delete(container);
    annotationScaleCache.delete(container);
    textLayerBuiltCache.delete(container);

    const job = textLayerJobs.get(container);
    if (job) job.cancelled = true;
    textLayerJobs.delete(container);
}

export function clearPdfCaches() {
    textContentCache.clear();
    annotationDataCache.clear();
    pageObjectCache.clear();
}

async function getCachedPage(pdfDocRef: RefObject<any>, pageNumber: number): Promise<any> {
    let page = pageObjectCache.get(pageNumber);
    if (!page) {
        page = await pdfDocRef.current.getPage(pageNumber);
        pageObjectCache.set(pageNumber, page);
    }
    return page;
}

export async function parsePdfPages(pdfBuffer: ArrayBuffer): Promise<{
    pdfDoc: any;
    metadata: Map<number, { width: number; height: number }>;
}> {
    const loadingTask = pdfjsLib.getDocument({
        data: pdfBuffer,
        cMapUrl: `${BASE_PATH}/assets/cmaps/`,
        cMapPacked: true,
    });
    const pdfDoc = await loadingTask.promise;

    const metadata = new Map<number, { width: number; height: number }>();
    for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 1.0 });
        metadata.set(i, { width: viewport.width, height: viewport.height });
    }

    return { pdfDoc, metadata };
}

export async function renderPdfPageToCanvas(ctx: PdfRenderContext, pageNumber: number): Promise<void> {
    const { pdfDocRef, canvasRefs, scale, renderingRef, pendingRenderRef } = ctx;

    if (!pdfDocRef.current || renderingRef.current.has(pageNumber)) {
        if (renderingRef.current.has(pageNumber)) {
            pendingRenderRef.current.add(pageNumber);
        }
        return;
    }

    const canvas = canvasRefs.current.get(pageNumber);
    if (!canvas) return;

    renderingRef.current.add(pageNumber);

    try {
        const page = await getCachedPage(pdfDocRef, pageNumber);
        const viewport = page.getViewport({ scale });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const scaledViewport = page.getViewport({ scale: scale * pixelRatio });

        const off = document.createElement('canvas');
        off.width = scaledViewport.width;
        off.height = scaledViewport.height;
        const offCtx = off.getContext('2d');
        if (!offCtx) return;

        await page.render({
            canvasContext: offCtx,
            viewport: scaledViewport
        }).promise;

        const ctx2d = canvas.getContext('2d');
        if (ctx2d) {
            canvas.width = scaledViewport.width;
            canvas.height = scaledViewport.height;
            canvas.style.width = `${viewport.width}px`;
            canvas.style.height = `${viewport.height}px`;
            ctx2d.drawImage(off, 0, 0);
        }
    } finally {
        renderingRef.current.delete(pageNumber);

        if (pendingRenderRef.current.has(pageNumber)) {
            pendingRenderRef.current.delete(pageNumber);
            requestAnimationFrame(() => renderPdfPageToCanvas(ctx, pageNumber));
        }
    }
}

export async function renderTextLayer(
    pdfDocRef: RefObject<any>,
    pageNumber: number,
    container: HTMLDivElement,
    scale: number
): Promise<void> {
    if (!pdfDocRef.current) return;
    if (overlayScaleCache.get(container) === scale) return;

    const builtForPage = textLayerBuiltCache.get(container);

    if (builtForPage === pageNumber) {
        const page = await getCachedPage(pdfDocRef, pageNumber);
        const viewport = page.getViewport({ scale });
        container.style.setProperty('--scale-factor', String(scale));
        container.style.width = `${viewport.width}px`;
        container.style.height = `${viewport.height}px`;
        overlayScaleCache.set(container, scale);
        return;
    }

    const previousJob = textLayerJobs.get(container);
    if (previousJob) previousJob.cancelled = true;

    const job: TextLayerJob = { cancelled: false };
    textLayerJobs.set(container, job);

    container.innerHTML = '';

    const page = await getCachedPage(pdfDocRef, pageNumber);
    if (job.cancelled) return;

    const referenceViewport = page.getViewport({ scale: REFERENCE_SCALE });
    const viewport = page.getViewport({ scale });

    let textContent = textContentCache.get(pageNumber);
    if (!textContent) {
        textContent = await page.getTextContent();
        textContentCache.set(pageNumber, textContent);
    }
    if (job.cancelled) return;

    container.style.setProperty('--scale-factor', String(scale));
    container.style.width = `${viewport.width}px`;
    container.style.height = `${viewport.height}px`;

    await buildTextLayerChunked(container, textContent, referenceViewport, job);
    if (job.cancelled) return;

    textLayerBuiltCache.set(container, pageNumber);
    overlayScaleCache.set(container, scale);
}

function buildTextLayerChunked(
    container: HTMLDivElement,
    textContent: any,
    viewport: any,
    job: TextLayerJob
): Promise<void> {
    return new Promise((resolve) => {
        const items = textContent.items as any[];
        const styles = textContent.styles as Record<string, any>;
        const total = items.length;
        const builtSpans: HTMLSpanElement[] = [];
        let index = 0;

        const processChunk = () => {
            if (job.cancelled) {
                resolve();
                return;
            }

            const fragment = document.createDocumentFragment();
            const end = Math.min(index + TEXT_LAYER_CHUNK_SIZE, total);

            for (let i = index; i < end; i++) {
                const item = items[i];
                if (!item.str || item.str.length === 0) continue;

                const span = createTextSpan(item, styles, viewport);
                if (span) {
                    fragment.appendChild(span);
                    builtSpans.push(span);
                }
            }

            container.appendChild(fragment);
            index = end;

            if (index < total) {
                requestAnimationFrame(processChunk);
            } else {
                requestAnimationFrame(() => {
                    if (!job.cancelled) correctSpanWidths(container, builtSpans);
                    resolve();
                });
            }
        };

        requestAnimationFrame(processChunk);
    });
}

function correctSpanWidths(
    container: HTMLDivElement,
    spans: HTMLSpanElement[]
): void {
    const previousScale = container.style.getPropertyValue('--scale-factor');
    container.style.setProperty('--scale-factor', '1');

    const measurements = new Float32Array(spans.length);
    for (let i = 0; i < spans.length; i++) {
        measurements[i] = spans[i].getBoundingClientRect().width;
    }

    if (previousScale) {
        container.style.setProperty('--scale-factor', previousScale);
    }

    for (let i = 0; i < spans.length; i++) {
        const span = spans[i];
        const target = parseFloat(span.dataset.targetWidth || '0');
        const measured = measurements[i];
        if (!target || measured === 0) continue;

        const ratio = target / measured;
        if (!isFinite(ratio) || ratio <= 0) continue;
        if (Math.abs(ratio - 1) < 0.02) continue;

        const angle = parseFloat(span.dataset.angle || '0');
        span.style.transform = angle !== 0
            ? `rotate(${angle}rad) scaleX(${ratio})`
            : `scaleX(${ratio})`;
    }
}

function createTextSpan(
    item: any,
    styles: Record<string, any>,
    viewport: any
): HTMLSpanElement | null {
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.hypot(tx[2], tx[3]);
    if (fontHeight === 0) return null;

    const angle = Math.atan2(tx[1], tx[0]);
    const style = styles[item.fontName];
    const ascent = typeof style?.ascent === 'number' ? style.ascent : 0.8;

    const span = document.createElement('span');
    span.textContent = item.str;
    span.style.left = `calc(var(--scale-factor) * ${tx[4]}px)`;
    span.style.top = `calc(var(--scale-factor) * ${tx[5] - fontHeight * ascent}px)`;
    span.style.fontSize = `calc(var(--scale-factor) * ${fontHeight}px)`;
    span.style.fontFamily = style?.fontFamily || 'sans-serif';
    span.dataset.targetWidth = String(Math.abs(item.width || 0));
    span.dataset.angle = String(angle);

    if (angle !== 0) {
        span.style.transform = `rotate(${angle}rad)`;
        span.style.transformOrigin = 'left bottom';
    }

    return span;
}

export async function renderAnnotationLayer(
    pdfDocRef: RefObject<any>,
    pageNumber: number,
    container: HTMLDivElement,
    scale: number
): Promise<void> {
    if (!pdfDocRef.current) return;
    if (annotationScaleCache.get(container) === scale) return;

    container.innerHTML = '';
    const page = await getCachedPage(pdfDocRef, pageNumber);
    const viewport = page.getViewport({ scale });

    let annotations = annotationDataCache.get(pageNumber);
    if (!annotations) {
        annotations = await page.getAnnotations();
        annotationDataCache.set(pageNumber, annotations);
    }

    if (!annotations || annotations.length === 0) {
        annotationScaleCache.set(container, scale);
        return;
    }

    container.style.width = `${viewport.width}px`;
    container.style.height = `${viewport.height}px`;

    for (const annotation of annotations) {
        const rect = annotation.rect;
        if (!rect || rect.length < 4) continue;

        const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(rect);
        const left = Math.min(x1, x2);
        const top = Math.min(y1, y2);
        const width = Math.abs(x2 - x1);
        const height = Math.abs(y2 - y1);

        if (annotation.subtype === 'Link') {
            const el = document.createElement('a');
            if (annotation.url) {
                el.href = annotation.url;
                el.target = '_blank';
                el.rel = 'noopener noreferrer';
            } else if (annotation.dest) {
                el.href = '#';
                el.dataset.dest = JSON.stringify(annotation.dest);
                el.addEventListener('click', (e) => {
                    e.preventDefault();
                    handleInternalLink(pdfDocRef, annotation.dest);
                });
            }
            applyAnnotationPosition(el, left, top, width, height);
            el.style.cursor = 'pointer';
            container.appendChild(el);
        } else if (annotation.subtype === 'Widget') {
            renderWidgetAnnotation(container, annotation, left, top, width, height);
        } else if (annotation.subtype === 'Text' || annotation.subtype === 'FreeText') {
            const el = document.createElement('div');
            applyAnnotationPosition(el, left, top, width, height);
            if (annotation.contents) {
                el.title = annotation.contents;
            }
            el.style.cursor = 'help';
            container.appendChild(el);
        }
    }

    annotationScaleCache.set(container, scale);
}

function applyAnnotationPosition(
    el: HTMLElement,
    left: number,
    top: number,
    width: number,
    height: number
): void {
    el.style.position = 'absolute';
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    el.style.pointerEvents = 'auto';
}

function renderWidgetAnnotation(
    container: HTMLDivElement,
    annotation: any,
    left: number,
    top: number,
    width: number,
    height: number
): void {
    const wrapper = document.createElement('div');
    applyAnnotationPosition(wrapper, left, top, width, height);

    const fieldType = annotation.fieldType;

    if (fieldType === 'Tx') {
        const input = annotation.multiLine
            ? document.createElement('textarea')
            : document.createElement('input');
        if (!annotation.multiLine) (input as HTMLInputElement).type = 'text';
        input.style.width = '100%';
        input.style.height = '100%';
        input.style.boxSizing = 'border-box';
        input.style.background = 'rgba(0, 54, 255, 0.13)';
        input.style.border = '1px solid transparent';
        input.style.fontSize = '9px';
        input.style.padding = '0 3px';
        input.style.margin = '0';
        if (annotation.fieldValue) input.value = annotation.fieldValue;
        if (annotation.readOnly) input.readOnly = true;
        wrapper.appendChild(input);
    } else if (fieldType === 'Btn') {
        const input = document.createElement('input');
        input.type = annotation.checkBox ? 'checkbox' : 'radio';
        input.style.width = '100%';
        input.style.height = '100%';
        input.style.margin = '0';
        input.style.background = 'rgba(0, 54, 255, 0.13)';
        if (annotation.fieldValue && annotation.fieldValue !== 'Off') {
            input.checked = true;
        }
        if (annotation.readOnly) input.disabled = true;
        if (!annotation.checkBox && annotation.fieldName) {
            input.name = annotation.fieldName;
        }
        wrapper.appendChild(input);
    } else if (fieldType === 'Ch') {
        const select = document.createElement('select');
        select.style.width = '100%';
        select.style.height = '100%';
        select.style.boxSizing = 'border-box';
        select.style.background = 'rgba(0, 54, 255, 0.13)';
        select.style.border = '1px solid transparent';
        select.style.fontSize = '9px';
        if (annotation.options) {
            for (const opt of annotation.options) {
                const option = document.createElement('option');
                option.value = opt.exportValue || opt.displayValue;
                option.textContent = opt.displayValue;
                if (annotation.fieldValue === option.value) option.selected = true;
                select.appendChild(option);
            }
        }
        if (annotation.readOnly) select.disabled = true;
        wrapper.appendChild(select);
    }

    container.appendChild(wrapper);
}

async function handleInternalLink(
    pdfDocRef: RefObject<any>,
    dest: any
): Promise<void> {
    if (!pdfDocRef.current || !dest) return;

    try {
        const resolvedDest = typeof dest === 'string'
            ? await pdfDocRef.current.getDestination(dest)
            : dest;

        if (!resolvedDest || !resolvedDest[0]) return;

        const pageIndex = await pdfDocRef.current.getPageIndex(resolvedDest[0]);
        const pageNumber = pageIndex + 1;

        const event = new CustomEvent('canvas-renderer-navigate', {
            detail: { page: pageNumber },
            bubbles: true,
        });
        document.dispatchEvent(event);
    } catch (e) {
        console.warn('[CanvasRenderer] Failed to resolve internal link:', e);
    }
}