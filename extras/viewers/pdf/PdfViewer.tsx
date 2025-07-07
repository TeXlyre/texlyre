// extras/viewers/pdf/PdfViewer.tsx
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	DownloadIcon,
	ZoomInIcon,
	ZoomOutIcon,
} from "../../../src/components/common/Icons";
import { PluginHeader, PluginControlGroup } from "../../../src/components/common/PluginHeader";
import { usePluginFileInfo } from "../../../src/hooks/usePluginFileInfo";
import { useSettings } from "../../../src/hooks/useSettings";
import type { ViewerProps } from "../../../src/plugins/PluginInterface";
import "./styles.css";

if (!pdfjs.GlobalWorkerOptions.workerSrc) {
	pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
}

const PdfViewer: React.FC<ViewerProps> = ({
	content,
	mimeType,
	fileName,
	fileId,
}) => {
	const { getSetting } = useSettings();
	const fileInfo = usePluginFileInfo(fileId, fileName);

	const autoScale =
		(getSetting("pdf-viewer-auto-scale")?.value as boolean) ?? true;
	const renderingQuality =
		(getSetting("pdf-viewer-rendering-quality")?.value as
			| "low"
			| "medium"
			| "high") ?? "high";

	const _qualityScaleMap = {
		low: 0.75,
		medium: 1.0,
		high: 1.5,
	};

	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [pdfDocument, setPdfDocument] = useState<pdfjs.PDFDocumentProxy | null>(
		null,
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
			console.log("PdfViewer: Original content stored", {
				size: content.byteLength,
				type: content.constructor.name,
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
				}
				loadingTaskRef.current = null;
			}

			setPdfDocument((prevDoc) => {
				if (prevDoc) {
					try {
						prevDoc.destroy();
					} catch (e) {
						console.error("Error destroying previous PDF document:", e);
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
						console.error("Error initializing PDF:", err);
						setError("Failed to initialize PDF document.");
						setIsLoading(false);
					}
				}
			} else {
				if (isMounted.current) {
					setError("Invalid PDF content.");
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
				}
				loadingTaskRef.current = null;
			}

			setPdfDocument((prevDoc) => {
				if (prevDoc) {
					try {
						prevDoc.destroy();
					} catch (e) {
						console.error("Error destroying PDF document:", e);
					}
				}
				return null;
			});

			contentRef.current = null;
		};
	}, [content]);

	const loadPdf = async (
		loadingTaskRef: { current: unknown },
		isMounted: { current: boolean },
	) => {
		if (!contentRef.current || !isMounted.current) {
			return;
		}

		try {
			const loadingTask = pdfjs.getDocument({
				data: new Uint8Array(contentRef.current),
				cMapUrl: import.meta.env.PROD ? "/texlyre/cmaps/" : "/cmaps/",
				cMapPacked: true,
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
					!err.message.includes("Loading task cancelled") &&
					!err.message.includes("Worker was destroyed")
				) {
					console.error("Error loading PDF:", err);
					setError("Failed to load PDF document.");
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
				}
				renderTaskRef.current = null;
			}

			try {
				const page = await pdfDocument.getPage(currentPage);

				if (!isMounted.current) {
					try {
						page.cleanup();
					} catch (_e) {
						// Ignore cleanup errors
					}
					return;
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

				const context = canvas.getContext("2d");

				if (!context) {
					throw new Error("Could not get canvas context");
				}

				context.clearRect(0, 0, canvas.width, canvas.height);

				canvas.height = viewport.height;
				canvas.width = viewport.width;

				const renderContext = {
					canvasContext: context,
					viewport: viewport,
				};

				renderTaskRef.current = page.render(renderContext);
				await renderTaskRef.current.promise;

				renderTaskRef.current = null;
			} catch (err) {
				if (
					isMounted.current &&
					err instanceof Error &&
					!err.message.includes("Rendering cancelled") &&
					!err.message.includes("Worker was destroyed")
				) {
					console.error("Error rendering PDF page:", err);
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
				}
				renderTaskRef.current = null;
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

	const handleResetZoom = () => {
		setScale(1);
	};

	const handlePageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		const pageNumber = Number.parseInt(event.target.value);
		if (
			!Number.isNaN(pageNumber) &&
			pageNumber >= 1 &&
			pageNumber <= totalPages
		) {
			setCurrentPage(pageNumber);
		}
	};

	const handleExport = () => {
		const contentToExport = originalContentRef.current || contentRef.current;

		if (contentToExport) {
			console.log("PdfViewer: Exporting PDF", {
				size: contentToExport.byteLength,
				fileName: fileName,
				source: originalContentRef.current ? "original" : "processed",
			});

			const blob = new Blob([contentToExport], { type: "application/pdf" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = fileName;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} else {
			console.error("PdfViewer: No valid PDF content available for export");
			setError("Cannot export: PDF content is not available");
		}
	};

	const tooltipInfo = [
		`Rendering quality: ${renderingQuality}`,
		`Auto-scale: ${autoScale ? "enabled" : "disabled"}`,
		`Pages: ${totalPages}`,
		`Current page: ${currentPage}`,
		`MIME Type: ${mimeType || "application/pdf"}`,
		`Size: ${fileInfo.fileSize ? Math.round(fileInfo.fileSize / 1024) + " KB" : "Unknown"}`
	];

	const headerControls = (
		<>
			<PluginControlGroup>
				<button
					onClick={handlePreviousPage}
					disabled={currentPage <= 1 || isLoading}
					title="Previous Page"
				>
					<ChevronLeftIcon />
				</button>
				<button
					onClick={handleNextPage}
					disabled={currentPage >= totalPages || isLoading}
					title="Next Page"
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
				<span>/ {totalPages}</span>
			</PluginControlGroup>

			<PluginControlGroup>
				<button onClick={handleZoomOut} title="Zoom Out" disabled={isLoading}>
					<ZoomOutIcon />
				</button>
				<button
					onClick={handleResetZoom}
					title="Reset Zoom"
					disabled={isLoading}
					className="zoom-percentage"
				>
					{Math.round(scale * 100)}%
				</button>
				<button onClick={handleZoomIn} title="Zoom In" disabled={isLoading}>
					<ZoomInIcon />
				</button>
			</PluginControlGroup>

			<PluginControlGroup>
				<button
					onClick={handleExport}
					title="Download PDF"
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
				pluginName="PDF Viewer"
				pluginVersion="1.0.0"
				tooltipInfo={tooltipInfo}
				controls={headerControls}
			/>

			<div className="pdf-viewer-content">
				{isLoading && (
					<div className="loading-indicator">Loading PDF document...</div>
				)}

				{error && <div className="pdf-error-message">{error}</div>}

				{!isLoading && !error && pdfDocument && (
					<div className="pdf-container" ref={pdfContainerRef}>
						<div className="pdf-page-container">
							<canvas
								ref={canvasRef}
								className="pdf-page-canvas"
								style={{
									transform: `scale(${scale})`,
									transformOrigin: "center",
								}}
							/>
						</div>
					</div>
				)}
			</div>
		</div>
	);
};

export default PdfViewer;
