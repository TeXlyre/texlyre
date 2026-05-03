// extras/renderers/canvas/CanvasRenderer.tsx
import { t } from '@/i18n';
import type React from 'react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useImperativeHandle,
} from 'react';

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
  MinimizeIcon,
} from '@/components/common/Icons';
import { useSettings } from '@/hooks/useSettings';
import { useProperties } from '@/hooks/useProperties';
import type { RendererProps } from '@/plugins/PluginInterface';
import './styles.css';
import { getCanvasRendererSettings } from './settings';
import {
  parseSvgPages,
  renderSvgPageToCanvas,
  renderSvgOverlay,
  invalidateSvgOverlayCache,
  type SvgRenderContext,
} from './svgRenderer';
import {
  parsePdfPages,
  renderPdfPageToCanvas,
  renderTextLayer,
  renderAnnotationLayer,
  invalidatePdfOverlayCaches,
  clearPdfCaches,
  type PdfRenderContext,
} from './pdfRenderer';

export interface CanvasRendererHandle {
  updateSvgContent: (svgBuffer: ArrayBuffer) => void;
}

const CanvasRenderer: React.FC<RendererProps> = ({
  content,
  fileName,
  onDownload,
  controllerRef,
  onLocationClick,
  headerLabel,
  headerTitle,
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
  const [renderRange, setRenderRange] = useState<{
    start: number;
    end: number;
  }>({ start: 1, end: 1 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fitMode, setFitMode] = useState<'fit-width' | 'fit-height'>(
    'fit-width',
  );
  const [pageMetadata, setPageMetadata] = useState<
    Map<number, { width: number; height: number }>
  >(new Map());
  const [highlight, setHighlight] = useState<{
    page: number;
    rects: Array<{ x: number; y: number; width: number; height: number }>;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const contentElRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const textLayerRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const annotationLayerRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const propertiesRegistered = useRef(false);
  const svgPagesRef = useRef<Map<number, string>>(new Map());
  const pdfDocRef = useRef<any>(null);
  const contentTypeRef = useRef<'svg' | 'pdf'>('svg');
  const [contentType, setContentType] = useState<'svg' | 'pdf'>('svg');
  const fullSvgBufferRef = useRef<ArrayBuffer | null>(null);
  const pendingRenderRef = useRef<Set<number>>(new Set());
  const renderingRef = useRef<Set<number>>(new Set());
  const lastStablePageRef = useRef<number>(1);
  const isTrackingEnabledRef = useRef<boolean>(true);
  const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renderTokensRef = useRef<Map<number, number>>(new Map());

  const BUFFER_PAGES = 2;
  const UPDATE_THROTTLE = 100;
  const HYSTERESIS_THRESHOLD = 0.2;

  const canvasRendererEnable =
    (getSetting('canvas-renderer-enable')?.value as boolean) ?? true;
  const canvasRendererTextSelection =
    (getSetting('canvas-renderer-text-selection')?.value as boolean) ?? true;
  const canvasRendererAnnotations =
    (getSetting('canvas-renderer-annotations')?.value as boolean) ?? true;

  const svgCtx = useMemo<SvgRenderContext>(
    () => ({
      svgPagesRef,
      canvasRefs,
      pageMetadata,
      scale,
      renderingRef,
      pendingRenderRef,
      renderTokensRef,
    }),
    [pageMetadata, scale],
  );

  const pdfCtx = useMemo<PdfRenderContext>(
    () => ({
      pdfDocRef,
      canvasRefs,
      scale,
      renderingRef,
      pendingRenderRef,
    }),
    [scale],
  );

  const getPageHeight = useCallback(
    (pageNum: number): number => {
      const meta = pageMetadata.get(pageNum);
      const baseHeight = meta?.height || 842;
      return baseHeight * scale + 20;
    },
    [scale, pageMetadata],
  );

  const getPageTop = useCallback(
    (pageNum: number): number => {
      let height = 0;
      for (let i = 1; i < pageNum; i++) {
        height += getPageHeight(i);
      }
      return height;
    },
    [getPageHeight],
  );

  const scrollToPage = useCallback(
    (pageNum: number) => {
      if (!scrollView || !scrollContainerRef.current) return;
      scrollContainerRef.current.scrollTo({
        top: getPageTop(pageNum),
        behavior: 'smooth',
      });
    },
    [scrollView, getPageTop],
  );

  const updateCurrentPageFromScroll = useCallback(() => {
    if (
      !scrollView ||
      !scrollContainerRef.current ||
      isEditingPageInput ||
      !isTrackingEnabledRef.current
    ) return;

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
      const hysteresisThreshold =
        getPageHeight(lastStablePageRef.current) * HYSTERESIS_THRESHOLD;

      if (
        minDistance < hysteresisThreshold ||
        Math.abs(closestPage - lastStablePageRef.current) > 1
      ) {
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

  const renderOverlays = useCallback(
    (pages: number[]) => {
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);

      overlayTimerRef.current = setTimeout(() => {
        for (const pageNum of pages) {
          if (canvasRendererTextSelection) {
            const textEl = textLayerRefs.current.get(pageNum);
            if (!textEl) continue;

            if (contentTypeRef.current === 'pdf') {
              renderTextLayer(pdfDocRef, pageNum, textEl, scale);
            } else if (contentTypeRef.current === 'svg') {
              const svgString = svgPagesRef.current.get(pageNum);
              if (svgString) {
                const meta = pageMetadata.get(pageNum);
                renderSvgOverlay(
                  svgString,
                  textEl,
                  scale,
                  meta?.width || 595,
                  meta?.height || 842,
                );
              }
            }
          }
          if (canvasRendererAnnotations && contentTypeRef.current === 'pdf') {
            const annotEl = annotationLayerRefs.current.get(pageNum);
            if (annotEl)
              renderAnnotationLayer(pdfDocRef, pageNum, annotEl, scale);
          }
        }
      }, 150);
    },
    [scale, canvasRendererTextSelection, canvasRendererAnnotations, pageMetadata],
  );

  const renderVisiblePages = useCallback(() => {
    const overlayPages: number[] = [];

    if (scrollView) {
      for (let i = renderRange.start; i <= renderRange.end; i++) {
        if (i <= numPages) {
          if (contentTypeRef.current === 'svg' && svgPagesRef.current.has(i)) {
            renderSvgPageToCanvas(svgCtx, i);
            overlayPages.push(i);
          } else if (contentTypeRef.current === 'pdf' && pdfDocRef.current) {
            renderPdfPageToCanvas(pdfCtx, i);
            overlayPages.push(i);
          }
        }
      }
    } else {
      if (contentTypeRef.current === 'svg' && svgPagesRef.current.has(currentPage)) {
        renderSvgPageToCanvas(svgCtx, currentPage);
        overlayPages.push(currentPage);
      } else if (contentTypeRef.current === 'pdf' && pdfDocRef.current) {
        renderPdfPageToCanvas(pdfCtx, currentPage);
        overlayPages.push(currentPage);
      }
    }

    if (overlayPages.length > 0) renderOverlays(overlayPages);
  }, [scrollView, renderRange, currentPage, numPages, svgCtx, pdfCtx, renderOverlays]);

  useEffect(() => {
    if (scrollView) return;
    renderVisiblePages();
  }, [currentPage, scale, scrollView]);

  useEffect(() => {
    if (!scrollView) return;
    renderVisiblePages();
  }, [renderRange, scrollView]);

  useEffect(() => {
    if (!scrollView || !scrollContainerRef.current) return;

    let rafId: number | null = null;
    let lastUpdateTime = 0;

    const handleScroll = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
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
      if (rafId !== null) cancelAnimationFrame(rafId);
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

  const updateContent = useCallback(
    async (buffer: ArrayBuffer) => {
      if (!buffer || buffer.byteLength === 0) return;

      const arr = new Uint8Array(buffer);
      const isPdf =
        arr.length > 4 &&
        arr[0] === 0x25 &&
        arr[1] === 0x50 &&
        arr[2] === 0x44 &&
        arr[3] === 0x46;

      const newContentType = isPdf ? 'pdf' : 'svg';
      contentTypeRef.current = newContentType;
      setContentType(newContentType);
      fullSvgBufferRef.current = buffer.slice(0);
      clearPdfCaches();

      for (const el of textLayerRefs.current.values()) {
        invalidateSvgOverlayCache(el);
        invalidatePdfOverlayCaches(el);
      }
      for (const el of annotationLayerRefs.current.values()) {
        invalidatePdfOverlayCaches(el);
      }

      try {
        if (isPdf) {
          svgPagesRef.current.clear();
          const { pdfDoc, metadata } = await parsePdfPages(buffer);
          pdfDocRef.current = pdfDoc;
          setPageMetadata(metadata);
          setNumPages(pdfDoc.numPages);
        } else {
          pdfDocRef.current = null;
          const { pages, metadata } = await parseSvgPages(buffer);
          svgPagesRef.current = pages;
          setPageMetadata(metadata);
          setNumPages(pages.size);
        }

        setIsLoading(false);
        setError(null);
      } catch (err) {
        console.error('[CanvasRenderer] Failed to parse content:', err);
        setError(`Failed to parse content: ${err}`);
        setIsLoading(false);
      }
    },
    [],
  );

  useImperativeHandle(
    controllerRef,
    () => ({
      updateContent: (newContent: ArrayBuffer | string) => {
        const buffer =
          typeof newContent === 'string'
            ? new TextEncoder().encode(newContent).buffer
            : newContent;
        updateContent(buffer);
      },
      setHighlight: (newHighlight) => {
        setHighlight(newHighlight);
        if (newHighlight) {
          document.dispatchEvent(
            new CustomEvent('canvas-renderer-navigate', {
              detail: { page: newHighlight.page },
            }),
          );
        }
      },
    }),
    [updateContent],
  );

  useEffect(() => {
    if (propertiesRegistered.current) return;
    propertiesRegistered.current = true;

    registerProperty({
      id: 'canvas-renderer-zoom',
      category: 'UI',
      subcategory: 'Canvas Viewer',
      defaultValue: 1.0,
    });

    registerProperty({
      id: 'canvas-renderer-scroll-view',
      category: 'UI',
      subcategory: 'Canvas Viewer',
      defaultValue: false,
    });
  }, [registerProperty]);

  useEffect(() => {
    const storedZoom = getProperty('canvas-renderer-zoom');
    const storedScrollView = getProperty('canvas-renderer-scroll-view');

    if (storedZoom !== undefined) setScale(Number(storedZoom));
    if (storedScrollView !== undefined) setScrollView(Boolean(storedScrollView));
  }, [getProperty]);

  useEffect(() => {
    if (content && content instanceof ArrayBuffer && content.byteLength > 0) {
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
    if (pageMetadata.size === 0) return;
    document.dispatchEvent(
      new CustomEvent('canvas-renderer-dimensions', {
        detail: { dimensions: pageMetadata },
      }),
    );
  }, [pageMetadata]);

  useEffect(() => {
    if (scrollView) calculateVisibleRange();
  }, [scrollView, numPages, scale, calculateVisibleRange]);

  useEffect(() => {
    if (numPages === 0 || pageMetadata.size === 0) return;
    renderVisiblePages();
  }, [numPages, pageMetadata, renderVisiblePages]);

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

  const handlePageInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setPageInput(event.target.value);
    },
    [],
  );

  const handlePageInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
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
    },
    [numPages, currentPage, pageInput, scrollToPage],
  );

  const handlePageClick = useCallback(
    (pageNum: number, event: React.MouseEvent<HTMLDivElement>) => {
      if (!onLocationClick) return;
      const canvas = canvasRefs.current.get(pageNum);
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const meta = pageMetadata.get(pageNum);
      if (!meta) return;
      const x = ((event.clientX - rect.left) / rect.width) * meta.width;
      const y = ((event.clientY - rect.top) / rect.height) * meta.height;
      onLocationClick(pageNum, x, y);
    },
    [onLocationClick, pageMetadata],
  );

  const computeFitScale = useCallback(
    (mode: 'fit-width' | 'fit-height') => {
      const container = scrollContainerRef.current || contentElRef.current;
      const containerWidth = container?.clientWidth || 800;
      const containerHeight = container?.clientHeight || 600;
      const meta = pageMetadata.get(currentPage);
      const pageWidth = meta?.width || 595;
      const pageHeight = meta?.height || 842;

      if (mode === 'fit-width') {
        return Math.max(0.25, Math.min(5, (containerWidth - 60) / pageWidth));
      }
      return Math.max(0.25, Math.min(5, (containerHeight - 70) / pageHeight));
    },
    [currentPage, pageMetadata],
  );

  const maxPageWidth = useMemo(() => {
    let maxW = 595;
    for (let i = renderRange.start; i <= renderRange.end; i++) {
      const meta = pageMetadata.get(i);
      if (meta && meta.width > maxW) maxW = meta.width;
    }
    return maxW;
  }, [renderRange, pageMetadata]);

  const anchorScrollToCurrentPage = useCallback(
    (newScale: number) => {
      if (!scrollView || !scrollContainerRef.current) return;
      const container = scrollContainerRef.current;
      const oldTop = getPageTop(currentPage);
      const offsetWithinPage = container.scrollTop - oldTop;
      const meta = pageMetadata.get(currentPage);
      const oldPageHeight = (meta?.height || 842) * scale + 20;
      const newPageHeight = (meta?.height || 842) * newScale + 20;
      const ratio = oldPageHeight > 0 ? offsetWithinPage / oldPageHeight : 0;

      requestAnimationFrame(() => {
        if (!scrollContainerRef.current) return;
        let acc = 0;
        for (let i = 1; i < currentPage; i++) {
          const m = pageMetadata.get(i);
          acc += (m?.height || 842) * newScale + 20;
        }
        scrollContainerRef.current.scrollTop = acc + ratio * newPageHeight;
      });
    },
    [scrollView, currentPage, pageMetadata, scale],
  );

  const handleFitToggle = useCallback(() => {
    const nextMode = fitMode === 'fit-width' ? 'fit-height' : 'fit-width';
    const s = computeFitScale(nextMode);
    if (s !== scale) anchorScrollToCurrentPage(s);
    setFitMode(nextMode);
    setScale(s);
    setProperty('canvas-renderer-zoom', s);
  }, [fitMode, scale, computeFitScale, setProperty, anchorScrollToCurrentPage]);

  const handleZoomIn = useCallback(() => {
    const newScale = Math.min(scale + 0.25, 5);
    if (newScale === scale) return;
    anchorScrollToCurrentPage(newScale);
    setScale(newScale);
    setProperty('canvas-renderer-zoom', newScale);
  }, [scale, setProperty, anchorScrollToCurrentPage]);

  const handleZoomOut = useCallback(() => {
    const newScale = Math.max(scale - 0.25, 0.25);
    if (newScale === scale) return;
    anchorScrollToCurrentPage(newScale);
    setScale(newScale);
    setProperty('canvas-renderer-zoom', newScale);
  }, [scale, setProperty, anchorScrollToCurrentPage]);

  const handleZoomChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      if (value === 'custom') return;
      const newScale = parseFloat(value) / 100;
      anchorScrollToCurrentPage(newScale);
      setScale(newScale);
      setProperty('canvas-renderer-zoom', newScale);
    },
    [setProperty, anchorScrollToCurrentPage],
  );

  const handleToggleView = useCallback(() => {
    const newScrollView = !scrollView;
    const targetPage = currentPage;
    setScrollView(newScrollView);
    setProperty('canvas-renderer-scroll-view', newScrollView);

    if (newScrollView) {
      isTrackingEnabledRef.current = false;
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop = getPageTop(targetPage);
        }
        lastStablePageRef.current = targetPage;
        setTimeout(() => {
          isTrackingEnabledRef.current = true;
        }, 200);
      });
    }
  }, [scrollView, currentPage, setProperty, getPageTop]);

  const handleToggleFullscreen = useCallback(() => {
    if (document.fullscreenElement === containerRef.current) {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    } else if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().then(() => setIsFullscreen(true));
    }
  }, []);

  const handleExport = useCallback(() => {
    if (onDownload && fileName) {
      onDownload(fileName);
      return;
    }

    const isPdf = contentType === 'pdf';
    const buffer = fullSvgBufferRef.current;
    if (!buffer || buffer.byteLength === 0) return;

    const mimeType = isPdf ? 'application/pdf' : 'image/svg+xml';
    const extension = isPdf ? '.pdf' : '.svg';

    const blob = new Blob([buffer], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName?.replace(/\.(typ|pdf|svg)$/i, extension) || `output${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [fileName, onDownload, contentType]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const fullscreenElement = document.fullscreenElement;
      const isCanvasFullscreen = fullscreenElement === containerRef.current;

      setIsFullscreen(isCanvasFullscreen);

      if (!isCanvasFullscreen) return;

      requestAnimationFrame(() => {
        const s = computeFitScale(fitMode);
        if (s !== scale) {
          anchorScrollToCurrentPage(s);
          setScale(s);
          setProperty('canvas-renderer-zoom', s);
        }
      });
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () =>
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [fitMode, scale, computeFitScale, anchorScrollToCurrentPage, setProperty]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        !document.fullscreenElement &&
        !containerRef.current?.contains(document.activeElement)
      ) return;

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

  useEffect(() => {
    const handleNavigate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.page && detail.page >= 1 && detail.page <= numPages) {
        lastStablePageRef.current = detail.page;
        setCurrentPage(detail.page);
        setPageInput(String(detail.page));
        scrollToPage(detail.page);
      }
    };

    document.addEventListener('canvas-renderer-navigate', handleNavigate);
    return () =>
      document.removeEventListener('canvas-renderer-navigate', handleNavigate);
  }, [numPages, scrollToPage]);

  const setCanvasRef = useCallback(
    (pageNumber: number) => (el: HTMLCanvasElement | null) => {
      if (el) canvasRefs.current.set(pageNumber, el);
      else canvasRefs.current.delete(pageNumber);
    },
    [],
  );

  const setTextLayerRef = useCallback(
    (pageNumber: number) => (el: HTMLDivElement | null) => {
      if (el) textLayerRefs.current.set(pageNumber, el);
      else textLayerRefs.current.delete(pageNumber);
    },
    [],
  );

  const setAnnotationLayerRef = useCallback(
    (pageNumber: number) => (el: HTMLDivElement | null) => {
      if (el) annotationLayerRefs.current.set(pageNumber, el);
      else annotationLayerRefs.current.delete(pageNumber);
    },
    [],
  );

  const renderHighlight = (pageNum: number) => {
    if (!highlight || highlight.page !== pageNum) return null;
    return highlight.rects.map((rect, i) => (
      <div
        key={i}
        className="canvas-page-highlight"
        style={{
          position: 'absolute',
          left: `${rect.x * scale}px`,
          top: `${rect.y * scale}px`,
          width: `${Math.max(rect.width, 0) * scale}px`,
          height: `${Math.max(rect.height, 1) * scale}px`,
          pointerEvents: 'none',
          backgroundColor: 'rgba(255, 235, 59, 0.4)',
          border: '2px solid rgba(255, 193, 7, 0.8)',
          borderRadius: '2px',
          animation: 'source-map-highlight-pulse 1.5s ease-out',
        }}
      />
    ));
  };

  if (!canvasRendererEnable) {
    return (
      <div className="canvas-renderer-container">
        <div className="canvas-renderer-error">
          {t('Canvas renderer is disabled. Please enable it in settings.')}
        </div>
      </div>
    );
  }

  const isPdf = contentTypeRef.current === 'pdf';
  const virtualWrapperWidth = maxPageWidth;
  const topOffset = scrollView ? pageOffsets[renderRange.start - 1] || 0 : 0;
  const zoomOptions =
    getCanvasRendererSettings().find(
      (s) => s.id === 'canvas-renderer-initial-zoom',
    )?.options || [];
  const currentZoom = Math.round(scale * 100).toString();
  const hasCustomZoom = !zoomOptions.some(
    (opt) => String(opt.value) === currentZoom,
  );

  return (
    <div className="canvas-renderer-container" ref={containerRef}>
      <div
        className={`canvas-toolbar ${isFullscreen ? 'fullscreen-toolbar' : ''}`}
      >
        <div className="toolbar">
          <div id="toolbarLeft">
            <div className="toolbarButtonGroup">
              <button
                onClick={handlePreviousPage}
                className="toolbarButton"
                title={t('Previous Page')}
                disabled={currentPage <= 1 || isLoading}
              >
                <ChevronLeftIcon />
              </button>
              <button
                onClick={handleNextPage}
                className="toolbarButton"
                title={t('Next Page')}
                disabled={currentPage >= numPages || isLoading}
              >
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
                disabled={isLoading}
              >
                <ZoomOutIcon />
              </button>
              <select
                value={hasCustomZoom ? 'custom' : currentZoom}
                onChange={handleZoomChange}
                disabled={isLoading}
                className="toolbarZoomSelect"
                title={t('Zoom Level')}
              >
                {zoomOptions.map((option) => (
                  <option
                    key={String(option.value)}
                    value={String(option.value)}
                  >
                    {option.label}
                  </option>
                ))}
                {hasCustomZoom && (
                  <option value="custom">{Math.round(scale * 100)}%</option>
                )}
              </select>
              <button
                onClick={handleZoomIn}
                className="toolbarButton"
                title={t('Zoom In')}
                disabled={isLoading}
              >
                <ZoomInIcon />
              </button>
            </div>

            <div className="toolbarButtonGroup">
              <button
                onClick={handleFitToggle}
                className="toolbarButton"
                title={
                  fitMode === 'fit-width'
                    ? t('Fit to Height')
                    : t('Fit to Width')
                }
                disabled={isLoading}
              >
                {fitMode === 'fit-width' ? <FitToWidthIcon /> : <FitToHeightIcon />}
              </button>
              <button
                onClick={handleToggleView}
                className="toolbarButton"
                title={scrollView ? t('Single Page View') : t('Scroll View')}
                disabled={isLoading}
              >
                {scrollView ? <PageIcon /> : <ScrollIcon />}
              </button>
              <button
                onClick={handleToggleFullscreen}
                className="toolbarButton"
                title={isFullscreen ? t('Exit Fullscreen') : t('Fullscreen')}
                disabled={isLoading}
              >
                {isFullscreen ? <MinimizeIcon /> : <ExpandIcon />}
              </button>
            </div>

            <div className="toolbarButtonGroup">
              <button
                onClick={handleExport}
                className="toolbarButton"
                title={t('Download')}
                disabled={isLoading}
              >
                <DownloadIcon />
              </button>
            </div>
          </div>
          {headerLabel && (
            <div id="toolbarRight">
              <span className="toolbar-file-label" title={headerTitle}>
                {headerLabel}
              </span>
            </div>
          )}
        </div>
      </div>

      <div
        className={`canvas-renderer-content ${isFullscreen ? 'fullscreen' : ''}`}
        ref={scrollView ? scrollContainerRef : contentElRef}
      >
        <div className="canvas-renderer-viewer">
          {!isLoading && !error && numPages > 0 && (
            scrollView ? (
              <div
                className="canvas-virtual-wrapper"
                style={{
                  position: 'relative',
                  height: totalHeight,
                  width: virtualWrapperWidth,
                  margin: '0 auto',
                }}
              >
                <div
                  className="canvas-virtual-inner"
                  style={{
                    position: 'absolute',
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
                        <div
                          key={`canvas-${contentType}-${pageNumber}`}
                          className="canvas-page"
                          onClick={(e) => handlePageClick(pageNumber, e)}
                        >
                          <canvas
                            ref={setCanvasRef(pageNumber)}
                            className="canvas-page-canvas"
                            style={{
                              width: `${width * scale}px`,
                              height: `${height * scale}px`,
                            }}
                          />
                          {canvasRendererTextSelection && (
                            <div
                              ref={setTextLayerRef(pageNumber)}
                              className="textLayer"
                            />
                          )}
                          {isPdf && canvasRendererAnnotations && (
                            <div
                              ref={setAnnotationLayerRef(pageNumber)}
                              className="annotationLayer"
                            />
                          )}
                          {renderHighlight(pageNumber)}
                        </div>
                      );
                    },
                  )}
                </div>
              </div>
            ) : (
              <div
                className="canvas-page"
                onClick={(e) => handlePageClick(currentPage, e)}
              >
                <canvas
                  key={`canvas-${contentType}-${currentPage}`}
                  ref={setCanvasRef(currentPage)}
                  className="canvas-page-canvas"
                  style={{
                    width: `${(pageMetadata.get(currentPage)?.width || 595) * scale}px`,
                    height: `${(pageMetadata.get(currentPage)?.height || 842) * scale}px`,
                  }}
                />
                {canvasRendererTextSelection && (
                  <div
                    key={`text-${contentType}-${currentPage}`}
                    ref={setTextLayerRef(currentPage)}
                    className="textLayer"
                  />
                )}
                {isPdf && canvasRendererAnnotations && (
                  <div
                    key={`annot-${contentType}-${currentPage}`}
                    ref={setAnnotationLayerRef(currentPage)}
                    className="annotationLayer"
                  />
                )}
                {renderHighlight(currentPage)}
              </div>
            )
          )}

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
