// extras/renderers/pdf/PdfRenderer.tsx
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
import * as pdfjs from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';

import { t } from '@/i18n';
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
import { PdfJsFullViewer, type PdfJsFullViewerHandle } from './PdfJsFullViewer';
import './styles.css';
import { createNamedLogger } from '@/logging';
const moduleLog = createNamedLogger('PdfRenderer');

const BASE_PATH = __BASE_PATH__;

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
	'pdfjs-dist/build/pdf.worker.min.mjs',
	import.meta.url,
).toString();

type PageSize = { width: number; height: number };
type Highlight = {
	page: number;
	rects: Array<{ x: number; y: number; width: number; height: number }>;
} | null;

const DEFAULT_WIDTH = 595;
const DEFAULT_HEIGHT = 842;
const MIN_SCALE = 0.25;
const MAX_SCALE = 5;
const ZOOM_STEP = 0.25;

const clamp = (value: number, min: number, max: number) =>
	Math.max(min, Math.min(max, value));

const getContentHash = (buffer: ArrayBuffer): string => {
	const view = new Uint8Array(buffer);
	const start = Array.from(view.slice(0, Math.min(32, view.length))).join(',');
	const end = Array.from(view.slice(Math.max(0, view.length - 32))).join(',');
	return `${buffer.byteLength}-${start}-${end}`;
};

const toArrayBuffer = (content: ArrayBuffer | string): ArrayBuffer =>
	typeof content === 'string'
		? new TextEncoder().encode(content).buffer
		: content;

