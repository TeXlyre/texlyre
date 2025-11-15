// extras/renderers/pdf/PdfRenderer.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  ZoomInIcon,
  ZoomOutIcon,
  ExpandIcon,
  MinimizeIcon
} from
  '@/components/common/Icons';
import { pdfRendererSettings } from './settings';
import { useSettings } from '@/hooks/useSettings';
import { useProperties } from '@/hooks/useProperties';
import type { RendererProps } from '@/plugins/PluginInterface';
import './styles.css';

const BASE_PATH = __BASE_PATH__;

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

const PdfRenderer: React.FC<RendererProps> = ({
  content,
  fileName,
  onDownload
}) => {
  const { getSetting } = useSettings();
  const { getProperty, setProperty, registerProperty } = useProperties();
  const propertiesRegistered = useRef(false);

  const pdfRendererEnable =
    getSetting('pdf-renderer-enable')?.value as boolean ?? true;
  const pdfRendererTextSelection =
    getSetting('pdf-renderer-text-selection')?.value as boolean ?? true;

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
  const [pageHeightMap, setPageHeightMap] = useState<Map<number, number>>(new Map());
  const [renderRange, setRenderRange] = useState<{ start: number; end: number; }>({ start: 1, end: 1 });
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const contentRef = useRef<ArrayBuffer | null>(null);
  const originalContentRef = useRef<ArrayBuffer | null>(null);
  const contentHashRef = useRef<string>('');
  const containerRef = useRef<HTMLDivElement>(null);
  const pageWidths = useRef<Map<number, number>>(new Map());
  const pageHeights = useRef<Map<number, number>>(new Map());
  const contentElRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isPageRenderedRef = useRef<Set<number>>(new Set());
  const [fitMode, setFitMode] = useState<'fit-width' | 'fit-height'>('fit-width');
  const BUFFER_PAGES = 2;

  useEffect(() => {
    if (propertiesRegistered.current) return;
    propertiesRegistered.current = true;

    registerProperty({
      id: 'pdf-renderer-zoom',
      category: 'UI',
      subcategory: 'PDF Viewer',
      defaultValue: 1.0
    });

    registerProperty({
      id: 'pdf-renderer-scroll-view',
      category: 'UI',
      subcategory: 'PDF Viewer',
      defaultValue: false
    });
  }, [registerProperty]);

  useEffect(() => {
    const storedZoom = getProperty('pdf-renderer-zoom');
    const storedScrollView = getProperty('pdf-renderer-scroll-view');

    if (storedZoom !== undefined) {
      setScale(Number(storedZoom));
    }

    if (storedScrollView !== undefined) {
      setScrollView(Boolean(storedScrollView));
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
          const data = new Uint8Array(content);
          const dataCopy = new Uint8Array(data);
          setPdfData(dataCopy);

          originalContentRef.current = dataCopy.buffer.slice(0);
          contentRef.current = originalContentRef.current;
          contentHashRef.current = contentHash;

          setIsLoading(true);
          setError(null);
        }
      } catch (error) {
        console.error('Error creating PDF data:', error);
        setError('Failed to process PDF content');
        setIsLoading(false);
      }
    } else {
      setPdfData(null);
      contentRef.current = null;
      originalContentRef.current = null;
      contentHashRef.current = '';
      setError('No PDF content available');
      setIsLoading(false);
    }
  }, [content, getContentHash]);

  const fileData = useMemo(() => {
    return pdfData ? {
      data: pdfData,
      cMapUrl: `${BASE_PATH}/assets/cmaps/`,
      cMapPacked: true
    } : null;
  }, [pdfData]);

  const onDocumentLoadSuccess = useCallback(
    ({ numPages }: { numPages: number; }) => {
      setNumPages(numPages);
      setCurrentPage(1);
      if (!isEditingPageInput) setPageInput('1');
      setIsLoading(false);
      setError(null);
      isPageRenderedRef.current.clear();
    },
    [isEditingPageInput]
  );

  const onDocumentLoadError = useCallback((error: Error) => {
    setError(`Failed to load PDF: ${error.message}`);
    setIsLoading(false);
  }, []);

  const onPageLoadSuccess = useCallback((page: any) => {
    const pageNum = page.pageNumber;
    const viewport = page.getViewport({ scale: 1.0 });

    pageWidths.current.set(pageNum, viewport.width);
    pageHeights.current.set(pageNum, viewport.height);

    setPageHeightMap((prev) => {
      const newMap = new Map(prev);
      const newHeight = viewport.height * scale + 20;
      if (prev.get(pageNum) !== newHeight) {
        newMap.set(pageNum, newHeight);
        return newMap;
      }
      return prev;
    });
  }, [scale]);

  useEffect(() => {
    if (pageHeights.current.size === 0) return;

    setPageHeightMap((prev) => {
      const newMap = new Map();
      pageHeights.current.forEach((height, pageNum) => {
        newMap.set(pageNum, height * scale + 20);
      });
      return newMap.size > 0 ? newMap : prev;
    });
  }, [scale]);

  const getPageTop = useCallback((pageNum: number): number => {
    let height = 0;
    for (let i = 1; i < pageNum; i++) {
      const baseHeight = pageHeights.current.get(i) || 842;
      height += baseHeight * scale + 20;
    }
    return height;
  }, [scale]);

  const handlePreviousPage = useCallback(() => {
    if (scrollView) {
      const targetPage = Math.max(currentPage - 1, 1);
      const targetTop = getPageTop(targetPage);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({ top: targetTop, behavior: 'smooth' });
      }
      setCurrentPage(targetPage);
      if (!isEditingPageInput) setPageInput(String(targetPage));
    } else {
      setCurrentPage((prev) => {
        const p = Math.max(prev - 1, 1);
        if (!isEditingPageInput) setPageInput(String(p));
        return p;
      });
    }
  }, [scrollView, currentPage, isEditingPageInput, getPageTop]);

  const handleNextPage = useCallback(() => {
    if (scrollView) {
      const targetPage = Math.min(currentPage + 1, numPages);
      const targetTop = getPageTop(targetPage);
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({ top: targetTop, behavior: 'smooth' });
      }
      setCurrentPage(targetPage);
      if (!isEditingPageInput) setPageInput(String(targetPage));
    } else {
      setCurrentPage((prev) => {
        const p = Math.min(prev + 1, numPages);
        if (!isEditingPageInput) setPageInput(String(p));
        return p;
      });
    }
  }, [scrollView, currentPage, numPages, isEditingPageInput, getPageTop]);

  const handlePageInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setPageInput(event.target.value);
    },
    []
  );

  const handlePageInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        const pageNum = Number.parseInt(pageInput, 10);
        if (!Number.isNaN(pageNum) && pageNum >= 1 && pageNum <= numPages) {
          if (scrollView) {
            const targetTop = getPageTop(pageNum);
            if (scrollContainerRef.current) {
              scrollContainerRef.current.scrollTo({ top: targetTop, behavior: 'smooth' });
            }
          }
          setCurrentPage(pageNum);
          setPageInput(String(pageNum));
        } else {
          setPageInput(String(currentPage));
        }
        setIsEditingPageInput(false);
        (event.target as HTMLInputElement).blur();
      }
    },
    [numPages, currentPage, scrollView, pageInput, getPageTop]
  );

  const computeFitScale = useCallback((mode: 'fit-width' | 'fit-height') => {
    const containerWidth =
      contentElRef.current?.clientWidth ||
      document.querySelector('.pdf-renderer-content')?.clientWidth ||
      3840;
    const containerHeight =
      contentElRef.current?.clientHeight ||
      (document.querySelector('.pdf-renderer-content') as HTMLElement | null)?.clientHeight ||
      2160;
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
    } else {
      return Math.max(0.5, Math.min(10, (containerHeight - 40) / pageHeight));
    }
  }, [currentPage]);

  const handleFitToggle = useCallback(() => {
    const nextMode = fitMode === 'fit-width' ? 'fit-height' : 'fit-width';
    setFitMode(nextMode);
    const s = computeFitScale(nextMode);
    setScale(s);
    setProperty('pdf-renderer-zoom', s);
  }, [fitMode, computeFitScale, setProperty]);

  const handleZoomIn = useCallback(() => {
    setScale((prev) => {
      const newScale = Math.min(prev + 0.25, 5);
      setProperty('pdf-renderer-zoom', newScale);
      return newScale;
    });
  }, [setProperty]);

  const handleZoomOut = useCallback(() => {
    setScale((prev) => {
      const newScale = Math.max(prev - 0.25, 0.25);
      setProperty('pdf-renderer-zoom', newScale);
      return newScale;
    });
  }, [setProperty]);

  const handleZoomChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (value === 'custom') return;
    const newScale = parseFloat(value) / 100;
    setScale(newScale);
    setProperty('pdf-renderer-zoom', newScale);
  }, [setProperty]);

  const handleToggleView = useCallback(() => {
    setScrollView((prev) => {
      const newScrollView = !prev;
      setProperty('pdf-renderer-scroll-view', newScrollView);
      pageRefs.current.clear();
      return newScrollView;
    });
  }, [setProperty]);

  const handleToggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().then(() => {
        setIsFullscreen(true);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      });
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

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
      const pageHeight = pageHeightMap.get(i) || (pageHeights.current.get(i) || 842) * scale + 20;
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
  }, [scrollView, numPages, pageHeightMap, scale]);

  useEffect(() => {
    if (!scrollView || !scrollContainerRef.current) return;

    const handleScroll = () => {
      calculateVisibleRange();
    };

    const container = scrollContainerRef.current;
    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [scrollView, calculateVisibleRange]);

  useEffect(() => {
    if (scrollView) {
      calculateVisibleRange();
    }
  }, [scrollView, numPages, scale, calculateVisibleRange]);

  useEffect(() => {
    if (!scrollView || !scrollContainerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const pageNum = Number.parseInt(
            entry.target.getAttribute('data-page-number') || '0'
          );
          if (entry.isIntersecting && entry.intersectionRatio > 0.3) {
            setCurrentPage(pageNum);
            if (!isEditingPageInput) setPageInput(String(pageNum));
          }
        });
      },
      {
        threshold: [0.3],
        root: scrollContainerRef.current
      }
    );

    pageRefs.current.forEach((element) => {
      observer.observe(element);
    });

    return () => observer.disconnect();
  }, [scrollView, isEditingPageInput]);

  const handleExport = useCallback(() => {
    if (onDownload && fileName) {
      onDownload(fileName);
    } else if (
      originalContentRef.current &&
      originalContentRef.current.byteLength > 0) {
      try {
        const blob = new Blob([originalContentRef.current], {
          type: 'application/pdf'
        });
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
        setError('Failed to export PDF');
      }
    } else {
      setError('Cannot export: PDF content is not available');
    }
  }, [fileName, onDownload]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        !document.fullscreenElement &&
        !containerRef.current?.contains(document.activeElement)) {
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
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handlePreviousPage, handleNextPage]);

  if (!pdfRendererEnable) {
    return (
      <div className="pdf-renderer-container">
        <div className="pdf-renderer-error">{t('Enhanced PDF renderer is disabled. Please enable it in settings to use this renderer.')}


        </div>
      </div>);

  }

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
                  disabled={isLoading} />

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
              {(() => {
                const zoomOptions = pdfRendererSettings.find((s) => s.id === 'pdf-renderer-initial-zoom')?.options || [];
                const currentZoom = Math.round(scale * 100).toString();
                const hasCustomZoom = !zoomOptions.some((opt) => String(opt.value) === currentZoom);

                return (
                  <select
                    value={hasCustomZoom ? 'custom' : currentZoom}
                    onChange={handleZoomChange}
                    disabled={isLoading}
                    className="toolbarZoomSelect"
                    title={t('Zoom Level')}>

                    {zoomOptions.map((option) =>
                      <option key={String(option.value)} value={String(option.value)}>
                        {option.label}
                      </option>
                    )}
                    {hasCustomZoom &&
                      <option value="custom">
                        {Math.round(scale * 100)}%
                      </option>
                    }
                  </select>);

              })()}
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
                title={fitMode === 'fit-width' ? t('Fit to Width') : t('Fit to Height')}
                disabled={isLoading}>

                <FitToWidthIcon />
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

      <div className={`pdf-renderer-content ${isFullscreen ? 'fullscreen' : ''}`} ref={scrollView ? scrollContainerRef : contentElRef}>
        {fileData &&
          <Document
            file={fileData}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div className="pdf-renderer-loading">{t('Loading PDF document...')}

              </div>
            }>

            {!isLoading &&
              !error && (
                scrollView ?
                  Array.from(new Array(numPages), (_, index) => {
                    const pageNumber = index + 1;
                    const shouldRender = pageNumber >= renderRange.start && pageNumber <= renderRange.end;
                    const estimatedHeight = pageHeightMap.get(pageNumber) || (pageHeights.current.get(pageNumber) || 842) * scale + 20;

                    return (
                      <div
                        key={`page_${pageNumber}`}
                        data-page-number={pageNumber}
                        ref={(el) => {
                          if (el && shouldRender) {
                            pageRefs.current.set(pageNumber, el);
                          } else if (!shouldRender) {
                            pageRefs.current.delete(pageNumber);
                          }
                        }}
                        className="pdf-page-scroll"
                        style={{ minHeight: shouldRender ? undefined : `${estimatedHeight}px` }}>

                        {shouldRender ?
                          <Page
                            pageNumber={pageNumber}
                            scale={scale}
                            renderTextLayer={pdfRendererTextSelection}
                            renderAnnotationLayer={true}
                            onLoadSuccess={onPageLoadSuccess}
                            loading={
                              <div className="pdf-page-loading">{t('Loading page')}
                                {pageNumber}{t('...')}
                              </div>
                            } /> :

                          null}
                      </div>);

                  }) :

                  <div className="pdf-page-scroll">
                    <Page
                      pageNumber={currentPage}
                      scale={scale}
                      renderTextLayer={pdfRendererTextSelection}
                      renderAnnotationLayer={true}
                      onLoadSuccess={onPageLoadSuccess}
                      loading={
                        <div className="pdf-page-loading">{t('Loading page...')}</div>
                      } />

                  </div>)
            }
          </Document>
        }
      </div>

      {error && <div className="pdf-renderer-error">{error}</div>}
    </div>);

};

export default PdfRenderer;