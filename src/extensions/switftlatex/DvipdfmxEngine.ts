// src/extensions/switftlatex/DvipdfmxEngine.ts
import {
	BaseEngine,
	type CompileResult,
	type EngineConfig,
} from "./BaseEngine";
import { EngineLoader } from "./EngineLoader";

const BASE_PATH = __BASE_PATH__

interface DvipdfmxCompileResult extends CompileResult {
	xdv?: Uint8Array;
}

declare global {
	interface Window {
		DvipdfmxEngine: any;
	}
}

export class DvipdfmxEngine extends BaseEngine {
	constructor() {
		const config: EngineConfig = {
			name: "Dvipdfmx",
			setupScript: `${BASE_PATH}/core/swiftlatex/TexlyreDvipdfmxEngineSetup.js`,
			engineScript: `${BASE_PATH}/core/swiftlatex/texlyredvipdfm.js`,
			engineClass: "DvipdfmxEngine",
		};
		super(config);
	}

	async loadScripts(): Promise<void> {
		if (typeof window.DvipdfmxEngine === "function") {
			return;
		}

		await EngineLoader.loadScripts([
			this.config.setupScript,
			this.config.engineScript,
		]);

		if (typeof window.DvipdfmxEngine !== "function") {
			throw new Error("DvipdfmxEngine not available after loading scripts");
		}
	}

	createEngine(): any {
		return new window.DvipdfmxEngine();
	}

	setTexliveEndpoint(endpoint: string): void {
		this.engine.setTexliveEndpoint(endpoint);
		console.log(`[DvipdfmxEngine] TexLive endpoint set for Dvipdfmx: ${endpoint}`);
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
		if (this.engine.flushCache) {
			this.engine.flushCache();
		}
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
			const result = await this.engine.compilePDF();
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
