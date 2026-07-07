// extras/renderers/pdf/latexInteraction/interactionDetection.ts
import type { PdfAnnotation, PdfDocument } from './types';
import { flattenActionStrings, getAnnotationName } from './dom';

export type LatexInteractionDetection = {
	interactive: boolean;
	reasons: string[];
};

function hasAnnotationAction(annotation: PdfAnnotation): boolean {
	return Boolean(
		annotation.action ||
			annotation.actions ||
			annotation.additionalActions ||
			annotation.jsAction,
	);
}

function isAnimateAnnotation(annotation: PdfAnnotation): boolean {
	const name = getAnnotationName(annotation);
	return (
		/^\d+\.\d+$/.test(name) || /^\d+\./.test(name) || /^anm\d+$/.test(name)
	);
}

function hasKnownLatexJavaScript(
	actions: Record<string, unknown> | null,
): boolean {
	const js = flattenActionStrings(actions).join('\n');
	return /this\.getField|app\.setTimeOut|app\.setInterval|\.display\b|ocg|animate|anim\b/i.test(
		js,
	);
}

export async function detectLatexInteractivePdf(
	pdfDocument: PdfDocument,
): Promise<LatexInteractionDetection> {
	const reasons = new Set<string>();

	const [fieldObjects, documentActions, optionalContentConfig] =
		await Promise.all([
			pdfDocument.getFieldObjects?.().catch(() => null),
			pdfDocument.getJSActions?.().catch(() => null),
			pdfDocument.getOptionalContentConfig?.().catch(() => null),
		]);

	if (fieldObjects && Object.keys(fieldObjects).length > 0) {
		reasons.add('AcroForm fields');
	}

	if (hasKnownLatexJavaScript(documentActions || null)) {
		reasons.add('LaTeX JavaScript actions');
	}

	if (optionalContentConfig) {
		reasons.add('Optional content groups');
	}

	for (let pageNumber = 1; pageNumber <= pdfDocument.numPages; pageNumber++) {
		const page = await pdfDocument.getPage(pageNumber);
		const annotations = await page.getAnnotations();

		for (const annotation of annotations) {
			if (isAnimateAnnotation(annotation))
				reasons.add('animate package widgets');
			if (hasAnnotationAction(annotation)) reasons.add('annotation actions');
		}
	}

	return {
		interactive: reasons.size > 0,
		reasons: Array.from(reasons),
	};
}
