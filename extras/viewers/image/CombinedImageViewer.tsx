import { t } from '@/i18n';
import DOMPurify from 'dompurify';
import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';

import {
  BrightnessDownIcon,
  BrightnessIcon,
  ContrastDownIcon,
  ContrastIcon,
  DownloadIcon,
  FlipHorizontalIcon,
  FlipVerticalIcon,
  MoveIcon,
  ResetIcon,
  RotateIcon,
  SaveIcon,
  ZoomInIcon,
  ZoomOutIcon
} from '@/components/common/Icons';
import {
  PluginControlGroup,
  PluginHeader
} from '@/components/common/PluginHeader';
import { usePluginFileInfo } from '@/hooks/usePluginFileInfo';
import { useSettings } from '@/hooks/useSettings';
import type { ViewerProps } from '@/plugins/PluginInterface';
import { fileStorageService } from '@/services/FileStorageService';
import { formatFileSize } from '@/utils/fileUtils';
import './styles.css';
import { PLUGIN_NAME, PLUGIN_VERSION } from './ImageViewerPlugin';

interface ImageTransform {
  scale: number;
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  translateX: number;
  translateY: number;
  brightness: number;
  contrast: number;
}

const DEFAULT_TRANSFORM: ImageTransform = {
  scale: 1,
  rotation: 0,
  flipH: false,
  flipV: false,
  translateX: 0,
  translateY: 0,
  brightness: 100,
  contrast: 100
};

const RENDERING_BY_QUALITY = {
  low: 'pixelated',
  medium: 'crisp-edges',
  high: 'auto'
} as const;

