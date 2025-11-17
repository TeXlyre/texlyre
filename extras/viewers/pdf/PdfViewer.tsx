// extras/viewers/pdf/PdfViewer.tsx
import { t } from '@/i18n';
import * as pdfjs from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  ZoomInIcon,
  ZoomOutIcon
} from
  '@/components/common/Icons';
import {
  PluginControlGroup,
  PluginHeader
} from
  '@/components/common/PluginHeader';
import { usePluginFileInfo } from '@/hooks/usePluginFileInfo';
import { useSettings } from '@/hooks/useSettings';
import type { ViewerProps } from '@/plugins/PluginInterface';
import './styles.css';
import { getPdfViewerSettings } from './settings';
import { PLUGIN_NAME, PLUGIN_VERSION } from './PdfViewerPlugin';

const BASE_PATH = __BASE_PATH__;

if (!pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
}

const PdfViewer: React.FC<ViewerProps> = ({
  content,
  mimeType,
  fileName,
  fileId
}) => {
  const { getSetting } = useSettings();
  const fileInfo = usePluginFileInfo(fileId, fileName);

  const autoScale =
    getSetting('pdf-viewer-auto-scale')?.value as boolean ?? true;
  const renderingQuality =
    getSetting('pdf-viewer-rendering-quality')?.value as
    'low' |
    'medium' |
    'high' ?? 'high';

  const _qualityScaleMap = {
    low: 0.75,
    medium: 1.0,
    high: 1.5
  };

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pdfDocument, setPdfDocument] = useState<pdfjs.PDFDocumentProxy | null>(
    null
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  const originalContentRef = useRef<ArrayBuffer | null>(null);
  const contentRef = useRef<ArrayBuffer | null>(null);

  useEffect(() => {
    if (content instanceof ArrayBuffer && content.byteLength > 0) {
      originalContentRef.current = content.slice(0);
      console.log('PdfViewer: Original content stored', {
        size: content.byteLength,
        type: content.constructor.name
      });
    }
  }, [content]);

  useEffect(() => {
    const isMounted = { current: true };
    const loadingTaskRef = { current: null };

    const initializePdf = async () => {
      if (loadingTaskRef.current) {
        try {
          loadingTaskRef.current.destroy();
        } catch (_e) {

          // Ignore errors during cancellation
        } loadingTaskRef.current = null;
      }

      setPdfDocument((prevDoc) => {
        if (prevDoc) {
          try {
            prevDoc.destroy();
          } catch (e) {
            console.error('Error destroying previous PDF document:', e);
          }
        }
        return null;
      });

      setCurrentPage(1);
      setTotalPages(0);
      setError(null);

      if (content instanceof ArrayBuffer) {
        try {
          setIsLoading(true);

          const contentCopy = content.slice(0);
          contentRef.current = contentCopy;

          await loadPdf(loadingTaskRef, isMounted);
        } catch (err) {
          if (isMounted.current) {
            console.error('Error initializing PDF:', err);
            setError(t('Failed to initialize PDF document'));
            setIsLoading(false);
          }
        }
      } else {
        if (isMounted.current) {
          setError(t('Invalid PDF content'));
          setIsLoading(false);
        }
      }
    };

    initializePdf();

    return () => {
      isMounted.current = false;

      if (loadingTaskRef.current) {
        try {
          loadingTaskRef.current.destroy();
        } catch (_e) {

          // Ignore errors during cancellation
        } loadingTaskRef.current = null;
      }

      setPdfDocument((prevDoc) => {
        if (prevDoc) {
          try {
            prevDoc.destroy();
          } catch (e) {
            console.error('Error destroying PDF document:', e);
          }
        }
        return null;
      });

      contentRef.current = null;
    };
  }, [content]);

  const loadPdf = async (
    loadingTaskRef: { current: unknown; },
    isMounted: { current: boolean; }) => {
    if (!contentRef.current || !isMounted.current) {
      return;
    }

    try {
      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(contentRef.current),
        cMapUrl: `${BASE_PATH}/assets/cmaps/`, //  import.meta.env.PROD ? "/texlyre/assets/cmaps/" : "/texlyre/assets/cmaps/", for now, use the same path in dev and prod
        cMapPacked: true
      });

      loadingTaskRef.current = loadingTask;

      const pdf = await loadingTask.promise;

      if (!isMounted.current) {
        if (pdf) {
          try {
            pdf.destroy();
          } catch (_e) {

            // Ignore cleanup errors
          }
        }
        return;
      }

      loadingTaskRef.current = null;

      setPdfDocument(pdf);
      setTotalPages(pdf.numPages);
      setCurrentPage(1);
      setError(null);
    } catch (err) {
      if (isMounted.current) {
        if (
          err instanceof Error &&
          !err.message.includes('Loading task cancelled') &&
          !err.message.includes('Worker was destroyed')) {
          console.error('Error loading PDF:', err);
          setError(t('Failed to load PDF document'));
        }
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    const isMounted = { current: true };
    const renderTaskRef = { current: null };

    const renderPage = async () => {
      if (!pdfDocument || !canvasRef.current || !isMounted.current) return;

      if (renderTaskRef.current) {
        try {
          await renderTaskRef.current.cancel();
        } catch (_e) {

          // Ignore cancellation errors
        } renderTaskRef.current = null;
      }

      try {
        const page = await pdfDocument.getPage(currentPage);

        if (!isMounted.current) {
          try {
            page.cleanup();
          } catch (_e) {

            // Ignore cleanup errors
          } return;
        }

        let renderScale = scale;

        if (autoScale && pdfContainerRef.current) {
          const container = pdfContainerRef.current;
          const containerRect = container.getBoundingClientRect();

          if (containerRect.width > 100 && containerRect.height > 100) {
            const baseViewport = page.getViewport({ scale: 1.0 });
            const availableWidth = containerRect.width * 0.9;
            const availableHeight = containerRect.height * 0.9;

            const scaleX = availableWidth / baseViewport.width;
            const scaleY = availableHeight / baseViewport.height;
            const fitScale = Math.min(scaleX, scaleY);

            renderScale = Math.max(fitScale, 0.5) * scale;
          }
        }

        const viewport = page.getViewport({ scale: renderScale });

        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');

        if (!context) {
          throw new Error('Could not get canvas context');
        }

        context.clearRect(0, 0, canvas.width, canvas.height);

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport
        };

        renderTaskRef.current = page.render(renderContext);
        await renderTaskRef.current.promise;

        renderTaskRef.current = null;
      } catch (err) {
        if (
          isMounted.current &&
          err instanceof Error &&
          !err.message.includes('Rendering cancelled') &&
          !err.message.includes('Worker was destroyed')) {
          console.error('Error rendering PDF page:', err);
          setError(`Failed to render page ${currentPage}.`);
        }
      }
    };

    const timerId = setTimeout(() => {
      renderPage();
    }, 200);

    return () => {
      clearTimeout(timerId);
      isMounted.current = false;

      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (_e) {

          // Ignore cancellation errors
        } renderTaskRef.current = null;
      }
    };
  }, [pdfDocument, currentPage, scale, autoScale, renderingQuality]);

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handleZoomIn = () => {
    setScale((prevScale) => Math.min(prevScale + 0.25, 3));
  };

  const handleZoomOut = () => {
    setScale((prevScale) => Math.max(prevScale - 0.25, 0.25));
  };

  const handleZoomChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (value === 'custom') return;
    setScale(parseFloat(value) / 100);
  };

  const handlePageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const pageNumber = Number.parseInt(event.target.value);
    if (
      !Number.isNaN(pageNumber) &&
      pageNumber >= 1 &&
      pageNumber <= totalPages) {
      setCurrentPage(pageNumber);
    }
  };

  const handleExport = () => {
    const contentToExport = originalContentRef.current || contentRef.current;

    if (contentToExport) {
      console.log('PdfViewer: Exporting PDF', {
        size: contentToExport.byteLength,
        fileName: fileName,
        source: originalContentRef.current ? 'original' : 'processed'
      });

      const blob = new Blob([contentToExport], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      console.error('PdfViewer: No valid PDF content available for export');
      setError(t('Cannot export: PDF content is not available'));
    }
  };

  const tooltipInfo = [
    t('Rendering quality: {quality}', { quality: t(renderingQuality) }),
    t('Auto-scale: {status}', { status: autoScale ? t('enabled') : t('disabled') }),
    t('Pages: {count}', { count: totalPages }),
    t('Current page: {page}', { page: currentPage }),
    t('MIME Type: {mimeType}', { mimeType: mimeType || 'application/pdf' }),
    t('Size: {size}', { size: fileInfo.fileSize ? `${Math.round(fileInfo.fileSize / 1024)} KB` : t('Unknown') })
  ];

  const headerControls =
    <>
      <PluginControlGroup>
        <button
          onClick={handlePreviousPage}
          disabled={currentPage <= 1 || isLoading}
          title={t('Previous Page')}>

          <ChevronLeftIcon />
        </button>
        <button
          onClick={handleNextPage}
          disabled={currentPage >= totalPages || isLoading}
          title={t('Next Page')}>

          <ChevronRightIcon />
        </button>
      </PluginControlGroup>

      <PluginControlGroup className="page-input-group">
        <input
          type="text"
          value={currentPage}
          onChange={handlePageChange}
          disabled={isLoading} />

        <span>/ {totalPages}</span>
      </PluginControlGroup>

      <PluginControlGroup>
        {(() => {
          const zoomOptions = getPdfViewerSettings().find((s) => s.id === 'pdf-renderer-initial-zoom')?.options || [
            { label: '25%', value: '25' },
            { label: '50%', value: '50' },
            { label: '75%', value: '75' },
            { label: '100%', value: '100' },
            { label: '125%', value: '125' },
            { label: '150%', value: '150' },
            { label: '200%', value: '200' },
            { label: '300%', value: '300' },
            { label: '400%', value: '400' },
            { label: '500%', value: '500' }];

          const currentZoom = Math.round(scale * 100).toString();
          const hasCustomZoom = !zoomOptions.some((opt) => String(opt.value) === currentZoom);

          return (
            <>
              <button onClick={handleZoomOut} title={t('Zoom Out')} disabled={isLoading}>
                <ZoomOutIcon />
              </button>
              <select
                value={hasCustomZoom ? 'custom' : currentZoom}
                onChange={handleZoomChange}
                disabled={isLoading}
                className="zoom-dropdown"
                title={t('Zoom Level')}>

                {zoomOptions.map((option) =>
                  <option key={String(option.value)} value={String(option.value)}>
                    {option.label}
                  </option>
                )}
                {hasCustomZoom &&
                  <option value="custom" className="custom-zoom-option">
                    {Math.round(scale * 100)}%
                  </option>
                }
              </select>
              <button onClick={handleZoomIn} title={t('Zoom In')} disabled={isLoading}>
                <ZoomInIcon />
              </button>
            </>);

        })()}
      </PluginControlGroup>

      <PluginControlGroup>
        <button
          onClick={handleExport}
          title={t('Download PDF')}
          disabled={isLoading}>

          <DownloadIcon />
        </button>
      </PluginControlGroup>
    </>;


  return (
    <div className="pdf-viewer-container">
      <PluginHeader
        fileName={fileInfo.fileName}
        filePath={fileInfo.filePath}
        pluginName={PLUGIN_NAME}
        pluginVersion={PLUGIN_VERSION}
        tooltipInfo={tooltipInfo}
        controls={headerControls} />


      <div className="pdf-viewer-content">
        {isLoading &&
          <div className="loading-indicator">{t('Loading PDF document...')}</div>
        }

        {error && <div className="pdf-error-message">{error}</div>}

        {!isLoading && !error && pdfDocument &&
          <div className="pdf-container" ref={pdfContainerRef}>
            <div className="pdf-page-container">
              <canvas
                ref={canvasRef}
                className="pdf-page-canvas" />

            </div>
          </div>
        }
      </div>
    </div>);

};

export default PdfViewer;