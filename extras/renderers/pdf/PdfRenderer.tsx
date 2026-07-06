// extras/renderers/pdf/PdfRenderer.tsx
import { t } from '@/i18n';
import type React from 'react';
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useImperativeHandle,
} from 'react';
import { flushSync } from 'react-dom';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

import { PluginHeader } from '@/components/common/PluginHeader';
import { formatFileSize } from '@/utils/fileUtils';
import {
	ChevronLeftIcon,
	ChevronRightIcon,
	DownloadIcon,
	PageIcon,
	ScrollIcon,
	FitToWidthIcon,
	FitToHeightIcon,
	ZoomInIcon,
	ZoomOutIcon,
	ExpandIcon,
	MinimizeIcon,
} from '@/components/common/Icons';
import { getPdfRendererSettings } from './settings';
import { useSettings } from '@/hooks/useSettings';
import { useProperties } from '@/hooks/useProperties';
import type { RendererProps } from '@/plugins/PluginInterface';
import { PdfJsFullViewer } from './PdfJsFullViewer';
import { detectLatexInteractivePdf } from './latexInteraction';
import './styles.css';

const BASE_PATH = __BASE_PATH__;

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
	'pdfjs-dist/build/pdf.worker.min.mjs',
	import.meta.url,
).toString();

type Range = { start: number; end: number };

const DEFAULT_WIDTH = 595;
const DEFAULT_HEIGHT = 842;
const PAGE_GAP = 20;
const BUFFER_PAGES = 2;
const MIN_SCALE = 0.25;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.25;
const PAGE_SYNC_SUPPRESS_MS = 180;

const clamp = (value: number, min: number, max: number) =>
	Math.max(min, Math.min(max, value));

const getContentHash = (buffer: ArrayBuffer): string => {
	const view = new Uint8Array(buffer);
	const start = Array.from(view.slice(0, Math.min(32, view.length))).join(',');
	const end = Array.from(view.slice(Math.max(0, view.length - 32))).join(',');

	return `${buffer.byteLength}-${start}-${end}`;
};

const pageHeightFor = (
	heights: Map<number, number>,
	page: number,
	scale: number,
) => (heights.get(page) || DEFAULT_HEIGHT) * scale + PAGE_GAP;

const pageTopFor = (
	heights: Map<number, number>,
	page: number,
	scale: number,
) => {
	let top = 0;

	for (let i = 1; i < page; i++) {
		top += pageHeightFor(heights, i, scale);
	}

	return top;
};

const totalHeightFor = (
	heights: Map<number, number>,
	numPages: number,
	scale: number,
) => {
	let total = 0;

	for (let page = 1; page <= numPages; page++) {
		total += pageHeightFor(heights, page, scale);
	}

	return total;
};

const rangeFor = (
	heights: Map<number, number>,
	numPages: number,
	scrollTop: number,
	viewportHeight: number,
	scale: number,
): Range => {
	if (numPages <= 0) return { start: 1, end: 1 };

	const scrollBottom = scrollTop + viewportHeight;
	let top = 0;
	let start = 1;
	let end = 1;
	let foundStart = false;

	for (let page = 1; page <= numPages; page++) {
		const bottom = top + pageHeightFor(heights, page, scale);

		if (!foundStart && bottom > scrollTop) {
			start = Math.max(1, page - BUFFER_PAGES);
			foundStart = true;
		}

		if (top < scrollBottom) {
			end = Math.min(numPages, page + BUFFER_PAGES);
		}

		top = bottom;

		if (foundStart && top > scrollBottom) break;
	}

	return { start, end };
};

const pageAtOffsetFor = (
	heights: Map<number, number>,
	numPages: number,
	offset: number,
	scale: number,
) => {
	let top = 0;

	for (let page = 1; page <= numPages; page++) {
		const bottom = top + pageHeightFor(heights, page, scale);

		if (offset <= bottom || page === numPages) return page;

		top = bottom;
	}

	return 1;
};

async function detectInteractivePdf(pdfData: Uint8Array): Promise<boolean> {
	const loadingTask = pdfjs.getDocument({
		data: new Uint8Array(pdfData).slice(),
		cMapUrl: `${BASE_PATH}/assets/cmaps/`,
		cMapPacked: true,
		isEvalSupported: true,
		enableXfa: true,
	});

	let pdfDocument: any = null;

	try {
		pdfDocument = await loadingTask.promise;
		const detection = await detectLatexInteractivePdf(pdfDocument);

		return detection.interactive;
	} catch {
		return false;
	} finally {
		try {
			await pdfDocument?.destroy?.();
		} catch {}

		try {
			await loadingTask?.destroy?.();
		} catch {}
	}
}