const loadPdfDocument = async (pdfData: Uint8Array) => {
	const loadingTask = pdfjs.getDocument({
		data: new Uint8Array(pdfData).slice(),
		cMapUrl: `${BASE_PATH}/assets/cmaps/`,
		cMapPacked: true,
		enableXfa: true,
		disableFontFace: false,
		useSystemFonts: true,
		fontExtraProperties: true,
	});

	return loadingTask.promise;
};

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
	const pdfRendererAnnotations =
		(getSetting('pdf-renderer-annotations')?.value as boolean) ?? true;

	const [numPages, setNumPages] = useState(0);
	const [currentPage, setCurrentPage] = useState(1);
	const [pageInput, setPageInput] = useState('1');
	const [isEditingPageInput, setIsEditingPageInput] = useState(false);
	const [scale, setScale] = useState(1);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [pdfDocument, setPdfDocument] = useState<any>(null);
	const [scrollView, setScrollView] = useState(false);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [fitMode, setFitMode] = useState<'fit-width' | 'fit-height'>(
		'fit-width',
	);
	const [highlight, setHighlight] = useState<Highlight>(null);

	const propertiesRegistered = useRef(false);
	const pageSizes = useRef<Map<number, PageSize>>(new Map());
	const lastStablePageRef = useRef(1);
	const contentHashRef = useRef('');
	const originalContentRef = useRef<ArrayBuffer | null>(null);
	const pendingRestorePageRef = useRef<number | null>(null);
	const pendingRestoreScrollTopRef = useRef<number | null>(null);
	const numPagesRef = useRef(0);
	const scaleRef = useRef(1);
	const pointerInsideRef = useRef(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const contentElRef = useRef<HTMLDivElement>(null);
	const fullViewerRef = useRef<PdfJsFullViewerHandle | null>(null);

	useEffect(() => {
		numPagesRef.current = numPages;
	}, [numPages]);

	useEffect(() => {
		scaleRef.current = scale;
	}, [scale]);

	useEffect(() => {
		return () => {
			pdfDocument?.destroy?.();
		};
	}, [pdfDocument]);

	const tooltipInfo = useMemo(() => {
		if (numPages <= 0) return undefined;

		const firstSize = pageSizes.current.get(1);
		const fileSize = originalContentRef.current?.byteLength ?? 0;

		return [
			t('Type: PDF'),
			t('MIME Type: {mimeType}', { mimeType: 'application/pdf' }),
			t('Pages: {count}', { count: numPages }),
			t('Dimensions: {width} × {height}', {
				width: firstSize?.width ?? '—',
				height: firstSize?.height ?? '—',
			}),
			t('Size: {size}', { size: formatFileSize(fileSize) }),
		];
	}, [numPages]);

	const setPage = useCallback(
		(page: number) => {
			const target = clamp(page, 1, numPagesRef.current || 1);
			lastStablePageRef.current = target;
			setCurrentPage(target);
			if (!isEditingPageInput) setPageInput(String(target));
			setProperty('pdf-renderer-current-page', target);
		},
		[isEditingPageInput, setProperty],
	);

	const goToPage = useCallback(
		(page: number) => {
			const target = clamp(page, 1, numPagesRef.current || 1);
			setPage(target);
			fullViewerRef.current?.goToPage(target);
		},
		[setPage],
	);

	const setPdfContent = useCallback((buffer: ArrayBuffer) => {
		if (!buffer || buffer.byteLength === 0) {
			setPdfDocument((previous: any) => {
				previous?.destroy?.();
				return null;
			});
			originalContentRef.current = null;
			contentHashRef.current = '';
			pageSizes.current.clear();
			setNumPages(0);
			setError(t('No PDF content available'));
			setIsLoading(false);
			return;
		}

		try {
			const nextHash = getContentHash(buffer);
			if (contentHashRef.current === nextHash) return;

			const dataCopy = new Uint8Array(new Uint8Array(buffer));
			pendingRestorePageRef.current = lastStablePageRef.current;
			pendingRestoreScrollTopRef.current =
				fullViewerRef.current?.getScrollTop() ?? null;
			originalContentRef.current = dataCopy.buffer.slice(0);
			contentHashRef.current = nextHash;
			pageSizes.current.clear();
			setError(null);
			setIsLoading(true);

			loadPdfDocument(dataCopy)
				.then((nextDocument) => {
					setPdfDocument((previous: any) => {
						previous?.destroy?.();
						return nextDocument;
					});
				})
				.catch((error) => {
					setError(
						t('Failed to load PDF: {error}', {
							error: error instanceof Error ? error.message : String(error),
						}),
					);
					setIsLoading(false);
				});
		} catch (error) {
			moduleLog.error('Error creating PDF data:', error);
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
				setPdfContent(toArrayBuffer(nextContent));
			},
			updatePdfContent: (nextContent: ArrayBuffer | string) => {
				setPdfContent(toArrayBuffer(nextContent));
			},
			setHighlight: (nextHighlight: Highlight) => {
				setHighlight(nextHighlight);
				if (nextHighlight) {
					const targetPage = nextHighlight.page;
					requestAnimationFrame(() => goToPage(targetPage));
				}
			},
		}),
		[goToPage, setPdfContent],
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

		const storedZoom = Number(getProperty('pdf-renderer-zoom'));
		const storedScrollView = getProperty('pdf-renderer-scroll-view');
		const storedPage = Number(getProperty('pdf-renderer-current-page'));

		if (Number.isFinite(storedZoom)) {
			setScale(clamp(storedZoom, MIN_SCALE, MAX_SCALE));
		}

		if (storedScrollView !== undefined) {
			setScrollView(Boolean(storedScrollView));
		}

		if (Number.isFinite(storedPage) && storedPage >= 1) {
			pendingRestorePageRef.current = storedPage;
		}
	}, [registerProperty, getProperty]);

	useEffect(() => {
		if (content instanceof ArrayBuffer && content.byteLength > 0) {
			setPdfContent(content);
		}
	}, [content, setPdfContent]);

	const handleDocumentReady = useCallback(
		(loadedNumPages: number) => {
			const restorePage = clamp(
				pendingRestorePageRef.current || lastStablePageRef.current || 1,
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

			requestAnimationFrame(() => {
				fullViewerRef.current?.goToPage(restorePage);
				if (pendingRestoreScrollTopRef.current !== null && scrollView) {
					fullViewerRef.current?.setScrollTop(
						pendingRestoreScrollTopRef.current,
					);
				}
				pendingRestoreScrollTopRef.current = null;
			});
		},
		[isEditingPageInput, scrollView],
	);

	const handlePageSize = useCallback((page: number, size: PageSize) => {
		pageSizes.current.set(page, size);
	}, []);

	const computeFitScale = useCallback((mode: 'fit-width' | 'fit-height') => {
		const resolved = fullViewerRef.current?.applyFitScale(mode);
		if (resolved !== null && resolved !== undefined) {
			return clamp(resolved, MIN_SCALE, MAX_SCALE);
		}

		const container = contentElRef.current;
		const size = fullViewerRef.current?.getPageSize(
			lastStablePageRef.current,
		) ||
			pageSizes.current.get(lastStablePageRef.current) || {
				width: DEFAULT_WIDTH,
				height: DEFAULT_HEIGHT,
			};

		return mode === 'fit-width'
			? clamp(
					((container?.clientWidth || 800) - 40) / size.width,
					MIN_SCALE,
					MAX_SCALE,
				)
			: clamp(
					((container?.clientHeight || 600) - 40) / size.height,
					MIN_SCALE,
					MAX_SCALE,
				);
	}, []);

	const commitZoom = useCallback(
		(nextScale: number, nextFitMode?: 'fit-width' | 'fit-height') => {
			nextScale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
			if (nextScale === scale && nextFitMode === undefined) return;

			flushSync(() => {
				if (nextFitMode) setFitMode(nextFitMode);
				setScale(nextScale);
			});

			fullViewerRef.current?.setScale(nextScale);
			setProperty('pdf-renderer-zoom', nextScale);
		},
		[scale, setProperty],
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

			if (Number.isFinite(page)) goToPage(page);
			else setPageInput(String(currentPage));

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

	const handleToggleView = useCallback(() => {
		const nextScrollView = !scrollView;
		pendingRestorePageRef.current = lastStablePageRef.current;
		pendingRestoreScrollTopRef.current =
			fullViewerRef.current?.getScrollTop() ?? null;
		setScrollView(nextScrollView);
		setProperty('pdf-renderer-scroll-view', nextScrollView);
	}, [scrollView, setProperty]);

	const handleToggleFullscreen = useCallback(() => {
		if (document.fullscreenElement === containerRef.current) {
			document.exitFullscreen().then(() => setIsFullscreen(false));
			return;
		}

		if (!document.fullscreenElement) {
			containerRef.current
				?.requestFullscreen()
				.then(() => setIsFullscreen(true));
		}
	}, []);

	useEffect(() => {
		const handleFullscreenChange = () => {
			const active = document.fullscreenElement === containerRef.current;
			setIsFullscreen(active);

			if (active) {
				requestAnimationFrame(() =>
					commitZoom(computeFitScale(fitMode), fitMode),
				);
			}
		};

		document.addEventListener('fullscreenchange', handleFullscreenChange);
		return () =>
			document.removeEventListener('fullscreenchange', handleFullscreenChange);
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
			moduleLog.error('Export error:', error);
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
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [handlePreviousPage, handleNextPage]);

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
				ref={contentElRef}
			>
				{pdfDocument && (
					<PdfJsFullViewer
						ref={fullViewerRef}
						pdfDocument={pdfDocument}
						scale={scale}
						currentPage={currentPage}
						scrollView={scrollView}
						textSelection={pdfRendererTextSelection}
						annotations={pdfRendererAnnotations}
						highlight={highlight}
						onDocumentReady={handleDocumentReady}
						onPageChange={setPage}
						onPageSize={handlePageSize}
						onLocationClick={onLocationClick}
						onError={(error) => {
							setError(
								t('Failed to load PDF: {error}', { error: error.message }),
							);
							setIsLoading(false);
						}}
					/>
				)}

				{isLoading && (
					<div className='pdf-renderer-loading'>
						{t('Loading PDF document...')}
					</div>
				)}
			</div>

			{error && <div className='pdf-renderer-error'>{error}</div>}
		</div>
	);
};

export default PdfRenderer;
