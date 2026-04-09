// extras/renderers/canvas/pdfRenderer.ts
import type { MutableRefObject } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
).toString();

export interface PdfRenderContext {
    pdfDocRef: MutableRefObject<any>;
    canvasRefs: MutableRefObject<Map<number, HTMLCanvasElement>>;
    scale: number;
    renderingRef: MutableRefObject<Set<number>>;
    pendingRenderRef: MutableRefObject<Set<number>>;
}

export async function parsePdfPages(pdfBuffer: ArrayBuffer): Promise<{
    pdfDoc: any;
    metadata: Map<number, { width: number; height: number }>;
}> {
    const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer });
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
        const page = await pdfDocRef.current.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const scaledViewport = page.getViewport({ scale: scale * pixelRatio });

        const off = document.createElement("canvas");
        off.width = scaledViewport.width;
        off.height = scaledViewport.height;
        const offCtx = off.getContext("2d");
        if (!offCtx) return;

        await page.render({
            canvasContext: offCtx,
            viewport: scaledViewport
        }).promise;

        const ctx2d = canvas.getContext("2d");
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

const textContentCache = new Map<number, any>();
const overlayScaleCache = new WeakMap<HTMLDivElement, number>();
const annotationScaleCache = new WeakMap<HTMLDivElement, number>();
const annotationDataCache = new Map<number, any[]>();

export function clearPdfCaches() {
    textContentCache.clear();
    annotationDataCache.clear();
}

export async function renderTextLayer(
    pdfDocRef: MutableRefObject<any>,
    pageNumber: number,
    container: HTMLDivElement,
    scale: number
): Promise<void> {
    if (!pdfDocRef.current) return;
    if (overlayScaleCache.get(container) === scale) return;

    container.innerHTML = '';
    const page = await pdfDocRef.current.getPage(pageNumber);
    const viewport = page.getViewport({ scale });

    let textContent = textContentCache.get(pageNumber);
    if (!textContent) {
        textContent = await page.getTextContent();
        textContentCache.set(pageNumber, textContent);
    }

    const textLayer = new pdfjsLib.TextLayer({
        textContentSource: textContent,
        container,
        viewport,
    });
    await textLayer.render();

    container.style.setProperty('--scale-factor', String(scale));
    container.style.setProperty('--total-scale-factor', String(scale));

    overlayScaleCache.set(container, scale);
}

export async function renderAnnotationLayer(
    pdfDocRef: MutableRefObject<any>,
    pageNumber: number,
    container: HTMLDivElement,
    scale: number
): Promise<void> {
    if (!pdfDocRef.current) return;
    if (annotationScaleCache.get(container) === scale) return;

    container.innerHTML = '';
    const page = await pdfDocRef.current.getPage(pageNumber);
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
    pdfDocRef: MutableRefObject<any>,
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