const PdfRenderer: React.FC<RendererProps> = ({
	content,
	fileName,
	onDownload,
	controllerRef,
	onLocationClick,
	headerLabel,
	headerTitle,
}) => {
	const { getSetting } = useSettings();
	const { getProperty, setProperty, registerProperty } = useProperties();

	const pdfRendererEnable =
		(getSetting('pdf-renderer-enable')?.value as boolean) ?? true;
	const pdfRendererTextSelection =
		(getSetting('pdf-renderer-text-selection')?.value as boolean) ?? true;

	const [numPages, setNumPages] = useState(0);
	const [currentPage, setCurrentPage] = useState(1);
	const [pageInput, setPageInput] = useState('1');
	const [isEditingPageInput, setIsEditingPageInput] = useState(false);
	const [scale, setScale] = useState(1);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
	const [isInteractivePdf, setIsInteractivePdf] = useState(false);
	const [fullViewerFailed, setFullViewerFailed] = useState(false);
	const [scrollView, setScrollView] = useState(false);
	const [renderRange, setRenderRange] = useState<Range>({ start: 1, end: 1 });
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [fitMode, setFitMode] = useState<'fit-width' | 'fit-height'>(
		'fit-width',
	);
	const [highlight, setHighlight] = useState<{
		page: number;
		rects: Array<{ x: number; y: number; width: number; height: number }>;
	} | null>(null);

	const propertiesRegistered = useRef(false);
	const pageWidths = useRef<Map<number, number>>(new Map());
	const pageHeights = useRef<Map<number, number>>(new Map());
	const lastStablePageRef = useRef(1);
	const suppressPageSyncUntilRef = useRef(0);
	const contentHashRef = useRef('');
	const originalContentRef = useRef<ArrayBuffer | null>(null);
	const pendingRestorePageRef = useRef<number | null>(null);
	const pendingRestoreScrollTopRef = useRef<number | null>(null);

	const numPagesRef = useRef(0);
	const scaleRef = useRef(1);
	const scrollViewRef = useRef(false);
	const pointerInsideRef = useRef(false);

	const containerRef = useRef<HTMLDivElement>(null);
	const contentElRef = useRef<HTMLDivElement>(null);
	const scrollContainerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		numPagesRef.current = numPages;
	}, [numPages]);

	useEffect(() => {
		scaleRef.current = scale;
	}, [scale]);

	useEffect(() => {
		scrollViewRef.current = scrollView;
	}, [scrollView]);

	const fileData = useMemo(() => {
		return pdfData ? { data: pdfData.slice() } : null;
	}, [pdfData]);

	const documentOptions = useMemo(
		() => ({
			cMapUrl: `${BASE_PATH}/assets/cmaps/`,
			cMapPacked: true,
			isEvalSupported: true,
			enableXfa: true,
		}),
		[],
	);

	const useFullPdfJsViewer = isInteractivePdf && !fullViewerFailed;

	const tooltipInfo = useMemo(() => {
		if (numPages <= 0) return undefined;

		const firstWidth = pageWidths.current.get(1);
		const firstHeight = pageHeights.current.get(1);
		const fileSize = originalContentRef.current?.byteLength ?? 0;

		return [
			t('Type: PDF'),
			t('MIME Type: {mimeType}', { mimeType: 'application/pdf' }),
			t('Pages: {count}', { count: numPages }),
			t('Dimensions: {width} × {height}', {
				width: firstWidth ?? '—',
				height: firstHeight ?? '—',
			}),
			t('Size: {size}', { size: formatFileSize(fileSize) }),
			useFullPdfJsViewer ? t('Interactive PDF mode') : t('Standard PDF mode'),
		];
	}, [numPages, useFullPdfJsViewer]);

	const suppressPageSync = useCallback(() => {
		suppressPageSyncUntilRef.current = Date.now() + PAGE_SYNC_SUPPRESS_MS;
	}, []);

	const setPage = useCallback(
		(page: number) => {
			const target = clamp(page, 1, numPagesRef.current || 1);

			lastStablePageRef.current = target;
			setCurrentPage(target);
			setPageInput(String(target));
			setProperty('pdf-renderer-current-page', target);
		},
		[setProperty],
	);

	const syncScroll = useCallback(
		(targetScale = scale) => {
			if (!scrollView || !scrollContainerRef.current || useFullPdfJsViewer)
				return;

			const container = scrollContainerRef.current;

			setRenderRange(
				rangeFor(
					pageHeights.current,
					numPages,
					container.scrollTop,
					container.clientHeight,
					targetScale,
				),
			);

			if (isEditingPageInput || Date.now() < suppressPageSyncUntilRef.current) {
				return;
			}

			const probeY =
				container.scrollTop + Math.min(80, container.clientHeight * 0.25);
			const page = pageAtOffsetFor(
				pageHeights.current,
				numPages,
				probeY,
				targetScale,
			);

			if (page !== lastStablePageRef.current) {
				setPage(page);
			}
		},
		[
			scrollView,
			numPages,
			scale,
			isEditingPageInput,
			setPage,
			useFullPdfJsViewer,
		],
	);

	const goToPage = useCallback(
		(page: number) => {
			const target = clamp(page, 1, numPages || 1);

			suppressPageSync();
			setPage(target);

			if (useFullPdfJsViewer || !scrollView || !scrollContainerRef.current)
				return;

			const container = scrollContainerRef.current;
			const top = pageTopFor(pageHeights.current, target, scale);

			container.scrollTop = top;
			setRenderRange(
				rangeFor(
					pageHeights.current,
					numPages,
					top,
					container.clientHeight,
					scale,
				),
			);
		},
		[
			numPages,
			scrollView,
			scale,
			setPage,
			suppressPageSync,
			useFullPdfJsViewer,
		],
	);

	const setPdfContent = useCallback((buffer: ArrayBuffer) => {
		if (!buffer || buffer.byteLength === 0) {
			setPdfData(null);
			setIsInteractivePdf(false);
			setFullViewerFailed(false);
			originalContentRef.current = null;
			contentHashRef.current = '';
			setError(t('No PDF content available'));
			setIsLoading(false);
			return;
		}

		try {
			const nextHash = getContentHash(buffer);
			if (contentHashRef.current === nextHash) return;

			const hadDocument = numPagesRef.current > 0;
			const keepPage = lastStablePageRef.current;
			const keepScrollTop = scrollContainerRef.current?.scrollTop ?? null;
			const dataCopy = new Uint8Array(new Uint8Array(buffer));

			pageWidths.current.clear();
			pageHeights.current.clear();

			originalContentRef.current = dataCopy.buffer.slice(0);
			contentHashRef.current = nextHash;
			pendingRestorePageRef.current = keepPage;
			pendingRestoreScrollTopRef.current = keepScrollTop;

			if (!hadDocument) setIsLoading(true);

			setPdfData(dataCopy);
			setIsInteractivePdf(false);
			setFullViewerFailed(false);
			setError(null);
		} catch (error) {
			console.error('Error creating PDF data:', error);
			setError(
				t('Failed to process PDF content: {error}', {
					error: error instanceof Error ? error.message : t('Unknown error'),
				}),
			);
			setIsLoading(false);
		}
	}, []);

	useImperativeHandle(
		controllerRef,
		() => ({
			updateContent: (nextContent: ArrayBuffer | string) => {
				setPdfContent(
					typeof nextContent === 'string'
						? new TextEncoder().encode(nextContent).buffer
						: nextContent,
				);
			},
			updatePdfContent: (nextContent: ArrayBuffer | string) => {
				setPdfContent(
					typeof nextContent === 'string'
						? new TextEncoder().encode(nextContent).buffer
						: nextContent,
				);
			},
			setHighlight: (nextHighlight) => {
				setHighlight(nextHighlight);

				if (nextHighlight) {
					document.dispatchEvent(
						new CustomEvent('pdf-renderer-navigate', {
							detail: { page: nextHighlight.page },
						}),
					);
				}
			},
		}),
		[setPdfContent],
	);

	useEffect(() => {
		if (propertiesRegistered.current) return;
		propertiesRegistered.current = true;

		registerProperty({
			id: 'pdf-renderer-zoom',
			category: 'UI',
			subcategory: 'PDF Viewer',
			defaultValue: 1,
		});

		registerProperty({
			id: 'pdf-renderer-scroll-view',
			category: 'UI',
			subcategory: 'PDF Viewer',
			defaultValue: false,
		});

		registerProperty({
			id: 'pdf-renderer-current-page',
			category: 'UI',
			subcategory: 'PDF Viewer',
			defaultValue: 1,
		});

		const storedZoom = getProperty('pdf-renderer-zoom');
		const storedScrollView = getProperty('pdf-renderer-scroll-view');
		const storedPage = getProperty('pdf-renderer-current-page');

		if (storedZoom !== undefined) {
			setScale(clamp(Number(storedZoom), MIN_SCALE, MAX_SCALE));
		}

		if (storedScrollView !== undefined) {
			setScrollView(Boolean(storedScrollView));
		}

		if (storedPage !== undefined && Number(storedPage) >= 1) {
			pendingRestorePageRef.current = Number(storedPage);
		}
	}, [registerProperty, getProperty]);

	useEffect(() => {
		if (content instanceof ArrayBuffer && content.byteLength > 0) {
			setPdfContent(content);
		}
	}, [content, setPdfContent]);

	useEffect(() => {
		if (!pdfData) return;

		let cancelled = false;

		detectInteractivePdf(pdfData).then((interactive) => {
			if (cancelled) return;
			setIsInteractivePdf(interactive);
		});

		return () => {
			cancelled = true;
		};
	}, [pdfData]);

	const handleDocumentReady = useCallback(
		(loadedNumPages: number) => {
			const pendingPage = pendingRestorePageRef.current;
			const restorePage = clamp(
				pendingPage || lastStablePageRef.current || 1,
				1,
				loadedNumPages || 1,
			);

			pendingRestorePageRef.current = null;
			numPagesRef.current = loadedNumPages;
			lastStablePageRef.current = restorePage;

			setNumPages(loadedNumPages);
			setCurrentPage(restorePage);
			if (!isEditingPageInput) setPageInput(String(restorePage));
			setIsLoading(false);
			setError(null);

			setRenderRange({
				start: Math.max(1, restorePage - BUFFER_PAGES),
				end: Math.min(loadedNumPages, restorePage + BUFFER_PAGES),
			});

			requestAnimationFrame(() => {
				if (
					useFullPdfJsViewer ||
					!scrollViewRef.current ||
					!scrollContainerRef.current
				) {
					return;
				}

				const container = scrollContainerRef.current;
				const fallbackTop = pageTopFor(
					pageHeights.current,
					restorePage,
					scaleRef.current,
				);
				const maxTop = Math.max(
					0,
					totalHeightFor(
						pageHeights.current,
						loadedNumPages,
						scaleRef.current,
					) - container.clientHeight,
				);
				const top = clamp(
					pendingRestoreScrollTopRef.current ?? fallbackTop,
					0,
					maxTop,
				);

				pendingRestoreScrollTopRef.current = null;
				suppressPageSync();
				container.scrollTop = top;

				setRenderRange(
					rangeFor(
						pageHeights.current,
						loadedNumPages,
						top,
						container.clientHeight,
						scaleRef.current,
					),
				);
			});
		},
		[isEditingPageInput, suppressPageSync, useFullPdfJsViewer],
	);

	const onDocumentLoadSuccess = useCallback(
		({ numPages: loadedNumPages }: { numPages: number }) => {
			handleDocumentReady(loadedNumPages);
		},
		[handleDocumentReady],
	);

	const onDocumentLoadError = useCallback((err: Error) => {
		setError(t('Failed to load PDF: {error}', { error: err.message }));
		setIsLoading(false);
	}, []);

	const onPageLoadSuccess = useCallback(
		(page: any) => {
			const pageNum = page.pageNumber;
			const viewport = page.getViewport({ scale: 1 });

			pageWidths.current.set(pageNum, viewport.width);
			pageHeights.current.set(pageNum, viewport.height);

			requestAnimationFrame(() => {
				syncScroll();
			});
		},
		[syncScroll],
	);

	const onFullViewerPageSize = useCallback(
		(page: number, width: number, height: number) => {
			pageWidths.current.set(page, width);
			pageHeights.current.set(page, height);
		},
		[],
	);

	useEffect(() => {
		if (!scrollView || !scrollContainerRef.current || useFullPdfJsViewer)
			return;

		const container = scrollContainerRef.current;
		let rafId = 0;

		const onScroll = () => {
			if (rafId) return;

			rafId = requestAnimationFrame(() => {
				rafId = 0;
				syncScroll();
			});
		};

		container.addEventListener('scroll', onScroll, { passive: true });
		syncScroll();

		return () => {
			container.removeEventListener('scroll', onScroll);
			cancelAnimationFrame(rafId);
		};
	}, [scrollView, syncScroll, useFullPdfJsViewer]);

	useEffect(() => {
		syncScroll();
	}, [syncScroll]);

	useEffect(() => {
		const handleNavigate = (event: Event) => {
			const page = Number((event as CustomEvent).detail?.page);

			if (!Number.isFinite(page) || page < 1 || page > numPagesRef.current) {
				return;
			}

			goToPage(page);
		};

		document.addEventListener('pdf-renderer-navigate', handleNavigate);

		return () => {
			document.removeEventListener('pdf-renderer-navigate', handleNavigate);
		};
	}, [goToPage]);

	const computeFitScale = useCallback((mode: 'fit-width' | 'fit-height') => {
		const container = scrollContainerRef.current || contentElRef.current;
		const width =
			pageWidths.current.get(lastStablePageRef.current) || DEFAULT_WIDTH;
		const height =
			pageHeights.current.get(lastStablePageRef.current) || DEFAULT_HEIGHT;

		return mode === 'fit-width'
			? clamp(
					((container?.clientWidth || 800) - 40) / width,
					MIN_SCALE,
					MAX_SCALE,
				)
			: clamp(
					((container?.clientHeight || 600) - 40) / height,
					MIN_SCALE,
					MAX_SCALE,
				);
	}, []);

	const commitZoom = useCallback(
		(nextScale: number, nextFitMode?: 'fit-width' | 'fit-height') => {
			nextScale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
			if (nextScale === scale && nextFitMode === undefined) return;

			const anchorPage = clamp(lastStablePageRef.current, 1, numPages || 1);

			suppressPageSync();

			if (!scrollView || !scrollContainerRef.current || useFullPdfJsViewer) {
				flushSync(() => {
					if (nextFitMode) setFitMode(nextFitMode);
					setScale(nextScale);
				});

				setPage(anchorPage);
				setProperty('pdf-renderer-zoom', nextScale);
				return;
			}

			const container = scrollContainerRef.current;
			const oldTop = pageTopFor(pageHeights.current, anchorPage, scale);
			const oldHeight = pageHeightFor(pageHeights.current, anchorPage, scale);
			const ratio = oldHeight
				? clamp((container.scrollTop - oldTop) / oldHeight, 0, 1)
				: 0;

			const nextTop = pageTopFor(pageHeights.current, anchorPage, nextScale);
			const nextHeight = pageHeightFor(
				pageHeights.current,
				anchorPage,
				nextScale,
			);
			const nextTotal = totalHeightFor(
				pageHeights.current,
				numPages,
				nextScale,
			);
			const nextScrollTop = clamp(
				nextTop + ratio * nextHeight,
				0,
				Math.max(0, nextTotal - container.clientHeight),
			);

			flushSync(() => {
				if (nextFitMode) setFitMode(nextFitMode);
				setScale(nextScale);
			});

			container.scrollTop = nextScrollTop;

			setRenderRange(
				rangeFor(
					pageHeights.current,
					numPages,
					nextScrollTop,
					container.clientHeight,
					nextScale,
				),
			);
			setPage(anchorPage);
			setProperty('pdf-renderer-zoom', nextScale);

			requestAnimationFrame(() => {
				syncScroll(nextScale);
			});
		},
		[
			scale,
			numPages,
			scrollView,
			setProperty,
			setPage,
			syncScroll,
			suppressPageSync,
			useFullPdfJsViewer,
		],
	);

	const handlePreviousPage = useCallback(() => {
		goToPage(lastStablePageRef.current - 1);
	}, [goToPage]);

	const handleNextPage = useCallback(() => {
		goToPage(lastStablePageRef.current + 1);
	}, [goToPage]);

	const handlePageInputKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLInputElement>) => {
			if (event.key !== 'Enter') return;
			const page = Number.parseInt(pageInput, 10);

			if (Number.isFinite(page)) {
				goToPage(page);
			} else {
				setPageInput(String(currentPage));
			}

			setIsEditingPageInput(false);
			event.currentTarget.blur();
		},
		[pageInput, currentPage, goToPage],
	);

	const handleFitToggle = useCallback(() => {
		const nextMode = fitMode === 'fit-width' ? 'fit-height' : 'fit-width';
		commitZoom(computeFitScale(nextMode), nextMode);
	}, [fitMode, computeFitScale, commitZoom]);

	const handleZoomChange = useCallback(
		(event: React.ChangeEvent<HTMLSelectElement>) => {
			if (event.target.value === 'custom') return;
			commitZoom(Number.parseFloat(event.target.value) / 100);
		},
		[commitZoom],
	);

	const handlePageClick = useCallback(
		(page: number, event: React.MouseEvent<HTMLDivElement>) => {
			if (!onLocationClick || useFullPdfJsViewer) return;

			const pageWidth = pageWidths.current.get(page);
			const pageHeight = pageHeights.current.get(page);

			if (!pageWidth || !pageHeight) return;

			const canvas = event.currentTarget.querySelector(
				'.react-pdf__Page canvas',
			) as HTMLElement | null;

			if (!canvas) return;

			const rect = canvas.getBoundingClientRect();

			if (rect.width <= 0 || rect.height <= 0) return;

			onLocationClick(
				page,
				((event.clientX - rect.left) / rect.width) * pageWidth,
				((event.clientY - rect.top) / rect.height) * pageHeight,
			);
		},
		[onLocationClick, useFullPdfJsViewer],
	);

	const handleToggleView = useCallback(() => {
		const nextScrollView = !scrollView;

		suppressPageSync();
		setScrollView(nextScrollView);
		setProperty('pdf-renderer-scroll-view', nextScrollView);

		if (useFullPdfJsViewer || !nextScrollView) return;

		requestAnimationFrame(() => {
			if (!scrollContainerRef.current) return;

			const container = scrollContainerRef.current;
			const top = pageTopFor(
				pageHeights.current,
				lastStablePageRef.current,
				scale,
			);

			container.scrollTop = top;
			setRenderRange(
				rangeFor(
					pageHeights.current,
					numPages,
					top,
					container.clientHeight,
					scale,
				),
			);
		});
	}, [
		scrollView,
		numPages,
		scale,
		setProperty,
		suppressPageSync,
		useFullPdfJsViewer,
	]);

	const handleToggleFullscreen = useCallback(() => {
		if (document.fullscreenElement === containerRef.current) {
			document.exitFullscreen().then(() => setIsFullscreen(false));
			return;
		}

		if (!document.fullscreenElement) {
			containerRef.current?.requestFullscreen().then(() => {
				setIsFullscreen(true);
			});
		}
	}, []);

	useEffect(() => {
		const handleFullscreenChange = () => {
			const active = document.fullscreenElement === containerRef.current;

			setIsFullscreen(active);

			if (active) {
				requestAnimationFrame(() => {
					commitZoom(computeFitScale(fitMode));
				});
			}
		};

		document.addEventListener('fullscreenchange', handleFullscreenChange);

		return () => {
			document.removeEventListener('fullscreenchange', handleFullscreenChange);
		};
	}, [commitZoom, computeFitScale, fitMode]);

	const handleExport = useCallback(() => {
		if (onDownload && fileName) {
			onDownload(fileName);
			return;
		}

		if (!originalContentRef.current?.byteLength) {
			setError(t('Cannot export: PDF content is not available'));
			return;
		}

		try {
			const blob = new Blob([originalContentRef.current], {
				type: 'application/pdf',
			});
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');

			link.href = url;
			link.download = fileName || 'document.pdf';

			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error('Export error:', error);
			setError(t('Failed to export PDF'));
		}
	}, [fileName, onDownload]);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			const active = document.activeElement;

			const isTyping =
				active instanceof HTMLInputElement ||
				active instanceof HTMLTextAreaElement ||
				active instanceof HTMLSelectElement ||
				active?.getAttribute('contenteditable') === 'true';

			if (isTyping) return;
			if (!document.fullscreenElement && !pointerInsideRef.current) return;

			if (
				event.key === 'ArrowLeft' ||
				event.key === 'ArrowUp' ||
				event.key === 'PageUp'
			) {
				event.preventDefault();
				handlePreviousPage();
			}

			if (
				event.key === 'ArrowRight' ||
				event.key === 'ArrowDown' ||
				event.key === ' ' ||
				event.key === 'PageDown'
			) {
				event.preventDefault();
				handleNextPage();
			}
		};

		window.addEventListener('keydown', handleKeyDown);

		return () => {
			window.removeEventListener('keydown', handleKeyDown);
		};
	}, [handlePreviousPage, handleNextPage]);

	const handleFullViewerError = useCallback((err: Error) => {
		console.error(
			'[PdfRenderer] Full PDF.js viewer failed; falling back to react-pdf:',
			err,
		);
		setFullViewerFailed(true);
		setError(null);
		setIsLoading(false);
	}, []);

	const renderHighlight = (page: number) => {
		if (!highlight || highlight.page !== page || useFullPdfJsViewer)
			return null;

		return highlight.rects.map((rect, index) => (
			<div
				key={index}
				className='pdf-page-highlight'
				style={{
					position: 'absolute',
					left: `${rect.x * scale}px`,
					top: `${rect.y * scale}px`,
					width: `${Math.max(rect.width, 0) * scale}px`,
					height: `${Math.max(rect.height, 1) * scale}px`,
					pointerEvents: 'none',
					backgroundColor: 'rgba(255, 235, 59, 0.4)',
					border: '2px solid rgba(255, 193, 7, 0.8)',
					borderRadius: '2px',
					animation: 'source-map-highlight-pulse 1.5s ease-out',
					zIndex: 3,
				}}
			/>
		));
	};

	if (!pdfRendererEnable) {
		return (
			<div className='pdf-renderer-container'>
				<div className='pdf-renderer-error'>
					{t(
						'Enhanced PDF renderer is disabled. Please enable it in settings to use this renderer.',
					)}
				</div>
			</div>
		);
	}

	const zoomOptions =
		getPdfRendererSettings().find(
			(setting) => setting.id === 'pdf-renderer-initial-zoom',
		)?.options || [];

	const currentZoom = Math.round(scale * 100).toString();
	const hasCustomZoom = !zoomOptions.some(
		(option) => String(option.value) === currentZoom,
	);

	return (
		<div
			className='pdf-renderer-container'
			ref={containerRef}
			onMouseEnter={() => {
				pointerInsideRef.current = true;
			}}
			onMouseLeave={() => {
				pointerInsideRef.current = false;
			}}
		>
			<div
				className={`pdf-toolbar ${isFullscreen ? 'fullscreen-toolbar' : ''}`}
			>
				<div className={`toolbar ${!headerLabel ? 'toolbar-no-left' : ''}`}>
					{headerLabel && (
						<div id='toolbarLeft'>
							<PluginHeader
								fileName={headerLabel}
								filePath={headerTitle}
								tooltipInfo={tooltipInfo}
							/>
						</div>
					)}
					<div id='toolbarRight'>
						<div className='toolbarButtonGroup'>
							<button
								onClick={handlePreviousPage}
								className='toolbarButton'
								title={t('Previous Page')}
								disabled={currentPage <= 1 || isLoading}
							>
								<ChevronLeftIcon />
							</button>

							<button
								onClick={handleNextPage}
								className='toolbarButton'
								title={t('Next Page')}
								disabled={currentPage >= numPages || isLoading}
							>
								<ChevronRightIcon />
							</button>
						</div>

						<div className='toolbarButtonGroup'>
							<div className='pageNumber'>
								<input
									type='number'
									value={pageInput}
									onChange={(event) => setPageInput(event.target.value)}
									onKeyDown={handlePageInputKeyDown}
									onFocus={() => setIsEditingPageInput(true)}
									onBlur={() => {
										setIsEditingPageInput(false);
										setPageInput(String(currentPage));
									}}
									className='toolbarField'
									min={1}
									max={numPages}
									disabled={isLoading}
								/>
								<span>/</span>
								<span>{numPages}</span>
								{useFullPdfJsViewer && (
									<span className='pdf-mode-badge'>{t('Interactive')}</span>
								)}
							</div>
						</div>

						<div className='toolbarButtonGroup'>
							<button
								onClick={() => commitZoom(scale - ZOOM_STEP)}
								className='toolbarButton'
								title={t('Zoom Out')}
								disabled={isLoading}
							>
								<ZoomOutIcon />
							</button>

							<select
								value={hasCustomZoom ? 'custom' : currentZoom}
								onChange={handleZoomChange}
								disabled={isLoading}
								className='toolbarZoomSelect'
								title={t('Zoom Level')}
							>
								{zoomOptions.map((option) => (
									<option
										key={String(option.value)}
										value={String(option.value)}
									>
										{option.label}
									</option>
								))}

								{hasCustomZoom && (
									<option value='custom'>{Math.round(scale * 100)}%</option>
								)}
							</select>

							<button
								onClick={() => commitZoom(scale + ZOOM_STEP)}
								className='toolbarButton'
								title={t('Zoom In')}
								disabled={isLoading}
							>
								<ZoomInIcon />
							</button>
						</div>

						<div className='toolbarButtonGroup'>
							<button
								onClick={handleFitToggle}
								className='toolbarButton'
								title={
									fitMode === 'fit-width'
										? t('Fit to Height')
										: t('Fit to Width')
								}
								disabled={isLoading}
							>
								{fitMode === 'fit-width' ? (
									<FitToWidthIcon />
								) : (
									<FitToHeightIcon />
								)}
							</button>

							<button
								onClick={handleToggleView}
								className='toolbarButton'
								title={scrollView ? t('Single Page View') : t('Scroll View')}
								disabled={isLoading}
							>
								{scrollView ? <PageIcon /> : <ScrollIcon />}
							</button>

							<button
								onClick={handleToggleFullscreen}
								className='toolbarButton'
								title={isFullscreen ? t('Exit Fullscreen') : t('Fullscreen')}
								disabled={isLoading}
							>
								{isFullscreen ? <MinimizeIcon /> : <ExpandIcon />}
							</button>
						</div>

						<div className='toolbarButtonGroup'>
							<button
								onClick={handleExport}
								className='toolbarButton'
								title={t('Download')}
								disabled={isLoading}
							>
								<DownloadIcon />
							</button>
						</div>
					</div>
				</div>
			</div>

			<div
				className={`pdf-renderer-content ${isFullscreen ? 'fullscreen' : ''}`}
				ref={
					useFullPdfJsViewer || !scrollView ? contentElRef : scrollContainerRef
				}
			>
				{pdfData && useFullPdfJsViewer && (
					<PdfJsFullViewer
						pdfData={pdfData}
						scale={scale}
						currentPage={currentPage}
						onDocumentReady={handleDocumentReady}
						onPageChange={setPage}
						onError={handleFullViewerError}
					/>
				)}

				{fileData && !useFullPdfJsViewer && (
					<Document
						file={fileData}
						options={documentOptions}
						onLoadSuccess={onDocumentLoadSuccess}
						onLoadError={onDocumentLoadError}
						loading={
							isLoading ? (
								<div className='pdf-renderer-loading'>
									{t('Loading PDF document...')}
								</div>
							) : null
						}
					>
						{!isLoading &&
							!error &&
							(scrollView ? (
								Array.from({ length: numPages }, (_, index) => {
									const page = index + 1;
									const shouldRender =
										page >= renderRange.start && page <= renderRange.end;
									const estimatedHeight = pageHeightFor(
										pageHeights.current,
										page,
										scale,
									);

									return (
										<div
											key={page}
											data-page-number={page}
											className='pdf-page-scroll'
											style={{
												minHeight: shouldRender
													? undefined
													: `${estimatedHeight}px`,
												position: 'relative',
											}}
											onClick={(event) => handlePageClick(page, event)}
										>
											{shouldRender && (
												<Page
													pageNumber={page}
													scale={scale}
													renderTextLayer={pdfRendererTextSelection}
													renderAnnotationLayer
													renderForms
													onLoadSuccess={onPageLoadSuccess}
													loading={
														<div className='pdf-page-loading'>
															{t('Loading page')} {page}
															{t('...')}
														</div>
													}
												>
													{renderHighlight(page)}
												</Page>
											)}
										</div>
									);
								})
							) : (
								<div
									className='pdf-page-scroll'
									style={{ position: 'relative' }}
									onClick={(event) => handlePageClick(currentPage, event)}
								>
									<Page
										pageNumber={currentPage}
										scale={scale}
										renderTextLayer={pdfRendererTextSelection}
										renderAnnotationLayer
										renderForms
										onLoadSuccess={onPageLoadSuccess}
										loading={
											<div className='pdf-page-loading'>
												{t('Loading page...')}
											</div>
										}
									>
										{renderHighlight(currentPage)}
									</Page>
								</div>
							))}
					</Document>
				)}
			</div>

			{error && <div className='pdf-renderer-error'>{error}</div>}
		</div>
	);
};

export default PdfRenderer;
