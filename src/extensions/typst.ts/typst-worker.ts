import { createTypstCompiler } from '@myriaddreamin/typst.ts/compiler';
import { createTypstRenderer } from '@myriaddreamin/typst.ts/renderer';

import type { TypstOutputFormat } from '../../types/typst';
import { sanitizeSvg } from '../../utils/svgSanitizer';
import { normalizeTypstSvgNavigation } from './svgNavigation';
import { longPathFetchPackageRegistry } from './LongPathPackageRegistry';
import { createNamedLogger } from '@/logging';

const moduleLog = createNamedLogger('typst-worker');

const BASE_PATH = __BASE_PATH__;

declare const self: DedicatedWorkerGlobalScope;

type OutputFormat = TypstOutputFormat;

type CompileMessage = {
	id: string;
	type: 'compile';
	payload: {
		mainFilePath: string;
		sources: Record<string, string | Uint8Array>;
		format: OutputFormat;
		pdfOptions?: {
			pdfStandard?: string;
			pdfTags?: boolean;
			creationTimestamp?: number;
		};
		options?: {
			allowRemoteUrls?: boolean;
		};
	};
};

type PingMessage = {
	id: string;
	type: 'ping';
};

type InboundMessage = CompileMessage | PingMessage;

type DoneResponse = {
	id: string;
	type: 'done';
	result: {
		format: OutputFormat;
		output: Uint8Array | string;
		diagnostics?: any[];
		pageInfos?: any[];
	};
};

type PongResponse = {
	id: string;
	type: 'pong';
};

type ErrorResponse = {
	id: string;
	type: 'error';
	error: string;
};

let compiler: any = null;
let renderer: any = null;
let initialized = false;

function mergeDiagnostics(...groups: any[][]): any[] {
	const seen = new Set<string>();
	const out: any[] = [];
	for (const group of groups) {
		for (const diag of group) {
			const key = `${diag.severity}|${diag.path ?? ''}|${diag.range ?? ''}|${diag.message}`;
			if (seen.has(key)) continue;
			seen.add(key);
			out.push(diag);
		}
	}
	return out;
}

const defaultFonts = [
	'DejaVuSansMono-Bold.ttf',
	'DejaVuSansMono-BoldOblique.ttf',
	'DejaVuSansMono-Oblique.ttf',
	'DejaVuSansMono.ttf',
	'LibertinusSerif-Bold.otf',
	'LibertinusSerif-BoldItalic.otf',
	'LibertinusSerif-Italic.otf',
	'LibertinusSerif-Regular.otf',
	'LibertinusSerif-Semibold.otf',
	'LibertinusSerif-SemiboldItalic.otf',
	'NewCM10-Bold.otf',
	'NewCM10-BoldItalic.otf',
	'NewCM10-Italic.otf',
	'NewCM10-Regular.otf',
	'NewCMMath-Bold.otf',
	'NewCMMath-Book.otf',
	'NewCMMath-Regular.otf',
];

async function loadFonts(baseUrl: string = `${BASE_PATH}/assets/fonts`) {
	const fontPaths: string[] = [];

	try {
		const indexResponse = await fetch(`${baseUrl}/fonts.json`);
		if (indexResponse.ok) {
			const fontList = await indexResponse.json();
			fontPaths.push(...fontList.map((font: string) => `${baseUrl}/${font}`));
		}
	} catch {
		moduleLog.warn('fonts.json not found, using default font list');
		fontPaths.push(...defaultFonts.map((font) => `${baseUrl}/${font}`));
	}

	const fontPromises = fontPaths.map(async (path) => {
		try {
			const response = await fetch(path);
			if (!response.ok) {
				moduleLog.warn(`Failed to fetch font: ${path}`);
				return null;
			}
			const buffer = await response.arrayBuffer();
			return new Uint8Array(buffer);
		} catch (error) {
			moduleLog.warn(`Error loading font ${path}:`, error);
			return null;
		}
	});
	const fonts = await Promise.all(fontPromises);
	return fonts.filter((f) => f !== null) as Uint8Array[];
}

async function retrievePageInfos(artifact: Uint8Array): Promise<any[]> {
	let pageInfos: any[] = [];
	await renderer.runWithSession(async (session: any) => {
		await renderer.manipulateData({
			renderSession: session,
			action: 'reset',
			data: artifact,
		});
		try {
			pageInfos = session.retrievePagesInfo() ?? [];
		} catch {
			pageInfos = [];
		}
	});
	return pageInfos;
}

