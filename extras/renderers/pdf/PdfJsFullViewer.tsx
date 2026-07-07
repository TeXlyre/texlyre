// extras/renderers/pdf/PdfJsFullViewer.tsx
import type React from 'react';
import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
} from 'react';
import {
	EventBus,
	PDFLinkService,
	PDFFindController,
	PDFViewer,
	PDFSinglePageViewer,
} from 'pdfjs-dist/web/pdf_viewer.mjs';
import 'pdfjs-dist/web/pdf_viewer.css';

import {
	type LatexPdfInteractionManager,
	createLatexPdfInteractionManager,
} from './latexInteraction';

type Highlight = {
	page: number;
	rects: Array<{ x: number; y: number; width: number; height: number }>;
} | null;

type PageSize = { width: number; height: number };

type Props = {
	pdfDocument: any;
	scale: number;
	currentPage: number;
	scrollView: boolean;
	textSelection: boolean;
	annotations: boolean;
	highlight: Highlight;
	onDocumentReady: (numPages: number) => void;
	onPageChange: (page: number) => void;
	onPageSize: (page: number, size: PageSize) => void;
	onLocationClick?: (page: number, x: number, y: number) => void;
	onError: (error: Error) => void;
};

export type PdfJsFullViewerHandle = {
	goToPage: (page: number) => void;
	setScale: (scale: number) => void;
	getPageSize: (page: number) => PageSize | null;
	getScrollTop: () => number;
	setScrollTop: (scrollTop: number) => void;
	refresh: () => void;
};

const TEXT_LAYER_MODE = {
	disabled: 0,
	enabled: 1,
} as const;

const ANNOTATION_MODE = {
	disabled: 0,
	enabled: 2,
} as const;

const toNumber = (value: unknown, fallback = 1): number => {
	const n = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(n) ? n : fallback;
};

const toPageNumber = (value: unknown, pagesCount: number): number => {
	const max = Math.max(1, Math.trunc(toNumber(pagesCount, 1)));
	const page = Math.trunc(toNumber(value, 1));
	return Math.max(1, Math.min(max, page));
};

const getPagesCount = (pdfViewer: any, pdfDocument: any): number =>
	Math.trunc(toNumber(pdfViewer?.pagesCount || pdfDocument?.numPages, 0));

function getPageDiv(pdfViewer: any, page: number): HTMLElement | null {
	return (
		(pdfViewer?._pages?.[page - 1]?.div as HTMLElement | undefined) ||
		(pdfViewer?.viewer?.querySelector?.(
			`.page[data-page-number="${page}"]`,
		) as HTMLElement | null) ||
		null
	);
}

function clearHighlight(root: HTMLElement | null): void {
	root
		?.querySelectorAll('.pdf-page-highlight')
		.forEach((element) => element.remove());
}

function renderHighlight(pdfViewer: any, highlight: Highlight): void {
	const root = pdfViewer?.viewer as HTMLElement | undefined;
	clearHighlight(root || null);
	if (!root || !highlight) return;

	const pageView = pdfViewer?._pages?.[highlight.page - 1];
	const pageDiv = getPageDiv(pdfViewer, highlight.page);
	const viewport = pageView?.viewport;
	if (!pageDiv || !viewport) return;

	for (const rect of highlight.rects) {
		const el = document.createElement('div');
		el.className = 'pdf-page-highlight';
		el.style.left = `${rect.x * viewport.scale}px`;
		el.style.top = `${rect.y * viewport.scale}px`;
		el.style.width = `${Math.max(rect.width, 0) * viewport.scale}px`;
		el.style.height = `${Math.max(rect.height, 1) * viewport.scale}px`;
		pageDiv.appendChild(el);
	}
}

