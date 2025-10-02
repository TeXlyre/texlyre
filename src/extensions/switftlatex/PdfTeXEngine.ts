// src/extensions/switftlatex/PdfTeXEngine.ts
import {
	BaseEngine,
	type CompileResult,
	type EngineConfig,
} from './BaseEngine';
import { EngineLoader } from './EngineLoader';

const BASE_PATH = __BASE_PATH__;

declare global {
	interface Window {
		PdfTeXEngine: any;
	}
}

export class PdfTeXEngine extends BaseEngine {
	constructor() {
		const config: EngineConfig = {
			name: 'PdfTeX',
			setupScript: `${BASE_PATH}/core/swiftlatex/TexlyrePdfTeXEngineSetup.js`,
			engineScript: `${BASE_PATH}/core/swiftlatex/texlyrepdftex.js`,
			engineClass: 'PdfTeXEngine',
		};
		super(config);
	}

	async loadScripts(): Promise<void> {
		if (typeof window.PdfTeXEngine === 'function') {
			return;
		}

		await EngineLoader.loadScripts([
			this.config.setupScript,
			this.config.engineScript,
		]);

		if (typeof window.PdfTeXEngine !== 'function') {
			throw new Error('PdfTeXEngine not available after loading scripts');
		}
	}

	createEngine(): any {
		return new window.PdfTeXEngine();
	}

	setTexliveEndpoint(endpoint: string): void {
		this.engine.setTexliveEndpoint(endpoint);
		console.log(`[PdfTeXEngine] TexLive endpoint set for PdfTeX: ${endpoint}`);
	}

	writeMemFSFile(filename: string, content: string | Uint8Array): void {
		if (!this.engine) throw new Error('Engine not initialized');
		this.engine.writeMemFSFile(filename, content);
	}

	makeMemFSFolder(folder: string): void {
		if (!this.engine) throw new Error('Engine not initialized');
		this.engine.makeMemFSFolder(folder);
	}

	setEngineMainFile(filename: string): void {
		if (!this.engine) throw new Error('Engine not initialized');
		this.engine.setEngineMainFile(filename);
	}

	flushCache(): void {
		if (!this.engine) throw new Error('Engine not initialized');
		this.engine.flushCache();
	}

	async dumpDirectory(dir: string): Promise<{ [key: string]: ArrayBuffer }> {
		if (!this.engine) throw new Error('Engine not initialized');
		return await this.engine.dumpDirectory(dir);
	}

	async compile(
		_mainFileName: string,
		_fileNodes: any[],
	): Promise<CompileResult> {
		if (!this.engine || !this.isReady()) {
			throw new Error('Engine not ready');
		}

		this.setStatus('compiling');

		try {
			await this.engine.compileLaTeX(); // Do it twice for tables
			await this.engine.compileLaTeX(); // Do it thrice for good luck and bib
			const result = await this.engine.compileLaTeX();
			this.setStatus('ready');
			// this.flushCache();

			console.log('[PdfTeXEngine] PDFTeX compilation result:', {
				status: result.status,
				hasPdf: !!result.pdf,
				pdfSize: result.pdf?.length
			});

			return {
				pdf: result.pdf,
				status: result.status,
				log: result.log,
			};
		} catch (error) {
			this.flushCache();
			this.setStatus('error');
			throw error;
		}
	}
}
