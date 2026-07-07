import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
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
	applyFitScale: (mode: 'fit-width' | 'fit-height') => number | null;
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

const MAX_CANVAS_PIXELS = 2 ** 24;
const SCALE_DEBOUNCE_MS = 120;

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
	root?.querySelectorAll('.pdf-page-highlight').forEach((element) => {
		element.remove();
	});
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
		const scrollCorrectionPageRef = useRef<number | null>(null);
		const scaleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

		const scrollToPageDom = useCallback((page: number): void => {
			const container = containerRef.current;
			const pageDiv = getPageDiv(pdfViewerRef.current, page);
			if (!container || !pageDiv) return;

			const delta =
				pageDiv.getBoundingClientRect().top -
				container.getBoundingClientRect().top -
				8;

			if (Math.abs(delta) > 1) container.scrollTop += delta;
		}, []);

		const isViewerReady = useCallback(
			(): boolean =>
				Boolean(pdfViewerRef.current) &&
				readyRef.current &&
				getPagesCount(pdfViewerRef.current, pdfDocument) >= 1,
			[pdfDocument],
		);

		const cancelScaleDebounce = useCallback((): void => {
			if (scaleDebounceRef.current) {
				clearTimeout(scaleDebounceRef.current);
				scaleDebounceRef.current = null;
			}
		}, []);

		const setViewerPage = useCallback(
			(page: unknown): void => {
				const pdfViewer = pdfViewerRef.current;
				const count =
					getPagesCount(pdfViewer, pdfDocument) || pdfDocument?.numPages || 1;
				const target = toPageNumber(page, count);

				if (!isViewerReady()) {
					pendingPageRef.current = target;
					return;
				}

				pendingPageRef.current = null;

				try {
					if (
						scrollView &&
						typeof pdfViewer.scrollPageIntoView === 'function'
					) {
						scrollCorrectionPageRef.current = target;
						pdfViewer.scrollPageIntoView({ pageNumber: target });
						requestAnimationFrame(() => {
							scrollToPageDom(target);
							requestAnimationFrame(() => scrollToPageDom(target));
						});
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
			},
			[pdfDocument, isViewerReady, scrollToPageDom, scrollView],
		);

		const setViewerScale = useCallback(
			(nextScale: unknown): void => {
				const scaleNumber = toNumber(nextScale, 1);

				if (!isViewerReady()) {
					pendingScaleRef.current = scaleNumber;
					return;
				}

				pendingScaleRef.current = null;
				scrollCorrectionPageRef.current = null;

				cancelScaleDebounce();

				scaleDebounceRef.current = setTimeout(() => {
					scaleDebounceRef.current = null;
					const pdfViewer = pdfViewerRef.current;
					if (!pdfViewer || !readyRef.current) return;

					if (toNumber(pdfViewer.currentScale, 0) !== scaleNumber) {
						pdfViewer.currentScale = scaleNumber;
					}

					renderHighlight(pdfViewer, propsRef.current.highlight);
				}, SCALE_DEBOUNCE_MS);
			},
			[cancelScaleDebounce, isViewerReady],
		);

		useImperativeHandle(
			ref,
			() => ({
				goToPage: (page: number) => setViewerPage(page),
				setScale: (nextScale: number) => setViewerScale(nextScale),
				applyFitScale: (mode: 'fit-width' | 'fit-height') => {
					const pdfViewer = pdfViewerRef.current;
					if (!isViewerReady()) return null;

					cancelScaleDebounce();
					scrollCorrectionPageRef.current = null;
					pdfViewer.currentScaleValue =
						mode === 'fit-width' ? 'page-width' : 'page-height';

					const resolved = toNumber(pdfViewer.currentScale, 1);
					renderHighlight(pdfViewer, propsRef.current.highlight);
					return resolved;
				},
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
			[setViewerPage, setViewerScale, isViewerReady, cancelScaleDebounce],
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
			scrollCorrectionPageRef.current = null;
			cancelScaleDebounce();
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
					maxCanvasPixels: MAX_CANVAS_PIXELS,
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

						if (scrollCorrectionPageRef.current === pageNumber) {
							scrollCorrectionPageRef.current = null;
							scrollToPageDom(pageNumber);
						}

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

						if (
							scrollCorrectionPageRef.current !== null &&
							pageNumber !== scrollCorrectionPageRef.current
						) {
							scrollCorrectionPageRef.current = null;
						}

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
				scrollCorrectionPageRef.current = null;
				cancelScaleDebounce();
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
		}, [
			pdfDocument,
			scrollView,
			textSelection,
			annotations,
			cancelScaleDebounce,
			setViewerPage,
			scrollToPageDom,
		]);

		useEffect(() => {
			const pdfViewer = pdfViewerRef.current;
			if (!pdfViewer) return;
			setViewerScale(scale);
			renderHighlight(pdfViewer, highlight);
		}, [scale, highlight, setViewerScale]);

		useEffect(() => {
			const pdfViewer = pdfViewerRef.current;
			if (!pdfViewer || internalPageChangeRef.current) return;
			if (
				readyRef.current &&
				toPageNumber(
					pdfViewer.currentPageNumber,
					getPagesCount(pdfViewer, pdfDocument),
				) === currentPage
			) {
				return;
			}
			setViewerPage(currentPage);
		}, [currentPage, pdfDocument, setViewerPage]);

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
