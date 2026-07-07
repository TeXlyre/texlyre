// extras/renderers/pdf/latexInteraction/LatexPdfInteractionManager.ts
import { AcroTexAdapter } from './AcroTexAdapter';
import { AnimateAdapter } from './AnimateAdapter';
import { OcgAdapter } from './OcgAdapter';
import type {
	LatexPdfInteractionAdapter,
	LatexPdfInteractionAnalysis,
	LatexPdfInteractionContext,
	PdfDocument,
	PdfViewer,
} from './types';

const DEFAULT_INSTALL_ATTEMPTS = 40;
const DEFAULT_INSTALL_RETRY_MS = 100;

export type LatexPdfInteractionManagerOptions = {
	installAttempts?: number;
	installRetryMs?: number;
	onInstalled?: (adapterNames: string[]) => void;
	onWarning?: (message: string, detail?: unknown) => void;
};

export class LatexPdfInteractionManager {
	private readonly adapters: LatexPdfInteractionAdapter[];
	private readonly installAttempts: number;
	private readonly installRetryMs: number;
	private readonly onInstalled?: (adapterNames: string[]) => void;
	private readonly onWarning?: (message: string, detail?: unknown) => void;
	private readonly disposers: Array<() => void> = [];
	private disposed = false;
	private installed = false;
	private timer: number | null = null;

	constructor(
		private readonly pdfViewer: PdfViewer,
		private readonly pdfDocument: PdfDocument,
		options: LatexPdfInteractionManagerOptions = {},
		adapters: LatexPdfInteractionAdapter[] = [
			AnimateAdapter,
			AcroTexAdapter,
			OcgAdapter,
		],
	) {
		this.adapters = adapters;
		this.installAttempts = options.installAttempts || DEFAULT_INSTALL_ATTEMPTS;
		this.installRetryMs = options.installRetryMs || DEFAULT_INSTALL_RETRY_MS;
		this.onInstalled = options.onInstalled;
		this.onWarning = options.onWarning;
	}

	async installWhenReady(): Promise<void> {
		const analysis = await this.analyze();
		const context: LatexPdfInteractionContext = {
			pdfViewer: this.pdfViewer,
			pdfDocument: this.pdfDocument,
			analysis,
		};
		let attempts = 0;

		const tryInstall = async () => {
			if (this.disposed || this.installed) return;

			attempts += 1;
			const installedAdapters: string[] = [];

			for (const adapter of this.adapters) {
				try {
					if (!adapter.detect(context)) continue;

					const result = await adapter.install(context);
					if (!result.installed) continue;

					installedAdapters.push(adapter.name);
					if (result.dispose) this.disposers.push(result.dispose);
				} catch (error) {
					this.onWarning?.(
						`LaTeX PDF ${adapter.name} adapter failed to install`,
						error,
					);
				}
			}

			if (installedAdapters.length > 0) {
				this.installed = true;
				this.onInstalled?.(installedAdapters);
				return;
			}

			if (attempts < this.installAttempts) {
				this.timer = window.setTimeout(tryInstall, this.installRetryMs);
				return;
			}

			this.onWarning?.(
				'LaTeX PDF interaction adapters could not find matching annotation DOM nodes',
				analysis,
			);
		};

		await tryInstall();
	}

	dispose(): void {
		this.disposed = true;

		if (this.timer !== null) {
			window.clearTimeout(this.timer);
			this.timer = null;
		}

		for (const dispose of this.disposers.splice(0)) {
			try {
				dispose();
			} catch {
				// Best-effort cleanup for DOM listeners created by adapters.
			}
		}
	}

	private async analyze(): Promise<LatexPdfInteractionAnalysis> {
		const [fieldObjects, documentActions, optionalContentConfig, pageLabels] =
			await Promise.all([
				this.pdfDocument.getFieldObjects?.().catch(() => null),
				this.pdfDocument.getJSActions?.().catch(() => null),
				this.pdfDocument.getOptionalContentConfig?.().catch(() => null),
				this.pdfDocument.getPageLabels?.().catch(() => null),
			]);
		const pageAnnotations = [];

		for (
			let pageNumber = 1;
			pageNumber <= this.pdfDocument.numPages;
			pageNumber++
		) {
			const page = await this.pdfDocument.getPage(pageNumber);
			const annotations = await page.getAnnotations();
			pageAnnotations.push({ pageNumber, annotations });
		}

		return {
			pageAnnotations,
			fieldObjects: fieldObjects || null,
			documentActions: documentActions || null,
			optionalContentConfig: optionalContentConfig || null,
			pageLabels: pageLabels || null,
		};
	}
}

export function createLatexPdfInteractionManager(
	pdfViewer: PdfViewer,
	pdfDocument: PdfDocument,
	options?: LatexPdfInteractionManagerOptions,
): LatexPdfInteractionManager {
	return new LatexPdfInteractionManager(pdfViewer, pdfDocument, options);
}
