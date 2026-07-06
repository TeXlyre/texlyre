// extras/renderers/pdf/PdfJsFullViewer.tsx
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

const BASE_PATH = __BASE_PATH__;

type Props = {
	pdfData: Uint8Array;
	scale: number;
	currentPage: number;
	onDocumentReady: (numPages: number) => void;
	onPageChange: (page: number) => void;
	onError: (error: Error) => void;
};

type FrameRecord = {
	name: string;
	index: number;
	annotationId: string;
};

type ControlRecord = {
	name: string;
	annotationId: string;
};

type AnimateManifest = {
	prefix: string;
	frames: FrameRecord[];
	controls: ControlRecord[];
	autoplay: boolean;
};

type AnimateInstance = {
	prefix: string;
	frames: HTMLElement[];
	controls: Map<string, HTMLElement>;
	index: number;
	timer: number | null;
	fps: number;
	direction: 1 | -1;
	playing: boolean;
};

const CONTROL_EVENTS = [
	'pointerdown',
	'pointerup',
	'mousedown',
	'mouseup',
	'click',
	'dblclick',
	'touchstart',
	'touchend',
] as const;

function queryByAnnotationId(
	root: ParentNode,
	annotationId: string,
): HTMLElement | null {
	const selectors = [`[data-annotation-id="${annotationId}"]`];

	if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
		selectors.unshift(`[data-annotation-id="${CSS.escape(annotationId)}"]`);
	}

	for (const selector of selectors) {
		try {
			const el = root.querySelector(selector) as HTMLElement | null;
			if (el) return el;
		} catch {}
	}

	return null;
}

function getAnnotationElement(
	pdfViewer: any,
	annotationId: string,
): HTMLElement | null {
	const viewerRoot = pdfViewer?.viewer as HTMLElement | undefined;
	if (viewerRoot) {
		const el = queryByAnnotationId(viewerRoot, annotationId);
		if (el) return el;
	}

	const pages = pdfViewer?._pages || [];
	for (const pageView of pages) {
		const pageRoot = pageView?.div as HTMLElement | undefined;
		if (!pageRoot) continue;

		const el = queryByAnnotationId(pageRoot, annotationId);
		if (el) return el;
	}

	return null;
}

