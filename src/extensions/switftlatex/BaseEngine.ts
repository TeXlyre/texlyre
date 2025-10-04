// src/extensions/switftlatex/BaseEngine.ts
export interface CompileResult {
	pdf?: Uint8Array;
	status: number;
	log: string;
}

export interface EngineConfig {
	name: string;
	setupScript: string;
	engineScript: string;
	engineClass: string;
}

export abstract class BaseEngine {
	protected engine: any = undefined;
	protected status: 'unloaded' | 'loading' | 'ready' | 'compiling' | 'error' =
		'unloaded';
	protected statusListeners: Set<() => void> = new Set();
	protected config: EngineConfig;

	constructor(config: EngineConfig) {
		this.config = config;
	}

	abstract loadScripts(): Promise<void>;
	abstract createEngine(): any;
	abstract setTexliveEndpoint(endpoint: string): void;
	abstract writeMemFSFile(filename: string, content: string | Uint8Array): void;
	abstract makeMemFSFolder(folder: string): void;
	abstract setEngineMainFile(filename: string): void;
	abstract flushCache(): void;
	abstract dumpDirectory(dir: string): Promise<{ [key: string]: ArrayBuffer }>;
	abstract compile(
		mainFileName: string,
		fileTree: any[],
	): Promise<CompileResult>;

	getStatus() {
		return this.status;
	}

	isReady(): boolean {
		return this.status === 'ready';
	}

	isCompiling(): boolean {
		return this.status === 'compiling';
	}

	addStatusListener(listener: () => void): () => void {
		this.statusListeners.add(listener);
		return () => this.statusListeners.delete(listener);
	}

	protected notifyStatusChange(): void {
		this.statusListeners.forEach((listener) => listener());
	}

	protected setStatus(status: typeof this.status): void {
		this.status = status;
		this.notifyStatusChange();
	}

	async initialize(): Promise<void> {
		if (this.status === 'ready') return;
		if (this.status === 'loading') {
			return new Promise((resolve, reject) => {
				const checkStatus = () => {
					if (this.status === 'ready') {
						resolve();
					} else if (this.status === 'error') {
						reject(
							new Error(`Failed to initialize ${this.config.name} engine`),
						);
					} else {
						setTimeout(checkStatus, 100);
					}
				};
				checkStatus();
			});
		}

		this.setStatus('loading');
		try {
			await this.loadScripts();
			this.engine = this.createEngine();

			// Set up the engine without calling methods that might send messages
			await this.engine.loadEngine();

			this.setStatus('ready');
		} catch (error) {
			this.setStatus('error');
			throw error;
		}
	}

	async reinitialize(): Promise<void> {
		this.cleanup();
		await this.initialize();
	}

	protected cleanup(): void {
		if (this.engine) {
			try {
				this.engine.closeWorker();
			} catch (error) {
				console.warn('Error during engine cleanup:', error);
			}
			this.engine = undefined;
		}
		this.setStatus('unloaded');
	}

	stopCompilation(): void {
		if (this.isCompiling() && this.engine) {
			try {
				this.engine.closeWorker();
				this.setStatus('error');
				this.status = 'ready';
			} catch (error) {
				console.warn('Error stopping compilation:', error);
			}
		}
	}
}
