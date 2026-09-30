// extras/renderers/canvas/CanvasRenderer.tsx
import { t } from '@/i18n';
import type React from 'react';
import {
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from 'react';
import { flushSync } from 'react-dom';

import { PluginHeader } from '@/components/common/PluginHeader';
import { formatFileSize } from '@/utils/fileUtils';
import { applyMediaKey } from '@/utils/mediaKeyboardUtils';
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
import { useSettings } from '@/hooks/useSettings';
import { useProperties } from '@/hooks/useProperties';
import type { RendererProps } from '@/plugins/PluginInterface';
import './styles.css';
import { getCanvasRendererSettings } from './settings';
import {
	parseSvgPages,
	renderSvgPageToCanvas,
	renderSvgOverlay,
	invalidateSvgOverlayCache,
	type SvgRenderContext,
} from './svgRenderer';
import {
	parsePdfPages,
	renderPdfPageToCanvas,
	renderTextLayer,
	renderAnnotationLayer,
	invalidatePdfOverlayCaches,
	destroyPdf,
	type PdfRenderContext,
} from './pdfRenderer';
import { createNamedLogger } from '@/logging';
const moduleLog = createNamedLogger('CanvasRenderer');

export interface CanvasRendererHandle {
	updateSvgContent: (content: ArrayBuffer | string) => void;
	updateContent: (content: ArrayBuffer | string) => void;
	setHighlight: (
		highlight: {
			page: number;
			rects: Array<{ x: number; y: number; width: number; height: number }>;
		} | null,
	) => void;
}

type ContentType = 'svg' | 'pdf' | 'paged';
type PageMeta = { width: number; height: number };
type Range = { start: number; end: number };

const DEFAULT_WIDTH = 595;
const DEFAULT_HEIGHT = 842;
const PAGE_GAP = 20;
const BUFFER_PAGES = 2;
const MIN_SCALE = 0.25;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.25;
const CANVAS_DELAY_MS = 20;
const OVERLAY_DELAY_MS = 80;
const OVERLAY_IDLE_TIMEOUT_MS = 250;
const PAGE_SYNC_SUPPRESS_MS = 180;

const clamp = (value: number, min: number, max: number) =>
	Math.max(min, Math.min(max, value));

const normalizeContent = (
	content: ArrayBuffer | Uint8Array | string,
): ArrayBuffer => {
	if (content instanceof ArrayBuffer) return content;
	if (typeof content === 'string')
		return new TextEncoder().encode(content).buffer;
	if (
		content.buffer instanceof ArrayBuffer &&
		content.byteOffset === 0 &&
		content.byteLength === content.buffer.byteLength
	) {
		return content.buffer;
	}
	const copy = new Uint8Array(content.byteLength);
	copy.set(content);
	return copy.buffer;
};

const pageSizeFor = (
	metadata: Map<number, PageMeta>,
	page: number,
	scale: number,
) => {
	const meta = metadata.get(page);
	const width = meta?.width || DEFAULT_WIDTH;
	const height = meta?.height || DEFAULT_HEIGHT;

	return {
		baseWidth: width,
		baseHeight: height,
		width: width * scale,
		height: height * scale,
	};
};

const pageHeightFor = (
	metadata: Map<number, PageMeta>,
	page: number,
	scale: number,
) => pageSizeFor(metadata, page, scale).height + PAGE_GAP;

const pageTopFor = (
	metadata: Map<number, PageMeta>,
	numPages: number,
	page: number,
	scale: number,
) => {
	let top = 0;
	const target = clamp(page, 1, numPages || 1);

	for (let i = 1; i < target; i++) {
		top += pageHeightFor(metadata, i, scale);
	}

	return top;
};

const totalHeightFor = (
	metadata: Map<number, PageMeta>,
	numPages: number,
	scale: number,
) => {
	let total = 0;

	for (let page = 1; page <= numPages; page++) {
		total += pageHeightFor(metadata, page, scale);
	}

	return total;
};

const rangeFor = (
	metadata: Map<number, PageMeta>,
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
		const bottom = top + pageHeightFor(metadata, page, scale);

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
	metadata: Map<number, PageMeta>,
	numPages: number,
	offset: number,
	scale: number,
) => {
	let top = 0;

	for (let page = 1; page <= numPages; page++) {
		const height = pageHeightFor(metadata, page, scale);
		const bottom = top + height;

		if (offset <= bottom || page === numPages) return page;

		top = bottom;
	}

	return 1;
};

const CanvasRenderer: React.FC<RendererProps> = ({
	content,
	pagedSource,
	fileName,
	onDownload,
	controllerRef,
	onLocationClick,
	headerLabel,
	headerTitle,
	memoryOptimized = false,
}) => {
	const { getSetting } = useSettings();
	const { getProperty, setProperty, registerProperty } = useProperties();

	const [numPages, setNumPages] = useState(0);
	const [currentPage, setCurrentPage] = useState(1);
	const [pageInput, setPageInput] = useState('1');
	const [isEditingPageInput, setIsEditingPageInput] = useState(false);
	const [scale, setScale] = useState(1);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [scrollView, setScrollView] = useState(false);
	const [renderRange, setRenderRange] = useState<Range>({
		start: 1,
		end: 1,
	});
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [fitMode, setFitMode] = useState<'fit-width' | 'fit-height'>(
		'fit-width',
	);
	const [pageMetadata, setPageMetadata] = useState<Map<number, PageMeta>>(
		new Map(),
	);
	const [contentType, setContentType] = useState<ContentType>('svg');
	const [highlight, setHighlight] = useState<{
		page: number;
		rects: Array<{ x: number; y: number; width: number; height: number }>;
	} | null>(null);

	const containerRef = useRef<HTMLDivElement>(null);
	const contentElRef = useRef<HTMLDivElement>(null);
	const scrollContainerRef = useRef<HTMLDivElement>(null);

	const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
	const textLayerRefs = useRef<Map<number, HTMLDivElement>>(new Map());
	const interactiveLayerRefs = useRef<Map<number, HTMLDivElement>>(new Map());
	const annotationLayerRefs = useRef<Map<number, HTMLDivElement>>(new Map());

	const svgPagesRef = useRef<Map<number, string>>(new Map());
	const pdfDocRef = useRef<any>(null);
	const contentTypeRef = useRef<ContentType>('svg');
	const fullBufferRef = useRef<ArrayBuffer | null>(null);
	const pagedSourceRef = useRef(pagedSource);
	const contentGenerationRef = useRef(0);
	const contentAbortRef = useRef<AbortController | null>(null);

	const pendingRenderRef = useRef<Set<number>>(new Set());
	const renderingRef = useRef<Set<number>>(new Set());
	const renderTokensRef = useRef<Map<number, number>>(new Map());

	const propertiesRegistered = useRef(false);
	const lastStablePageRef = useRef(1);
	const suppressPageSyncUntilRef = useRef(0);
	const renderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const overlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const overlayIdleRef = useRef<number | null>(null);
	const renderGenerationRef = useRef(0);
	const pdfOverlayRefreshAfterJumpRef = useRef(false);

	const numPagesRef = useRef(0);
	const scaleRef = useRef(1);
	const scrollViewRef = useRef(false);
	const pointerInsideRef = useRef(false);

	const canvasRendererEnable =
		(getSetting('canvas-renderer-enable')?.value as boolean) ?? true;
	const canvasRendererTextSelection =
		(getSetting('canvas-renderer-text-selection')?.value as boolean) ?? true;
	const canvasRendererAnnotations =
		(getSetting('canvas-renderer-annotations')?.value as boolean) ?? true;
	const airgapExternalRequests =
		(getSetting('offline-airgap-external-requests')?.value as boolean) ?? false;

	const isPdf = contentType === 'pdf';

	useEffect(() => {
		numPagesRef.current = numPages;
	}, [numPages]);

	useEffect(() => {
		scaleRef.current = scale;
	}, [scale]);

	useEffect(() => {
		scrollViewRef.current = scrollView;
	}, [scrollView]);

	const layout = useMemo(() => {
		const offsets: number[] = [];
		let height = 0;
		let width = 0;

		for (let page = 1; page <= numPages; page++) {
			const size = pageSizeFor(pageMetadata, page, scale);

			offsets[page] = height;
			height += size.height + PAGE_GAP;
			width = Math.max(width, size.width);
		}

		return { offsets, height, width: width || DEFAULT_WIDTH * scale };
	}, [numPages, pageMetadata, scale]);

	const svgCtx = useMemo<SvgRenderContext>(
		() => ({
			svgPagesRef,
			canvasRefs,
			pageMetadata,
			scale,
			renderingRef,
			pendingRenderRef,
			renderTokensRef,
		}),
		[pageMetadata, scale],
	);

	const pdfCtx = useMemo<PdfRenderContext>(
		() => ({
			pdfDocRef,
			canvasRefs,
			scale,
			renderingRef,
			pendingRenderRef,
			memoryOptimized,
		}),
		[scale, memoryOptimized],
	);

	const tooltipInfo = useMemo(() => {
		if (numPages <= 0) return undefined;

		const firstPage = pageMetadata.get(1);
		const fileSize =
			contentType === 'paged'
				? (pagedSourceRef.current?.byteLength ?? 0)
				: (fullBufferRef.current?.byteLength ?? 0);
		const type =
			contentType === 'pdf'
				? 'PDF'
				: contentType === 'svg'
					? 'SVG'
					: (pagedSourceRef.current?.typeLabel ?? 'Paged');
		const typeMime =
			contentType === 'pdf'
				? 'application/pdf'
				: contentType === 'svg'
					? 'image/svg+xml'
					: (pagedSourceRef.current?.mimeType ?? 'application/octet-stream');

		return [
			t('Type: {type}', { type }),
			t('MIME Type: {mimeType}', { mimeType: typeMime }),
			t('Pages: {count}', { count: numPages }),
			t('Dimensions: {width} × {height}', {
				width: firstPage?.width ?? '—',
				height: firstPage?.height ?? '—',
			}),
			t('Size: {size}', { size: formatFileSize(fileSize) }),
		];
	}, [contentType, pageMetadata, numPages]);

	const cancelTimers = useCallback(() => {
		if (renderTimerRef.current) clearTimeout(renderTimerRef.current);
		if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
		if (overlayIdleRef.current !== null && 'cancelIdleCallback' in window) {
			window.cancelIdleCallback(overlayIdleRef.current);
		}

		renderTimerRef.current = null;
		overlayTimerRef.current = null;
		overlayIdleRef.current = null;
		renderGenerationRef.current += 1;
	}, []);

	const suppressPageSync = useCallback(() => {
		suppressPageSyncUntilRef.current = Date.now() + PAGE_SYNC_SUPPRESS_MS;
	}, []);

	const setPage = useCallback((page: number) => {
		const target = clamp(page, 1, numPagesRef.current || 1);

		lastStablePageRef.current = target;
		setCurrentPage(target);
		setPageInput(String(target));
	}, []);

	const clearLayers = useCallback(() => {
		for (const el of textLayerRefs.current.values()) {
			el.replaceChildren();
			el.style.visibility = 'hidden';
			invalidateSvgOverlayCache(el);
			invalidatePdfOverlayCaches(el);
		}

		for (const el of interactiveLayerRefs.current.values()) {
			el.replaceChildren();
			delete el.dataset.renderKey;
			el.style.visibility = 'hidden';
		}

		for (const el of annotationLayerRefs.current.values()) {
			el.replaceChildren();
			el.style.visibility = 'hidden';
			invalidatePdfOverlayCaches(el);
		}
	}, []);

	const syncScroll = useCallback(
		(targetScale = scale) => {
			if (!scrollView || !scrollContainerRef.current) return;

			const container = scrollContainerRef.current;

			setRenderRange(
				rangeFor(
					pageMetadata,
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
			const page = pageAtOffsetFor(pageMetadata, numPages, probeY, targetScale);

			if (page !== lastStablePageRef.current) {
				setPage(page);
			}
		},
		[scrollView, pageMetadata, numPages, scale, isEditingPageInput, setPage],
	);

	const goToPage = useCallback(
		(page: number, y = 0) => {
			const target = clamp(page, 1, numPages || 1);

			suppressPageSync();
			setPage(target);

			if (contentTypeRef.current === 'pdf') {
				pdfOverlayRefreshAfterJumpRef.current = true;
			}

			if (!scrollView || !scrollContainerRef.current) return;

			const container = scrollContainerRef.current;
			const pageTop = pageTopFor(pageMetadata, numPages, target, scale);
			const pageHeight = pageMetadata.get(target)?.height || DEFAULT_HEIGHT;
			const top = pageTop + clamp(y, 0, pageHeight) * scale;

			container.scrollTop = top;
			setRenderRange(
				rangeFor(pageMetadata, numPages, top, container.clientHeight, scale),
			);
		},
		[numPages, scrollView, pageMetadata, scale, setPage, suppressPageSync],
	);

	const renderOverlays = useCallback(
		(pages: number[], generation: number) => {
			if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);

			overlayTimerRef.current = setTimeout(() => {
				const render = () => {
					overlayIdleRef.current = null;

					void (async () => {
						for (const page of pages) {
							if (generation !== renderGenerationRef.current) return;

							const textEl = textLayerRefs.current.get(page);
							const interactiveEl = interactiveLayerRefs.current.get(page);
							const annotEl = annotationLayerRefs.current.get(page);

							if (textEl) {
								if (contentTypeRef.current === 'pdf') {
									invalidatePdfOverlayCaches(textEl);
								}
								textEl.replaceChildren();
								textEl.style.visibility = 'hidden';
							}

							if (annotEl) {
								if (contentTypeRef.current === 'pdf') {
									invalidatePdfOverlayCaches(annotEl);
								}
								annotEl.replaceChildren();
								annotEl.style.visibility = 'hidden';
							}

							if (
								canvasRendererTextSelection &&
								contentTypeRef.current === 'paged' &&
								interactiveEl
							) {
								const source = pagedSourceRef.current;
								const controller = contentAbortRef.current;

								if (source?.renderInteractiveLayer && controller) {
									const renderKey = `${source.id}:${scale}`;

									if (interactiveEl.dataset.renderKey !== renderKey) {
										interactiveEl.replaceChildren();
										interactiveEl.style.visibility = 'hidden';

										try {
											await source.renderInteractiveLayer({
												page,
												container: interactiveEl,
												scale,
												signal: controller.signal,
											});
											if (generation !== renderGenerationRef.current) return;
											interactiveEl.dataset.renderKey = renderKey;
										} catch (error) {
											delete interactiveEl.dataset.renderKey;
											if (
												!controller.signal.aborted &&
												generation === renderGenerationRef.current
											) {
												moduleLog.warn(
													'Failed to render paged interactive layer:',
													error,
												);
											}
										}
									}
								}

								if (generation !== renderGenerationRef.current) return;
								interactiveEl.style.visibility = 'visible';
							}

							if (canvasRendererTextSelection && textEl) {
								if (contentTypeRef.current === 'pdf') {
									await renderTextLayer(
										pdfDocRef,
										page,
										textEl,
										scale,
										memoryOptimized,
									);
								} else if (contentTypeRef.current === 'svg') {
									const svgString = svgPagesRef.current.get(page);
									const meta = pageMetadata.get(page);

									if (svgString) {
										await renderSvgOverlay(
											svgString,
											textEl,
											scale,
											meta?.width || DEFAULT_WIDTH,
											meta?.height || DEFAULT_HEIGHT,
											({ page, y }) => goToPage(page, y),
										);
									}
								} else {
									const source = pagedSourceRef.current;
									const controller = contentAbortRef.current;

									if (source?.renderTextLayer && controller) {
										try {
											await source.renderTextLayer({
												page,
												container: textEl,
												scale,
												signal: controller.signal,
												onNavigate: ({ page, y }) => goToPage(page, y),
											});
										} catch (error) {
											if (
												!controller.signal.aborted &&
												generation === renderGenerationRef.current
											) {
												moduleLog.warn(
													'Failed to render paged text layer:',
													error,
												);
											}
										}
									}
								}

								if (generation !== renderGenerationRef.current) return;
								textEl.style.visibility = 'visible';
							}

							if (
								canvasRendererAnnotations &&
								contentTypeRef.current === 'pdf' &&
								annotEl
							) {
								await renderAnnotationLayer(
									pdfDocRef,
									page,
									annotEl,
									scale,
									memoryOptimized,
								);
								if (generation !== renderGenerationRef.current) return;
								annotEl.style.visibility = 'visible';
							}

							await new Promise<void>((resolve) => setTimeout(resolve, 0));
						}
					})();
				};

				if ('requestIdleCallback' in window) {
					overlayIdleRef.current = window.requestIdleCallback(render, {
						timeout: OVERLAY_IDLE_TIMEOUT_MS,
					});
				} else {
					render();
				}
			}, OVERLAY_DELAY_MS);
		},
		[
			scale,
			canvasRendererTextSelection,
			canvasRendererAnnotations,
			pageMetadata,
			goToPage,
			memoryOptimized,
		],
	);

	const renderVisiblePages = useCallback(() => {
		if (isLoading || error || numPages <= 0) return;

		cancelTimers();
		const generation = renderGenerationRef.current;

		renderTimerRef.current = setTimeout(() => {
			void (async () => {
				const start = scrollView ? renderRange.start : currentPage;
				const end = scrollView ? renderRange.end : currentPage;
				const primary =
					currentPage >= start && currentPage <= end ? currentPage : start;
				const pages = [primary];
				for (let distance = 1; pages.length < end - start + 1; distance++) {
					if (primary + distance <= end) pages.push(primary + distance);
					if (primary - distance >= start) pages.push(primary - distance);
				}

				const rendered: number[] = [];
				for (const page of pages) {
					if (generation !== renderGenerationRef.current) return;
					if (
						contentTypeRef.current === 'svg' &&
						svgPagesRef.current.has(page)
					) {
						await renderSvgPageToCanvas(svgCtx, page);
						rendered.push(page);
					} else if (contentTypeRef.current === 'pdf' && pdfDocRef.current) {
						await renderPdfPageToCanvas(pdfCtx, page);
						rendered.push(page);
					} else if (contentTypeRef.current === 'paged') {
						const source = pagedSourceRef.current;
						const canvas = canvasRefs.current.get(page);
						const controller = contentAbortRef.current;
						if (source && canvas && controller) {
							try {
								await source.renderPage({
									page,
									canvas,
									scale,
									signal: controller.signal,
								});
								rendered.push(page);
							} catch (error) {
								if (
									!controller.signal.aborted &&
									generation === renderGenerationRef.current
								) {
									moduleLog.warn('Failed to render paged page:', error);
								}
							}
						}
					}
					await new Promise<void>((resolve) => setTimeout(resolve, 0));
				}

				const needsOverlays =
					canvasRendererTextSelection ||
					(canvasRendererAnnotations && contentTypeRef.current === 'pdf');

				if (
					needsOverlays &&
					rendered.length &&
					generation === renderGenerationRef.current
				) {
					renderOverlays(rendered, generation);
				}
			})();
		}, CANVAS_DELAY_MS);
	}, [
		isLoading,
		error,
		numPages,
		scrollView,
		renderRange,
		currentPage,
		svgCtx,
		pdfCtx,
		scale,
		renderOverlays,
		cancelTimers,
		canvasRendererTextSelection,
		canvasRendererAnnotations,
	]);

	const commitZoom = useCallback(
		(nextScale: number, nextFitMode?: 'fit-width' | 'fit-height') => {
			nextScale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
			if (nextScale === scale && nextFitMode === undefined) return;

			const anchorPage = clamp(lastStablePageRef.current, 1, numPages || 1);

			cancelTimers();
			clearLayers();
			suppressPageSync();

			if (!scrollView || !scrollContainerRef.current) {
				flushSync(() => {
					if (nextFitMode) setFitMode(nextFitMode);
					setScale(nextScale);
				});

				setProperty('canvas-renderer-zoom', nextScale);
				return;
			}

			const container = scrollContainerRef.current;
			const oldTop = pageTopFor(pageMetadata, numPages, anchorPage, scale);
			const oldHeight = pageHeightFor(pageMetadata, anchorPage, scale);
			const ratio = oldHeight
				? clamp((container.scrollTop - oldTop) / oldHeight, 0, 1)
				: 0;

			const nextTop = pageTopFor(pageMetadata, numPages, anchorPage, nextScale);
			const nextHeight = pageHeightFor(pageMetadata, anchorPage, nextScale);
			const nextTotal = totalHeightFor(pageMetadata, numPages, nextScale);
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
					pageMetadata,
					numPages,
					nextScrollTop,
					container.clientHeight,
					nextScale,
				),
			);
			setPage(anchorPage);
			setProperty('canvas-renderer-zoom', nextScale);

			requestAnimationFrame(() => {
				syncScroll(nextScale);
			});
		},
		[
			scale,
			numPages,
			scrollView,
			pageMetadata,
			cancelTimers,
			clearLayers,
			setPage,
			setProperty,
			syncScroll,
			suppressPageSync,
		],
	);

	const computeFitScale = useCallback(
		(mode: 'fit-width' | 'fit-height') => {
			const container = scrollContainerRef.current || contentElRef.current;
			const meta = pageMetadata.get(lastStablePageRef.current);
			const width = meta?.width || DEFAULT_WIDTH;
			const height = meta?.height || DEFAULT_HEIGHT;

			return mode === 'fit-width'
				? clamp(
						((container?.clientWidth || 800) - 60) / width,
						MIN_SCALE,
						MAX_SCALE,
					)
				: clamp(
						((container?.clientHeight || 600) - 70) / height,
						MIN_SCALE,
						MAX_SCALE,
					);
		},
		[pageMetadata],
	);

	const commitDocument = useCallback(
		(
			nextNumPages: number,
			nextMetadata: Map<number, PageMeta>,
			generation: number,
			keepPage: number,
			keepScrollTop: number,
		) => {
			if (generation !== contentGenerationRef.current) return;
			const nextPage = clamp(keepPage, 1, nextNumPages || 1);

			numPagesRef.current = nextNumPages;
			lastStablePageRef.current = nextPage;
			setPageMetadata(nextMetadata);
			setNumPages(nextNumPages);
			setCurrentPage(nextPage);
			setPageInput(String(nextPage));
			setIsLoading(false);
			setError(null);
			suppressPageSync();

			requestAnimationFrame(() => {
				if (generation !== contentGenerationRef.current) return;
				if (!scrollViewRef.current || !scrollContainerRef.current) return;
				const container = scrollContainerRef.current;
				const maxTop = Math.max(
					0,
					totalHeightFor(nextMetadata, nextNumPages, scaleRef.current) -
						container.clientHeight,
				);
				const fallbackTop = pageTopFor(
					nextMetadata,
					nextNumPages,
					nextPage,
					scaleRef.current,
				);
				const top = clamp(keepScrollTop || fallbackTop, 0, maxTop);
				container.scrollTop = top;
				setRenderRange(
					rangeFor(
						nextMetadata,
						nextNumPages,
						top,
						container.clientHeight,
						scaleRef.current,
					),
				);
			});
		},
		[suppressPageSync],
	);

	const beginContentLoad = useCallback(() => {
		const generation = ++contentGenerationRef.current;
		contentAbortRef.current?.abort();
		const controller = new AbortController();
		contentAbortRef.current = controller;
		cancelTimers();
		setError(null);
		if (numPagesRef.current === 0) setIsLoading(true);
		for (const el of textLayerRefs.current.values()) {
			el.className = 'textLayer';
			invalidateSvgOverlayCache(el);
			invalidatePdfOverlayCaches(el);
			el.style.visibility = 'hidden';
		}
		for (const el of interactiveLayerRefs.current.values()) {
			el.replaceChildren();
			delete el.dataset.renderKey;
			el.style.visibility = 'hidden';
		}
		for (const el of annotationLayerRefs.current.values()) {
			invalidatePdfOverlayCaches(el);
			el.style.visibility = 'hidden';
		}
		return { generation, controller };
	}, [cancelTimers]);

	const updateContent = useCallback(
		async (buffer: ArrayBuffer, trusted = false) => {
			if (!buffer || buffer.byteLength === 0) return;
			const { generation, controller } = beginContentLoad();
			const keepPage = lastStablePageRef.current;
			const keepScrollTop = scrollContainerRef.current?.scrollTop ?? 0;
			const bytes = new Uint8Array(buffer);
			const isPdfBuffer =
				bytes.length > 4 &&
				bytes[0] === 0x25 &&
				bytes[1] === 0x50 &&
				bytes[2] === 0x44 &&
				bytes[3] === 0x46;
			const nextType: ContentType = isPdfBuffer ? 'pdf' : 'svg';

			fullBufferRef.current = buffer;
			pagedSourceRef.current = undefined;
			contentTypeRef.current = nextType;
			setContentType((previous) =>
				previous === nextType ? previous : nextType,
			);

			try {
				if (isPdfBuffer) {
					await destroyPdf(pdfDocRef);
					if (controller.signal.aborted) return;
					svgPagesRef.current.clear();
					const { pdfDoc, metadata } = await parsePdfPages(buffer, {
						memoryOptimized,
					});
					if (
						controller.signal.aborted ||
						generation !== contentGenerationRef.current
					) {
						try {
							await pdfDoc.loadingTask?.destroy();
						} catch {}
						return;
					}
					pdfDocRef.current = pdfDoc;
					commitDocument(
						pdfDoc.numPages,
						metadata,
						generation,
						keepPage,
						keepScrollTop,
					);
					return;
				}

				await destroyPdf(pdfDocRef);
				if (controller.signal.aborted) return;
				const { pages, metadata } = await parseSvgPages(buffer, {
					trusted,
					allowRemoteUrls: !airgapExternalRequests,
				});
				if (
					controller.signal.aborted ||
					generation !== contentGenerationRef.current
				)
					return;
				svgPagesRef.current = pages;
				commitDocument(
					pages.size,
					metadata,
					generation,
					keepPage,
					keepScrollTop,
				);
			} catch (error) {
				if (
					controller.signal.aborted ||
					generation !== contentGenerationRef.current
				)
					return;
				moduleLog.error('Failed to parse content:', error);
				setError(
					t('Failed to parse content: {error}', {
						error: error instanceof Error ? error.message : t('Unknown error'),
					}),
				);
				setIsLoading(false);
			}
		},
		[beginContentLoad, commitDocument, airgapExternalRequests, memoryOptimized],
	);

	const updatePagedSource = useCallback(
		async (source: NonNullable<RendererProps['pagedSource']>) => {
			const { generation, controller } = beginContentLoad();
			const keepPage = lastStablePageRef.current;
			const keepScrollTop = scrollContainerRef.current?.scrollTop ?? 0;
			fullBufferRef.current = null;
			pagedSourceRef.current = source;
			contentTypeRef.current = 'paged';
			setContentType('paged');

			try {
				await destroyPdf(pdfDocRef);
				svgPagesRef.current.clear();
				const pages = await source.getPages(controller.signal);
				if (
					controller.signal.aborted ||
					generation !== contentGenerationRef.current
				)
					return;
				const metadata = new Map<number, PageMeta>(
					pages.map((page, index) => [
						index + 1,
						{ width: page.width, height: page.height },
					]),
				);
				commitDocument(
					pages.length,
					metadata,
					generation,
					keepPage,
					keepScrollTop,
				);
			} catch (error) {
				if (
					controller.signal.aborted ||
					generation !== contentGenerationRef.current
				)
					return;
				moduleLog.error('Failed to prepare paged content:', error);
				setError(
					t('Failed to parse content: {error}', {
						error: error instanceof Error ? error.message : t('Unknown error'),
					}),
				);
				setIsLoading(false);
			}
		},
		[beginContentLoad, commitDocument],
	);

	useImperativeHandle(controllerRef, () => {
		const update = (nextContent: ArrayBuffer | Uint8Array | string) => {
			void updateContent(normalizeContent(nextContent), true);
		};

		return {
			updateSvgContent: update,
			updateContent: update,
			cancelPending: () => {
				contentGenerationRef.current += 1;
				contentAbortRef.current?.abort();
				cancelTimers();
			},
			setHighlight: (nextHighlight) => {
				setHighlight(nextHighlight);

				if (nextHighlight) {
					document.dispatchEvent(
						new CustomEvent('canvas-renderer-navigate', {
							detail: { page: nextHighlight.page },
						}),
					);
				}
			},
		};
	}, [updateContent, cancelTimers]);

	useEffect(() => {
		if (propertiesRegistered.current) return;
		propertiesRegistered.current = true;

		registerProperty({
			id: 'canvas-renderer-zoom',
			category: 'UI',
			subcategory: 'Canvas Viewer',
			defaultValue: 1,
		});

		registerProperty({
			id: 'canvas-renderer-scroll-view',
			category: 'UI',
			subcategory: 'Canvas Viewer',
			defaultValue: false,
		});

		const storedZoom = getProperty('canvas-renderer-zoom');
		const storedScrollView = getProperty('canvas-renderer-scroll-view');

		if (storedZoom !== undefined) {
			setScale(clamp(Number(storedZoom), MIN_SCALE, MAX_SCALE));
		}

		if (storedScrollView !== undefined) {
			setScrollView(Boolean(storedScrollView));
		}
	}, [registerProperty, getProperty]);

	useEffect(() => {
		if (pagedSource) {
			void updatePagedSource(pagedSource);
			return;
		}

		const buffer = normalizeContent(content);
		if (buffer.byteLength > 0) void updateContent(buffer);
	}, [content, pagedSource, updateContent, updatePagedSource]);

	useEffect(() => {
		if (!scrollView || !scrollContainerRef.current) return;

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
	}, [scrollView, syncScroll]);

	useEffect(() => {
		if (!scrollView || !scrollContainerRef.current) return;

		const container = scrollContainerRef.current;
		let hadSize = container.clientHeight > 0;

		const observer = new ResizeObserver(() => {
			const hasSize = container.clientHeight > 0;
			if (hasSize === hadSize) return;

			hadSize = hasSize;
			if (hasSize) syncScroll();
		});

		observer.observe(container);

		return () => observer.disconnect();
	}, [scrollView, syncScroll]);

	useEffect(() => {
		syncScroll();
	}, [syncScroll]);

	useEffect(() => {
		renderVisiblePages();
	}, [renderVisiblePages]);

	/* biome-ignore lint/correctness/useExhaustiveDependencies: currentPage and renderRange are intentional triggers paired with pdfOverlayRefreshAfterJumpRef to detect when a navigation update has landed. */
	useEffect(() => {
		if (
			!pdfOverlayRefreshAfterJumpRef.current ||
			contentType !== 'pdf' ||
			isLoading ||
			error ||
			numPages <= 0
		) {
			return;
		}

		pdfOverlayRefreshAfterJumpRef.current = false;

		const timer = setTimeout(() => {
			renderVisiblePages();
		}, OVERLAY_DELAY_MS + 40);

		return () => clearTimeout(timer);
	}, [
		contentType,
		currentPage,
		renderRange.start,
		renderRange.end,
		isLoading,
		error,
		numPages,
		renderVisiblePages,
	]);

	useEffect(() => {
		if (pageMetadata.size === 0) return;

		document.dispatchEvent(
			new CustomEvent('canvas-renderer-dimensions', {
				detail: { dimensions: pageMetadata },
			}),
		);
	}, [pageMetadata]);

	useEffect(() => {
		const handleNavigate = (event: Event) => {
			const page = Number((event as CustomEvent).detail?.page);

			if (!Number.isFinite(page) || page < 1 || page > numPagesRef.current) {
				return;
			}

			if (containerRef.current?.offsetParent === null) return;

			requestAnimationFrame(() => {
				goToPage(page);
				renderVisiblePages();
			});
		};

		document.addEventListener('canvas-renderer-navigate', handleNavigate);

		return () => {
			document.removeEventListener('canvas-renderer-navigate', handleNavigate);
		};
	}, [goToPage, renderVisiblePages]);

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

	const getActiveMedia = useCallback((): HTMLMediaElement | null => {
		const textEl = textLayerRefs.current.get(lastStablePageRef.current);
		if (!textEl) return null;

		const root: ParentNode = textEl.shadowRoot ?? textEl;
		return root.querySelector('video, audio');
	}, []);

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

			const media = getActiveMedia();

			if (media) {
				if (event.key === ' ') {
					event.preventDefault();
					if (media.paused) {
						media.play().catch(() => undefined);
						(media as unknown as HTMLElement).focus?.();
					} else {
						media.pause();
					}
					return;
				}

				if (applyMediaKey(media, event.key)) {
					event.preventDefault();
					return;
				}
			}

			if (
				event.key === 'ArrowLeft' ||
				event.key === 'ArrowUp' ||
				event.key === 'PageUp'
			) {
				event.preventDefault();
				goToPage(lastStablePageRef.current - 1);
			}

			if (
				event.key === 'ArrowRight' ||
				event.key === 'ArrowDown' ||
				event.key === ' ' ||
				event.key === 'PageDown'
			) {
				event.preventDefault();
				goToPage(lastStablePageRef.current + 1);
			}
		};

		window.addEventListener('keydown', handleKeyDown, true);

		return () => {
			window.removeEventListener('keydown', handleKeyDown, true);
		};
	}, [goToPage, getActiveMedia]);

	useEffect(() => {
		return () => {
			contentGenerationRef.current += 1;
			contentAbortRef.current?.abort();
			cancelTimers();
			void destroyPdf(pdfDocRef);
		};
	}, [cancelTimers]);

	const handlePageInputKeyDown = (
		event: React.KeyboardEvent<HTMLInputElement>,
	) => {
		if (event.key !== 'Enter') return;

		const page = Number.parseInt(pageInput, 10);

		if (Number.isFinite(page)) {
			goToPage(page);
		} else {
			setPageInput(String(currentPage));
		}

		setIsEditingPageInput(false);
		event.currentTarget.blur();
	};

	const handlePageClick = (
		page: number,
		event: React.MouseEvent<HTMLDivElement>,
	) => {
		if (!onLocationClick) return;

		const canvas = canvasRefs.current.get(page);
		const meta = pageMetadata.get(page);

		if (!canvas || !meta) return;

		const rect = canvas.getBoundingClientRect();

		if (rect.width <= 0 || rect.height <= 0) return;

		onLocationClick(
			page,
			((event.clientX - rect.left) / rect.width) * meta.width,
			((event.clientY - rect.top) / rect.height) * meta.height,
		);
	};

	const handleToggleView = () => {
		const nextScrollView = !scrollView;

		suppressPageSync();
		setScrollView(nextScrollView);
		setProperty('canvas-renderer-scroll-view', nextScrollView);

		if (!nextScrollView) return;

		requestAnimationFrame(() => {
			if (!scrollContainerRef.current) return;

			const container = scrollContainerRef.current;
			const top = pageTopFor(
				pageMetadata,
				numPages,
				lastStablePageRef.current,
				scale,
			);

			container.scrollTop = top;
			setRenderRange(
				rangeFor(pageMetadata, numPages, top, container.clientHeight, scale),
			);
		});
	};

	const handleToggleFullscreen = () => {
		if (document.fullscreenElement === containerRef.current) {
			document.exitFullscreen().then(() => setIsFullscreen(false));
			return;
		}

		if (!document.fullscreenElement) {
			containerRef.current?.requestFullscreen().then(() => {
				setIsFullscreen(true);
			});
		}
	};

	const canExport = contentType !== 'paged' || Boolean(onDownload);

	const handleExport = () => {
		if (onDownload && fileName) {
			onDownload(fileName);
			return;
		}

		if (contentTypeRef.current === 'paged') return;

		const buffer = fullBufferRef.current;
		if (!buffer || buffer.byteLength === 0) return;

		const mimeType = isPdf ? 'application/pdf' : 'image/svg+xml';
		const extension = isPdf ? '.pdf' : '.svg';
		const blob = new Blob([buffer], { type: mimeType });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');

		link.href = url;
		link.download =
			fileName?.replace(/\.(typ|pdf|svg)$/i, extension) || `output${extension}`;

		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);
	};

	const setCanvasRef = useCallback(
		(page: number) => (el: HTMLCanvasElement | null) => {
			if (el) canvasRefs.current.set(page, el);
			else canvasRefs.current.delete(page);
		},
		[],
	);

	const setTextLayerRef = useCallback(
		(page: number) => (el: HTMLDivElement | null) => {
			if (el) textLayerRefs.current.set(page, el);
			else textLayerRefs.current.delete(page);
		},
		[],
	);

	const setInteractiveLayerRef = useCallback(
		(page: number) => (el: HTMLDivElement | null) => {
			if (el) interactiveLayerRefs.current.set(page, el);
			else interactiveLayerRefs.current.delete(page);
		},
		[],
	);

	const setAnnotationLayerRef = useCallback(
		(page: number) => (el: HTMLDivElement | null) => {
			if (el) annotationLayerRefs.current.set(page, el);
			else annotationLayerRefs.current.delete(page);
		},
		[],
	);

	const renderHighlight = (page: number) => {
		if (!highlight || highlight.page !== page) return null;

		return highlight.rects.map((rect, index) => (
			<div
				key={index}
				className='renderer-page-highlight'
				style={{
					left: `${rect.x * scale}px`,
					top: `${rect.y * scale}px`,
					width: `${Math.max(rect.width, 0) * scale}px`,
					height: `${Math.max(rect.height, 1) * scale}px`,
				}}
			/>
		));
	};

	const renderPage = (page: number) => {
		const size = pageSizeFor(pageMetadata, page, scale);

		return (
			<div
				key={`${contentType}-${page}`}
				className='canvas-page'
				onClick={(event) => handlePageClick(page, event)}
				style={
					scrollView
						? {
								top: `${layout.offsets[page] || 0}px`,
								left: '50%',
								transform: 'translateX(-50%)',
							}
						: undefined
				}
			>
				<canvas
					ref={setCanvasRef(page)}
					className='canvas-page-canvas'
					style={{
						width: `${size.width}px`,
						height: `${size.height}px`,
					}}
				/>

				{canvasRendererTextSelection &&
					contentType === 'paged' &&
					pagedSourceRef.current?.renderInteractiveLayer && (
						<div
							ref={setInteractiveLayerRef(page)}
							className='interactiveLayer'
						/>
					)}

				{canvasRendererTextSelection && (
					<div ref={setTextLayerRef(page)} className='textLayer' />
				)}

				{isPdf && canvasRendererAnnotations && (
					<div ref={setAnnotationLayerRef(page)} className='annotationLayer' />
				)}

				{renderHighlight(page)}
			</div>
		);
	};

	if (!canvasRendererEnable) {
		return (
			<div className='ui-viewer' data-surface='base'>
				<div
					className='ui-message'
					data-placement='overlay-center'
					data-variant='error'
				>
					{t('Canvas renderer is disabled. Please enable it in settings.')}
				</div>
			</div>
		);
	}

	const zoomOptions =
		getCanvasRendererSettings().find(
			(setting) => setting.id === 'canvas-renderer-initial-zoom',
		)?.options || [];

	const currentZoom = Math.round(scale * 100).toString();
	const hasCustomZoom = !zoomOptions.some(
		(option) => String(option.value) === currentZoom,
	);

	const visiblePages = scrollView
		? Array.from(
				{ length: Math.max(0, renderRange.end - renderRange.start + 1) },
				(_, index) => renderRange.start + index,
			)
		: [currentPage];

	return (
		<div
			className='ui-viewer'
			data-surface='base'
			ref={containerRef}
			onMouseEnter={() => {
				pointerInsideRef.current = true;
			}}
			onMouseLeave={() => {
				pointerInsideRef.current = false;
			}}
		>
			<div className='renderer-toolbar'>
				<div
					className='renderer-toolbar-content ui-toolbar'
					data-no-left={!headerLabel ? 'true' : undefined}
				>
					{headerLabel && (
						<div className='renderer-toolbar-left'>
							<PluginHeader
								fileName={headerLabel}
								filePath={headerTitle}
								tooltipInfo={tooltipInfo}
							/>
						</div>
					)}
					<div className='renderer-toolbar-right'>
						<div className='ui-toolbar-section' data-gap='control'>
							<button
								type='button'
								onClick={() => goToPage(lastStablePageRef.current - 1)}
								className='ui-icon-button'
								data-variant='control'
								title={t('Previous Page')}
								disabled={currentPage <= 1 || isLoading}
							>
								<ChevronLeftIcon />
							</button>

							<button
								type='button'
								onClick={() => goToPage(lastStablePageRef.current + 1)}
								className='ui-icon-button'
								data-variant='control'
								title={t('Next Page')}
								disabled={currentPage >= numPages || isLoading}
							>
								<ChevronRightIcon />
							</button>
						</div>

						<div className='ui-toolbar-section' data-gap='control'>
							<div className='ui-control-cluster'>
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
									className='ui-field-control'
									data-width='numeric'
									min={1}
									max={numPages}
									disabled={isLoading}
								/>
								<span>/</span>
								<span>{numPages}</span>
							</div>
						</div>

						<div className='ui-toolbar-section' data-gap='control'>
							<button
								type='button'
								onClick={() => commitZoom(scale - ZOOM_STEP)}
								className='ui-icon-button'
								data-variant='control'
								title={t('Zoom Out')}
								disabled={isLoading}
							>
								<ZoomOutIcon />
							</button>

							<select
								value={hasCustomZoom ? 'custom' : currentZoom}
								onChange={(event) => {
									if (event.target.value !== 'custom') {
										commitZoom(Number.parseFloat(event.target.value) / 100);
									}
								}}
								disabled={isLoading}
								className='renderer-toolbar-select ui-field-control'
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
								type='button'
								onClick={() => commitZoom(scale + ZOOM_STEP)}
								className='ui-icon-button'
								data-variant='control'
								title={t('Zoom In')}
								disabled={isLoading}
							>
								<ZoomInIcon />
							</button>
						</div>

						<div className='ui-toolbar-section' data-gap='control'>
							<button
								type='button'
								onClick={() => {
									const nextMode =
										fitMode === 'fit-width' ? 'fit-height' : 'fit-width';

									commitZoom(computeFitScale(nextMode), nextMode);
								}}
								className='ui-icon-button'
								data-variant='control'
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
								type='button'
								onClick={handleToggleView}
								className='ui-icon-button'
								data-variant='control'
								title={scrollView ? t('Single Page View') : t('Scroll View')}
								disabled={isLoading}
							>
								{scrollView ? <PageIcon /> : <ScrollIcon />}
							</button>

							<button
								type='button'
								onClick={handleToggleFullscreen}
								className='ui-icon-button'
								data-variant='control'
								title={isFullscreen ? t('Exit Fullscreen') : t('Fullscreen')}
								disabled={isLoading}
							>
								{isFullscreen ? <MinimizeIcon /> : <ExpandIcon />}
							</button>
						</div>

						<div className='ui-toolbar-section' data-gap='control'>
							<button
								type='button'
								onClick={handleExport}
								className='ui-icon-button'
								data-variant='control'
								title={t('Download')}
								disabled={isLoading || !canExport}
							>
								<DownloadIcon />
							</button>
						</div>
					</div>
				</div>
			</div>

			<div
				className={`ui-viewer-content renderer-content ${isFullscreen ? 'fullscreen' : ''}`}
				data-layout='fill'
				data-overflow='auto'
				ref={scrollView ? scrollContainerRef : contentElRef}
			>
				<div className='canvas-renderer-viewer'>
					{!isLoading &&
						!error &&
						numPages > 0 &&
						(scrollView ? (
							<div
								className='canvas-virtual-wrapper'
								style={{
									position: 'relative',
									height: layout.height,
									width: layout.width,
									margin: '0 auto',
								}}
							>
								{visiblePages.map(renderPage)}
							</div>
						) : (
							renderPage(currentPage)
						))}

					{isLoading && (
						<div
							className='ui-message'
							data-placement='overlay-center'
							data-variant='loading'
						>
							{t('Loading document...')}
						</div>
					)}
				</div>

				{error && (
					<div
						className='ui-message'
						data-placement='overlay-center'
						data-variant='error'
					>
						{error}
					</div>
				)}
			</div>
		</div>
	);
};

CanvasRenderer.displayName = 'CanvasRenderer';

export default CanvasRenderer;
