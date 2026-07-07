// extras/renderers/pdf/PdfJsFullViewer.tsx
import type React from 'react';
import { useEffect, useRef } from 'react';
import {
	EventBus,
	PDFViewer,
	PDFLinkService,
	PDFFindController,
} from 'pdfjs-dist/web/pdf_viewer.mjs';
import 'pdfjs-dist/web/pdf_viewer.css';

import { type  LatexPdfInteractionManager , createLatexPdfInteractionManager } from './latexInteraction';

type Props = {
	pdfDocument: any;
	scale: number;
	currentPage: number;
	onDocumentReady: (numPages: number) => void;
	onPageChange: (page: number) => void;
	onError: (error: Error) => void;
};

export const PdfJsFullViewer: React.FC<Props> = ({
	pdfDocument,
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

	const onDocumentReadyRef = useRef(onDocumentReady);
	const onPageChangeRef = useRef(onPageChange);
	const onErrorRef = useRef(onError);

	useEffect(() => {
		scaleRef.current = scale;
	}, [scale]);

	useEffect(() => {
		currentPageRef.current = currentPage;
	}, [currentPage]);

	useEffect(() => {
		onDocumentReadyRef.current = onDocumentReady;
	}, [onDocumentReady]);

	useEffect(() => {
		onPageChangeRef.current = onPageChange;
	}, [onPageChange]);

	useEffect(() => {
		onErrorRef.current = onError;
	}, [onError]);

	useEffect(() => {
		let cancelled = false;

		const container = containerRef.current;
		const viewerElement = viewerRef.current;

		if (!container || !viewerElement) return;

		const startLatexInteractions = () => {
			if (cancelled || interactionStartedRef.current || !pdfViewerRef.current) {
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
				onDocumentReadyRef.current(pagesCount);
				startLatexInteractions();
			});

			eventBus.on('annotationlayerrendered', startLatexInteractions);
			eventBus.on('pagerendered', startLatexInteractions);

			eventBus.on('pagechanging', ({ pageNumber }: { pageNumber: number }) => {
				if (cancelled) return;

				internalPageChangeRef.current = true;
				onPageChangeRef.current(pageNumber);

				requestAnimationFrame(() => {
					internalPageChangeRef.current = false;
				});
			});

			linkService.setDocument(pdfDocument, null);
			pdfViewer.setDocument(pdfDocument);
		} catch (error) {
			if (!cancelled) {
				onErrorRef.current(
					error instanceof Error ? error : new Error(String(error)),
				);
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

			pdfViewerRef.current = null;
		};
	}, [pdfDocument]);

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