function setVisible(el: HTMLElement | undefined, visible: boolean): void {
	if (!el) return;

	el.style.setProperty('display', visible ? '' : 'none', 'important');
	el.style.setProperty(
		'visibility',
		visible ? 'visible' : 'hidden',
		'important',
	);
	el.style.setProperty(
		'pointer-events',
		visible ? 'auto' : 'none',
		'important',
	);
	el.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function setFrame(instance: AnimateInstance, nextIndex: number): void {
	if (instance.frames.length === 0) return;

	const max = instance.frames.length - 1;
	const clamped = Math.max(0, Math.min(max, nextIndex));

	instance.frames.forEach((frame, index) => {
		setVisible(frame, index === clamped);
	});

	instance.index = clamped;
}

function setControlIcons(instance: AnimateInstance): void {
	const playing = instance.playing;

	setVisible(instance.controls.get(`${instance.prefix}.PlayRight`), !playing);
	setVisible(instance.controls.get(`${instance.prefix}.PlayLeft`), !playing);
	setVisible(instance.controls.get(`${instance.prefix}.PauseRight`), playing);
	setVisible(instance.controls.get(`${instance.prefix}.PauseLeft`), playing);

	const clickableControls = [
		`${instance.prefix}.PlayPauseRight`,
		`${instance.prefix}.PlayPauseLeft`,
		`${instance.prefix}.StepRight`,
		`${instance.prefix}.StepLeft`,
		`${instance.prefix}.EndRight`,
		`${instance.prefix}.EndLeft`,
		`${instance.prefix}.Plus`,
		`${instance.prefix}.Minus`,
		`${instance.prefix}.Reset`,
		`anm${instance.prefix}`,
	];

	for (const name of clickableControls) {
		const el = instance.controls.get(name);
		if (!el) continue;

		el.style.setProperty('cursor', 'pointer', 'important');
		el.style.setProperty('pointer-events', 'auto', 'important');

		const inner = el.querySelector(
			'a, button, input, [role="button"]',
		) as HTMLElement | null;
		if (inner) {
			inner.style.setProperty('cursor', 'pointer', 'important');
			inner.style.setProperty('pointer-events', 'auto', 'important');
		}
	}
}

function stop(instance: AnimateInstance, keepPausedState = true): void {
	if (instance.timer !== null) {
		window.clearInterval(instance.timer);
		instance.timer = null;
	}

	instance.playing = false;
	setControlIcons(instance);

	if (!keepPausedState) {
		instance.direction = 1;
	}
}

function tick(instance: AnimateInstance): void {
	const next = instance.index + instance.direction;

	if (next >= instance.frames.length) {
		setFrame(instance, 0);
		return;
	}

	if (next < 0) {
		setFrame(instance, instance.frames.length - 1);
		return;
	}

	setFrame(instance, next);
}

function play(instance: AnimateInstance, direction: 1 | -1): void {
	if (instance.timer !== null) {
		window.clearInterval(instance.timer);
	}

	instance.direction = direction;
	instance.playing = true;
	setControlIcons(instance);

	instance.timer = window.setInterval(() => {
		tick(instance);
	}, 1000 / instance.fps);
}

function preventNativePdfAction(event: Event): void {
	event.preventDefault();
	event.stopPropagation();
	if ('stopImmediatePropagation' in event) {
		event.stopImmediatePropagation();
	}
}

function attachControl(el: HTMLElement | undefined, handler: () => void): void {
	if (!el) return;

	const clickable =
		(el.querySelector(
			'a, button, input, [role="button"]',
		) as HTMLElement | null) || el;

	for (const eventName of CONTROL_EVENTS) {
		clickable.addEventListener(
			eventName,
			(event) => {
				preventNativePdfAction(event);

				if (eventName === 'click' || eventName === 'touchend') {
					handler();
				}
			},
			true,
		);
	}

	clickable.style.setProperty('cursor', 'pointer', 'important');
	clickable.style.setProperty('pointer-events', 'auto', 'important');
}

async function buildAnimateManifest(
	pdfDocument: any,
): Promise<AnimateManifest[]> {
	const byPrefix = new Map<string, AnimateManifest>();

	for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
		const page = await pdfDocument.getPage(pageNumber);
		const annotations = await page.getAnnotations();

		for (const annotation of annotations) {
			const rawName =
				annotation.fieldName ||
				annotation.fieldNameStr ||
				annotation.title ||
				annotation.T;
			const name = rawName ? String(rawName) : '';
			const annotationId = annotation.id ? String(annotation.id) : '';

			if (!name || !annotationId || annotation.subtype !== 'Widget') continue;

			const frameMatch = /^(\d+)\.(\d+)$/.exec(name);
			const controlMatch = /^(\d+)\./.exec(name);
			const rootButtonMatch = /^anm(\d+)$/.exec(name);

			if (frameMatch) {
				const prefix = frameMatch[1];
				const index = Number(frameMatch[2]);

				let manifest = byPrefix.get(prefix);
				if (!manifest) {
					manifest = { prefix, frames: [], controls: [], autoplay: false };
					byPrefix.set(prefix, manifest);
				}

				manifest.frames.push({ name, index, annotationId });
				continue;
			}

			const prefix = controlMatch?.[1] || rootButtonMatch?.[1];
			if (!prefix) continue;

			let manifest = byPrefix.get(prefix);
			if (!manifest) {
				manifest = { prefix, frames: [], controls: [], autoplay: false };
				byPrefix.set(prefix, manifest);
			}

			if (rootButtonMatch) {
				manifest.autoplay = true;
			}

			manifest.controls.push({ name, annotationId });
		}
	}

	return Array.from(byPrefix.values()).map((manifest) => ({
		...manifest,
		frames: manifest.frames.sort((a, b) => a.index - b.index),
	}));
}

