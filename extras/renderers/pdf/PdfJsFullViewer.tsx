import type React from 'react';
import { useEffect, useRef } from 'react';
import { pdfjs } from 'react-pdf';

// pdfjs-dist web viewer typings are incomplete/inconsistent across builds.
import {
	EventBus,
	PDFViewer,
	PDFLinkService,
	PDFFindController,
} from 'pdfjs-dist/web/pdf_viewer.mjs';

import 'pdfjs-dist/web/pdf_viewer.css';

import { createLatexPdfInteractionManager } from './latexInteraction';
import type { LatexPdfInteractionManager } from './latexInteraction';

const BASE_PATH = __BASE_PATH__;

type Props = {
	pdfData: Uint8Array;
	scale: number;
	currentPage: number;
	onDocumentReady: (numPages: number) => void;
	onPageChange: (page: number) => void;
	onError: (error: Error) => void;
};

export const PdfJsFullViewer: React.FC<Props> = ({
	pdfData,
	scale,
	currentPage,
	onDocumentReady,
	onPageChange,
	onError,
}) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const viewerRef = useRef<HTMLDivElement>(null);
	const pdfViewerRef = useRef<any>(null);
	const interactionManagerRef = useRef<LatexPdfInteractionManager | null>(null);
	const internalPageChangeRef = useRef(false);
	const interactionStartedRef = useRef(false);
	const scaleRef = useRef(scale);
	const currentPageRef = useRef(currentPage);

	useEffect(() => {
		scaleRef.current = scale;
	}, [scale]);

	useEffect(() => {
		currentPageRef.current = currentPage;
	}, [currentPage]);

	useEffect(() => {
		let cancelled = false;
		let loadingTask: any = null;
		let pdfDocument: any = null;

		const startLatexInteractions = () => {
			if (
				cancelled ||
				interactionStartedRef.current ||
				!pdfDocument ||
				!pdfViewerRef.current
			) {
				return;
			}

			interactionStartedRef.current = true;
			interactionManagerRef.current = createLatexPdfInteractionManager(
				pdfViewerRef.current,
				pdfDocument,
				{
					onInstalled: (adapterNames) => {
						console.info(
							'[PdfJsFullViewer] LaTeX PDF interaction adapters installed:',
							adapterNames,
						);
					},
					onWarning: (message, detail) => {
						console.warn(`[PdfJsFullViewer] ${message}`, detail);
					},
				},
			);

			interactionManagerRef.current.installWhenReady().catch((error) => {
				console.warn('[PdfJsFullViewer] LaTeX PDF interactions failed:', error);
			});
		};

		try {
			const container = containerRef.current;
			const viewerElement = viewerRef.current;

			if (!container || !viewerElement) return;

			const eventBus = new EventBus();
			const linkService = new PDFLinkService({ eventBus });
			const findController = new PDFFindController({ eventBus, linkService });

			const pdfViewer = new PDFViewer({
				container,
				viewer: viewerElement,
				eventBus,
				linkService,
				findController,
				textLayerMode: 1,
				annotationMode: 2,
			});

			pdfViewerRef.current = pdfViewer;
			linkService.setViewer(pdfViewer);

			eventBus.on('pagesinit', () => {
				if (cancelled) return;
				pdfViewer.currentScale = scaleRef.current;
				pdfViewer.currentPageNumber = currentPageRef.current;
			});

			eventBus.on('pagesloaded', ({ pagesCount }: { pagesCount: number }) => {
				if (cancelled) return;
				onDocumentReady(pagesCount);
				startLatexInteractions();
			});

			eventBus.on('annotationlayerrendered', startLatexInteractions);
			eventBus.on('pagerendered', startLatexInteractions);

			eventBus.on('pagechanging', ({ pageNumber }: { pageNumber: number }) => {
				if (cancelled) return;

				internalPageChangeRef.current = true;
				onPageChange(pageNumber);

				requestAnimationFrame(() => {
					internalPageChangeRef.current = false;
				});
			});

			loadingTask = pdfjs.getDocument({
				data: new Uint8Array(pdfData).slice(),
				cMapUrl: `${BASE_PATH}/assets/cmaps/`,
				cMapPacked: true,
				isEvalSupported: true,
				enableXfa: true,
			});

			loadingTask.promise
				.then((doc: any) => {
					if (cancelled) {
						doc.destroy?.();
						return;
					}

					pdfDocument = doc;
					pdfViewer.setDocument(pdfDocument);
					linkService.setDocument(pdfDocument, null);
				})
				.catch((error: Error) => {
					if (!cancelled) onError(error);
				});
		} catch (error) {
			if (!cancelled) {
				onError(error instanceof Error ? error : new Error(String(error)));
			}
		}

		return () => {
			cancelled = true;
			interactionStartedRef.current = false;
			interactionManagerRef.current?.dispose();
			interactionManagerRef.current = null;

			try {
				pdfViewerRef.current?.setDocument?.(null);
			} catch {}

			try {
				pdfDocument?.destroy?.();
			} catch {}

			try {
				loadingTask?.destroy?.();
			} catch {}

			pdfViewerRef.current = null;
		};
	}, [pdfData, onDocumentReady, onError, onPageChange]);

	useEffect(() => {
		const pdfViewer = pdfViewerRef.current;
		if (!pdfViewer) return;

		pdfViewer.currentScale = scale;
	}, [scale]);

	useEffect(() => {
		const pdfViewer = pdfViewerRef.current;
		if (!pdfViewer || internalPageChangeRef.current) return;

		if (
			Number.isFinite(currentPage) &&
			currentPage >= 1 &&
			currentPage <= pdfViewer.pagesCount
		) {
			pdfViewer.currentPageNumber = currentPage;
		}
	}, [currentPage]);

	return (
		<div
			className='pdf-full-viewer-container'
			ref={containerRef}
			style={{
				position: 'absolute',
				inset: 0,
				overflow: 'auto',
			}}
		>
			<div className='pdfViewer' ref={viewerRef} />
		</div>
	);
};
