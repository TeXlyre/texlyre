import type { PdfViewer } from './types';

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

export function getAnnotationName(annotation: {
	fieldName?: string;
	fieldNameStr?: string;
	title?: string;
	T?: string;
	name?: string;
}): string {
	return String(
		annotation.fieldName ||
			annotation.fieldNameStr ||
			annotation.title ||
			annotation.T ||
			annotation.name ||
			'',
	);
}

export function queryByAnnotationId(
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
		} catch {
			// Ignore malformed selectors from unusual annotation ids.
		}
	}

	return null;
}

export function getAnnotationElement(
	pdfViewer: PdfViewer,
	annotationId: string,
): HTMLElement | null {
	const viewerRoot = pdfViewer.viewer;
	if (viewerRoot) {
		const el = queryByAnnotationId(viewerRoot, annotationId);
		if (el) return el;
	}

	const pages = pdfViewer._pages || [];
	for (const pageView of pages) {
		const pageRoot = pageView?.div;
		if (!pageRoot) continue;

		const el = queryByAnnotationId(pageRoot, annotationId);
		if (el) return el;
	}

	return null;
}

export function setVisible(
	el: HTMLElement | undefined | null,
	visible: boolean,
): void {
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

export function makeClickable(el: HTMLElement | undefined | null): void {
	if (!el) return;

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

export function preventNativePdfAction(event: Event): void {
	event.preventDefault();
	event.stopPropagation();
	if ('stopImmediatePropagation' in event) {
		event.stopImmediatePropagation();
	}
}

export function attachPdfButtonHandler(
	el: HTMLElement | undefined | null,
	handler: () => void,
): () => void {
	if (!el) return () => {};

	const clickable =
		(el.querySelector(
			'a, button, input, [role="button"]',
		) as HTMLElement | null) || el;
	const removers: Array<() => void> = [];

	for (const eventName of CONTROL_EVENTS) {
		const listener = (event: Event) => {
			preventNativePdfAction(event);

			if (eventName === 'click' || eventName === 'touchend') {
				handler();
			}
		};

		clickable.addEventListener(eventName, listener, true);
		removers.push(() =>
			clickable.removeEventListener(eventName, listener, true),
		);
	}

	makeClickable(clickable);

	return () => {
		for (const remove of removers) remove();
	};
}

export function addAnnotationMessage(
	el: HTMLElement,
	message: string,
	className: string,
): () => void {
	const messageEl = document.createElement('div');
	messageEl.className = className;
	messageEl.textContent = message;
	messageEl.setAttribute('role', 'note');

	const previousPosition = el.style.position;
	if (!previousPosition) {
		el.style.position = 'relative';
	}

	el.appendChild(messageEl);

	return () => {
		messageEl.remove();
		el.style.position = previousPosition;
	};
}

export function flattenActionStrings(value: unknown): string[] {
	if (!value) return [];
	if (typeof value === 'string') return [value];
	if (Array.isArray(value)) return value.flatMap(flattenActionStrings);
	if (typeof value !== 'object') return [];

	const record = value as Record<string, unknown>;
	return Object.values(record).flatMap(flattenActionStrings);
}
