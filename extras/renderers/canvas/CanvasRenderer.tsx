import { t } from "@/i18n";
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

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
  MinimizeIcon } from
'@/components/common/Icons';
import { canvasRendererSettings } from './settings';
import { useSettings } from '@/hooks/useSettings';
import { useProperties } from '@/hooks/useProperties';
import type { RendererProps } from '@/plugins/PluginInterface';
import { CanvasPageManager } from './CanvasPageManager';
import './styles.css';

const CanvasRenderer: React.FC<RendererProps> = ({
  content,
  fileName,
  onDownload
}) => {
  const { getSetting } = useSettings();
  const { getProperty, setProperty, registerProperty } = useProperties();

  const containerRef = useRef<HTMLDivElement>(null);
  const contentElRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const [pageManager] = useState(() => new CanvasPageManager(10, 2));
  const propertiesRegistered = useRef(false);
  const renderQueue = useRef<Set<number>>(new Set());
  const isRendering = useRef(false);

  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  const [isEditingPageInput, setIsEditingPageInput] = useState(false);
  const [scale, setScale] = useState(1.0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [scrollView, setScrollView] = useState(false);
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fitMode, setFitMode] = useState<'fit-width' | 'fit-height'>('fit-width');

  const canvasRendererEnable = getSetting('canvas-renderer-enable')?.value as boolean ?? true;

  useEffect(() => {
    console.log('[CanvasRenderer] Component mounted/updated', {
      hasContent: !!content,
      contentByteLength: content?.byteLength,
      fileName,
      canvasRendererEnable,
      isLoading,
      error
    });
  }, [content, fileName, canvasRendererEnable, isLoading, error]);

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
    const loadContent = async () => {
      console.log('[CanvasRenderer] loadContent called', { hasContent: !!content });

      if (!content) {
        setError('No content available');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const textDecoder = new TextDecoder();
        const svgText = textDecoder.decode(content);

        console.log('[CanvasRenderer] Decoded SVG', {
          svgTextLength: svgText.length,
          svgTextPreview: svgText.substring(0, 100)
        });

        setSvgContent(svgText);

        const pageCount = pageManager.parseSvgDocument(svgText);
        console.log('[CanvasRenderer] Parsed document', { pageCount });

        setNumPages(pageCount);
        setCurrentPage(1);
        setPageInput('1');

        setIsLoading(false);
      } catch (err) {
        console.error('[CanvasRenderer] Error loading content:', err);
        setError(`Failed to load content: ${err}`);
        setIsLoading(false);
      }
    };

    loadContent();
  }, [content, pageManager]);

  const renderPageToCanvas = useCallback(async (pageNumber: number) => {
    if (renderQueue.current.has(pageNumber)) return;
    renderQueue.current.add(pageNumber);

    try {
      const svgString = await pageManager.getPage(pageNumber);
      console.log('[CanvasRenderer] renderPageToCanvas', {
        pageNumber,
        hasSvgString: !!svgString,
        svgLength: svgString?.length
      });

      if (!svgString) return;

      const canvas = canvasRefs.current.get(pageNumber);
      if (!canvas) {
        console.error('[CanvasRenderer] No canvas element for page', pageNumber);
        return;
      }

      const metadata = pageManager.getPageMetadata(pageNumber);
      if (!metadata) {
        console.error('[CanvasRenderer] No metadata for page', pageNumber);
        return;
      }

      const dpr = Math.max(1, Math.min(scale, 3));
      const canvasWidth = Math.floor(metadata.width * dpr);
      const canvasHeight = Math.floor(metadata.height * dpr);

      console.log('[CanvasRenderer] Canvas dimensions', {
        canvasWidth,
        canvasHeight,
        dpr,
        metadataWidth: metadata.width,
        metadataHeight: metadata.height
      });

      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) {
        console.error('[CanvasRenderer] Failed to get 2d context');
        return;
      }

      ctx.scale(dpr, dpr);

      const img = new Image();
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      console.log('[CanvasRenderer] Created blob URL:', url);

      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          console.log('[CanvasRenderer] Image loaded successfully', {
            pageNumber,
            imgWidth: img.width,
            imgHeight: img.height
          });

          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, metadata.width, metadata.height);

          ctx.drawImage(img, 0, 0, metadata.width, metadata.height);

          const imageData = ctx.getImageData(0, 0, 10, 10);
          const hasNonBlackPixels = Array.from(imageData.data).some((v) => v > 0);
          console.log('[CanvasRenderer] Canvas pixel check', {
            pageNumber,
            hasNonBlackPixels,
            firstPixels: Array.from(imageData.data.slice(0, 12))
          });

          URL.revokeObjectURL(url);
          resolve();
        };
        img.onerror = (e) => {
          console.error('[CanvasRenderer] Image failed to load', { pageNumber, error: e });
          URL.revokeObjectURL(url);
          reject(new Error('Failed to load SVG'));
        };
        img.src = url;
      });

      console.log('[CanvasRenderer] Successfully rendered page', pageNumber);
    } catch (err) {
      console.error(`[CanvasRenderer] Failed to render page ${pageNumber}:`, err);
    } finally {
      renderQueue.current.delete(pageNumber);
    }
  }, [pageManager, scale]);

  const processRenderQueue = useCallback(async () => {
    if (isRendering.current) return;
    isRendering.current = true;

    const pagesToRender = scrollView ?
    Array.from(visiblePages) :
    [currentPage];

    for (const pageNum of pagesToRender) {
      await renderPageToCanvas(pageNum);
    }

    isRendering.current = false;
  }, [scrollView, visiblePages, currentPage, renderPageToCanvas]);

  useEffect(() => {
    if (isLoading || numPages === 0) return;
    processRenderQueue();
  }, [isLoading, numPages, processRenderQueue]);

  useEffect(() => {
    if (isLoading || numPages === 0) return;

    if (scrollView) {
      visiblePages.forEach((pageNum) => renderPageToCanvas(pageNum));
    } else {
      renderPageToCanvas(currentPage);
    }

    pageManager.preloadPages(currentPage, scrollView);
  }, [currentPage, scale, scrollView, visiblePages, isLoading, numPages, pageManager, renderPageToCanvas]);

  useEffect(() => {
    if (!scrollView || isLoading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const newVisiblePages = new Set(visiblePages);

        entries.forEach((entry) => {
          const pageNum = Number.parseInt(
            entry.target.getAttribute('data-page-number') || '0',
            10
          );

          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            newVisiblePages.add(pageNum);
          } else {
            newVisiblePages.delete(pageNum);
          }
        });

        setVisiblePages(newVisiblePages);

        if (newVisiblePages.size > 0) {
          const lowestVisiblePage = Math.min(...Array.from(newVisiblePages));
          setCurrentPage(lowestVisiblePage);
          if (!isEditingPageInput) {
            setPageInput(String(lowestVisiblePage));
          }
        }
      },
      {
        threshold: [0.5],
        rootMargin: '-20% 0px -20% 0px',
        root: contentElRef.current
      }
    );

    pageRefs.current.forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, [scrollView, isLoading, visiblePages, isEditingPageInput]);

  const handlePreviousPage = useCallback(() => {
    if (scrollView) {
      const targetPage = Math.max(currentPage - 1, 1);
      const pageElement = pageRefs.current.get(targetPage);
      if (pageElement) {
        pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      setCurrentPage((prev) => {
        const p = Math.max(prev - 1, 1);
        if (!isEditingPageInput) setPageInput(String(p));
        return p;
      });
    }
  }, [scrollView, currentPage, isEditingPageInput]);

  const handleNextPage = useCallback(() => {
    if (scrollView) {
      const targetPage = Math.min(currentPage + 1, numPages);
      const pageElement = pageRefs.current.get(targetPage);
      if (pageElement) {
        pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } else {
      setCurrentPage((prev) => {
        const p = Math.min(prev + 1, numPages);
        if (!isEditingPageInput) setPageInput(String(p));
        return p;
      });
    }
  }, [scrollView, currentPage, numPages, isEditingPageInput]);

  const handlePageInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setPageInput(event.target.value);
  }, []);

  const handlePageInputKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      const pageNum = Number.parseInt(pageInput, 10);
      if (!Number.isNaN(pageNum) && pageNum >= 1 && pageNum <= numPages) {
        if (scrollView) {
          const pageElement = pageRefs.current.get(pageNum);
          if (pageElement) {
            pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  }, [numPages, currentPage, scrollView, pageInput]);

  const computeFitScale = useCallback((mode: 'fit-width' | 'fit-height') => {
    const containerWidth = contentElRef.current?.clientWidth || 3840;
    const containerHeight = contentElRef.current?.clientHeight || 2160;
    const pageWidth = 595;
    const pageHeight = 842;

    if (mode === 'fit-width') {
      return Math.max(0.5, Math.min(10, (containerWidth - 40) / pageWidth));
    }
    return Math.max(0.5, Math.min(10, (containerHeight - 40) / pageHeight));
  }, []);

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
      pageRefs.current.clear();
      canvasRefs.current.clear();
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
    } else if (svgContent) {
      try {
        const blob = new Blob([svgContent], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName?.replace(/\.typ$/, '.svg') || 'output.svg';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Export error:', err);
        setError('Failed to export SVG');
      }
    }
  }, [svgContent, fileName, onDownload]);

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

  useEffect(() => {
    return () => pageManager.clear();
  }, [pageManager]);

  const renderCanvasPage = useCallback((pageNumber: number) => {
    const metadata = pageManager.getPageMetadata(pageNumber);
    const width = metadata?.width || 595;
    const height = metadata?.height || 842;

    return (
      <canvas
        ref={(el) => {
          if (el) {
            canvasRefs.current.set(pageNumber, el);
          } else {
            canvasRefs.current.delete(pageNumber);
          }
        }}
        className="canvas-page-canvas"
        style={{
          width: `${width}px`,
          height: `${height}px`,
          imageRendering: scale > 1.5 ? 'crisp-edges' : 'auto'
        }} />);


  }, [pageManager, scale]);

  if (!canvasRendererEnable) {
    return (
      <div className="canvas-renderer-container">
                <div className="canvas-renderer-error">{t('Canvas renderer is disabled. Please enable it in settings.')}

        </div>
            </div>);

  }

  const zoomOptions = canvasRendererSettings.find((s) => s.id === 'canvas-renderer-initial-zoom')?.options || [];
  const currentZoom = Math.round(scale * 100).toString();
  const hasCustomZoom = !zoomOptions.some((opt) => String(opt.value) === currentZoom);

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
                title={fitMode === 'fit-width' ? 'Fit to Width' : 'Fit to Height'}
                disabled={isLoading}>

                                <FitToWidthIcon />
                            </button>
                            <button
                onClick={handleToggleView}
                className="toolbarButton"
                title={scrollView ? 'Single Page View' : 'Scroll View'}
                disabled={isLoading}>

                                {scrollView ? <PageIcon /> : <ScrollIcon />}
                            </button>
                            <button
                onClick={handleToggleFullscreen}
                className="toolbarButton"
                title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
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

            <div className={`canvas-renderer-content ${isFullscreen ? 'fullscreen' : ''}`} ref={contentElRef}>
                <div className="canvas-renderer-viewer" style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                    {!isLoading && !error && numPages > 0 && (
          scrollView ?
          Array.from({ length: numPages }, (_, i) => {
            const pageNumber = i + 1;
            return (
              <div
                key={`page_${pageNumber}`}
                data-page-number={pageNumber}
                ref={(el) => {
                  if (el) {
                    pageRefs.current.set(pageNumber, el);
                  } else {
                    pageRefs.current.delete(pageNumber);
                  }
                }}
                className="canvas-page-scroll">

                                        <div className="canvas-page">
                                            {renderCanvasPage(pageNumber)}
                                        </div>
                                    </div>);

          }) :

          <div className="canvas-page">
                                {renderCanvasPage(currentPage)}
                            </div>)

          }
                </div>

                {isLoading &&
        <div className="canvas-renderer-loading">{t('Loading document...')}

        </div>
        }
            </div>

            {error && <div className="canvas-renderer-error">{error}</div>}
        </div>);

};

export default CanvasRenderer;