export const PdfJsFullViewer = forwardRef<PdfJsFullViewerHandle, Props>(
	(
		{
			pdfDocument,
			scale,
			currentPage,
			scrollView,
			textSelection,
			annotations,
			highlight,
			onDocumentReady,
			onPageChange,
			onPageSize,
			onLocationClick,
			onError,
		},
		ref,
	) => {
		const containerRef = useRef<HTMLDivElement>(null);
		const viewerRef = useRef<HTMLDivElement>(null);
		const pdfViewerRef = useRef<any>(null);
		const linkServiceRef = useRef<any>(null);
		const interactionManagerRef = useRef<LatexPdfInteractionManager | null>(
			null,
		);
		const internalPageChangeRef = useRef(false);
		const interactionStartedRef = useRef(false);
		const readyRef = useRef(false);
		const pendingPageRef = useRef<number | null>(null);
		const pendingScaleRef = useRef<number | null>(null);
		const pageSizesRef = useRef<Map<number, PageSize>>(new Map());

		const propsRef = useRef({
			scale,
			currentPage,
			highlight,
			onDocumentReady,
			onPageChange,
			onPageSize,
			onLocationClick,
			onError,
		});

		useEffect(() => {
			propsRef.current = {
				scale,
				currentPage,
				highlight,
				onDocumentReady,
				onPageChange,
				onPageSize,
				onLocationClick,
				onError,
			};
		}, [
			scale,
			currentPage,
			highlight,
			onDocumentReady,
			onPageChange,
			onPageSize,
			onLocationClick,
			onError,
		]);

		const viewerKey = useMemo(
			() =>
				`${scrollView ? 'scroll' : 'single'}-${textSelection}-${annotations}`,
			[scrollView, textSelection, annotations],
		);

		const scrollToPageDom = (page: number): void => {
			const container = containerRef.current;
			const pageDiv = getPageDiv(pdfViewerRef.current, page);
			if (!container || !pageDiv) return;

			const containerRect = container.getBoundingClientRect();
			const pageRect = pageDiv.getBoundingClientRect();
			container.scrollTop += pageRect.top - containerRect.top - 8;
		};

		const setViewerPage = (page: unknown): void => {
			const pdfViewer = pdfViewerRef.current;
			const count =
				getPagesCount(pdfViewer, pdfDocument) || pdfDocument?.numPages || 1;
			const target = toPageNumber(page, count);

			if (
				!pdfViewer ||
				!readyRef.current ||
				getPagesCount(pdfViewer, pdfDocument) < 1
			) {
				pendingPageRef.current = target;
				return;
			}

			pendingPageRef.current = null;

			try {
				if (scrollView && typeof pdfViewer.scrollPageIntoView === 'function') {
					pdfViewer.scrollPageIntoView({ pageNumber: target });
					requestAnimationFrame(() => scrollToPageDom(target));
				} else {
					pdfViewer.currentPageNumber = target;
				}
			} catch {
				scrollToPageDom(target);
				try {
					pdfViewer.currentPageNumber = target;
				} catch {
					// Ignore best-effort page state sync failures.
				}
			}
		};

		const setViewerScale = (nextScale: unknown): void => {
			const pdfViewer = pdfViewerRef.current;
			const scaleNumber = toNumber(nextScale, 1);

			if (
				!pdfViewer ||
				!readyRef.current ||
				getPagesCount(pdfViewer, pdfDocument) < 1
			) {
				pendingScaleRef.current = scaleNumber;
				return;
			}

			pendingScaleRef.current = null;
			pdfViewer.currentScale = scaleNumber;
			renderHighlight(pdfViewer, propsRef.current.highlight);
		};

		useImperativeHandle(
			ref,
			() => ({
				goToPage: (page: number) => setViewerPage(page),
				setScale: (nextScale: number) => setViewerScale(nextScale),
				getPageSize: (page: number) => pageSizesRef.current.get(page) || null,
				getScrollTop: () => containerRef.current?.scrollTop || 0,
				setScrollTop: (scrollTop: number) => {
					if (containerRef.current) containerRef.current.scrollTop = scrollTop;
				},
				refresh: () => {
					const pdfViewer = pdfViewerRef.current;
					pdfViewer?.refresh?.();
					pdfViewer?.update?.();
					renderHighlight(pdfViewer, propsRef.current.highlight);
				},
			}),
			[pdfDocument],
		);

		useEffect(() => {
			let cancelled = false;
			const container = containerRef.current;
			const viewerElement = viewerRef.current;
			if (!container || !viewerElement) return;

			pageSizesRef.current.clear();
			readyRef.current = false;
			pendingPageRef.current = toPageNumber(
				propsRef.current.currentPage,
				pdfDocument?.numPages || 1,
			);
			pendingScaleRef.current = propsRef.current.scale;
			interactionStartedRef.current = false;
			interactionManagerRef.current?.dispose();
			interactionManagerRef.current = null;

			const startLatexInteractions = () => {
				if (
					cancelled ||
					interactionStartedRef.current ||
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
					console.warn(
						'[PdfJsFullViewer] LaTeX PDF interactions failed:',
						error,
					);
				});
			};

			const collectPageSize = (pageNumber: number) => {
				const pageView = pdfViewerRef.current?._pages?.[pageNumber - 1];
				const pdfPage = pageView?.pdfPage;
				if (!pdfPage?.getViewport) return;

				const viewport = pdfPage.getViewport({ scale: 1 });
				const size = { width: viewport.width, height: viewport.height };
				pageSizesRef.current.set(pageNumber, size);
				propsRef.current.onPageSize(pageNumber, size);
			};

			try {
				const eventBus = new EventBus();
				const linkService = new PDFLinkService({ eventBus });
				const findController = new PDFFindController({ eventBus, linkService });
				const ViewerClass = scrollView ? PDFViewer : PDFSinglePageViewer;

				const pdfViewer = new ViewerClass({
					container,
					viewer: viewerElement,
					eventBus,
					linkService,
					findController,
					textLayerMode: textSelection
						? TEXT_LAYER_MODE.enabled
						: TEXT_LAYER_MODE.disabled,
					annotationMode: annotations
						? ANNOTATION_MODE.enabled
						: ANNOTATION_MODE.disabled,
				});

				pdfViewerRef.current = pdfViewer;
				linkServiceRef.current = linkService;
				linkService.setViewer(pdfViewer);

				eventBus.on('pagesinit', () => {
					if (cancelled) return;
					readyRef.current = true;

					const count =
						getPagesCount(pdfViewer, pdfDocument) || pdfDocument.numPages || 1;
					const target = toPageNumber(
						pendingPageRef.current ?? propsRef.current.currentPage,
						count,
					);
					pendingPageRef.current = null;

					pdfViewer.currentScale = toNumber(
						pendingScaleRef.current ?? propsRef.current.scale,
						1,
					);

					requestAnimationFrame(() => {
						if (!cancelled) setViewerPage(target);
					});
				});

				eventBus.on('pagesloaded', ({ pagesCount }: { pagesCount: number }) => {
					if (cancelled) return;

					const count = getPagesCount(pdfViewer, pdfDocument) || pagesCount;
					propsRef.current.onDocumentReady(count);

					for (let page = 1; page <= count; page++) collectPageSize(page);
					requestAnimationFrame(() =>
						renderHighlight(pdfViewer, propsRef.current.highlight),
					);
					startLatexInteractions();
				});

				eventBus.on(
					'pagerendered',
					({ pageNumber }: { pageNumber: number }) => {
						if (cancelled) return;
						collectPageSize(pageNumber);
						renderHighlight(pdfViewer, propsRef.current.highlight);
						startLatexInteractions();
					},
				);

				eventBus.on('textlayerrendered', () => {
					if (cancelled) return;
					renderHighlight(pdfViewer, propsRef.current.highlight);
				});

				eventBus.on('annotationlayerrendered', startLatexInteractions);

				eventBus.on(
					'pagechanging',
					({ pageNumber }: { pageNumber: number }) => {
						if (cancelled) return;
						internalPageChangeRef.current = true;
						propsRef.current.onPageChange(
							toPageNumber(pageNumber, getPagesCount(pdfViewer, pdfDocument)),
						);
						requestAnimationFrame(() => {
							internalPageChangeRef.current = false;
						});
					},
				);

				eventBus.on(
					'updateviewarea',
					({ pageNumber }: { pageNumber?: number }) => {
						if (cancelled || internalPageChangeRef.current || !pageNumber)
							return;
						propsRef.current.onPageChange(
							toPageNumber(pageNumber, getPagesCount(pdfViewer, pdfDocument)),
						);
					},
				);

				linkService.setDocument(pdfDocument, null);
				pdfViewer.setDocument(pdfDocument);
			} catch (error) {
				if (!cancelled) {
					propsRef.current.onError(
						error instanceof Error ? error : new Error(String(error)),
					);
				}
			}

			return () => {
				cancelled = true;
				readyRef.current = false;
				interactionStartedRef.current = false;
				interactionManagerRef.current?.dispose();
				interactionManagerRef.current = null;
				clearHighlight(viewerElement);

				try {
					pdfViewerRef.current?.setDocument?.(null);
				} catch {
					// Best-effort PDF.js cleanup.
				}

				pdfViewerRef.current = null;
				linkServiceRef.current = null;
			};
		}, [pdfDocument, viewerKey, scrollView, textSelection, annotations]);

		useEffect(() => {
			const pdfViewer = pdfViewerRef.current;
			if (!pdfViewer) return;
			setViewerScale(scale);
			renderHighlight(pdfViewer, highlight);
		}, [scale, highlight]);

		useEffect(() => {
			const pdfViewer = pdfViewerRef.current;
			if (!pdfViewer || internalPageChangeRef.current) return;
			setViewerPage(currentPage);
		}, [currentPage, pdfDocument]);

		useEffect(() => {
			const container = containerRef.current;
			if (!container || !onLocationClick) return;

			const onClick = (event: MouseEvent) => {
				const target = event.target as HTMLElement | null;
				if (!target) return;
				if (
					target.closest('a, button, input, textarea, select, [role="button"]')
				) {
					return;
				}

				const pageEl = target.closest(
					'.page[data-page-number]',
				) as HTMLElement | null;
				if (!pageEl) return;

				const page = Number(pageEl.dataset.pageNumber);
				const canvas = pageEl.querySelector(
					'canvas',
				) as HTMLCanvasElement | null;
				const size = pageSizesRef.current.get(page);
				if (!canvas || !size) return;

				const rect = canvas.getBoundingClientRect();
				if (rect.width <= 0 || rect.height <= 0) return;

				onLocationClick(
					page,
					((event.clientX - rect.left) / rect.width) * size.width,
					((event.clientY - rect.top) / rect.height) * size.height,
				);
			};

			container.addEventListener('click', onClick, true);
			return () => container.removeEventListener('click', onClick, true);
		}, [onLocationClick]);

		return (
			<div className='pdf-full-viewer-container' ref={containerRef}>
				<div className='pdfViewer' ref={viewerRef} />
			</div>
		);
	},
);

PdfJsFullViewer.displayName = 'PdfJsFullViewer';
