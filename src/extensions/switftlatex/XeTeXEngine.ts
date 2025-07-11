// src/extensions/switftlatex/XeTeXEngine.ts
import {
	BaseEngine,
	type CompileResult,
	type EngineConfig,
} from "./BaseEngine";
import { EngineLoader } from "./EngineLoader";

declare global {
	interface Window {
		XeTeXEngine: any;
	}
}

interface XeTeXCompileResult extends CompileResult {
	xdv?: Uint8Array;
}

export class XeTeXEngine extends BaseEngine {
	constructor() {
		const config: EngineConfig = {
			name: "XeTeX",
			setupScript: "./TexlyreXeTeXEngineSetup.js",
			engineScript: "./texlyrexetex.js",
			engineClass: "XeTeXEngine",
			enginePath: "texlyrexetex.js",
		};
		super(config);
	}

	async loadScripts(): Promise<void> {
		if (typeof window.XeTeXEngine === "function") {
			return;
		}

		await EngineLoader.loadScripts([
			this.config.setupScript,
			this.config.engineScript,
		]);

		if (typeof window.XeTeXEngine !== "function") {
			throw new Error("XeTeXEngine not available after loading scripts");
		}
	}

	createEngine(): any {
		return new window.XeTeXEngine();
	}

	setTexliveEndpoint(endpoint: string): void {
		console.log(`[XeTeXEngine] TexLive endpoint set for XeTeX: ${endpoint}`);
	}

	writeMemFSFile(filename: string, content: string | Uint8Array): void {
		if (!this.engine) throw new Error("Engine not initialized");
		this.engine.writeMemFSFile(filename, content);
	}

	makeMemFSFolder(folder: string): void {
		if (!this.engine) throw new Error("Engine not initialized");
		this.engine.makeMemFSFolder(folder);
	}

	setEngineMainFile(filename: string): void {
		if (!this.engine) throw new Error("Engine not initialized");
		this.engine.setEngineMainFile(filename);
	}

	flushCache(): void {
		if (!this.engine) throw new Error("Engine not initialized");
		this.engine.flushCache();
	}

	async dumpDirectory(dir: string): Promise<{ [key: string]: ArrayBuffer }> {
		if (!this.engine) throw new Error("Engine not initialized");
		return await this.engine.dumpDirectory(dir);
	}

	async compile(
		_mainFileName: string,
		_fileNodes: any[],
	): Promise<CompileResult> {
		if (!this.engine || !this.isReady()) {
			throw new Error("Engine not ready");
		}

		this.setStatus("compiling");

		try {
			await this.engine.compileLaTeX(); // Do it twice for tables
			await this.engine.compileLaTeX(); // Do it thrice for good luck and bib
			const result = await this.engine.compileLaTeX();
			this.setStatus("ready");
			// this.flushCache();

			console.log("[XeTeXEngine] XeTeX compilation result:", {
				status: result.status,
				hasPdf: !!result.pdf,
				hasXdv: !!result.xdv,
				pdfSize: result.pdf?.length,
				xdvSize: result.xdv?.length,
			});

			if (result.status === 0 && result.pdf) {
				return {
					pdf: undefined,
					status: result.status,
					log: result.log,
					xdv: result.pdf,
				} as XeTeXCompileResult;
			}

			return {
				pdf: result.pdf,
				status: result.status,
				log: result.log,
			};
		} catch (error) {
			this.flushCache();
			this.setStatus("error");
			throw error;
		}
	}
}
