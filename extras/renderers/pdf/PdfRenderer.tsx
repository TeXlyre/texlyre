// extras/renderers/pdf/PdfRenderer.tsx
import * as pdfjs from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import {
	EventBus,
	PDFFindController,
	PDFLinkService,
	PDFViewer,
} from "pdfjs-dist/web/pdf_viewer.mjs";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
	ChevronLeftIcon,
	ChevronRightIcon,
	DownloadIcon,
	ZoomInIcon,
	ZoomOutIcon,
} from "../../../src/components/common/Icons";
import { useSettings } from "../../../src/hooks/useSettings";
import type { RendererProps } from "../../../src/plugins/PluginInterface";
import "pdfjs-dist/web/pdf_viewer.css";
import "./styles.css";

if (!pdfjs.GlobalWorkerOptions.workerSrc) {
	pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
}

const PdfRenderer: React.FC<RendererProps> = ({
	content,
	fileName,
	onDownload,
}) => {
	const { getSetting } = useSettings();

	const pdfRendererEnable =
		(getSetting("pdf-renderer-enable")?.value as boolean) ?? true;
	const pdfRendererInitialZoom =
		(getSetting("pdf-renderer-initial-zoom")?.value as string) ?? "100";
	const pdfRendererTextSelection =
		(getSetting("pdf-renderer-text-selection")?.value as boolean) ?? true;
	const pdfRendererAnnotations =
		(getSetting("pdf-renderer-annotations")?.value as boolean) ?? true;

	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const containerRef = useRef<HTMLDivElement>(null);
	const viewerContainerRef = useRef<HTMLDivElement>(null);
	const viewerRef = useRef<HTMLDivElement>(null);
	const toolbarRef = useRef<HTMLDivElement>(null);

	const pdfViewerRef = useRef<PDFViewer | null>(null);
	const loadingTaskRef = useRef<pdfjs.PDFDocumentLoadingTask | null>(null);
	const eventBusRef = useRef<EventBus | null>(null);
	const toolbarListenersRef = useRef<(() => void)[]>([]);

	// Store original content immediately when component receives it
	const originalContentRef = useRef<ArrayBuffer | null>(null);
	const pdfContentRef = useRef<{
		data: ArrayBuffer;
		uint8Data: Uint8Array;
		isValid: boolean;
	} | null>(null);

	// Store the original content as soon as we receive it
	useEffect(() => {
		if (content instanceof ArrayBuffer && content.byteLength > 0) {
			originalContentRef.current = content.slice(0); // Create a copy immediately
			console.log("PdfRenderer: Original content stored", {
				size: content.byteLength,
				type: content.constructor.name,
			});
		}
	}, [content]);

	const initializeContent = useCallback(() => {
		if (!content || !(content instanceof ArrayBuffer)) {
			console.error("PdfRenderer: Invalid content provided", content);
			pdfContentRef.current = null;
			return false;
		}

		if (content.byteLength === 0) {
			console.error("PdfRenderer: Empty content provided");
			pdfContentRef.current = null;
			return false;
		}

		const dataCopy = content.slice(0);
		const uint8Copy = new Uint8Array(dataCopy);

		pdfContentRef.current = {
			data: dataCopy,
			uint8Data: uint8Copy,
			isValid: true,
		};

		console.log("PdfRenderer: Content initialized", {
			size: dataCopy.byteLength,
			type: content.constructor.name,
		});

		return true;
	}, [content]);

	const cleanup = useCallback(() => {
		console.log("PdfRenderer: Cleaning up...");

		toolbarListenersRef.current.forEach((removeListener) => removeListener());
		toolbarListenersRef.current = [];

		if (loadingTaskRef.current) {
			loadingTaskRef.current
				.destroy()
				.catch((err) =>
					console.warn("PdfRenderer: Error destroying loading task:", err),
				);
			loadingTaskRef.current = null;
		}

		if (pdfViewerRef.current) {
			try {
				const pdfDocument = pdfViewerRef.current.pdfDocument;
				if (pdfDocument) {
					pdfDocument
						.destroy()
						.catch((err) =>
							console.warn("PdfRenderer: Error destroying PDF document:", err),
						);
				}
			} catch (err) {
				console.warn("PdfRenderer: Error during viewer cleanup:", err);
			}
			pdfViewerRef.current = null;
		}

		eventBusRef.current = null;

		if (viewerRef.current) {
			viewerRef.current.innerHTML = "";
			viewerRef.current.removeAttribute("style");
			viewerRef.current.className = "pdf-renderer-viewer";
		}
		if (toolbarRef.current) {
			const pageNumber = toolbarRef.current.querySelector(
				"#pageNumber",
			) as HTMLInputElement;
			if (pageNumber) pageNumber.value = "1";
			const pageCount = toolbarRef.current.querySelector("#pageCount");
			if (pageCount) pageCount.textContent = "0";
		}
	}, []);

	useEffect(() => {
		if (!pdfRendererEnable) {
			setError("Enhanced PDF renderer is disabled");
			setIsLoading(false);
			return;
		}

		if (
			!containerRef.current ||
			!viewerContainerRef.current ||
			!viewerRef.current ||
			!toolbarRef.current
		) {
			console.log("PdfRenderer: Not all refs are ready");
			return;
		}

		let isMounted = true;

		const initPdfViewer = async () => {
			console.log("PdfRenderer: Initializing viewer...");

			if (!initializeContent()) {
				if (isMounted) {
					setError("Invalid or empty PDF content");
					setIsLoading(false);
				}
				return;
			}

			if (isMounted) {
				setIsLoading(true);
				setError(null);
			}

			cleanup();

			try {
				const eventBus = new EventBus();
				const linkService = new PDFLinkService({ eventBus });
				const findController = new PDFFindController({ eventBus, linkService });
				const viewerOptions = {
					container: viewerContainerRef.current!,
					viewer: viewerRef.current!,
					eventBus,
					linkService,
					findController,
					textLayerMode: pdfRendererTextSelection ? 2 : 0,
					...(pdfRendererAnnotations && { renderInteractiveForms: true }),
				};
				// Use simpler configuration similar to the working old version
				const viewer = new PDFViewer(viewerOptions as any);

				pdfViewerRef.current = viewer;
				eventBusRef.current = eventBus;
				linkService.setViewer(viewer);

				console.log("PdfRenderer: Loading PDF document...");
				const loadingTask = pdfjs.getDocument({
					data: pdfContentRef.current?.uint8Data,
					cMapUrl: import.meta.env.PROD ? "/texlyre/cmaps/" : "/cmaps/",
					cMapPacked: true,
				});
				loadingTaskRef.current = loadingTask;

				const pdfDocument = await loadingTask.promise;
				console.log(
					"PdfRenderer: PDF document loaded, pages:",
					pdfDocument.numPages,
				);

				if (!isMounted) return;

				await viewer.setDocument(pdfDocument);
				linkService.setDocument(pdfDocument);

				const initialZoom = Number.parseInt(pdfRendererInitialZoom) / 100;
				viewer.currentScale = initialZoom;

				setupToolbar(eventBus, linkService, viewer);

				if (isMounted) {
					setIsLoading(false);
				}
			} catch (err) {
				if (isMounted) {
					console.error("PdfRenderer: Error loading PDF:", err);
					setError(`Failed to load PDF document: ${err.message || err}`);
					setIsLoading(false);
				}
			}
		};

		initPdfViewer();

		return () => {
			isMounted = false;
			cleanup();
		};
	}, [
		content,
		cleanup,
		initializeContent,
		pdfRendererEnable,
		pdfRendererInitialZoom,
		pdfRendererTextSelection,
		pdfRendererAnnotations,
	]);

	const setupToolbar = (
		eventBus: EventBus,
		linkService: PDFLinkService,
		viewer: PDFViewer,
	) => {
		if (!toolbarRef.current) return;

		const toolbar = toolbarRef.current;

		const addListener = (
			element: Element | null,
			event: string,
			handler: EventListener,
		) => {
			if (element) {
				element.addEventListener(event, handler);
				toolbarListenersRef.current.push(() =>
					element.removeEventListener(event, handler),
				);
			}
		};

		addListener(toolbar.querySelector("#prevPage"), "click", () => {
			eventBus.dispatch("previouspage", { source: viewer });
		});

		addListener(toolbar.querySelector("#nextPage"), "click", () => {
			eventBus.dispatch("nextpage", { source: viewer });
		});

		const pageNumber = toolbar.querySelector("#pageNumber") as HTMLInputElement;
		if (pageNumber) {
			const pageNumberHandler = function (this: HTMLInputElement) {
				const val = Number.parseInt(this.value);
				if (val && !Number.isNaN(val) && val > 0 && val <= viewer.pagesCount) {
					linkService.page = val;
				} else {
					this.value = linkService.page.toString();
				}
			};
			addListener(pageNumber, "change", pageNumberHandler);

			const pageChangeHandler = (evt: any) => {
				pageNumber.value = evt.pageNumber.toString();
			};
			eventBus.on("pagechanging", pageChangeHandler);
			toolbarListenersRef.current.push(() =>
				eventBus.off("pagechanging", pageChangeHandler),
			);
		}

		const pageCount = toolbar.querySelector("#pageCount");
		if (pageCount) {
			const pagesLoadedHandler = (evt: any) => {
				pageCount.textContent = evt.pagesCount.toString();
			};
			eventBus.on("pagesloaded", pagesLoadedHandler);
			toolbarListenersRef.current.push(() =>
				eventBus.off("pagesloaded", pagesLoadedHandler),
			);
		}

		addListener(toolbar.querySelector("#zoomIn"), "click", () => {
			viewer.increaseScale();
		});

		addListener(toolbar.querySelector("#zoomOut"), "click", () => {
			viewer.decreaseScale();
		});

		const exportButton = toolbar.querySelector("#exportButton");
		if (exportButton) {
			addListener(exportButton, "click", () => {
				console.log("PdfRenderer: Export button clicked");

				if (onDownload && fileName) {
					console.log("PdfRenderer: Using custom export handler");
					onDownload(fileName);
				} else {
					const contentToExport =
						originalContentRef.current || pdfContentRef.current?.data;

					if (contentToExport) {
						console.log("PdfRenderer: Exporting PDF", {
							size: contentToExport.byteLength,
							fileName: fileName || "document.pdf",
							source: originalContentRef.current ? "original" : "processed",
						});

						const blob = new Blob([contentToExport], {
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
					} else {
						console.error(
							"PdfRenderer: No valid PDF content available for export",
						);
						setError("Cannot export: PDF content is not available");
					}
				}
			});
		}
	};

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
			<div className="pdf-toolbar" ref={toolbarRef}>
				<div className="toolbar">
					<div id="toolbarLeft">
						<div className="toolbarButtonGroup">
							<button
								id="prevPage"
								className="toolbarButton"
								title="Previous Page"
							>
								<ChevronLeftIcon />
							</button>
							<button id="nextPage" className="toolbarButton" title="Next Page">
								<ChevronRightIcon />
							</button>
						</div>
						<div className="toolbarButtonGroup">
							<div className="pageNumber">
								<input id="pageNumber" type="number" className="toolbarField" />
								<span>/</span>
								<span id="pageCount">0</span>
							</div>
						</div>
						<div className="toolbarButtonGroup">
							<button id="zoomOut" className="toolbarButton" title="Zoom Out">
								<ZoomOutIcon />
							</button>
							<button id="zoomIn" className="toolbarButton" title="Zoom In">
								<ZoomInIcon />
							</button>
						</div>
						<div className="toolbarButtonGroup">
							<button
								id="exportButton"
								className="toolbarButton"
								title="Download"
							>
								<DownloadIcon />
							</button>
						</div>
					</div>
				</div>
			</div>

			<div className="pdf-renderer-content" ref={viewerContainerRef}>
				<div className="pdf-renderer-viewer" ref={viewerRef} />
			</div>

			{isLoading && (
				<div className="pdf-renderer-loading">Loading PDF document...</div>
			)}

			{error && <div className="pdf-renderer-error">{error}</div>}
		</div>
	);
};

export default PdfRenderer;
