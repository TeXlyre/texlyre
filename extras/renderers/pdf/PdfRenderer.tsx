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
	ZoomInIcon,
	ZoomOutIcon,
} from "../../../src/components/common/Icons";
import { useSettings } from "../../../src/hooks/useSettings";
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
	const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
	const contentRef = useRef<ArrayBuffer | null>(null);
	const originalContentRef = useRef<ArrayBuffer | null>(null);
	const contentHashRef = useRef<string>("");

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
		return pdfData ? { data: pdfData } : null;
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
			if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= numPages) {
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
				if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= numPages) {
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

	const handleZoomIn = useCallback(() => {
		setScale((prev) => Math.min(prev + 0.25, 3));
	}, []);

	const handleZoomOut = useCallback(() => {
		setScale((prev) => Math.max(prev - 0.25, 0.5));
	}, []);

	const handleToggleView = useCallback(() => {
		setScrollView((prev) => !prev);
		// Reset page refs when switching views
		pageRefs.current.clear();
	}, []);

	const onPageLoadSuccess = useCallback((pageNumber: number) => {
		return (page: any) => {
			// This callback is called when each page finishes loading in scroll view
		};
	}, []);

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
		<div className="pdf-renderer-container">
			<div className="pdf-toolbar">
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
								onClick={handleToggleView}
								className="toolbarButton"
								title={scrollView ? "Single Page View" : "Scroll View"}
								disabled={isLoading}
							>
								{scrollView ? <PageIcon /> : <ScrollIcon />}
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

			<div className="pdf-renderer-content">
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
