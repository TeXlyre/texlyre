import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
    MinimizeIcon,
} from "../../../src/components/common/Icons";
import { canvasRendererSettings } from "./settings";
import { useSettings } from "../../../src/hooks/useSettings";
import { useProperties } from "../../../src/hooks/useProperties";
import type { RendererProps } from "../../../src/plugins/PluginInterface";
import "./styles.css";

interface TypstAPI {
    pdf(options: { mainContent: string; sources?: Record<string, string | Uint8Array> }): Promise<Uint8Array>;
    svg(options: { mainContent: string; sources?: Record<string, string | Uint8Array> }): Promise<string>;
}

declare global {
    interface Window {
        $typst?: TypstAPI;
    }
}

declare global {
    interface Window {
        $typst?: TypstInstance;
    }
}

const CanvasRenderer: React.FC<RendererProps> = ({
    content,
    fileName,
    onDownload,
}) => {
    const { getSetting } = useSettings();
    const { getProperty, setProperty, registerProperty } = useProperties();
    const propertiesRegistered = useRef(false);

    const canvasRendererEnable =
        (getSetting("canvas-renderer-enable")?.value as boolean) ?? true;

    const [numPages, setNumPages] = useState<number>(0);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [pageInput, setPageInput] = useState<string>("1");
    const [isEditingPageInput, setIsEditingPageInput] = useState<boolean>(false);
    const [scale, setScale] = useState<number>(1.0);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [scrollView, setScrollView] = useState<boolean>(false);
    const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set());
    const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
    const [svgContent, setSvgContent] = useState<string | null>(null);
    const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
    const containerRef = useRef<HTMLDivElement>(null);
    const contentElRef = useRef<HTMLDivElement>(null);
    const [fitMode, setFitMode] = useState<"fit-width" | "fit-height">("fit-width");

    useEffect(() => {
        if (propertiesRegistered.current) return;
        propertiesRegistered.current = true;

        registerProperty({
            id: "canvas-renderer-zoom",
            category: "UI",
            subcategory: "Canvas Viewer",
            defaultValue: 1.0,
        });

        registerProperty({
            id: "canvas-renderer-scroll-view",
            category: "UI",
            subcategory: "Canvas Viewer",
            defaultValue: false,
        });
    }, [registerProperty]);

    useEffect(() => {
        const storedZoom = getProperty("canvas-renderer-zoom");
        const storedScrollView = getProperty("canvas-renderer-scroll-view");

        if (storedZoom !== undefined) {
            setScale(Number(storedZoom));
        }

        if (storedScrollView !== undefined) {
            setScrollView(Boolean(storedScrollView));
        }
    }, [getProperty]);

    useEffect(() => {
        const loadTypstDocument = async () => {
            if (!content || !window.$typst) {
                setError("No content or Typst engine not available");
                setIsLoading(false);
                return;
            }

            try {
                setIsLoading(true);
                setError(null);

                const textDecoder = new TextDecoder();
                const mainContent = textDecoder.decode(content);

                // Compile to SVG first to get renderable content
                const svgOutput = await window.$typst.svg({
                    mainContent,
                    sources: {}
                });

                setSvgContent(svgOutput);

                // Parse SVG to count pages
                const svgDoc = new DOMParser().parseFromString(svgOutput, 'image/svg+xml');
                const svgElements = svgDoc.querySelectorAll('svg');
                const pageCount = svgElements.length > 1 ? svgElements.length : 1;

                setNumPages(pageCount);
                setCurrentPage(1);
                if (!isEditingPageInput) setPageInput("1");
                setIsLoading(false);
            } catch (error) {
                console.error("Error loading Typst document:", error);
                setError(`Failed to load document: ${error}`);
                setIsLoading(false);
            }
        };

        loadTypstDocument();
    }, [content, isEditingPageInput]);

    const handlePreviousPage = useCallback(() => {
        if (scrollView) {
            const targetPage = Math.max(currentPage - 1, 1);
            const pageElement = pageRefs.current.get(targetPage);
            if (pageElement) {
                pageElement.scrollIntoView({ behavior: "smooth", block: "start" });
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
                pageElement.scrollIntoView({ behavior: "smooth", block: "start" });
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
        [],
    );

    const handlePageInputKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") {
                const pageNum = Number.parseInt(pageInput, 10);
                if (!Number.isNaN(pageNum) && pageNum >= 1 && pageNum <= numPages) {
                    if (scrollView) {
                        const pageElement = pageRefs.current.get(pageNum);
                        if (pageElement) {
                            pageElement.scrollIntoView({
                                behavior: "smooth",
                                block: "start",
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
        [numPages, currentPage, scrollView, pageInput],
    );

    const computeFitScale = useCallback((mode: "fit-width" | "fit-height") => {
        const containerWidth =
            contentElRef.current?.clientWidth ||
            document.querySelector('.canvas-renderer-content')?.clientWidth ||
            3840;
        const containerHeight =
            contentElRef.current?.clientHeight ||
            (document.querySelector('.canvas-renderer-content') as HTMLElement | null)?.clientHeight ||
            2160;

        const pageWidth = 595;
        const pageHeight = 842;

        if (mode === "fit-width") {
            return Math.max(0.5, Math.min(10, (containerWidth - 40) / pageWidth));
        } else {
            return Math.max(0.5, Math.min(10, (containerHeight - 40) / pageHeight));
        }
    }, []);

    const handleFitToggle = useCallback(() => {
        const nextMode = fitMode === "fit-width" ? "fit-height" : "fit-width";
        setFitMode(nextMode);
        const s = computeFitScale(nextMode);
        setScale(s);
        setProperty("canvas-renderer-zoom", s);
    }, [fitMode, computeFitScale, setProperty]);

    const handleZoomIn = useCallback(() => {
        setScale((prev) => {
            const newScale = Math.min(prev + 0.25, 5);
            setProperty("canvas-renderer-zoom", newScale);
            return newScale;
        });
    }, [setProperty]);

    const handleZoomOut = useCallback(() => {
        setScale((prev) => {
            const newScale = Math.max(prev - 0.25, 0.25);
            setProperty("canvas-renderer-zoom", newScale);
            return newScale;
        });
    }, [setProperty]);

    const handleZoomChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
        const value = event.target.value;
        if (value === "custom") return;
        const newScale = parseFloat(value) / 100;
        setScale(newScale);
        setProperty("canvas-renderer-zoom", newScale);
    }, [setProperty]);

    const handleToggleView = useCallback(() => {
        setScrollView((prev) => {
            const newScrollView = !prev;
            setProperty("canvas-renderer-scroll-view", newScrollView);
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

    const renderPage = useCallback((pageNumber: number) => {
        if (!svgContent) return null;

        const CanvasPage = React.forwardRef<HTMLCanvasElement>((props, ref) => {
            const canvasRef = useRef<HTMLCanvasElement>(null);

            useEffect(() => {
                const canvas = canvasRef.current;
                if (canvas && svgContent) {
                    try {
                        const svgDoc = new DOMParser().parseFromString(svgContent, 'image/svg+xml');
                        const svgElements = svgDoc.querySelectorAll('svg');
                        const targetSvg = svgElements.length > 1 ? svgElements[pageNumber - 1] : svgElements[0];

                        if (targetSvg) {
                            const svgString = new XMLSerializer().serializeToString(targetSvg);
                            const img = new Image();

                            img.onload = () => {
                                const ctx = canvas.getContext('2d');
                                if (ctx) {
                                    const pixelRatio = window.devicePixelRatio || 1;
                                    const baseWidth = 595;
                                    const baseHeight = 842;

                                    canvas.width = baseWidth * scale * pixelRatio;
                                    canvas.height = baseHeight * scale * pixelRatio;
                                    canvas.style.width = `${baseWidth * scale}px`;
                                    canvas.style.height = `${baseHeight * scale}px`;

                                    ctx.scale(pixelRatio, pixelRatio);
                                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                                    ctx.drawImage(img, 0, 0, baseWidth * scale, baseHeight * scale);
                                }
                            };

                            const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
                            const url = URL.createObjectURL(svgBlob);
                            img.src = url;

                            return () => URL.revokeObjectURL(url);
                        }
                    } catch (error) {
                        console.error(`Error rendering page ${pageNumber}:`, error);
                    }
                }
            }, [pageNumber, scale]);

            return (
                <canvas
                    ref={canvasRef}
                    style={{
                        maxWidth: '100%',
                        height: 'auto',
                        backgroundColor: 'white',
                        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
                    }}
                />
            );
        });

        return <CanvasPage key={`page-${pageNumber}-${scale}`} />;
    }, [svgContent, scale]);

    useEffect(() => {
        if (!scrollView) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const newVisiblePages = new Set(visiblePages);

                entries.forEach((entry) => {
                    const pageNum = Number.parseInt(
                        entry.target.getAttribute("data-page-number") || "0",
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
                    if (!isEditingPageInput) setPageInput(String(lowestVisiblePage));
                }
            },
            {
                threshold: [0.5],
                rootMargin: "-20% 0px -20% 0px",
                root: contentElRef.current || undefined,
            },
        );

        pageRefs.current.forEach((element) => {
            observer.observe(element);
        });

        return () => observer.disconnect();
    }, [scrollView, visiblePages, isFullscreen, isEditingPageInput]);

    const handleExport = useCallback(() => {
        if (onDownload && fileName) {
            onDownload(fileName);
        } else if (svgContent) {
            try {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    const svgDoc = new DOMParser().parseFromString(svgContent, 'image/svg+xml');
                    const svgElements = svgDoc.querySelectorAll('svg');
                    const targetSvg = svgElements.length > 1 ? svgElements[currentPage - 1] : svgElements[0];

                    if (targetSvg) {
                        const svgString = new XMLSerializer().serializeToString(targetSvg);
                        const img = new Image();

                        img.onload = () => {
                            const pixelRatio = window.devicePixelRatio || 1;
                            const baseWidth = 595;
                            const baseHeight = 842;

                            canvas.width = baseWidth * pixelRatio;
                            canvas.height = baseHeight * pixelRatio;
                            canvas.style.width = `${baseWidth}px`;
                            canvas.style.height = `${baseHeight}px`;

                            ctx.scale(pixelRatio, pixelRatio);
                            ctx.drawImage(img, 0, 0, baseWidth, baseHeight);

                            canvas.toBlob((blob) => {
                                if (blob) {
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement("a");
                                    a.href = url;
                                    a.download = fileName?.replace(/\.typ$/, '.png') || "page.png";
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                    URL.revokeObjectURL(url);
                                }
                            });
                        };

                        const svgBlob = new Blob([svgString], { type: 'image/svg+xml' });
                        const url = URL.createObjectURL(svgBlob);
                        img.src = url;
                    }
                }
            } catch (error) {
                console.error("Export error:", error);
                setError("Failed to export page");
            }
        }
    }, [svgContent, currentPage, fileName, onDownload]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (
                !document.fullscreenElement &&
                !containerRef.current?.contains(document.activeElement)
            ) {
                return;
            }

            switch (event.key) {
                case "ArrowLeft":
                case "ArrowUp":
                    event.preventDefault();
                    handlePreviousPage();
                    break;
                case "ArrowRight":
                case "ArrowDown":
                case " ":
                    event.preventDefault();
                    handleNextPage();
                    break;
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [handlePreviousPage, handleNextPage]);

    if (!canvasRendererEnable) {
        return (
            <div className="canvas-renderer-container">
                <div className="canvas-renderer-error">
                    Canvas renderer is disabled. Please enable it in settings to use
                    this renderer.
                </div>
            </div>
        );
    }

    return (
        <div className="canvas-renderer-container" ref={containerRef}>
            <div className={`canvas-toolbar ${isFullscreen ? "fullscreen-toolbar" : ""}`}>
                <div className="toolbar">
                    <div id="toolbarLeft">
                        <div className="toolbarButtonGroup">
                            <button
                                onClick={handlePreviousPage}
                                className="toolbarButton"
                                title="Previous Page"
                                disabled={currentPage <= 1 || isLoading}
                            >
                                <ChevronLeftIcon />
                            </button>
                            <button
                                onClick={handleNextPage}
                                className="toolbarButton"
                                title="Next Page"
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
                                title="Zoom Out"
                                disabled={isLoading}
                            >
                                <ZoomOutIcon />
                            </button>
                            {(() => {
                                const zoomOptions = canvasRendererSettings.find(s => s.id === "canvas-renderer-initial-zoom")?.options || [];
                                const currentZoom = Math.round(scale * 100).toString();
                                const hasCustomZoom = !zoomOptions.some(opt => String(opt.value) === currentZoom);

                                return (
                                    <select
                                        value={hasCustomZoom ? "custom" : currentZoom}
                                        onChange={handleZoomChange}
                                        disabled={isLoading}
                                        className="toolbarZoomSelect"
                                        title="Zoom Level"
                                    >
                                        {zoomOptions.map(option => (
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
                                );
                            })()}
                            <button
                                onClick={handleZoomIn}
                                className="toolbarButton"
                                title="Zoom In"
                                disabled={isLoading}
                            >
                                <ZoomInIcon />
                            </button>
                        </div>
                        <div className="toolbarButtonGroup">
                            <button
                                onClick={handleFitToggle}
                                className="toolbarButton"
                                title={fitMode === "fit-width" ? "Fit to Width" : "Fit to Height"}
                                disabled={isLoading}
                            >
                                <FitToWidthIcon />
                            </button>
                            <button
                                onClick={handleToggleView}
                                className="toolbarButton"
                                title={scrollView ? "Single Page View" : "Scroll View"}
                                disabled={isLoading}
                            >
                                {scrollView ? <PageIcon /> : <ScrollIcon />}
                            </button>
                            <button
                                onClick={handleToggleFullscreen}
                                className="toolbarButton"
                                title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                                disabled={isLoading}
                            >
                                {isFullscreen ? <MinimizeIcon /> : <ExpandIcon />}
                            </button>
                        </div>
                        <div className="toolbarButtonGroup">
                            <button
                                onClick={handleExport}
                                className="toolbarButton"
                                title="Download"
                                disabled={isLoading}
                            >
                                <DownloadIcon />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className={`canvas-renderer-content ${isFullscreen ? "fullscreen" : ""}`} ref={contentElRef}>
                {isLoading && (
                    <div className="canvas-renderer-loading">
                        Loading Canvas document...
                    </div>
                )}

                {!isLoading && !error && svgContent && (
                    scrollView ? (
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
                                    className="canvas-page-scroll"
                                >
                                    {renderPage(pageNumber)}
                                </div>
                            );
                        })
                    ) : (
                        <div className="canvas-single-page">
                            {renderPage(currentPage)}
                        </div>
                    )
                )}
            </div>

            {error && <div className="canvas-renderer-error">{error}</div>}
        </div>
    );
};

export default CanvasRenderer;