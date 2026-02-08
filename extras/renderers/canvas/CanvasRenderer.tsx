// extras/renderers/canvas/CanvasRenderer.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState, useImperativeHandle } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

import {
    ChevronLeftIcon,
    ChevronRightIcon,
    DownloadIcon,
    PageIcon,
    ScrollIcon,
    FitToWidthIcon,
    FitToHeightIcon,
    ZoomInIcon,
    ZoomOutIcon,
    ExpandIcon,
    MinimizeIcon
} from '@/components/common/Icons';
import { useSettings } from '@/hooks/useSettings';
import { useProperties } from '@/hooks/useProperties';
import type { RendererProps } from '@/plugins/PluginInterface';
import './styles.css';
import { getCanvasRendererSettings } from './settings';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
).toString();

export interface CanvasRendererHandle {
    updateSvgContent: (svgBuffer: ArrayBuffer) => void;
}

let workerInstance: Worker | null = null;

function getWorker(): Worker {
    if (!workerInstance) {
        workerInstance = new Worker(new URL('./worker.ts?worker', import.meta.url), { type: 'module' });
    }
    return workerInstance;
}

const CanvasRenderer: React.FC<RendererProps> = ({
    content,
    fileName,
    onDownload,
    controllerRef
}) => {
    const { getSetting } = useSettings();
    const { getProperty, setProperty, registerProperty } = useProperties();

    const [numPages, setNumPages] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageInput, setPageInput] = useState('1');
    const [pageOffsets, setPageOffsets] = useState<number[]>([]);
    const [totalHeight, setTotalHeight] = useState(0);
    const [isEditingPageInput, setIsEditingPageInput] = useState(false);
    const [scale, setScale] = useState(1.0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [scrollView, setScrollView] = useState(false);
    const [renderRange, setRenderRange] = useState<{ start: number; end: number }>({ start: 1, end: 1 });
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [fitMode, setFitMode] = useState<'fit-width' | 'fit-height'>('fit-width');
    const [pageMetadata, setPageMetadata] = useState<Map<number, { width: number; height: number }>>(new Map());

    const containerRef = useRef<HTMLDivElement>(null);
    const contentElRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
    const propertiesRegistered = useRef(false);
    const svgPagesRef = useRef<Map<number, string>>(new Map());
    const pdfDocRef = useRef<any>(null);
    const contentTypeRef = useRef<'svg' | 'pdf'>('svg');
    const fullSvgBufferRef = useRef<ArrayBuffer | null>(null);
    const pendingRenderRef = useRef<Set<number>>(new Set());
    const renderingRef = useRef<Set<number>>(new Set());
    const lastStablePageRef = useRef<number>(1);
    const isTrackingEnabledRef = useRef<boolean>(true);

    const BUFFER_PAGES = 2;
    const UPDATE_THROTTLE = 100;
    const HYSTERESIS_THRESHOLD = 0.2;

    const canvasRendererEnable = getSetting('canvas-renderer-enable')?.value as boolean ?? true;

    const parseSvgPages = useCallback((svgBuffer: ArrayBuffer): Promise<{
        pages: Map<number, string>;
        metadata: Map<number, { width: number; height: number }>;
    }> => {
        return new Promise((resolve, reject) => {
            const worker = getWorker();

            const handleMessage = (e: MessageEvent) => {
                if (e.data.type === 'parsed') {
                    worker.removeEventListener('message', handleMessage);
                    const pages = new Map<number, string>(e.data.pages);
                    const metadata = new Map<number, { width: number; height: number }>(e.data.metadata);
                    resolve({ pages, metadata });
                } else if (e.data.type === 'error') {
                    worker.removeEventListener('message', handleMessage);
                    reject(new Error(e.data.error));
                }
            };

            worker.addEventListener('message', handleMessage);
            worker.postMessage({ type: 'parse', svgBuffer });
        });
    }, []);

    const parsePdfPages = useCallback(async (pdfBuffer: ArrayBuffer): Promise<void> => {
        const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer });
        const pdfDoc = await loadingTask.promise;
        pdfDocRef.current = pdfDoc;

        const metadata = new Map<number, { width: number; height: number }>();
        for (let i = 1; i <= pdfDoc.numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const viewport = page.getViewport({ scale: 1.0 });
            metadata.set(i, { width: viewport.width, height: viewport.height });
        }

        setPageMetadata(metadata);
        setNumPages(pdfDoc.numPages);
    }, []);

    const renderPageToCanvas = useCallback((pageNumber: number) => {
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

        const ctx = canvas.getContext('2d');
        if (!ctx) {
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
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.scale(pixelRatio, pixelRatio);

            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, scaledWidth, scaledHeight);

            ctx.drawImage(img, 0, 0, scaledWidth, scaledHeight);

            URL.revokeObjectURL(url);
            renderingRef.current.delete(pageNumber);

            if (pendingRenderRef.current.has(pageNumber)) {
                pendingRenderRef.current.delete(pageNumber);
                requestAnimationFrame(() => renderPageToCanvas(pageNumber));
            }
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            renderingRef.current.delete(pageNumber);
            pendingRenderRef.current.delete(pageNumber);
        };

        img.src = url;
    }, [pageMetadata, scale]);

    const renderPdfPageToCanvas = useCallback(async (pageNumber: number) => {
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

            const ctx = canvas.getContext("2d");
            if (ctx) {
                canvas.width = scaledViewport.width;
                canvas.height = scaledViewport.height;
                canvas.style.width = `${viewport.width}px`;
                canvas.style.height = `${viewport.height}px`;

                ctx.drawImage(off, 0, 0);
            }

        } finally {
            renderingRef.current.delete(pageNumber);

            if (pendingRenderRef.current.has(pageNumber)) {
                pendingRenderRef.current.delete(pageNumber);
                requestAnimationFrame(() => renderPdfPageToCanvas(pageNumber));
            }
        }
    }, [scale]);

    useEffect(() => {
        if (scrollView) return;
        renderVisiblePages();
    }, [currentPage, scale, scrollView]);

    useEffect(() => {
        if (!scrollView) return;
        renderVisiblePages();
    }, [renderRange, scrollView]);

    const getPageHeight = useCallback((pageNum: number): number => {
        const meta = pageMetadata.get(pageNum);
        const baseHeight = meta?.height || 842;
        return baseHeight * scale + 20;
    }, [scale, pageMetadata]);

    const getPageTop = useCallback((pageNum: number): number => {
        let height = 0;
        for (let i = 1; i < pageNum; i++) {
            height += getPageHeight(i);
        }
        return height;
    }, [getPageHeight]);

    const scrollToPage = useCallback((pageNum: number) => {
        if (!scrollView || !scrollContainerRef.current) return;

        const targetTop = getPageTop(pageNum);
        scrollContainerRef.current.scrollTo({ top: targetTop, behavior: 'smooth' });
    }, [scrollView, getPageTop]);

    const updateCurrentPageFromScroll = useCallback(() => {
        if (!scrollView || !scrollContainerRef.current || isEditingPageInput || !isTrackingEnabledRef.current) {
            return;
        }

        const container = scrollContainerRef.current;
        const scrollTop = container.scrollTop;
        const containerHeight = container.clientHeight;
        const viewportCenter = scrollTop + containerHeight / 2;

        let accumulatedHeight = 0;
        let closestPage = 1;
        let minDistance = Infinity;

        for (let i = 1; i <= numPages; i++) {
            const pageHeight = getPageHeight(i);
            const pageTop = accumulatedHeight;
            const pageCenter = pageTop + pageHeight / 2;
            const distance = Math.abs(viewportCenter - pageCenter);

            if (distance < minDistance) {
                minDistance = distance;
                closestPage = i;
            }

            accumulatedHeight += pageHeight;
            if (pageTop > viewportCenter + containerHeight) break;
        }

        if (closestPage !== lastStablePageRef.current) {
            const currentPageHeight = getPageHeight(lastStablePageRef.current);
            const hysteresisThreshold = currentPageHeight * HYSTERESIS_THRESHOLD;

            if (minDistance < hysteresisThreshold || Math.abs(closestPage - lastStablePageRef.current) > 1) {
                lastStablePageRef.current = closestPage;
                setCurrentPage(closestPage);
                setPageInput(String(closestPage));
            }
        }
    }, [scrollView, numPages, isEditingPageInput, getPageHeight]);

    const calculateVisibleRange = useCallback(() => {
        if (!scrollView || !scrollContainerRef.current) return;

        const container = scrollContainerRef.current;
        const scrollTop = container.scrollTop;
        const containerHeight = container.clientHeight;
        const scrollBottom = scrollTop + containerHeight;

        let accumulatedHeight = 0;
        let startPage = 1;
        let endPage = 1;
        let foundStart = false;

        for (let i = 1; i <= numPages; i++) {
            const pageHeight = getPageHeight(i);
            const pageTop = accumulatedHeight;
            const pageBottom = accumulatedHeight + pageHeight;

            if (!foundStart && pageBottom > scrollTop) {
                startPage = Math.max(1, i - BUFFER_PAGES);
                foundStart = true;
            }

            if (pageTop < scrollBottom) {
                endPage = Math.min(numPages, i + BUFFER_PAGES);
            }

            accumulatedHeight += pageHeight;

            if (foundStart && pageTop > scrollBottom) break;
        }

        setRenderRange({ start: startPage, end: endPage });
    }, [scrollView, numPages, getPageHeight]);

    const renderVisiblePages = useCallback(() => {
        if (scrollView) {
            for (let i = renderRange.start; i <= renderRange.end; i++) {
                if (i <= numPages) {
                    if (contentTypeRef.current === 'svg' && svgPagesRef.current.has(i)) {
                        renderPageToCanvas(i);
                    } else if (contentTypeRef.current === 'pdf' && pdfDocRef.current) {
                        renderPdfPageToCanvas(i);
                    }
                }
            }
        } else {
            if (contentTypeRef.current === 'svg' && svgPagesRef.current.has(currentPage)) {
                renderPageToCanvas(currentPage);
            } else if (contentTypeRef.current === 'pdf' && pdfDocRef.current) {
                renderPdfPageToCanvas(currentPage);
            }
        }
    }, [scrollView, renderRange, currentPage, numPages, renderPageToCanvas, renderPdfPageToCanvas]);

    useEffect(() => {
        if (!scrollView || !scrollContainerRef.current) return;

        let rafId: number | null = null;
        let lastUpdateTime = 0;

        const handleScroll = () => {
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
            }

            rafId = requestAnimationFrame(() => {
                const now = Date.now();
                if (now - lastUpdateTime >= UPDATE_THROTTLE) {
                    lastUpdateTime = now;
                    calculateVisibleRange();
                    updateCurrentPageFromScroll();
                }
            });
        };

        const container = scrollContainerRef.current;
        container.addEventListener('scroll', handleScroll, { passive: true });

        calculateVisibleRange();
        updateCurrentPageFromScroll();

        return () => {
            container.removeEventListener('scroll', handleScroll);
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
            }
        };
    }, [scrollView, calculateVisibleRange, updateCurrentPageFromScroll]);

    useEffect(() => {
        if (!scrollView) return;

        isTrackingEnabledRef.current = false;

        const timer = setTimeout(() => {
            isTrackingEnabledRef.current = true;
            updateCurrentPageFromScroll();
        }, 200);

        return () => clearTimeout(timer);
    }, [scale, scrollView, updateCurrentPageFromScroll]);

    const updateContent = useCallback(async (buffer: ArrayBuffer) => {
        if (!buffer || buffer.byteLength === 0) return;

        fullSvgBufferRef.current = buffer;

        const arr = new Uint8Array(buffer);
        const isPdf = arr.length > 4 && arr[0] === 0x25 && arr[1] === 0x50 && arr[2] === 0x44 && arr[3] === 0x46;
        contentTypeRef.current = isPdf ? 'pdf' : 'svg';

        try {
            if (isPdf) {
                await parsePdfPages(buffer);
            } else {
                const { pages, metadata } = await parseSvgPages(buffer);
                svgPagesRef.current = pages;
                setPageMetadata(metadata);
                setNumPages(pages.size);
            }

            setIsLoading(false);
            setError(null);

            requestAnimationFrame(() => {
                renderVisiblePages();
            });

        } catch (err) {
            console.error('[CanvasRenderer] Failed to parse content:', err);
            setError(`Failed to parse content: ${err}`);
            setIsLoading(false);
        }
    }, [parseSvgPages, parsePdfPages, renderVisiblePages]);

    useImperativeHandle(controllerRef, () => ({
        updateContent: (newContent: ArrayBuffer | string) => {
            const buffer = typeof newContent === 'string'
                ? new TextEncoder().encode(newContent).buffer
                : newContent;
            updateContent(buffer);
        }
    }), [updateContent]);

    useEffect(() => {
        if (propertiesRegistered.current) return;
        propertiesRegistered.current = true;

        registerProperty({
            id: 'canvas-renderer-zoom',
            category: 'UI',
            subcategory: 'Canvas Viewer',
            defaultValue: 1.0
        });

        registerProperty({
            id: 'canvas-renderer-scroll-view',
            category: 'UI',
            subcategory: 'Canvas Viewer',
            defaultValue: false
        });
    }, [registerProperty]);

    useEffect(() => {
        const storedZoom = getProperty('canvas-renderer-zoom');
        const storedScrollView = getProperty('canvas-renderer-scroll-view');

        if (storedZoom !== undefined) {
            setScale(Number(storedZoom));
        }
        if (storedScrollView !== undefined) {
            setScrollView(Boolean(storedScrollView));
        }
    }, [getProperty]);

    useEffect(() => {
        if (content && (content instanceof ArrayBuffer) && content.byteLength > 0) {
            updateContent(content);
        }
    }, []);

    useEffect(() => {
        if (numPages === 0) return;

        const offs: number[] = [];
        let acc = 0;

        for (let i = 1; i <= numPages; i++) {
            offs.push(acc);
            acc += getPageHeight(i);
        }

        setPageOffsets(offs);
        setTotalHeight(acc);
    }, [numPages, scale, pageMetadata]);

    useEffect(() => {
        if (scrollView) {
            calculateVisibleRange();
        }
    }, [scrollView, numPages, scale, calculateVisibleRange]);

    const handlePreviousPage = useCallback(() => {
        const targetPage = Math.max(currentPage - 1, 1);
        lastStablePageRef.current = targetPage;
        setCurrentPage(targetPage);
        setPageInput(String(targetPage));
        scrollToPage(targetPage);
    }, [currentPage, scrollToPage]);

    const handleNextPage = useCallback(() => {
        const targetPage = Math.min(currentPage + 1, numPages);
        lastStablePageRef.current = targetPage;
        setCurrentPage(targetPage);
        setPageInput(String(targetPage));
        scrollToPage(targetPage);
    }, [currentPage, numPages, scrollToPage]);

    const handlePageInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        setPageInput(event.target.value);
    }, []);

    const handlePageInputKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            const pageNum = Number.parseInt(pageInput, 10);
            if (!Number.isNaN(pageNum) && pageNum >= 1 && pageNum <= numPages) {
                lastStablePageRef.current = pageNum;
                setCurrentPage(pageNum);
                setIsEditingPageInput(false);
                (event.target as HTMLInputElement).blur();
                scrollToPage(pageNum);
            } else {
                setPageInput(String(currentPage));
                setIsEditingPageInput(false);
                (event.target as HTMLInputElement).blur();
            }
        }
    }, [numPages, currentPage, pageInput, scrollToPage]);

    const computeFitScale = useCallback((mode: 'fit-width' | 'fit-height') => {
        const container = scrollContainerRef.current || contentElRef.current;
        const containerWidth = container?.clientWidth || 800;
        const containerHeight = container?.clientHeight || 600;
        const meta = pageMetadata.get(currentPage);
        const pageWidth = meta?.width || 595;
        const pageHeight = meta?.height || 842;

        if (mode === 'fit-width') {
            return Math.max(0.25, Math.min(5, (containerWidth - 40) / pageWidth));
        }
        return Math.max(0.25, Math.min(5, (containerHeight - 40) / pageHeight));
    }, [currentPage, pageMetadata]);

    const maxPageWidth = useMemo(() => {
        let maxW = 595;
        for (let i = renderRange.start; i <= renderRange.end; i++) {
            const meta = pageMetadata.get(i);
            if (meta && meta.width > maxW) {
                maxW = meta.width;
            }
        }
        return maxW;
    }, [renderRange, pageMetadata]);

    const virtualWrapperWidth = maxPageWidth * scale + 80;

    const handleFitToggle = useCallback(() => {
        const nextMode = fitMode === 'fit-width' ? 'fit-height' : 'fit-width';
        setFitMode(nextMode);
        const s = computeFitScale(nextMode);
        setScale(s);
        setProperty('canvas-renderer-zoom', s);
    }, [fitMode, computeFitScale, setProperty]);

    const handleZoomIn = useCallback(() => {
        setScale((prev) => {
            const newScale = Math.min(prev + 0.25, 5);
            setProperty('canvas-renderer-zoom', newScale);
            return newScale;
        });
    }, [setProperty]);

    const handleZoomOut = useCallback(() => {
        setScale((prev) => {
            const newScale = Math.max(prev - 0.25, 0.25);
            setProperty('canvas-renderer-zoom', newScale);
            return newScale;
        });
    }, [setProperty]);

    const handleZoomChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
        const value = event.target.value;
        if (value === 'custom') return;
        const newScale = parseFloat(value) / 100;
        setScale(newScale);
        setProperty('canvas-renderer-zoom', newScale);
    }, [setProperty]);

    const handleToggleView = useCallback(() => {
        setScrollView((prev) => {
            const newScrollView = !prev;
            setProperty('canvas-renderer-scroll-view', newScrollView);
            return newScrollView;
        });
    }, [setProperty]);

    const handleToggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen().then(() => setIsFullscreen(true));
        } else {
            document.exitFullscreen().then(() => setIsFullscreen(false));
        }
    }, []);

    const handleExport = useCallback(() => {
        if (onDownload && fileName) {
            onDownload(fileName);
            return;
        }

        const exportConfig = {
            pdf: {
                data: pdfDocRef.current,
                mimeType: 'application/pdf',
                extension: '.pdf',
                getData: (doc: any) => doc.getData()
            },
            svg: {
                data: fullSvgBufferRef.current,
                mimeType: 'image/svg+xml',
                extension: '.svg',
                getData: (buffer: any) => Promise.resolve(buffer)
            }
        };

        const config = exportConfig[contentTypeRef.current as keyof typeof exportConfig];
        if (!config?.data) return;

        config.getData(config.data).then((data: ArrayBuffer | string) => {
            const blob = new Blob([data], { type: config.mimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName?.replace(/\.(typ|pdf|svg)$/i, config.extension) || `output${config.extension}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }, [fileName, onDownload]);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (!document.fullscreenElement && !containerRef.current?.contains(document.activeElement)) {
                return;
            }

            switch (event.key) {
                case 'ArrowLeft':
                case 'ArrowUp':
                    event.preventDefault();
                    handlePreviousPage();
                    break;
                case 'ArrowRight':
                case 'ArrowDown':
                case ' ':
                    event.preventDefault();
                    handleNextPage();
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handlePreviousPage, handleNextPage]);

    const setCanvasRef = useCallback((pageNumber: number) => (el: HTMLCanvasElement | null) => {
        if (el) {
            canvasRefs.current.set(pageNumber, el);
        } else {
            canvasRefs.current.delete(pageNumber);
        }
    }, []);

    if (!canvasRendererEnable) {
        return (
            <div className="canvas-renderer-container">
                <div className="canvas-renderer-error">
                    {t('Canvas renderer is disabled. Please enable it in settings.')}
                </div>
            </div>
        );
    }

    const zoomOptions = getCanvasRendererSettings().find((s) => s.id === 'canvas-renderer-initial-zoom')?.options || [];
    const currentZoom = Math.round(scale * 100).toString();
    const hasCustomZoom = !zoomOptions.some((opt) => String(opt.value) === currentZoom);
    const topOffset = scrollView ? (pageOffsets[renderRange.start - 1] || 0) : 0;

    return (
        <div className="canvas-renderer-container" ref={containerRef}>
            <div className={`canvas-toolbar ${isFullscreen ? 'fullscreen-toolbar' : ''}`}>
                <div className="toolbar">
                    <div id="toolbarLeft">
                        <div className="toolbarButtonGroup">
                            <button
                                onClick={handlePreviousPage}
                                className="toolbarButton"
                                title={t('Previous Page')}
                                disabled={currentPage <= 1 || isLoading}>
                                <ChevronLeftIcon />
                            </button>
                            <button
                                onClick={handleNextPage}
                                className="toolbarButton"
                                title={t('Next Page')}
                                disabled={currentPage >= numPages || isLoading}>
                                <ChevronRightIcon />
                            </button>
                        </div>

                        <div className="toolbarButtonGroup">
                            <div className="pageNumber">
                                <input
                                    type="number"
                                    value={pageInput}
                                    onChange={handlePageInputChange}
                                    onKeyDown={handlePageInputKeyDown}
                                    onFocus={() => setIsEditingPageInput(true)}
                                    onBlur={() => {
                                        setIsEditingPageInput(false);
                                        setPageInput(String(currentPage));
                                    }}
                                    className="toolbarField"
                                    min={1}
                                    max={numPages}
                                    disabled={isLoading}
                                />
                                <span>/</span>
                                <span>{numPages}</span>
                            </div>
                        </div>

                        <div className="toolbarButtonGroup">
                            <button
                                onClick={handleZoomOut}
                                className="toolbarButton"
                                title={t('Zoom Out')}
                                disabled={isLoading}>
                                <ZoomOutIcon />
                            </button>

                            <select
                                value={hasCustomZoom ? 'custom' : currentZoom}
                                onChange={handleZoomChange}
                                disabled={isLoading}
                                className="toolbarZoomSelect"
                                title={t('Zoom Level')}>
                                {zoomOptions.map((option) => (
                                    <option key={String(option.value)} value={String(option.value)}>
                                        {option.label}
                                    </option>
                                ))}
                                {hasCustomZoom && (
                                    <option value="custom">
                                        {Math.round(scale * 100)}%
                                    </option>
                                )}
                            </select>

                            <button
                                onClick={handleZoomIn}
                                className="toolbarButton"
                                title={t('Zoom In')}
                                disabled={isLoading}>
                                <ZoomInIcon />
                            </button>
                        </div>

                        <div className="toolbarButtonGroup">
                            <button
                                onClick={handleFitToggle}
                                className="toolbarButton"
                                title={fitMode === 'fit-width' ? t('Fit to Height') : t('Fit to Width')}
                                disabled={isLoading}>
                                {fitMode === 'fit-width' ? <FitToWidthIcon /> : <FitToHeightIcon />}
                            </button>

                            <button
                                onClick={handleToggleView}
                                className="toolbarButton"
                                title={scrollView ? t('Single Page View') : t('Scroll View')}
                                disabled={isLoading}>
                                {scrollView ? <PageIcon /> : <ScrollIcon />}
                            </button>

                            <button
                                onClick={handleToggleFullscreen}
                                className="toolbarButton"
                                title={isFullscreen ? t('Exit Fullscreen') : t('Fullscreen')}
                                disabled={isLoading}>
                                {isFullscreen ? <MinimizeIcon /> : <ExpandIcon />}
                            </button>
                        </div>

                        <div className="toolbarButtonGroup">
                            <button
                                onClick={handleExport}
                                className="toolbarButton"
                                title={t('Download')}
                                disabled={isLoading}>
                                <DownloadIcon />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div
                className={`canvas-renderer-content ${isFullscreen ? 'fullscreen' : ''}`}
                ref={scrollView ? scrollContainerRef : contentElRef}
            >
                <div className="canvas-renderer-viewer">

                    {!isLoading && !error && numPages > 0 && scrollView && (
                        <div
                            className="canvas-virtual-wrapper"
                            style={{
                                position: "relative",
                                height: totalHeight,
                                width: virtualWrapperWidth,
                                margin: "0 auto",
                            }}
                        >
                            <div
                                className="canvas-virtual-inner"
                                style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    transform: `translateY(${topOffset}px)`,
                                }}
                            >
                                {Array.from(
                                    { length: renderRange.end - renderRange.start + 1 },
                                    (_, idx) => {
                                        const pageNumber = renderRange.start + idx;
                                        const meta = pageMetadata.get(pageNumber);
                                        const width = meta?.width || 595;
                                        const height = meta?.height || 842;

                                        return (
                                            <div key={pageNumber} className="canvas-page">
                                                <canvas
                                                    ref={setCanvasRef(pageNumber)}
                                                    className="canvas-page-canvas"
                                                    style={{
                                                        width: `${width * scale}px`,
                                                        height: `${height * scale}px`,
                                                    }}
                                                />
                                            </div>
                                        );
                                    }
                                )}
                            </div>
                        </div>
                    )}

                    {!isLoading && !error && numPages > 0 && !scrollView && (
                        <div className="canvas-page">
                            <canvas
                                ref={setCanvasRef(currentPage)}
                                className="canvas-page-canvas"
                                style={{
                                    width: `${(pageMetadata.get(currentPage)?.width || 595) * scale}px`,
                                    height: `${(pageMetadata.get(currentPage)?.height || 842) * scale}px`,
                                }}
                            />
                        </div>
                    )}

                    {/* LOADING */}
                    {isLoading && (
                        <div className="canvas-renderer-loading">
                            {t('Loading document...')}
                        </div>
                    )}
                </div>

                {error && <div className="canvas-renderer-error">{error}</div>}
            </div>
        </div>
    );
};

CanvasRenderer.displayName = 'CanvasRenderer';

export default CanvasRenderer;