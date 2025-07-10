// src/extensions/switftlatex/PdfTeXEngine.ts
import {
	BaseEngine,
	type CompileResult,
	type EngineConfig,
} from "./BaseEngine";
import { EngineLoader } from "./EngineLoader";

declare global {
	interface Window {
		PdfTeXEngine: any;
	}
}

export class PdfTeXEngine extends BaseEngine {
	constructor() {
		const config: EngineConfig = {
			name: "PdfTeX",
			setupScript: "./TexlyrePdfTeXEngineSetup.js",
			engineScript: "./texlyrepdftex.js",
			engineClass: "PdfTeXEngine",
			enginePath: "texlyrepdftex.js",
		};
		super(config);
	}

	async loadScripts(): Promise<void> {
		if (typeof window.PdfTeXEngine === "function") {
			return;
		}

		await EngineLoader.loadScripts([
			this.config.setupScript,
			this.config.engineScript,
		]);

		if (typeof window.PdfTeXEngine !== "function") {
			throw new Error("PdfTeXEngine not available after loading scripts");
		}
	}

	createEngine(): any {
		return new window.PdfTeXEngine();
	}

	setTexliveEndpoint(endpoint: string): void {
		// Store the endpoint but don't apply it immediately to avoid initialization issues
		// The engine will use the default endpoint during compilation
		console.log(`TexLive endpoint set for PdfTeX: ${endpoint}`);
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

	setCacheEntry(fileName: string, format: string, filePath: string): void {
		if (!this.engine) throw new Error("Engine not initialized");
		this.engine.setCacheEntry(fileName, format, filePath);
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
		mainFileName: string,
		fileNodes: any[],
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