function installManifest(
	pdfViewer: any,
	manifests: AnimateManifest[],
): boolean {
	let installedAny = false;

	for (const manifest of manifests) {
		const frames = manifest.frames
			.map((frame) => getAnnotationElement(pdfViewer, frame.annotationId))
			.filter(Boolean) as HTMLElement[];

		if (frames.length < 2) continue;

		const controls = new Map<string, HTMLElement>();
		for (const control of manifest.controls) {
			const el = getAnnotationElement(pdfViewer, control.annotationId);
			if (el) controls.set(control.name, el);
		}

		const instance: AnimateInstance = {
			prefix: manifest.prefix,
			frames,
			controls,
			index: 0,
			timer: null,
			fps: 15,
			direction: 1,
			playing: false,
		};

		setFrame(instance, 0);
		setControlIcons(instance);
		installedAny = true;

		attachControl(controls.get(`${manifest.prefix}.StepRight`), () => {
			stop(instance);
			setFrame(instance, instance.index + 1);
		});

		attachControl(controls.get(`${manifest.prefix}.StepLeft`), () => {
			stop(instance);
			setFrame(instance, instance.index - 1);
		});

		attachControl(controls.get(`${manifest.prefix}.EndRight`), () => {
			stop(instance, false);
			setFrame(instance, instance.frames.length - 1);
		});

		attachControl(controls.get(`${manifest.prefix}.EndLeft`), () => {
			stop(instance, false);
			setFrame(instance, 0);
		});

		const playPauseRight = () => {
			if (instance.playing) {
				stop(instance);
			} else {
				if (instance.index === instance.frames.length - 1) {
					setFrame(instance, 0);
				}
				play(instance, 1);
			}
		};

		const playPauseLeft = () => {
			if (instance.playing) {
				stop(instance);
			} else {
				if (instance.index === 0) {
					setFrame(instance, instance.frames.length - 1);
				}
				play(instance, -1);
			}
		};

		attachControl(
			controls.get(`${manifest.prefix}.PlayPauseRight`),
			playPauseRight,
		);
		attachControl(
			controls.get(`${manifest.prefix}.PlayPauseLeft`),
			playPauseLeft,
		);
		attachControl(controls.get(`anm${manifest.prefix}`), playPauseRight);

		attachControl(controls.get(`${manifest.prefix}.PlayRight`), () =>
			play(instance, 1),
		);
		attachControl(controls.get(`${manifest.prefix}.PlayLeft`), () =>
			play(instance, -1),
		);
		attachControl(controls.get(`${manifest.prefix}.PauseRight`), () =>
			stop(instance),
		);
		attachControl(controls.get(`${manifest.prefix}.PauseLeft`), () =>
			stop(instance),
		);

		attachControl(controls.get(`${manifest.prefix}.Plus`), () => {
			instance.fps = Math.min(60, instance.fps * 1.1);
			if (instance.playing) play(instance, instance.direction);
		});

		attachControl(controls.get(`${manifest.prefix}.Minus`), () => {
			instance.fps = Math.max(1, instance.fps / 1.1);
			if (instance.playing) play(instance, instance.direction);
		});

		attachControl(controls.get(`${manifest.prefix}.Reset`), () => {
			instance.fps = 15;
			if (instance.playing) play(instance, instance.direction);
		});

		if (manifest.autoplay) {
			play(instance, 1);
		}
	}

	return installedAny;
}

async function installAnimateShimWhenReady(
	pdfViewer: any,
	pdfDocument: any,
): Promise<void> {
	const manifests = await buildAnimateManifest(pdfDocument);
	if (manifests.length === 0) return;

	let attempts = 0;

	const tryInstall = () => {
		attempts += 1;

		const ok = installManifest(pdfViewer, manifests);
		if (ok) {
			console.info('[PdfJsFullViewer] LaTeX animate shim installed');
			return;
		}

		if (attempts < 40) {
			window.setTimeout(tryInstall, 100);
		} else {
			console.warn(
				'[PdfJsFullViewer] LaTeX animate shim could not find annotation DOM nodes',
				manifests,
			);
		}
	};

	tryInstall();
}

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
	const internalPageChangeRef = useRef(false);
	const shimStartedRef = useRef(false);

	useEffect(() => {
		let cancelled = false;
		let loadingTask: any = null;
		let pdfDocument: any = null;

		const startShim = () => {
			if (
				cancelled ||
				shimStartedRef.current ||
				!pdfDocument ||
				!pdfViewerRef.current
			) {
				return;
			}

			shimStartedRef.current = true;

			installAnimateShimWhenReady(pdfViewerRef.current, pdfDocument).catch(
				(error) => {
					console.warn('[PdfJsFullViewer] animate shim failed:', error);
				},
			);
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
				pdfViewer.currentScale = scale;
				pdfViewer.currentPageNumber = currentPage;
			});

			eventBus.on('pagesloaded', ({ pagesCount }: { pagesCount: number }) => {
				if (cancelled) return;
				onDocumentReady(pagesCount);
				startShim();
			});

			eventBus.on('annotationlayerrendered', startShim);
			eventBus.on('pagerendered', startShim);

			eventBus.on('pagechanging', ({ pageNumber }: { pageNumber: number }) => {
				if (cancelled) return;

				internalPageChangeRef.current = true;
				onPageChange(pageNumber);

				requestAnimationFrame(() => {
					internalPageChangeRef.current = false;
				});
			});

			loadingTask = pdfjs.getDocument({
				data: new Uint8Array(pdfData),
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
			shimStartedRef.current = false;

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