const CombinedImageViewer: React.FC<ViewerProps> = ({
  content,
  mimeType,
  fileName,
  fileId
}) => {
  const { getSetting } = useSettings();
  const fileInfo = usePluginFileInfo(fileId, fileName);

  const autoCenter = getSetting('image-viewer-auto-center')?.value as boolean ?? true;
  const quality = getSetting('image-viewer-quality')?.value as keyof typeof RENDERING_BY_QUALITY ?? 'high';
  const enablePanning = getSetting('image-viewer-enable-panning')?.value as boolean ?? true;
  const enableFilters = getSetting('image-viewer-enable-filters')?.value as boolean ?? true;
  const imageRenderingStyle = RENDERING_BY_QUALITY[quality];

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [svgContent, setSvgContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [transform, setTransform] = useState<ImageTransform>(DEFAULT_TRANSFORM);
  const [panningActive, setPanningActive] = useState(enablePanning);
  const [isPanning, setIsPanning] = useState(false);

  const isSvg = mimeType === 'image/svg+xml' || fileName.toLowerCase().endsWith('.svg');
  const panStart = useRef({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!(content instanceof ArrayBuffer)) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    if (isSvg) {
      setSvgContent(new TextDecoder('utf-8').decode(content));
      setImageSrc(null);
      setIsLoading(false);
      return;
    }

    const blob = new Blob([content], { type: mimeType || 'image/png' });
    const url = URL.createObjectURL(blob);
    setImageSrc(url);
    setSvgContent(null);
    setIsLoading(false);
    return () => URL.revokeObjectURL(url);
  }, [content, mimeType, isSvg]);

  const sanitizedSvg = useMemo(
    () => svgContent ? DOMPurify.sanitize(svgContent, { USE_PROFILES: { svg: true, svgFilters: true } }) : '',
    [svgContent]
  );

  const innerHtml = isSvg
    ? sanitizedSvg
    : imageSrc ? `<img src="${imageSrc}" alt="${fileName}" draggable="false" />` : '';

  const srcDoc = useMemo(() => {
    if (!innerHtml) return '';
    const align = autoCenter ? 'center' : 'flex-start';
    return `<!DOCTYPE html>
<html><head><style>
  html, body { margin: 0; padding: 0; background: transparent;
    display: flex; justify-content: ${align}; align-items: ${align};
    width: max-content; height: max-content; min-width: 100%; min-height: 100%;
    overflow: visible; }
  .fx-outer { display: inline-block; transform-origin: top left; }
  .fx-inner { display: inline-block; transform-origin: center; }
  .fx-inner img { display: block; image-rendering: ${imageRenderingStyle};
    user-select: none; -webkit-user-drag: none; }
  .fx-inner > svg { display: block; }
  .fx-inner > svg:not([width]):not([height]) { width: 512px; height: 512px; }
</style></head>
<body><div class="fx-outer"><div class="fx-inner">${innerHtml}</div></div></body></html>`;
  }, [innerHtml, autoCenter, imageRenderingStyle]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const sync = () => {
      const doc = iframe.contentDocument;
      if (!doc?.body) return;
      const outer = doc.querySelector('.fx-outer') as HTMLElement | null;
      const inner = doc.querySelector('.fx-inner') as HTMLElement | null;
      if (!outer || !inner) return;

      outer.style.transform = `translate(${transform.translateX}px, ${transform.translateY}px) scale(${transform.scale})`;
      outer.style.filter = enableFilters
        ? `brightness(${transform.brightness}%) contrast(${transform.contrast}%)`
        : 'none';
      inner.style.transform = `rotate(${transform.rotation}deg) scale(${transform.flipH ? -1 : 1}, ${transform.flipV ? -1 : 1})`;

      const w = Math.max(doc.documentElement.scrollWidth, doc.body.scrollWidth);
      const h = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight);
      iframe.style.width = `${w}px`;
      iframe.style.height = `${h}px`;
    };

    const handleLoad = () => {
      sync();
      const doc = iframe.contentDocument;
      if (!doc) return;

      const observer = new ResizeObserver(sync);
      if (doc.body) observer.observe(doc.body);

      const img = doc.querySelector('img');
      if (img && !img.complete) img.addEventListener('load', sync, { once: true });

      (iframe as any)._cleanup = () => observer.disconnect();
    };

    iframe.addEventListener('load', handleLoad);
    if (iframe.contentDocument?.readyState === 'complete') handleLoad();
    sync();

    return () => {
      iframe.removeEventListener('load', handleLoad);
      (iframe as any)._cleanup?.();
    };
  }, [transform, enableFilters, srcDoc]);

  const updateTransform = (changes: Partial<ImageTransform>) => {
    setTransform((prev) => ({ ...prev, ...changes }));
    setHasChanges(true);
  };

  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

  const handleZoomIn = () => updateTransform({ scale: clamp(transform.scale + 0.25, 0.1, 5) });
  const handleZoomOut = () => updateTransform({ scale: clamp(transform.scale - 0.25, 0.1, 5) });
  const handleRotate = () => updateTransform({ rotation: (transform.rotation + 90) % 360 });
  const handleFlipH = () => updateTransform({ flipH: !transform.flipH });
  const handleFlipV = () => updateTransform({ flipV: !transform.flipV });
  const handleBrightness = (delta: number) => updateTransform({ brightness: clamp(transform.brightness + delta, 0, 200) });
  const handleContrast = (delta: number) => updateTransform({ contrast: clamp(transform.contrast + delta, 0, 200) });

  const handleReset = () => {
    setTransform(DEFAULT_TRANSFORM);
    setHasChanges(false);
  };

  const processImageWithTransforms = (): Promise<ArrayBuffer | null> =>
    new Promise((resolve) => {
      if (!imageSrc || !canvasRef.current) return resolve(null);
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d')!;
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(transform.rotation * Math.PI / 180);
        ctx.scale(transform.flipH ? -1 : 1, transform.flipV ? -1 : 1);
        ctx.filter = `brightness(${transform.brightness}%) contrast(${transform.contrast}%)`;
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        canvas.toBlob(
          (blob) => blob ? blob.arrayBuffer().then(resolve) : resolve(null),
          mimeType || 'image/png'
        );
      };
      img.onerror = () => resolve(null);
      img.src = imageSrc;
    });

  const handleSave = async () => {
    if (!hasChanges || !fileId || isSvg) return;
    setIsSaving(true);
    try {
      const data = await processImageWithTransforms();
      if (data) {
        await fileStorageService.updateFileContent(fileId, data);
        setHasChanges(false);
      }
    } catch (error) {
      console.error('Error saving image:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = () => {
    const href = isSvg && svgContent
      ? URL.createObjectURL(new Blob([svgContent], { type: 'image/svg+xml' }))
      : imageSrc;
    if (!href) return;
    const a = document.createElement('a');
    a.href = href;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (isSvg) URL.revokeObjectURL(href);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!panningActive) return;
    setIsPanning(true);
    panStart.current = { x: e.clientX - transform.translateX, y: e.clientY - transform.translateY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning || !panningActive) return;
    updateTransform({
      translateX: e.clientX - panStart.current.x,
      translateY: e.clientY - panStart.current.y
    });
  };

  const handleMouseUp = () => setIsPanning(false);

  const tooltipInfo = [
    t('Quality: {quality}', { quality: t(quality) }),
    t('Auto center: {status}', { status: autoCenter ? t('enabled') : t('disabled') }),
    t('Panning: {status}', { status: enablePanning ? t('enabled') : t('disabled') }),
    t('Filters: {status}', { status: enableFilters ? t('enabled') : t('disabled') }),
    t('MIME Type: {mimeType}', { mimeType: mimeType || t('Unknown') }),
    t('Size: {size}', { size: formatFileSize(fileInfo.fileSize) })
  ];

  const headerControls = (
    <>
      <PluginControlGroup>
        <button onClick={handleZoomOut} title={t('Zoom Out')}><ZoomOutIcon /></button>
        <button onClick={() => updateTransform({ scale: 1 })} title={t('Reset Zoom')}>
          {Math.round(transform.scale * 100)}%
        </button>
        <button onClick={handleZoomIn} title={t('Zoom In')}><ZoomInIcon /></button>
      </PluginControlGroup>

      <PluginControlGroup>
        <button onClick={handleRotate} title={t('Rotate 90° ({degree}°)', { degree: transform.rotation })}>
          <RotateIcon />
        </button>
        <button onClick={handleFlipH} title={t('Flip Horizontal')} className={transform.flipH ? 'active' : ''}>
          <FlipHorizontalIcon />
        </button>
        <button onClick={handleFlipV} title={t('Flip Vertical')} className={transform.flipV ? 'active' : ''}>
          <FlipVerticalIcon />
        </button>
      </PluginControlGroup>

      {enablePanning && (
        <PluginControlGroup>
          <button
            onClick={() => setPanningActive((p) => !p)}
            title={t('Panning: {status}', { status: panningActive ? t('enabled') : t('disabled') })}
            className={panningActive ? 'active' : ''}>
            <MoveIcon />
          </button>
        </PluginControlGroup>
      )}

      {enableFilters && (
        <PluginControlGroup>
          <button onClick={() => handleBrightness(-10)} title={t('Decrease Brightness ({percent}%)', { percent: transform.brightness })}>
            <BrightnessDownIcon />
          </button>
          <button onClick={() => handleBrightness(10)} title={t('Increase Brightness ({percent}%)', { percent: transform.brightness })}>
            <BrightnessIcon />
          </button>
          <button onClick={() => handleContrast(-10)} title={t('Decrease Contrast ({percent}%)', { percent: transform.contrast })}>
            <ContrastDownIcon />
          </button>
          <button onClick={() => handleContrast(10)} title={t('Increase Contrast ({percent}%)', { percent: transform.contrast })}>
            <ContrastIcon />
          </button>
        </PluginControlGroup>
      )}

      <PluginControlGroup>
        <button onClick={handleReset} title={t('Reset All Transforms')}><ResetIcon /></button>
        {!isSvg && fileId && (
          <button
            onClick={handleSave}
            title={t('Save Changes to File')}
            disabled={!hasChanges || isSaving}
            className={hasChanges ? 'active' : ''}>
            <SaveIcon />
          </button>
        )}
        <button onClick={handleExport} title={t('Download Image')}><DownloadIcon /></button>
      </PluginControlGroup>
    </>
  );

  return (
    <div className="image-viewer-container">
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      <PluginHeader
        fileName={fileInfo.fileName}
        filePath={fileInfo.filePath}
        pluginName={PLUGIN_NAME}
        pluginVersion={PLUGIN_VERSION}
        tooltipInfo={tooltipInfo}
        controls={headerControls} />

      <div
        className="image-viewer-content"
        style={{
          cursor: panningActive ? (isPanning ? 'grabbing' : 'grab') : 'default',
          userSelect: panningActive ? 'none' : 'auto'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}>

        {isLoading && <div className="loading-indicator">{t('Loading image...')}</div>}

        {!isLoading && srcDoc && (
          <div className="image-scroll-area">
            <iframe
              ref={iframeRef}
              title={fileName}
              srcDoc={srcDoc}
              style={{
                border: 'none',
                display: 'block',
                pointerEvents: panningActive ? 'none' : 'auto'
              }} />
          </div>
        )}

        {!isLoading && !srcDoc && (
          <div className="image-error-message">{t('Cannot display this image.')}</div>
        )}
      </div>
    </div>
  );
};

export default CombinedImageViewer;