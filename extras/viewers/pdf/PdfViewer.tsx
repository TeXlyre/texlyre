// extras/viewers/pdf/PdfViewer.tsx
import { t } from '@/i18n';
import * as pdfjs from 'pdfjs-dist';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '@/components/common/Icons';
import {
  PluginControlGroup,
  PluginHeader,
} from '@/components/common/PluginHeader';
import { usePluginFileInfo } from '@/hooks/usePluginFileInfo';
import { useSettings } from '@/hooks/useSettings';
import type { ViewerProps } from '@/plugins/PluginInterface';
import { formatFileSize } from '@/utils/fileUtils';
import './styles.css';
import { getPdfViewerSettings } from './settings';
import { PLUGIN_NAME, PLUGIN_VERSION } from './PdfViewerPlugin';

const BASE_PATH = __BASE_PATH__;

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const PdfViewer: React.FC<ViewerProps> = ({
  content,
  mimeType,
  fileName,
  fileId,
}) => {
  const { getSetting } = useSettings();
  const fileInfo = usePluginFileInfo(fileId, fileName);

  const autoScale =
    (getSetting('pdf-viewer-auto-scale')?.value as boolean) ?? true;
  const renderingQuality =
    (getSetting('pdf-viewer-rendering-quality')?.value as
      | 'low'
      | 'medium'
      | 'high') ?? 'high';

  const qualityScaleMap = { low: 0.75, medium: 1.0, high: 1.5 };

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pdfContainerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<pdfjs.PDFDocumentProxy | null>(null);
  const originalContentRef = useRef<ArrayBuffer | null>(null);
  const renderTaskRef = useRef<pdfjs.RenderTask | null>(null);

  useEffect(() => {
    if (!(content instanceof ArrayBuffer) || content.byteLength === 0) return;
    originalContentRef.current = content.slice(0);
  }, [content]);

  useEffect(() => {
    if (!(content instanceof ArrayBuffer) || content.byteLength === 0) {
      setError(t('Invalid PDF content'));
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      if (pdfDocRef.current) {
        try { pdfDocRef.current.destroy(); } catch (_e) { }
        pdfDocRef.current = null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const task = pdfjs.getDocument({
          data: new Uint8Array(content),
          cMapUrl: `${BASE_PATH}/assets/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `${BASE_PATH}/assets/standard_fonts/`,
        });

        const doc = await task.promise;
        if (cancelled) { doc.destroy(); return; }

        pdfDocRef.current = doc;
        setNumPages(doc.numPages);
        setCurrentPage(1);
        setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          console.error('Error loading PDF:', err);
          setError(t('Failed to load PDF document'));
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch (_e) { }
        renderTaskRef.current = null;
      }
    };
  }, [content]);

  const renderPage = useCallback(async () => {
    if (!pdfDocRef.current || !canvasRef.current) return;

    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel(); } catch (_e) { }
      renderTaskRef.current = null;
    }

    try {
      const page = await pdfDocRef.current.getPage(currentPage);
      if (!canvasRef.current) { page.cleanup(); return; }

      let renderScale = scale;

      if (autoScale && pdfContainerRef.current) {
        const rect = pdfContainerRef.current.getBoundingClientRect();
        if (rect.width > 100 && rect.height > 100) {
          const base = page.getViewport({ scale: 1.0 });
          const fitScale = Math.min(
            (rect.width * 0.9) / base.width,
            (rect.height * 0.9) / base.height,
          );
          renderScale = Math.max(fitScale, 0.5) * scale;
        }
      }

      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const outputScale = qualityScaleMap[renderingQuality] * pixelRatio;
      const displayViewport = page.getViewport({ scale: renderScale });
      const scaledViewport = page.getViewport({ scale: renderScale * outputScale });

      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not get canvas context');

      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      canvas.style.width = `${displayViewport.width}px`;
      canvas.style.height = `${displayViewport.height}px`;

      renderTaskRef.current = page.render({
        canvasContext: context,
        viewport: scaledViewport,
        canvas,
      });
      await renderTaskRef.current.promise;
      renderTaskRef.current = null;
    } catch (err) {
      if (
        err instanceof Error &&
        !err.message.includes('Rendering cancelled') &&
        !err.message.includes('Worker was destroyed')
      ) {
        console.error('Error rendering PDF page:', err);
        setError(`Failed to render page ${currentPage}.`);
      }
    }
  }, [pdfDocRef, currentPage, scale, autoScale, renderingQuality]);

  useEffect(() => {
    if (isLoading) return;
    const id = setTimeout(renderPage, 200);
    return () => clearTimeout(id);
  }, [isLoading, renderPage]);

  const handlePreviousPage = useCallback(() => {
    setCurrentPage((p) => Math.max(p - 1, 1));
  }, []);

  const handleNextPage = useCallback(() => {
    setCurrentPage((p) => Math.min(p + 1, numPages));
  }, [numPages]);

  const handlePageChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const pageNumber = Number.parseInt(event.target.value, 10);
      if (!Number.isNaN(pageNumber) && pageNumber >= 1 && pageNumber <= numPages) {
        setCurrentPage(pageNumber);
      }
    },
    [numPages],
  );

  const handleZoomIn = useCallback(() => {
    setScale((prev) => Math.min(prev + 0.25, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((prev) => Math.max(prev - 0.25, 0.25));
  }, []);

  const handleZoomChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value;
      if (value === 'custom') return;
      setScale(parseFloat(value) / 100);
    },
    [],
  );

  const handleExport = useCallback(() => {
    const data = originalContentRef.current;
    if (!data) {
      setError(t('Cannot export: PDF content is not available'));
      return;
    }
    const blob = new Blob([data], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [fileName]);

  const zoomOptions =
    getPdfViewerSettings().find((s) => s.id === 'pdf-renderer-initial-zoom')
      ?.options || [];
  const currentZoom = Math.round(scale * 100).toString();
  const hasCustomZoom = !zoomOptions.some(
    (opt) => String(opt.value) === currentZoom,
  );

  const tooltipInfo = [
    t('Rendering quality: {quality}', { quality: t(renderingQuality) }),
    t('Auto-scale: {status}', { status: autoScale ? t('enabled') : t('disabled') }),
    t('Pages: {count}', { count: numPages }),
    t('Current page: {page}', { page: currentPage }),
    t('MIME Type: {mimeType}', { mimeType: mimeType || 'application/pdf' }),
    t('Size: {size}', { size: formatFileSize(fileInfo.fileSize) }),
  ];

  const headerControls = (
    <>
      <PluginControlGroup>
        <button
          onClick={handlePreviousPage}
          disabled={currentPage <= 1 || isLoading}
          title={t('Previous Page')}
        >
          <ChevronLeftIcon />
        </button>
        <button
          onClick={handleNextPage}
          disabled={currentPage >= numPages || isLoading}
          title={t('Next Page')}
        >
          <ChevronRightIcon />
        </button>
      </PluginControlGroup>

      <PluginControlGroup className="page-input-group">
        <input
          type="text"
          value={currentPage}
          onChange={handlePageChange}
          disabled={isLoading}
        />
        <span>/ {numPages}</span>
      </PluginControlGroup>

      <PluginControlGroup>
        <button onClick={handleZoomOut} title={t('Zoom Out')} disabled={isLoading}>
          <ZoomOutIcon />
        </button>
        <select
          value={hasCustomZoom ? 'custom' : currentZoom}
          onChange={handleZoomChange}
          disabled={isLoading}
          className="zoom-dropdown"
          title={t('Zoom Level')}
        >
          {zoomOptions.map((option) => (
            <option key={String(option.value)} value={String(option.value)}>
              {option.label}
            </option>
          ))}
          {hasCustomZoom && (
            <option value="custom" className="custom-zoom-option">
              {Math.round(scale * 100)}%
            </option>
          )}
        </select>
        <button onClick={handleZoomIn} title={t('Zoom In')} disabled={isLoading}>
          <ZoomInIcon />
        </button>
      </PluginControlGroup>

      <PluginControlGroup>
        <button
          onClick={handleExport}
          title={t('Download PDF')}
          disabled={isLoading}
        >
          <DownloadIcon />
        </button>
      </PluginControlGroup>
    </>
  );

  return (
    <div className="pdf-viewer-container">
      <PluginHeader
        fileName={fileInfo.fileName}
        filePath={fileInfo.filePath}
        pluginName={PLUGIN_NAME}
        pluginVersion={PLUGIN_VERSION}
        tooltipInfo={tooltipInfo}
        controls={headerControls}
      />

      <div className="pdf-viewer-content">
        {isLoading && (
          <div className="loading-indicator">{t('Loading PDF document...')}</div>
        )}
        {error && <div className="pdf-error-message">{error}</div>}
        {!isLoading && !error && (
          <div className="pdf-container" ref={pdfContainerRef}>
            <div className="pdf-page-container">
              <canvas ref={canvasRef} className="pdf-page-canvas" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PdfViewer;