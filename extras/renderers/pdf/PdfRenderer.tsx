// extras/renderers/pdf/PdfRenderer.tsx
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

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
import { useSettings } from "../../../src/hooks/useSettings";
import { useProperties } from "../../../src/hooks/useProperties";
import type { RendererProps } from "../../../src/plugins/PluginInterface";
import "./styles.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
	"pdfjs-dist/build/pdf.worker.min.mjs",
	import.meta.url,
).toString();

const PdfRenderer: React.FC<RendererProps> = ({
	content,
	fileName,
	onDownload,
}) => {
	const { getSetting } = useSettings();
	const { getProperty, setProperty, registerProperty } = useProperties();
	const propertiesRegistered = useRef(false);

	const pdfRendererEnable =
		(getSetting("pdf-renderer-enable")?.value as boolean) ?? true;
	const pdfRendererTextSelection =
		(getSetting("pdf-renderer-text-selection")?.value as boolean) ?? true;

	const [numPages, setNumPages] = useState<number>(0);
	const [currentPage, setCurrentPage] = useState<number>(1);
	const [scale, setScale] = useState<number>(1.0);
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [error, setError] = useState<string | null>(null);
	const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
	const [scrollView, setScrollView] = useState<boolean>(false);
	const [visiblePages, setVisiblePages] = useState<Set<number>>(new Set());
	const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
	const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
	const contentRef = useRef<ArrayBuffer | null>(null);
	const originalContentRef = useRef<ArrayBuffer | null>(null);
	const contentHashRef = useRef<string>("");
	const containerRef = useRef<HTMLDivElement>(null);
	const pageWidths = useRef<Map<number, number>>(new Map());
	const pageHeights = useRef<Map<number, number>>(new Map());
	const contentElRef = useRef<HTMLDivElement>(null);
	const [fitMode, setFitMode] = useState<"zoom" | "fit-width" | "fit-height">("zoom");
	const prevZoomRef = useRef<number>(1.0);

	// Register properties
	useEffect(() => {
		if (propertiesRegistered.current) return;
		propertiesRegistered.current = true;

		registerProperty({
			id: "pdf-renderer-zoom",
			category: "UI",
			subcategory: "PDF Viewer",
			defaultValue: 1.0,
		});

		registerProperty({
			id: "pdf-renderer-scroll-view",
			category: "UI",
			subcategory: "PDF Viewer",
			defaultValue: false,
		});
	}, [registerProperty]);

	// Load properties
	useEffect(() => {
		const storedZoom = getProperty("pdf-renderer-zoom");
		const storedScrollView = getProperty("pdf-renderer-scroll-view");

		if (storedZoom !== undefined) {
			setScale(Number(storedZoom));
			prevZoomRef.current = Number(storedZoom);
		}

		if (storedScrollView !== undefined) {
			setScrollView(Boolean(storedScrollView));
		}
	}, [getProperty]);

	const getContentHash = useCallback((buffer: ArrayBuffer): string => {
		const view = new Uint8Array(buffer);
		const sample = view.slice(0, Math.min(1024, view.length));
		return `${buffer.byteLength}-${Array.from(sample.slice(0, 16)).join(",")}`;
	}, []);

	useEffect(() => {
		if (content instanceof ArrayBuffer && content.byteLength > 0) {
			try {
				const contentHash = getContentHash(content);

				if (contentHashRef.current !== contentHash) {
					// Create Uint8Array directly from the original ArrayBuffer
					const data = new Uint8Array(content);
					// Create a copy of the data for persistence
					const dataCopy = new Uint8Array(data);
					setPdfData(dataCopy);

					// Store the copied buffer for export
					originalContentRef.current = dataCopy.buffer.slice(0);
					contentRef.current = originalContentRef.current;
					contentHashRef.current = contentHash;

					// Reset loading state
					setIsLoading(true);
					setError(null);
				}
			} catch (error) {
				console.error("Error creating PDF data:", error);
				setError("Failed to process PDF content");
				setIsLoading(false);
			}
		} else {
			setPdfData(null);
			contentRef.current = null;
			originalContentRef.current = null;
			contentHashRef.current = "";
			setError("No PDF content available");
			setIsLoading(false);
		}
	}, [content, getContentHash]);

	const fileData = useMemo(() => {
		return pdfData ? {
			data: pdfData,
			cMapUrl: import.meta.env.PROD ? "/texlyre/cmaps/" : "/texlyre/cmaps/",
			cMapPacked: true,
		} : null;
	}, [pdfData]);

	const onDocumentLoadSuccess = useCallback(
		({ numPages }: { numPages: number }) => {
			setNumPages(numPages);
			setCurrentPage(1);
			setIsLoading(false);
			setError(null);
		},
		[],
	);

	const onDocumentLoadError = useCallback((error: Error) => {
		setError(`Failed to load PDF: ${error.message}`);
		setIsLoading(false);
	}, []);

	const handlePreviousPage = useCallback(() => {
		if (scrollView) {
			const targetPage = Math.max(currentPage - 1, 1);
			const pageElement = pageRefs.current.get(targetPage);
			if (pageElement) {
				pageElement.scrollIntoView({ behavior: "smooth", block: "start" });
			}
		} else {
			setCurrentPage((prev) => Math.max(prev - 1, 1));
		}
	}, [scrollView, currentPage]);

	const handleNextPage = useCallback(() => {
		if (scrollView) {
			const targetPage = Math.min(currentPage + 1, numPages);
			const pageElement = pageRefs.current.get(targetPage);
			if (pageElement) {
				pageElement.scrollIntoView({ behavior: "smooth", block: "start" });
			}
		} else {
			setCurrentPage((prev) => Math.min(prev + 1, numPages));
		}
	}, [scrollView, currentPage, numPages]);

	const handlePageInputChange = useCallback(
		(event: React.ChangeEvent<HTMLInputElement>) => {
			const pageNum = Number.parseInt(event.target.value, 10);
			if (!Number.isNaN(pageNum) && pageNum >= 1 && pageNum <= numPages) {
				if (scrollView) {
					const pageElement = pageRefs.current.get(pageNum);
					if (pageElement) {
						pageElement.scrollIntoView({ behavior: "smooth", block: "start" });
					}
				} else {
					setCurrentPage(pageNum);
				}
			}
		},
		[numPages, scrollView],
	);

	const handlePageInputKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLInputElement>) => {
			if (event.key === "Enter") {
				const pageNum = Number.parseInt(event.currentTarget.value, 10);
				if (!Number.isNaN(pageNum) && pageNum >= 1 && pageNum <= numPages) {
					if (scrollView) {
						const pageElement = pageRefs.current.get(pageNum);
						if (pageElement) {
							pageElement.scrollIntoView({
								behavior: "smooth",
								block: "start",
							});
						}
					} else {
						setCurrentPage(pageNum);
					}
				} else {
					event.currentTarget.value = currentPage.toString();
				}
			}
		},
		[numPages, currentPage, scrollView],
	);

	const computeFitScale = useCallback((mode: "fit-width" | "fit-height") => {
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
		if (typeof currentW === "number") pageWidth = currentW;
		if (typeof currentH === "number") pageHeight = currentH;
		if ((!currentW || !currentH) && pageWidths.current.size > 0) {
			const firstKey = Math.min(...Array.from(pageWidths.current.keys()));
			pageWidth = pageWidths.current.get(firstKey) || pageWidth;
			pageHeight = pageHeights.current.get(firstKey) || pageHeight;
		}
		if (mode === "fit-width") {
			return Math.max(0.5, Math.min(10, (containerWidth - 40) / pageWidth));
		} else {
			return Math.max(0.5, Math.min(10, (containerHeight - 40) / pageHeight));
		}
	}, [currentPage]);

	const handleFitToggle = useCallback(() => {
		if (fitMode === "zoom") {
			const s = computeFitScale("fit-width");
			setFitMode("fit-width");
			setScale(s);
			setProperty("pdf-renderer-zoom", s);
		} else if (fitMode === "fit-width") {
			const s = computeFitScale("fit-height");
			setFitMode("fit-height");
			setScale(s);
			setProperty("pdf-renderer-zoom", s);
		} else {
			setFitMode("zoom");
			const s = prevZoomRef.current || scale;
			setScale(s);
			setProperty("pdf-renderer-zoom", s);
		}
	}, [fitMode, computeFitScale, setProperty, scale]);

	const handleZoomIn = useCallback(() => {
		setFitMode("zoom");
		setScale((prev) => {
			const newScale = Math.min(prev + 0.25, 10);
			prevZoomRef.current = newScale;
			setProperty("pdf-renderer-zoom", newScale);
			return newScale;
		});
	}, [setProperty]);

	const handleZoomOut = useCallback(() => {
		setFitMode("zoom");
		setScale((prev) => {
			const newScale = Math.max(prev - 0.25, 0.25);
			prevZoomRef.current = newScale;
			setProperty("pdf-renderer-zoom", newScale);
			return newScale;
		});
	}, [setProperty]);

	const handleToggleView = useCallback(() => {
		setScrollView((prev) => {
			const newScrollView = !prev;
			setProperty("pdf-renderer-scroll-view", newScrollView);
			// Reset page refs when switching views
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

	const onPageLoadSuccess = useCallback((_pageNumber: number) => {
		return (_page: any) => {
			// This callback is called when each page finishes loading in scroll view
			const v = (typeof _page?.getViewport === "function" ? _page.getViewport({ scale: 1 }) : undefined) as { width: number; height: number } | undefined;
			if (v && typeof v.width === "number" && typeof v.height === "number") {
				pageWidths.current.set(_pageNumber, v.width);
				pageHeights.current.set(_pageNumber, v.height);
				if (fitMode === "fit-width" || fitMode === "fit-height") {
					const s = computeFitScale(fitMode);
					setScale(s);
					setProperty("pdf-renderer-zoom", s);
				}
			}
		};
	}, [fitMode, computeFitScale, setProperty]);

	// Track visible pages in scroll view using Intersection Observer
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

				// Update current page to the lowest visible page
				if (newVisiblePages.size > 0) {
					const lowestVisiblePage = Math.min(...Array.from(newVisiblePages));
					setCurrentPage(lowestVisiblePage);
				}
			},
			{
				threshold: [0.5],
				rootMargin: "-20% 0px -20% 0px",
			},
		);

		// Observe all page elements
		pageRefs.current.forEach((element) => {
			observer.observe(element);
		});

		return () => observer.disconnect();
	}, [scrollView, visiblePages]);

	useEffect(() => {
		if (fitMode === "fit-width" || fitMode === "fit-height") {
			const s = computeFitScale(fitMode);
			setScale(s);
			setProperty("pdf-renderer-zoom", s);
		}
	}, [currentPage, fitMode, computeFitScale, setProperty]);

	const handleExport = useCallback(() => {
		if (onDownload && fileName) {
			onDownload(fileName);
		} else if (
			originalContentRef.current &&
			originalContentRef.current.byteLength > 0
		) {
			try {
				const blob = new Blob([originalContentRef.current], {
					type: "application/pdf",
				});
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = fileName || "document.pdf";
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
			} catch (error) {
				console.error("Export error:", error);
				setError("Failed to export PDF");
			}
		} else {
			setError("Cannot export: PDF content is not available");
		}
	}, [fileName, onDownload]);

	if (!pdfRendererEnable) {
		return (
			<div className="pdf-renderer-container">
				<div className="pdf-renderer-error">
					Enhanced PDF renderer is disabled. Please enable it in settings to use
					this renderer.
				</div>
			</div>
		);
	}

	return (
    <div className="pdf-renderer-container" ref={containerRef}>
			<div className={`pdf-toolbar ${isFullscreen ? "fullscreen-toolbar" : ""}`}>
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
									value={currentPage}
									onChange={handlePageInputChange}
									onKeyDown={handlePageInputKeyDown}
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
								title={fitMode === "fit-width" ? "Fit to Width" : fitMode === "fit-height" ? "Fit to Height" : "Zoom"}
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

			<div className={`pdf-renderer-content ${isFullscreen ? "fullscreen" : ""}`} ref={contentElRef}>
				{fileData && (
					<Document
						file={fileData}
						onLoadSuccess={onDocumentLoadSuccess}
						onLoadError={onDocumentLoadError}
						loading={
							<div className="pdf-renderer-loading">
								Loading PDF document...
							</div>
						}
					>
						{!isLoading &&
							!error &&
							(scrollView ? (
								// Render all pages in scroll view
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
										>
											<Page
												pageNumber={pageNumber}
												scale={scale}
												renderTextLayer={pdfRendererTextSelection}
												renderAnnotationLayer={true}
												loading={
													<div className="pdf-page-loading">
														Loading page {pageNumber}...
													</div>
												}
												className="pdf-page-scroll"
												onLoadSuccess={onPageLoadSuccess(pageNumber)}
											/>
										</div>
									);
								})
							) : (
								// Render single page
								<Page
									pageNumber={currentPage}
									scale={scale}
									renderTextLayer={pdfRendererTextSelection}
									renderAnnotationLayer={true}
									loading={
										<div className="pdf-page-loading">Loading page...</div>
									}
									onLoadSuccess={onPageLoadSuccess(currentPage)}
								/>
							))}
					</Document>
				)}
			</div>

			{error && <div className="pdf-renderer-error">{error}</div>}
		</div>
	);
};

export default PdfRenderer;
