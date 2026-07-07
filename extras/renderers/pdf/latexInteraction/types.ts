// extras/renderers/pdf/latexInteraction/types.ts
export type PdfAnnotation = {
	id?: string;
	subtype?: string;
	annotationType?: number;
	fieldName?: string;
	fieldNameStr?: string;
	title?: string;
	T?: string;
	name?: string;
	contents?: string;
	alternativeText?: string;
	url?: string;
	unsafeUrl?: string;
	dest?: unknown;
	namedDest?: string;
	action?: unknown;
	actions?: Record<string, unknown>;
	additionalActions?: Record<string, unknown>;
	jsAction?: string;
	rect?: number[];
	[key: string]: unknown;
};

export type PdfPage = {
	getAnnotations: () => Promise<PdfAnnotation[]>;
};

export type PdfDocument = {
	numPages: number;
	getPage: (pageNumber: number) => Promise<PdfPage>;
	getFieldObjects?: () => Promise<Record<string, unknown> | null>;
	getJSActions?: () => Promise<Record<string, unknown> | null>;
	getOptionalContentConfig?: () => Promise<unknown>;
	getPageLabels?: () => Promise<string[] | null>;
};

export type PdfViewer = {
	viewer?: HTMLElement;
	_pages?: Array<{ div?: HTMLElement }>;
	[key: string]: unknown;
};

export type LatexPdfPageAnnotations = {
	pageNumber: number;
	annotations: PdfAnnotation[];
};

export type LatexPdfInteractionAnalysis = {
	pageAnnotations: LatexPdfPageAnnotations[];
	fieldObjects: Record<string, unknown> | null;
	documentActions: Record<string, unknown> | null;
	optionalContentConfig: unknown;
	pageLabels: string[] | null;
};

export type LatexPdfInteractionContext = {
	pdfViewer: PdfViewer;
	pdfDocument: PdfDocument;
	analysis: LatexPdfInteractionAnalysis;
};

export type LatexPdfAdapterInstallResult = {
	installed: boolean;
	dispose?: () => void;
};

export type LatexPdfInteractionAdapter = {
	readonly name: string;
	detect: (context: LatexPdfInteractionContext) => boolean;
	install: (
		context: LatexPdfInteractionContext,
	) => LatexPdfAdapterInstallResult | Promise<LatexPdfAdapterInstallResult>;
};
