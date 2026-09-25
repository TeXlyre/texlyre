import { createTypstCompiler } from '@myriaddreamin/typst.ts/compiler';

import type { TypstOutputFormat } from '../../types/typst';
import { sanitizeSvg } from '../../utils/svgSanitizer';
import { longPathFetchPackageRegistry } from './LongPathPackageRegistry';
import { normalizeTypstSvgNavigation } from './svgNavigation';
import {
	getTypstRenderer,
	loadTypstFonts,
	BASE_PATH,
} from './TypstRendererRuntime';

declare const self: DedicatedWorkerGlobalScope;

type CompileMessage = {
	id: string;
	type: 'compile';
	payload: {
		mainFilePath: string;
		sources: Record<string, string | Uint8Array>;
		format: TypstOutputFormat;
		pdfOptions?: {
			pdfStandard?: string;
			pdfTags?: boolean;
			creationTimestamp?: number;
		};
		options?: {
			allowRemoteUrls?: boolean;
			buildSourceMap?: boolean;
		};
	};
};

type PingMessage = { id: string; type: 'ping' };
type InboundMessage = CompileMessage | PingMessage;

type DoneResponse = {
	id: string;
	type: 'done';
	result: {
		format: TypstOutputFormat;
		output: Uint8Array | string;
		sourceMapArtifact?: Uint8Array;
		diagnostics?: any[];
	};
};

type ErrorResponse = { id: string; type: 'error'; error: string };

let compiler: any = null;
let compilerPromise: Promise<void> | null = null;

function mergeDiagnostics(...groups: any[][]): any[] {
	const seen = new Set<string>();
	const output: any[] = [];

	for (const group of groups) {
		for (const diagnostic of group) {
			const key = `${diagnostic.severity}|${diagnostic.path ?? ''}|${diagnostic.range ?? ''}|${diagnostic.message}`;
			if (seen.has(key)) continue;
			seen.add(key);
			output.push(diagnostic);
		}
	}

	return output;
}

async function ensureCompiler(): Promise<void> {
	if (compilerPromise) return compilerPromise;

	compilerPromise = (async () => {
		const fonts = await loadTypstFonts();
		// NOTE (fabawi): Patch for issue (#340)[https://github.com/TeXlyre/texlyre/issues/340]
		// const packageRegistry = TypstSnippet.fetchPackageRegistry();
		const packageRegistry = longPathFetchPackageRegistry();
		compiler = createTypstCompiler();

		await compiler.init({
			getModule: () =>
				`${BASE_PATH}/core/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm`,
			beforeBuild: [
				...packageRegistry.provides,
				async (_: unknown, { builder }: any) => {
					for (const font of fonts) await builder.add_raw_font(font);
				},
			],
		});
	})();

	return compilerPromise;
}

async function compileVector(
	mainFilePath: string,
): Promise<{ result: Uint8Array; diagnostics: any[] }> {
	return compiler.runWithWorld({ mainFilePath }, async (world: any) => {
		const paged = await world.compile({ diagnostics: 'full' });
		const vector = await world.vector({ diagnostics: 'full' });
		return {
			result: vector.result as Uint8Array,
			diagnostics: mergeDiagnostics(
				paged.diagnostics ?? [],
				vector.diagnostics ?? [],
			),
		};
	});
}

self.addEventListener('message', (event: MessageEvent<InboundMessage>) => {
	void (async () => {
		const data = event.data;
		const { id, type } = data;

		try {
			if (type === 'ping') {
				self.postMessage({ id, type: 'pong' });
				return;
			}

			await ensureCompiler();

			const { mainFilePath, sources, format, pdfOptions, options } =
				data.payload;
			const absoluteMainPath = mainFilePath.startsWith('/')
				? mainFilePath
				: `/${mainFilePath}`;

			compiler.resetShadow();
			for (const [path, content] of Object.entries(sources)) {
				const absolutePath = path.startsWith('/') ? path : `/${path}`;
				if (typeof content === 'string')
					compiler.addSource(absolutePath, content);
				else compiler.mapShadow(absolutePath, content);
			}

			if (format === 'pdf' || format === 'canvas-pdf') {
				const compiled = await compiler.runWithWorld(
					{ mainFilePath: absoluteMainPath },
					async (world: any) => {
						world.setPdfOpts({
							pdf_standard: pdfOptions?.pdfStandard || '"1.7"',
							pdf_tags: pdfOptions?.pdfTags ?? true,
							creation_timestamp:
								pdfOptions?.creationTimestamp || Math.floor(Date.now() / 1000),
						});
						const paged = await world.compile({ diagnostics: 'full' });
						const pdf = await world.pdf({ diagnostics: 'full' });
						return {
							result: pdf.result as Uint8Array,
							diagnostics: mergeDiagnostics(
								paged.diagnostics ?? [],
								pdf.diagnostics ?? [],
							),
						};
					},
				);

				const response: DoneResponse = {
					id,
					type: 'done',
					result: {
						format,
						output: compiled.result,
						diagnostics: compiled.diagnostics,
					},
				};
				self.postMessage(response, [compiled.result.buffer]);
				return;
			}

			const compiled = await compileVector(absoluteMainPath);
			if (!compiled.result || compiled.result.byteLength === 0) {
				const response: DoneResponse = {
					id,
					type: 'done',
					result: {
						format,
						output: new Uint8Array(0),
						diagnostics: compiled.diagnostics,
					},
				};
				self.postMessage(response);
				return;
			}

			if (format === 'canvas') {
				const previewArtifact = compiled.result;
				const sourceMapArtifact = options?.buildSourceMap
					? previewArtifact.slice()
					: undefined;
				const response: DoneResponse = {
					id,
					type: 'done',
					result: {
						format,
						output: previewArtifact,
						sourceMapArtifact,
						diagnostics: compiled.diagnostics,
					},
				};
				const transfer: Transferable[] = [previewArtifact.buffer];
				if (sourceMapArtifact) transfer.push(sourceMapArtifact.buffer);
				self.postMessage(response, transfer);
				return;
			}

			const renderer = await getTypstRenderer();
			const rawSvg = await renderer.renderSvg({
				artifactContent: compiled.result,
			});
			const svg = sanitizeSvg(normalizeTypstSvgNavigation(String(rawSvg)), {
				baseUrl: self.location.href,
				allowRemoteUrls: options?.allowRemoteUrls !== false,
			});
			const response: DoneResponse = {
				id,
				type: 'done',
				result: {
					format,
					output: svg,
					diagnostics: compiled.diagnostics,
				},
			};
			self.postMessage(response);
		} catch (error) {
			const response: ErrorResponse = {
				id,
				type: 'error',
				error: error instanceof Error ? error.message : String(error),
			};
			self.postMessage(response);
		}
	})();
});
