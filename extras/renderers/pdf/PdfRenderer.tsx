// extras/renderers/pdf/PdfRenderer.tsx
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
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

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
import { getPdfRendererSettings } from './settings';
import { useSettings } from '@/hooks/useSettings';
import { useProperties } from '@/hooks/useProperties';
import type { RendererProps } from '@/plugins/PluginInterface';
import './styles.css';

const BASE_PATH = __BASE_PATH__;

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const PdfRenderer: React.FC<RendererProps> = ({
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
  const propertiesRegistered = useRef(false);

  const pdfRendererEnable =
    (getSetting('pdf-renderer-enable')?.value as boolean) ?? true;
  const pdfRendererTextSelection =
    (getSetting('pdf-renderer-text-selection')?.value as boolean) ?? true;

  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageInput, setPageInput] = useState<string>('1');
  const [isEditingPageInput, setIsEditingPageInput] = useState<boolean>(false);
  const [scale, setScale] = useState<number>(1.0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [scrollView, setScrollView] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [renderRange, setRenderRange] = useState<{
    start: number;
    end: number;
  }>({ start: 1, end: 1 });
  const [fitMode, setFitMode] = useState<'fit-width' | 'fit-height'>(
    'fit-width',
  );

  const pageWidths = useRef<Map<number, number>>(new Map());
  const pageHeights = useRef<Map<number, number>>(new Map());
  const lastStablePageRef = useRef<number>(1);
  const contentHashRef = useRef<string>('');
  const originalContentRef = useRef<ArrayBuffer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentElRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isTrackingEnabledRef = useRef<boolean>(true);
  const pendingRestorePageRef = useRef<number | null>(null);
  const loadedPagesRef = useRef<Set<number>>(new Set());

  const [highlight, setHighlight] = useState<{
    page: number;
    rects: Array<{ x: number; y: number; width: number; height: number }>;
  } | null>(null);

  const BUFFER_PAGES = 2;
  const UPDATE_THROTTLE = 100;
  const HYSTERESIS_THRESHOLD = 0.2;

  useEffect(() => {
    if (propertiesRegistered.current) return;
    propertiesRegistered.current = true;

    registerProperty({
      id: 'pdf-renderer-zoom',
      category: 'UI',
      subcategory: 'PDF Viewer',
      defaultValue: 1.0,
    });

    registerProperty({
      id: 'pdf-renderer-scroll-view',
      category: 'UI',
      subcategory: 'PDF Viewer',
      defaultValue: false,
    });

    registerProperty({
      id: 'pdf-renderer-current-page',
      category: 'UI',
      subcategory: 'PDF Viewer',
      defaultValue: 1,
    });
  }, [registerProperty]);

  useEffect(() => {
    const storedZoom = getProperty('pdf-renderer-zoom');
    const storedScrollView = getProperty('pdf-renderer-scroll-view');
    const storedPage = getProperty('pdf-renderer-current-page');

    if (storedZoom !== undefined) setScale(Number(storedZoom));
    if (storedScrollView !== undefined) setScrollView(Boolean(storedScrollView));
    if (storedPage !== undefined && Number(storedPage) >= 1) {
      pendingRestorePageRef.current = Number(storedPage);
    }
  }, [getProperty]);

  const getContentHash = useCallback((buffer: ArrayBuffer): string => {
    const view = new Uint8Array(buffer);
    const sample = view.slice(0, Math.min(1024, view.length));
    return `${buffer.byteLength}-${Array.from(sample.slice(0, 16)).join(',')}`;
  }, []);

  useEffect(() => {
    if (content instanceof ArrayBuffer && content.byteLength > 0) {
      try {
        const contentHash = getContentHash(content);
        if (contentHashRef.current !== contentHash) {
          const dataCopy = new Uint8Array(new Uint8Array(content));
          setPdfData(dataCopy);
          originalContentRef.current = dataCopy.buffer.slice(0);
          contentHashRef.current = contentHash;
          setIsLoading(true);
          setError(null);
        }
      } catch (error) {
        console.error('Error creating PDF data:', error);
        setError(t('Failed to process PDF content'));
        setIsLoading(false);
      }
    } else {
      setPdfData(null);
      originalContentRef.current = null;
      contentHashRef.current = '';
      setError(t('No PDF content available'));
      setIsLoading(false);
    }
  }, [content, getContentHash]);

  const fileData = useMemo(() => {
    return pdfData
      ? {
        data: pdfData,
        cMapUrl: `${BASE_PATH}/assets/cmaps/`,
        cMapPacked: true,
      }
      : null;
  }, [pdfData]);

  const getPageHeight = useCallback(
    (pageNum: number): number => {
      const baseHeight = pageHeights.current.get(pageNum) || 842;
      return baseHeight * scale + 20;
    },
    [scale],
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
      const pageCenter = accumulatedHeight + pageHeight / 2;
      const distance = Math.abs(viewportCenter - pageCenter);

      if (distance < minDistance) {
        minDistance = distance;
        closestPage = i;
      }

      accumulatedHeight += pageHeight;
      if (accumulatedHeight > viewportCenter + containerHeight) break;
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
        setProperty('pdf-renderer-current-page', closestPage);
      }
    }
  }, [scrollView, numPages, isEditingPageInput, getPageHeight, setProperty]);

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

  const onDocumentLoadSuccess = useCallback(
    ({ numPages: loadedNumPages }: { numPages: number }) => {
      setNumPages(loadedNumPages);
      loadedPagesRef.current.clear();

      const pendingPage = pendingRestorePageRef.current;
      const restorePage =
        pendingPage && pendingPage >= 1 && pendingPage <= loadedNumPages
          ? pendingPage
          : 1;

      pendingRestorePageRef.current = null;
      lastStablePageRef.current = restorePage;
      setCurrentPage(restorePage);
      if (!isEditingPageInput) setPageInput(String(restorePage));
      setIsLoading(false);
      setError(null);

      if (scrollView && restorePage > 1) {
        pendingRestorePageRef.current = restorePage;
        setRenderRange({
          start: Math.max(1, restorePage - BUFFER_PAGES),
          end: Math.min(loadedNumPages, restorePage + BUFFER_PAGES),
        });
      }
    },
    [isEditingPageInput, scrollView],
  );

  const onDocumentLoadError = useCallback((error: Error) => {
    setError(`Failed to load PDF: ${error.message}`);
    setIsLoading(false);
  }, []);

  const onPageLoadSuccess = useCallback(
    (page: any) => {
      const pageNum = page.pageNumber;
      const viewport = page.getViewport({ scale: 1.0 });
      pageWidths.current.set(pageNum, viewport.width);
      pageHeights.current.set(pageNum, viewport.height);
      loadedPagesRef.current.add(pageNum);

      const pendingPage = pendingRestorePageRef.current;
      if (pendingPage && pageNum === pendingPage && scrollView) {
        pendingRestorePageRef.current = null;
        isTrackingEnabledRef.current = false;
        requestAnimationFrame(() => {
          scrollToPage(pendingPage);
          setTimeout(() => {
            isTrackingEnabledRef.current = true;
            calculateVisibleRange();
          }, 300);
        });
      }
    },
    [scrollView, scrollToPage, calculateVisibleRange],
  );

  const persistCurrentPage = useCallback(
    (page: number) => {
      setCurrentPage(page);
      setProperty('pdf-renderer-current-page', page);
    },
    [setProperty],
  );

  const handlePreviousPage = useCallback(() => {
    const targetPage = Math.max(currentPage - 1, 1);
    lastStablePageRef.current = targetPage;
    persistCurrentPage(targetPage);
    setPageInput(String(targetPage));
    scrollToPage(targetPage);
  }, [currentPage, scrollToPage, persistCurrentPage]);

  const handleNextPage = useCallback(() => {
    const targetPage = Math.min(currentPage + 1, numPages);
    lastStablePageRef.current = targetPage;
    persistCurrentPage(targetPage);
    setPageInput(String(targetPage));
    scrollToPage(targetPage);
  }, [currentPage, numPages, scrollToPage, persistCurrentPage]);

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
          persistCurrentPage(pageNum);
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
    [numPages, currentPage, pageInput, scrollToPage, persistCurrentPage],
  );

  useImperativeHandle(
    controllerRef,
    () => ({
      updateContent: (_newContent: ArrayBuffer | string) => { },
      setHighlight: (newHighlight) => {
        setHighlight(newHighlight);
        if (newHighlight && newHighlight.page !== currentPage) {
          lastStablePageRef.current = newHighlight.page;
          persistCurrentPage(newHighlight.page);
          setPageInput(String(newHighlight.page));
          scrollToPage(newHighlight.page);
        }
      },
    }),
    [currentPage, persistCurrentPage, scrollToPage],
  );

  const computeFitScale = useCallback(
    (mode: 'fit-width' | 'fit-height') => {
      const container = scrollContainerRef.current || contentElRef.current;
      const containerWidth = container?.clientWidth || 800;
      const containerHeight = container?.clientHeight || 600;
      let pageWidth = 595;
      let pageHeight = 842;

      const currentW = pageWidths.current.get(currentPage);
      const currentH = pageHeights.current.get(currentPage);
      if (typeof currentW === 'number') pageWidth = currentW;
      if (typeof currentH === 'number') pageHeight = currentH;

      if ((!currentW || !currentH) && pageWidths.current.size > 0) {
        const firstKey = Math.min(...Array.from(pageWidths.current.keys()));
        pageWidth = pageWidths.current.get(firstKey) || pageWidth;
        pageHeight = pageHeights.current.get(firstKey) || pageHeight;
      }

      if (mode === 'fit-width') {
        return Math.max(0.5, Math.min(10, (containerWidth - 40) / pageWidth));
      }
      return Math.max(0.5, Math.min(10, (containerHeight - 40) / pageHeight));
    },
    [currentPage],
  );

  const anchorScrollToCurrentPage = useCallback(
    (newScale: number) => {
      if (!scrollView || !scrollContainerRef.current) return;
      const container = scrollContainerRef.current;
      const oldTop = getPageTop(currentPage);
      const offsetWithinPage = container.scrollTop - oldTop;
      const baseHeight = pageHeights.current.get(currentPage) || 842;
      const oldPageHeight = baseHeight * scale + 20;
      const newPageHeight = baseHeight * newScale + 20;
      const ratio = oldPageHeight > 0 ? offsetWithinPage / oldPageHeight : 0;

      requestAnimationFrame(() => {
        if (!scrollContainerRef.current) return;
        let acc = 0;
        for (let i = 1; i < currentPage; i++) {
          const h = pageHeights.current.get(i) || 842;
          acc += h * newScale + 20;
        }
        scrollContainerRef.current.scrollTop = acc + ratio * newPageHeight;
      });
    },
    [scrollView, currentPage, scale, getPageTop],
  );

  const handleFitToggle = useCallback(() => {
    const nextMode = fitMode === 'fit-width' ? 'fit-height' : 'fit-width';
    const s = computeFitScale(nextMode);
    if (s !== scale) anchorScrollToCurrentPage(s);
    setFitMode(nextMode);
    setScale(s);
    setProperty('pdf-renderer-zoom', s);
  }, [fitMode, scale, computeFitScale, setProperty, anchorScrollToCurrentPage]);

  const handleZoomIn = useCallback(() => {
    const newScale = Math.min(scale + 0.25, 5);
    if (newScale === scale) return;
    anchorScrollToCurrentPage(newScale);
    setScale(newScale);
    setProperty('pdf-renderer-zoom', newScale);
  }, [scale, setProperty, anchorScrollToCurrentPage]);

  const handleZoomOut = useCallback(() => {
    const newScale = Math.max(scale - 0.25, 0.25);
    if (newScale === scale) return;
    anchorScrollToCurrentPage(newScale);
    setScale(newScale);
    setProperty('pdf-renderer-zoom', newScale);
  }, [scale, setProperty, anchorScrollToCurrentPage]);

  const handleZoomChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      if (value === 'custom') return;
      const newScale = parseFloat(value) / 100;
      anchorScrollToCurrentPage(newScale);
      setScale(newScale);
      setProperty('pdf-renderer-zoom', newScale);
    },
    [setProperty, anchorScrollToCurrentPage],
  );

  const handlePageClick = useCallback(
    (pageNum: number, event: React.MouseEvent<HTMLDivElement>) => {
      if (!onLocationClick) return;
      const pageWidth = pageWidths.current.get(pageNum);
      const pageHeight = pageHeights.current.get(pageNum);
      if (!pageWidth || !pageHeight) return;

      const target = event.currentTarget.querySelector(
        '.react-pdf__Page canvas',
      ) as HTMLElement | null;
      if (!target) return;

      const rect = target.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const x = ((event.clientX - rect.left) / rect.width) * pageWidth;
      const y = ((event.clientY - rect.top) / rect.height) * pageHeight;
      onLocationClick(pageNum, x, y);
    },
    [onLocationClick],
  );

  const handleToggleView = useCallback(() => {
    const newScrollView = !scrollView;
    setScrollView(newScrollView);
    setProperty('pdf-renderer-scroll-view', newScrollView);
  }, [scrollView, setProperty]);

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleExport = useCallback(() => {
    if (onDownload && fileName) {
      onDownload(fileName);
      return;
    }

    if (!originalContentRef.current?.byteLength) {
      setError(t('Cannot export: PDF content is not available'));
      return;
    }

    try {
      const blob = new Blob([originalContentRef.current], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || 'document.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export error:', error);
      setError(t('Failed to export PDF'));
    }
  }, [fileName, onDownload]);

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

  const renderHighlight = (pageNum: number) => {
    if (!highlight || highlight.page !== pageNum) return null;
    return highlight.rects.map((rect, i) => (
      <div
        key={i}
        className="pdf-page-highlight"
        style={{
          position: 'absolute',
          left: `${rect.x * scale}px`,
          top: `${10 + rect.y * scale}px`,
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

  if (!pdfRendererEnable) {
    return (
      <div className="pdf-renderer-container">
        <div className="pdf-renderer-error">
          {t('Enhanced PDF renderer is disabled. Please enable it in settings to use this renderer.')}
        </div>
      </div>
    );
  }

  const zoomOptions =
    getPdfRendererSettings().find((s) => s.id === 'pdf-renderer-initial-zoom')
      ?.options || [];
  const currentZoom = Math.round(scale * 100).toString();
  const hasCustomZoom = !zoomOptions.some(
    (opt) => String(opt.value) === currentZoom,
  );

  return (
    <div className="pdf-renderer-container" ref={containerRef}>
      <div className={`pdf-toolbar ${isFullscreen ? 'fullscreen-toolbar' : ''}`}>
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
                  <option key={String(option.value)} value={String(option.value)}>
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
                title={fitMode === 'fit-width' ? t('Fit to Height') : t('Fit to Width')}
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
        className={`pdf-renderer-content ${isFullscreen ? 'fullscreen' : ''}`}
        ref={scrollView ? scrollContainerRef : contentElRef}
      >
        {fileData && (
          <Document
            file={fileData}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div className="pdf-renderer-loading">
                {t('Loading PDF document...')}
              </div>
            }
          >
            {!isLoading && !error && (
              scrollView ? (
                Array.from(new Array(numPages), (_, index) => {
                  const pageNumber = index + 1;
                  const shouldRender =
                    pageNumber >= renderRange.start &&
                    pageNumber <= renderRange.end;
                  const estimatedHeight = getPageHeight(pageNumber);

                  return (
                    <div
                      key={`page_${pageNumber}`}
                      data-page-number={pageNumber}
                      className="pdf-page-scroll"
                      style={{
                        minHeight: shouldRender ? undefined : `${estimatedHeight}px`,
                        position: 'relative',
                      }}
                      onClick={(e) => handlePageClick(pageNumber, e)}
                    >
                      {shouldRender && (
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                          <Page
                            pageNumber={pageNumber}
                            scale={scale}
                            renderTextLayer={pdfRendererTextSelection}
                            renderAnnotationLayer={true}
                            onLoadSuccess={onPageLoadSuccess}
                            loading={
                              <div className="pdf-page-loading">
                                {t('Loading page')} {pageNumber}{t('...')}
                              </div>
                            }
                          />
                          {renderHighlight(pageNumber)}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div
                  className="pdf-page-scroll"
                  style={{ position: 'relative' }}
                  onClick={(e) => handlePageClick(currentPage, e)}
                >
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <Page
                      pageNumber={currentPage}
                      scale={scale}
                      renderTextLayer={pdfRendererTextSelection}
                      renderAnnotationLayer={true}
                      onLoadSuccess={onPageLoadSuccess}
                      loading={
                        <div className="pdf-page-loading">
                          {t('Loading page...')}
                        </div>
                      }
                    />
                    {renderHighlight(currentPage)}
                  </div>
                </div>
              )
            )}
          </Document>
        )}
      </div>

      {error && <div className="pdf-renderer-error">{error}</div>}
    </div>
  );
};

export default PdfRenderer;
