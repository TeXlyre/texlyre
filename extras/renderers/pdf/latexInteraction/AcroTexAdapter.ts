// extras/renderers/pdf/latexInteraction/AcroTexAdapter.ts
import type {
	LatexPdfAdapterInstallResult,
	LatexPdfInteractionAdapter,
	LatexPdfInteractionContext,
	PdfAnnotation,
} from './types';
import {
	attachPdfButtonHandler,
	flattenActionStrings,
	getAnnotationElement,
	getAnnotationName,
	setVisible,
} from './dom';

type FieldApi = {
	readonly name: string;
	display: number;
	readonly hidden: boolean;
};

type TimerRecord = {
	id: number;
	clear: () => void;
};

const DISPLAY = {
	visible: 0,
	hidden: 1,
	noPrint: 2,
	noView: 3,
};

function collectActionJavaScript(annotation: PdfAnnotation): string {
	return flattenActionStrings([
		annotation.action,
		annotation.actions,
		annotation.additionalActions,
		annotation.jsAction,
	]).join('\n');
}

function hasSupportedJavaScript(js: string): boolean {
	return /this\.getField\s*\(|\.display\b|app\.setTimeOut\s*\(|app\.setInterval\s*\(/.test(
		js,
	);
}

function createFieldMap(
	context: LatexPdfInteractionContext,
): Map<string, HTMLElement[]> {
	const fields = new Map<string, HTMLElement[]>();

	for (const page of context.analysis.pageAnnotations) {
		for (const annotation of page.annotations) {
			if (!annotation.id) continue;

			const name = getAnnotationName(annotation);
			if (!name) continue;

			const el = getAnnotationElement(context.pdfViewer, String(annotation.id));
			if (!el) continue;

			const list = fields.get(name) || [];
			list.push(el);
			fields.set(name, list);
		}
	}

	return fields;
}

function readDisplayValue(rawValue: string): number | null {
	const value = rawValue.trim();
	if (/^display\.hidden$/.test(value)) return DISPLAY.hidden;
	if (/^display\.visible$/.test(value)) return DISPLAY.visible;
	if (/^display\.noPrint$/.test(value)) return DISPLAY.noPrint;
	if (/^display\.noView$/.test(value)) return DISPLAY.noView;

	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : null;
}

function createFieldApi(name: string, elements: HTMLElement[]): FieldApi {
	let display = elements.every((el) => el.style.display === 'none')
		? DISPLAY.hidden
		: DISPLAY.visible;

	return {
		name,
		get display() {
			return display;
		},
		set display(nextDisplay: number) {
			display = nextDisplay;
			const visible =
				nextDisplay === DISPLAY.visible || nextDisplay === DISPLAY.noPrint;
			for (const el of elements) setVisible(el, visible);
		},
		get hidden() {
			return display === DISPLAY.hidden || display === DISPLAY.noView;
		},
	};
}

function executeSupportedJavaScript(
	js: string,
	fields: Map<string, HTMLElement[]>,
	timers: TimerRecord[],
): void {
	const run = (source: string) => {
		const assignmentPattern =
			/this\.getField\(["']([^"']+)["']\)\.display\s*=\s*([^;\n]+)/g;
		let assignment: RegExpExecArray | null;

		while ((assignment = assignmentPattern.exec(source))) {
			const [, fieldName, rawValue] = assignment;
			const elements = fields.get(fieldName);
			const displayValue = readDisplayValue(rawValue);

			if (!elements || displayValue === null) continue;
			createFieldApi(fieldName, elements).display = displayValue;
		}
	};

	run(js);

	const timeoutPattern =
		/app\.setTimeOut\(["']([\s\S]*?)["']\s*,\s*(\d+)\s*\)/g;
	let timeout: RegExpExecArray | null;
	while ((timeout = timeoutPattern.exec(js))) {
		const [, source, delay] = timeout;
		const id = window.setTimeout(() => run(source), Number(delay));
		timers.push({ id, clear: () => window.clearTimeout(id) });
	}

	const intervalPattern =
		/app\.setInterval\(["']([\s\S]*?)["']\s*,\s*(\d+)\s*\)/g;
	let interval: RegExpExecArray | null;
	while ((interval = intervalPattern.exec(js))) {
		const [, source, delay] = interval;
		const id = window.setInterval(() => run(source), Number(delay));
		timers.push({ id, clear: () => window.clearInterval(id) });
	}
}

export const AcroTexAdapter: LatexPdfInteractionAdapter = {
	name: 'acrotex',
	detect: (context: LatexPdfInteractionContext) => {
		if (
			flattenActionStrings(context.analysis.documentActions).some(
				hasSupportedJavaScript,
			)
		) {
			return true;
		}

		return context.analysis.pageAnnotations.some((page) =>
			page.annotations.some((annotation) =>
				hasSupportedJavaScript(collectActionJavaScript(annotation)),
			),
		);
	},
	install: (context): LatexPdfAdapterInstallResult => {
		const fields = createFieldMap(context);
		const timers: TimerRecord[] = [];
		const disposers: Array<() => void> = [];
		let installed = false;

		for (const js of flattenActionStrings(context.analysis.documentActions)) {
			if (!hasSupportedJavaScript(js)) continue;
			installed = true;
			executeSupportedJavaScript(js, fields, timers);
		}

		for (const page of context.analysis.pageAnnotations) {
			for (const annotation of page.annotations) {
				const js = collectActionJavaScript(annotation);
				if (!annotation.id || !hasSupportedJavaScript(js)) continue;

				const el = getAnnotationElement(
					context.pdfViewer,
					String(annotation.id),
				);
				if (!el) continue;

				installed = true;
				disposers.push(
					attachPdfButtonHandler(el, () => {
						executeSupportedJavaScript(js, fields, timers);
					}),
				);
			}
		}

		return {
			installed,
			dispose: () => {
				for (const timer of timers) timer.clear();
				for (const dispose of disposers) dispose();
			},
		};
	},
};
