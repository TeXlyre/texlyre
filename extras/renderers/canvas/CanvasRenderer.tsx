import { t } from '@/i18n';
import type React from 'react';
import { useCallback, useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';

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
} from '@/components/common/Icons';
import { getCanvasRendererSettings } from './settings';
import { useSettings } from '@/hooks/useSettings';
import { useProperties } from '@/hooks/useProperties';
import type { RendererProps } from '@/plugins/PluginInterface';
import './styles.css';

export interface CanvasRendererHandle {
    updateSvgContent: (svgString: string) => void;
}

const CanvasRenderer: React.FC<RendererProps> = ({
    content,
    fileName,
    onDownload,
    controllerRef
}) => {
    const { getSetting } = useSettings();
    const { getProperty, setProperty, registerProperty } = useProperties();

    const containerRef = useRef<HTMLDivElement>(null);
    const contentElRef = useRef<HTMLDivElement>(null);
    const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
    const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
    const propertiesRegistered = useRef(false);
    const svgPagesRef = useRef<Map<number, string>>(new Map());
    const fullSvgRef = useRef<string>('');
    const pendingRenderRef = useRef<Set<number>>(new Set());
    const renderingRef = useRef<Set<number>>(new Set());

    const [numPages, setNumPages] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageInput, setPageInput] = useState('1');
    const [isEditingPageInput, setIsEditingPageInput] = useState(false);
    const [scale, setScale] = useState(1.0);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [scrollView, setScrollView] = useState(false);
    const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set([1]));
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [fitMode, setFitMode] = useState<'fit-width' | 'fit-height'>('fit-width');
    const [pageMetadata, setPageMetadata] = useState<Map<number, { width: number; height: number }>>(new Map());

    const canvasRendererEnable = getSetting('canvas-renderer-enable')?.value as boolean ?? true;

    const parseSvgPages = useCallback((svgString: string) => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgString, 'image/svg+xml');
        const svgElement = doc.querySelector('svg');

        if (!svgElement) {
            throw new Error('No SVG element found');
        }

        const pageGroups = svgElement.querySelectorAll('g.typst-page');
        const pages = new Map<number, string>();
        const metadata = new Map<number, { width: number; height: number }>();

        const svgWidth = parseFloat(svgElement.getAttribute('width') || '595');
        const svgHeight = parseFloat(svgElement.getAttribute('height') || '842');

        const defs = svgElement.querySelector('defs');
        const styles = svgElement.querySelectorAll('style');
        const defsString = defs ? new XMLSerializer().serializeToString(defs) : '';
        let stylesString = '';
        styles.forEach(style => {
            stylesString += new XMLSerializer().serializeToString(style);
        });

        const svgAttrs: string[] = [];
        Array.from(svgElement.attributes).forEach(attr => {
            if (attr.name !== 'width' && attr.name !== 'height' && attr.name !== 'viewBox') {
                svgAttrs.push(`${attr.name}="${attr.value}"`);
            }
        });
        const attrsString = svgAttrs.join(' ');

        if (pageGroups.length === 0) {
            pages.set(1, svgString);
            metadata.set(1, { width: svgWidth, height: svgHeight });
        } else {
            pageGroups.forEach((pageGroup, index) => {
                const pageNumber = index + 1;
                const transform = pageGroup.getAttribute('transform') || '';

                let yOffset = 0;
                if (transform) {
                    const match = transform.match(/translate\([^,]*,\s*([^)]*)\)/);
                    if (match) {
                        yOffset = parseFloat(match[1]) || 0;
                    }
                }

                let pageHeight = svgHeight;
                if (index < pageGroups.length - 1) {
                    const nextTransform = pageGroups[index + 1].getAttribute('transform');
                    if (nextTransform) {
                        const nextMatch = nextTransform.match(/translate\([^,]*,\s*([^)]*)\)/);
                        if (nextMatch) {
                            pageHeight = Math.abs((parseFloat(nextMatch[1]) || 0) - yOffset);
                        }
                    }
                }

                const pageContent = new XMLSerializer().serializeToString(pageGroup);
                const pageSvg = `<svg ${attrsString} width="${svgWidth}" height="${pageHeight}" viewBox="0 0 ${svgWidth} ${pageHeight}">
                    ${stylesString}
                    ${defsString}
                    <g transform="translate(0, ${-yOffset})">
                        ${pageContent}
                    </g>
                </svg>`;

                pages.set(pageNumber, pageSvg);
                metadata.set(pageNumber, { width: svgWidth, height: pageHeight });
            });
        }

        return { pages, metadata };
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

            // Clear + fill only when we're ready to draw:
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

    const renderVisiblePages = useCallback(() => {
        if (scrollView) {
            visiblePages.forEach(pageNum => {
                if (pageNum <= numPages && svgPagesRef.current.has(pageNum)) {
                    renderPageToCanvas(pageNum);
                }
            });
        } else if (svgPagesRef.current.has(currentPage)) {
            renderPageToCanvas(currentPage);
        }
    }, [scrollView, visiblePages, currentPage, numPages, renderPageToCanvas]);

    const updateSvgContent = useCallback((svgString: string) => {
        if (!svgString) return;

        fullSvgRef.current = svgString;

        try {
            const { pages, metadata } = parseSvgPages(svgString);

            svgPagesRef.current = pages;
            setPageMetadata(metadata);
            setNumPages(pages.size);
            setIsLoading(false);
            setError(null);

            requestAnimationFrame(() => {
                if (scrollView) {
                    visiblePages.forEach(pageNum => {
                        if (pageNum <= pages.size) {
                            renderPageToCanvas(pageNum);
                        }
                    });
                } else {
                    renderPageToCanvas(currentPage);
                }
            });

        } catch (err) {
            console.error('[CanvasRenderer] Failed to parse SVG:', err);
            setError(`Failed to parse SVG: ${err}`);
            setIsLoading(false);
        }
    }, [parseSvgPages, scrollView, visiblePages, currentPage, renderPageToCanvas]);

    useEffect(() => {
        if (controllerRef) {
            controllerRef({
                updateContent: (newContent: ArrayBuffer | string) => {
                    const svgString = typeof newContent === 'string'
                        ? newContent
                        : new TextDecoder().decode(newContent);
                    updateSvgContent(svgString);
                }
            });
        }
        return () => {
            if (controllerRef) {
                controllerRef(null);
            }
        };
    }, [controllerRef, updateSvgContent]);

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
        if (content && content.byteLength > 0) {
            const decoder = new TextDecoder();
            const svgString = decoder.decode(content);
            updateSvgContent(svgString);
        }
    }, []);

    useEffect(() => {
        if (numPages === 0 || svgPagesRef.current.size === 0) return;
        renderVisiblePages();
    }, [scale, renderVisiblePages, numPages]);

    useEffect(() => {
        if (!scrollView || isLoading || numPages === 0) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const newVisiblePages = new Set(visiblePages);
                let changed = false;

                entries.forEach((entry) => {
                    const pageNum = Number.parseInt(
                        entry.target.getAttribute('data-page-number') || '0',
                        10
                    );

                    if (entry.isIntersecting && entry.intersectionRatio > 0.1) {
                        if (!newVisiblePages.has(pageNum)) {
                            newVisiblePages.add(pageNum);
                            changed = true;
                        }
                    } else if (!entry.isIntersecting) {
                        if (newVisiblePages.has(pageNum)) {
                            newVisiblePages.delete(pageNum);
                            changed = true;
                        }
                    }
                });

                if (changed) {
                    setVisiblePages(newVisiblePages);

                    if (newVisiblePages.size > 0) {
                        const lowestVisiblePage = Math.min(...Array.from(newVisiblePages));
                        setCurrentPage(lowestVisiblePage);
                        if (!isEditingPageInput) {
                            setPageInput(String(lowestVisiblePage));
                        }
                    }
                }
            },
            {
                threshold: [0.1],
                rootMargin: '100px 0px',
                root: contentElRef.current
            }
        );

        pageRefs.current.forEach((element) => observer.observe(element));

        return () => observer.disconnect();
    }, [scrollView, isLoading, numPages, isEditingPageInput]);

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
        const containerWidth = contentElRef.current?.clientWidth || 800;
        const containerHeight = contentElRef.current?.clientHeight || 600;
        const meta = pageMetadata.get(currentPage);
        const pageWidth = meta?.width || 595;
        const pageHeight = meta?.height || 842;

        if (mode === 'fit-width') {
            return Math.max(0.25, Math.min(5, (containerWidth - 40) / pageWidth));
        }
        return Math.max(0.25, Math.min(5, (containerHeight - 40) / pageHeight));
    }, [currentPage, pageMetadata]);

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
        } else if (fullSvgRef.current) {
            const blob = new Blob([fullSvgRef.current], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName?.replace(/\.typ$/, '.svg') || 'output.svg';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
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

            <div className={`canvas-renderer-content ${isFullscreen ? 'fullscreen' : ''}`} ref={contentElRef}>
                <div className="canvas-renderer-viewer">
                    {!isLoading && !error && numPages > 0 && (
                        scrollView ? (
                            Array.from({ length: numPages }, (_, i) => {
                                const pageNumber = i + 1;
                                const meta = pageMetadata.get(pageNumber);
                                const width = meta?.width || 595;
                                const height = meta?.height || 842;

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
                                            <canvas
                                                ref={setCanvasRef(pageNumber)}
                                                className="canvas-page-canvas"
                                                style={{
                                                    width: `${width * scale}px`,
                                                    height: `${height * scale}px`,
                                                }}
                                            />
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
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
                        )
                    )}
                </div>

                {isLoading && (
                    <div className="canvas-renderer-loading">
                        {t('Loading document...')}
                    </div>
                )}
            </div>

            {error && <div className="canvas-renderer-error">{error}</div>}
        </div>
    );
};

CanvasRenderer.displayName = 'CanvasRenderer';

export default CanvasRenderer;