async function ensureInit() {
	if (initialized) return;

	const fonts = await loadFonts();
	// NOTE (fabawi): Patch for issue (#340)[https://github.com/TeXlyre/texlyre/issues/340]
	// const packageRegistry = TypstSnippet.fetchPackageRegistry();
	const packageRegistry = longPathFetchPackageRegistry();

	compiler = createTypstCompiler();

	await compiler.init({
		getModule: () =>
			`${BASE_PATH}/core/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm`,
		beforeBuild: [
			...packageRegistry.provides,
			async (_: any, { builder }: any) => {
				for (const font of fonts) {
					await builder.add_raw_font(font);
				}
			},
		],
	});

	renderer = createTypstRenderer();
	await renderer.init({
		getModule: () =>
			`${BASE_PATH}/core/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm`,
		beforeBuild: [
			async (_: any, { builder }: any) => {
				for (const font of fonts) {
					await builder.add_raw_font(font);
				}
			},
		],
	});

	initialized = true;
}

self.addEventListener('message', async (e: MessageEvent<InboundMessage>) => {
	const data = e.data;
	const { id, type } = data;
	try {
		if (type === 'ping') {
			const resp: PongResponse = { id, type: 'pong' };
			self.postMessage(resp);
			return;
		}
		await ensureInit();

		const { payload } = data as CompileMessage;
		const { mainFilePath, sources, format, pdfOptions, options } = payload;
		const allowRemoteUrls = options?.allowRemoteUrls !== false;

		compiler.resetShadow();
		for (const [path, content] of Object.entries(sources)) {
			const absolutePath = path.startsWith('/') ? path : `/${path}`;
			if (typeof content === 'string') {
				compiler.addSource(absolutePath, content);
			} else {
				compiler.mapShadow(absolutePath, content);
			}
		}
		const absoluteMainPath = mainFilePath.startsWith('/')
			? mainFilePath
			: `/${mainFilePath}`;
		let output: Uint8Array | string;
		let diagnostics: any[] = [];

		if (format === 'pdf' || format === 'canvas-pdf') {
			const pdfStandard = pdfOptions?.pdfStandard || '"1.7"';
			const pdfTags =
				pdfOptions?.pdfTags !== undefined ? pdfOptions.pdfTags : true;
			const creationTimestamp =
				pdfOptions?.creationTimestamp || Math.floor(Date.now() / 1000);

			const compiled = await compiler.runWithWorld(
				{ mainFilePath: absoluteMainPath },
				async (world: any) => {
					world.setPdfOpts({
						pdf_standard: pdfStandard,
						pdf_tags: pdfTags,
						creation_timestamp: creationTimestamp,
					});
					const paged = await world.compile({ diagnostics: 'full' });
					const res = await world.pdf({ diagnostics: 'full' });
					return {
						result: res.result,
						diagnostics: mergeDiagnostics(
							paged.diagnostics ?? [],
							res.diagnostics ?? [],
						),
					};
				},
			);
			output = compiled.result as Uint8Array;
			diagnostics = compiled.diagnostics;
		} else {
			const compiled = await compiler.runWithWorld(
				{ mainFilePath: absoluteMainPath },
				async (world: any) => {
					const paged = await world.compile({ diagnostics: 'full' });
					const res = await world.vector({ diagnostics: 'full' });
					return {
						result: res.result,
						diagnostics: mergeDiagnostics(
							paged.diagnostics ?? [],
							res.diagnostics ?? [],
						),
					};
				},
			);
			diagnostics = compiled.diagnostics;

			if (!compiled.result || compiled.result.byteLength === 0) {
				const resp: DoneResponse = {
					id,
					type: 'done',
					result: { format, output: new Uint8Array(0), diagnostics },
				};
				self.postMessage(resp);
				return;
			}

			const rawSvg = await renderer.renderSvg({
				artifactContent: compiled.result,
			});

			output = sanitizeSvg(normalizeTypstSvgNavigation(String(rawSvg)), {
				baseUrl: self.location.href,
				allowRemoteUrls,
			});
			const pageInfos = await retrievePageInfos(compiled.result);

			const resp: DoneResponse = {
				id,
				type: 'done',
				result: { format, output, diagnostics, pageInfos },
			};
			self.postMessage(resp);
			return;
		}

		const transferList: Transferable[] =
			output instanceof Uint8Array ? [output.buffer as ArrayBuffer] : [];
		const resp: DoneResponse = {
			id,
			type: 'done',
			result: { format, output, diagnostics },
		};
		self.postMessage(resp, transferList);
	} catch (err: unknown) {
		const message =
			typeof err === 'object' && err && 'message' in err
				? String((err as any).message)
				: String(err);
		const resp: ErrorResponse = { id, type: 'error', error: message };
		self.postMessage(resp);
	}
});
