import { t } from '@/i18n';
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
  MinimizeIcon
} from
  '@/components/common/Icons';
import { svgRendererSettings } from './settings';
import { useSettings } from '@/hooks/useSettings';
import { useProperties } from '@/hooks/useProperties';
import type { RendererProps } from '@/plugins/PluginInterface';
import { SvgPageManager } from './SvgPageManager';
import './styles.css';

const SvgRenderer: React.FC<RendererProps> = ({
  content,
  fileName,
  onDownload
}) => {
  const { getSetting } = useSettings();
  const { getProperty, setProperty, registerProperty } = useProperties();
  const propertiesRegistered = useRef(false);

  const svgRendererEnable =
    getSetting('svg-renderer-enable')?.value as boolean ?? true;

  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageInput, setPageInput] = useState<string>('1');
  const [isEditingPageInput, setIsEditingPageInput] = useState<boolean>(false);
  const [scale, setScale] = useState<number>(1.0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [scrollView, setScrollView] = useState<boolean>(false);
  const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set());
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [pageManager] = useState(() => new SvgPageManager(10, 2));
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const contentElRef = useRef<HTMLDivElement>(null);
  const [fitMode, setFitMode] = useState<'fit-width' | 'fit-height'>('fit-width');

  useEffect(() => {
    if (propertiesRegistered.current) return;
    propertiesRegistered.current = true;

    registerProperty({
      id: 'svg-renderer-zoom',
      category: 'UI',
      subcategory: 'SVG Viewer',
      defaultValue: 1.0
    });

    registerProperty({
      id: 'svg-renderer-scroll-view',
      category: 'UI',
      subcategory: 'SVG Viewer',
      defaultValue: false
    });
  }, [registerProperty]);

  useEffect(() => {
    const storedZoom = getProperty('svg-renderer-zoom');
    const storedScrollView = getProperty('svg-renderer-scroll-view');

    if (storedZoom !== undefined) {
      setScale(Number(storedZoom));
    }

    if (storedScrollView !== undefined) {
      setScrollView(Boolean(storedScrollView));
    }
  }, [getProperty]);

  useEffect(() => {
    const loadSvgContent = async () => {
      if (!content) {
        setError('No SVG content available');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const textDecoder = new TextDecoder();
        const svgText = textDecoder.decode(content);
        setSvgContent(svgText);

        const pageCount = pageManager.parseSvgDocument(svgText);
        setNumPages(pageCount);

        pageManager.getPage(1);
        pageManager.preloadPages(1, scrollView);

        setCurrentPage(1);
        if (!isEditingPageInput) setPageInput('1');
        setIsLoading(false);
      } catch (error) {
        console.error('Error loading SVG content:', error);
        setError(`Failed to load SVG: ${error}`);
        setIsLoading(false);
      }
    };

    loadSvgContent();
  }, [content, isEditingPageInput, pageManager, scrollView]);

  useEffect(() => {
    if (!isLoading && numPages > 0) {
      pageManager.preloadPages(currentPage, scrollView);
    }
  }, [currentPage, scrollView, pageManager, numPages, isLoading]);

  const handlePreviousPage = useCallback(() => {
    if (scrollView) {
      const targetPage = Math.max(currentPage - 1, 1);
      const pageElement = pageRefs.current.get(targetPage);
      if (pageElement) {
        pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setCurrentPage(targetPage);
        if (!isEditingPageInput) setPageInput(String(targetPage));
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
        setCurrentPage(targetPage);
        if (!isEditingPageInput) setPageInput(String(targetPage));
      }
    } else {
      setCurrentPage((prev) => {
        const p = Math.min(prev + 1, numPages);
        if (!isEditingPageInput) setPageInput(String(p));
        return p;
      });
    }
  }, [scrollView, currentPage, numPages, isEditingPageInput]);

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
            const pageElement = pageRefs.current.get(pageNum);
            if (pageElement) {
              pageElement.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
              });
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
    [numPages, currentPage, scrollView, pageInput]
  );

  const computeFitScale = useCallback((mode: 'fit-width' | 'fit-height') => {
    const containerWidth =
      contentElRef.current?.clientWidth ||
      document.querySelector('.svg-renderer-content')?.clientWidth ||
      3840;
    const containerHeight =
      contentElRef.current?.clientHeight ||
      (document.querySelector('.svg-renderer-content') as HTMLElement | null)?.clientHeight ||
      2160;

    const pageWidth = 595;
    const pageHeight = 842;

    if (mode === 'fit-width') {
      return Math.max(0.5, Math.min(10, (containerWidth - 40) / pageWidth));
    } else {
      return Math.max(0.5, Math.min(10, (containerHeight - 40) / pageHeight));
    }
  }, []);

  const handleFitToggle = useCallback(() => {
    const nextMode = fitMode === 'fit-width' ? 'fit-height' : 'fit-width';
    setFitMode(nextMode);
    const s = computeFitScale(nextMode);
    setScale(s);
    setProperty('svg-renderer-zoom', s);
  }, [fitMode, computeFitScale, setProperty]);

  const handleZoomIn = useCallback(() => {
    setScale((prev) => {
      const newScale = Math.min(prev + 0.25, 5);
      setProperty('svg-renderer-zoom', newScale);
      return newScale;
    });
  }, [setProperty]);

  const handleZoomOut = useCallback(() => {
    setScale((prev) => {
      const newScale = Math.max(prev - 0.25, 0.25);
      setProperty('svg-renderer-zoom', newScale);
      return newScale;
    });
  }, [setProperty]);

  const handleZoomChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (value === 'custom') return;
    const newScale = parseFloat(value) / 100;
    setScale(newScale);
    setProperty('svg-renderer-zoom', newScale);
  }, [setProperty]);

  const handleToggleView = useCallback(() => {
    setScrollView((prev) => {
      const newScrollView = !prev;
      setProperty('svg-renderer-scroll-view', newScrollView);
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

  const renderSvgPage = useCallback((pageNumber: number) => {
    const pageContent = pageManager.getPage(pageNumber);
    const metadata = pageManager.getPageMetadata(pageNumber);
    const width = metadata?.width || 595;
    const height = metadata?.height || 842;

    if (!pageContent) {
      return (
        <div className="svg-page-loading">{t('Loading page')}
          {pageNumber}{t('...')}
        </div>);

    }

    return (
      <div
        className="svg-page"
        style={{
          width: `${width}px`,
          height: `${height}px`
        }}
        dangerouslySetInnerHTML={{ __html: pageContent }} />);


  }, [pageManager]);

  useEffect(() => {
    if (!scrollView) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const newVisiblePages = new Set(visiblePages);

        entries.forEach((entry) => {
          const pageNum = Number.parseInt(
            entry.target.getAttribute('data-page-number') || '0'
          );
          if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
            newVisiblePages.add(pageNum);
            pageManager.getPage(pageNum);
            pageManager.preloadPages(pageNum, true);
          } else {
            newVisiblePages.delete(pageNum);
          }
        });

        setVisiblePages(newVisiblePages);

        if (newVisiblePages.size > 0) {
          const lowestVisiblePage = Math.min(...Array.from(newVisiblePages));
          setCurrentPage(lowestVisiblePage);
          if (!isEditingPageInput) setPageInput(String(lowestVisiblePage));
        }
      },
      {
        threshold: [0.5],
        rootMargin: '-20% 0px -20% 0px',
        root: contentElRef.current || undefined
      }
    );

    pageRefs.current.forEach((element) => {
      observer.observe(element);
    });

    return () => observer.disconnect();
  }, [scrollView, visiblePages, isFullscreen, isEditingPageInput, pageManager]);

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
      } catch (error) {
        console.error('Export error:', error);
        setError('Failed to export SVG');
      }
    }
  }, [svgContent, fileName, onDownload]);

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

  useEffect(() => {
    return () => {
      pageManager.clear();
    };
  }, [pageManager]);

  if (!svgRendererEnable) {
    return (
      <div className="svg-renderer-container">
        <div className="svg-renderer-error">{t('SVG renderer is disabled. Please enable it in settings to use this renderer.')}


        </div>
      </div>);

  }

  return (
    <div className="svg-renderer-container" ref={containerRef}>
      <div className={`svg-toolbar ${isFullscreen ? 'fullscreen-toolbar' : ''}`}>
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
                const zoomOptions = svgRendererSettings.find((s) => s.id === 'svg-renderer-initial-zoom')?.options || [];
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

      <div className={`svg-renderer-content ${isFullscreen ? 'fullscreen' : ''}`} ref={contentElRef}>
        <div className="svg-renderer-viewer" style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          {!isLoading && !error && numPages > 0 && (
            scrollView ?
              Array.from(new Array(numPages), (_, index) => {
                const pageNumber = index + 1;
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
                    className="svg-page-scroll">

                    {renderSvgPage(pageNumber)}
                  </div>);

              }) :

              renderSvgPage(currentPage))

          }
        </div>

        {isLoading &&
          <div className="svg-renderer-loading">{t('Loading SVG document...')}

          </div>
        }
      </div>

      {error && <div className="svg-renderer-error">{error}</div>}
    </div>);

};

export default SvgRenderer;