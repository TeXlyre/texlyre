// src/services/LaTeXService.ts
import { t } from '@/i18n';
import { nanoid } from 'nanoid';

import type { BaseEngine, CompileResult } from '../extensions/switftlatex/BaseEngine';
import { DvipdfmxEngine } from '../extensions/switftlatex/DvipdfmxEngine';
import { PdfTeXEngine } from '../extensions/switftlatex/PdfTeXEngine';
import { XeTeXEngine } from '../extensions/switftlatex/XeTeXEngine';
import { busyTexService } from '../extensions/texlyre-busytex/BusyTeXService';
import type { BusyTeXEngineType } from '../extensions/texlyre-busytex/BusyTeXEngine';
import type { FileNode } from '../types/files';
import { getMimeType, isBinaryFile, isTemporaryFile, toArrayBuffer } from '../utils/fileUtils';
import { downloadFiles } from '../utils/zipUtils';
import { latexSourceMapService } from './LaTeXSourceMapService';
import { fileStorageService } from './FileStorageService';
import { notificationService } from './NotificationService';
import { cleanContent } from '../utils/fileCommentUtils';

type SwiftEngineType = 'pdftex' | 'xetex' | 'luatex';
export type EngineType = SwiftEngineType | BusyTeXEngineType;

function isBusyTeXEngine(engine: EngineType): engine is BusyTeXEngineType {
	return engine.startsWith('busytex-');
}

class LaTeXService {
	private engines: Map<SwiftEngineType | 'dvipdfmx', BaseEngine> = new Map();
	private currentEngineType: EngineType = 'pdftex';
	private statusListeners: Set<() => void> = new Set();
	private texliveEndpoint = '';
	private storeCache = true;
	private storeWorkingDirectory = false;
	private flattenMainDirectory = true;
	private processedNodes: FileNode[] = [];
	private sourceFileTimestamps: Map<string, number> = new Map();

	constructor() {
		this.engines.set('pdftex', new PdfTeXEngine());
		this.engines.set('xetex', new XeTeXEngine());
		this.engines.set('dvipdfmx', new DvipdfmxEngine());
	}

	setTexliveEndpoint(endpoint: string): void {
		this.texliveEndpoint = endpoint;
	}

	setStoreCache(store: boolean): void {
		this.storeCache = store;
	}

	setStoreWorkingDirectory(store: boolean): void {
		this.storeWorkingDirectory = store;
		busyTexService.setStoreWorkingDirectory(store);
	}

	setFlattenMainDirectory(flatten: boolean): void {
		this.flattenMainDirectory = flatten;
	}

	setBusyTeXBundles(bundles: string[]): void {
		busyTexService.setSelectedBundles(bundles);
	}

	setBusyTeXEndpoint(endpoint: string): void {
		busyTexService.setTexliveEndpoint(endpoint);
	}

	async isBusyTeXBundleCached(bundleId: string): Promise<boolean> {
		return busyTexService.isBundleCached(bundleId);
	}

	async deleteBusyTeXBundle(bundleId: string): Promise<void> {
		await busyTexService.deleteBundle(bundleId);
	}

	async initialize(engineType: EngineType = 'pdftex'): Promise<void> {
		this.currentEngineType = engineType;

		if (isBusyTeXEngine(engineType)) {
			await busyTexService.initialize(engineType);
			this.notifyStatusChange();
			return;
		}

		const engine = this.engines.get(engineType as SwiftEngineType);
		if (!engine) {
			throw new Error(t('Unsupported engine type: {engineType}', { engineType }));
		}
		try {
			await engine.initialize();
			engine.setTexliveEndpoint(this.texliveEndpoint);
			this.notifyStatusChange();
		} catch (error) {
			console.error(`Failed to initialize ${engineType} engine:`, error);
			throw error;
		}
	}

	async setEngine(engineType: EngineType): Promise<void> {
		if (this.currentEngineType === engineType) return;
		this.currentEngineType = engineType;
		await this.initialize(engineType);
	}

	getCurrentEngine(): BaseEngine | null {
		if (isBusyTeXEngine(this.currentEngineType)) return null;
		return this.engines.get(this.currentEngineType as SwiftEngineType) ?? null;
	}

	getCurrentEngineType(): EngineType {
		return this.currentEngineType;
	}

	getSupportedEngines(): EngineType[] {
		const swiftEngines: EngineType[] = ['pdftex', 'xetex'];
		const busyEngines: EngineType[] = ['busytex-pdftex', 'busytex-xetex', 'busytex-luatex'];
		return [...swiftEngines, ...busyEngines];
	}

	getStatus(): string {
		if (isBusyTeXEngine(this.currentEngineType)) {
			return busyTexService.getStatus();
		}
		try {
			return this.getCurrentEngine()?.getStatus() ?? 'unloaded';
		} catch {
			return 'unloaded';
		}
	}

	isReady(): boolean {
		if (isBusyTeXEngine(this.currentEngineType)) {
			return busyTexService.isReady();
		}
		try {
			return this.getCurrentEngine()?.isReady() ?? false;
		} catch {
			return false;
		}
	}

	isCompiling(): boolean {
		if (isBusyTeXEngine(this.currentEngineType)) {
			return busyTexService.isCompiling();
		}
		try {
			return this.getCurrentEngine()?.isCompiling() ?? false;
		} catch {
			return false;
		}
	}

	addStatusListener(listener: () => void): () => void {
		this.statusListeners.add(listener);

		const swiftUnsubs = Array.from(this.engines.values()).map((engine) =>
			engine.addStatusListener(() => this.notifyStatusChange())
		);
		const busyUnsub = busyTexService.addStatusListener(() => this.notifyStatusChange());

		return () => {
			this.statusListeners.delete(listener);
			swiftUnsubs.forEach((u) => u());
			busyUnsub();
		};
	}

	private notifyStatusChange(): void {
		this.statusListeners.forEach((listener) => listener());
	}

	async compileLaTeX(
		mainFileName: string,
		fileTree: FileNode[],
		format: string = 'pdf'
	): Promise<CompileResult> {
		const operationId = `latex-compile-${nanoid()}`;

		if (isBusyTeXEngine(this.currentEngineType)) {
			return this.compileBusyTeX(mainFileName, fileTree, format, operationId);
		}

		return this.compileSwiftLaTeX(mainFileName, fileTree, format, operationId);
	}

	private async compileBusyTeX(
		mainFileName: string,
		fileTree: FileNode[],
		format: string,
		operationId: string
	): Promise<CompileResult> {
		if (!busyTexService.isReady()) {
			this.showLoadingNotification(t('Initializing BusyTeX engine...'), operationId, format);
			await busyTexService.initialize(this.currentEngineType as BusyTeXEngineType);
		}

		try {
			this.showLoadingNotification(t('Compiling LaTeX document...'), operationId, format);

			const allNodes = this.collectAllFiles(fileTree);
			const nodesWithContent = await this.loadFileContents(allNodes);

			const result = await busyTexService.compile(mainFileName, nodesWithContent);

			if (result.status === 0 && result.pdf && result.pdf.length > 0) {
				this.showSuccessNotification(t('LaTeX compilation completed successfully'), {
					operationId,
					duration: 3000,
					format,
				});
			} else {
				this.showErrorNotification(t('LaTeX compilation failed'), {
					operationId,
					duration: 5000,
					format,
				});
			}

			return result;
		} catch (error) {
			if (busyTexService.getStatus() === 'error' || busyTexService.getStatus() === 'unloaded') {
				this.showInfoNotification(t('Compilation stopped by user'), {
					operationId,
					duration: 2000,
					format,
				});
				return { pdf: undefined, status: -1, log: 'Compilation failed or was stopped by user.' };
			}
			this.showErrorNotification(
				`Compilation error: ${error instanceof Error ? error.message : t('Unknown error')}`,
				{ operationId, duration: 5000, format }
			);
			throw error;
		}
	}

	private async loadFileContents(nodes: FileNode[]): Promise<FileNode[]> {
		const result: FileNode[] = [];
		for (const node of nodes) {
			if (node.content !== undefined) {
				result.push(node);
				continue;
			}
			try {
				const raw = await fileStorageService.getFile(node.id);
				if (raw?.content) {
					result.push({ ...node, content: raw.content });
				}
			} catch {
				// skip unreadable files
			}
		}
		return result;
	}

	private async compileSwiftLaTeX(
		mainFileName: string,
		fileTree: FileNode[],
		format: string,
		operationId: string
	): Promise<CompileResult> {
		const engine = this.getCurrentEngine();
		if (!engine) throw new Error('No SwiftLaTeX engine available');

		if (!engine.isReady()) {
			this.showLoadingNotification(t('Initializing LaTeX engine...'), operationId, format);
			await engine.initialize();
		}
		engine.setTexliveEndpoint(this.texliveEndpoint);

		try {
			this.showLoadingNotification(t('Preparing files for compilation...'), operationId, format);
			await this.prepareFileNodes(mainFileName, fileTree);

			this.showLoadingNotification(t('Compiling LaTeX document...'), operationId, format);
			await this.writeNodesToMemFS(engine, mainFileName);
			let result = await engine.compile(mainFileName, this.processedNodes);

			if (result.status === 0 && !result.pdf && (result as any).xdv) {
				this.showLoadingNotification(t('Converting XDV to PDF...'), operationId, format);
				result = await this.processDviToPdf((result as any).xdv, mainFileName, result.log);
			}

			if (result.status === 0 && result.pdf && result.pdf.length > 0) {
				this.showLoadingNotification(t('Saving compilation output...'), operationId, format);
				await this.saveCompilationOutput(mainFileName.replace(/^\/+/, ''), result);
				await this.loadSourceMap(engine, mainFileName);
				await this.storeOutputDirectories(engine);
				this.showSuccessNotification(t('LaTeX compilation completed successfully'), {
					operationId,
					duration: 3000,
					format,
				});
			} else {
				await this.saveCompilationLog(mainFileName.replace(/^\/+/, ''), result.log);
				this.showErrorNotification(t('LaTeX compilation failed'), {
					operationId,
					duration: 5000,
					format,
				});
			}

			return result;
		} catch (error) {
			if (this.getStatus() === 'error') {
				this.showInfoNotification(t('Compilation stopped by user'), {
					operationId,
					duration: 2000,
					format,
				});
				return { pdf: undefined, status: -1, log: 'Compilation failed or was stopped by user.' };
			}
			this.showErrorNotification(
				`Compilation error: ${error instanceof Error ? error.message : t('Unknown error')}`,
				{ operationId, duration: 5000, format }
			);
			throw error;
		}
	}

	async clearCacheDirectories(): Promise<void> {
		const operationId = `latex-clear-cache-${nanoid()}`;
		try {
			this.showLoadingNotification(t('Clearing LaTeX cache...'), operationId);

			const existingFiles = await fileStorageService.getAllFiles();
			const cacheFiles = existingFiles.filter(
				(file) => isTemporaryFile(file.path) && !file.isDeleted
			);

			if (cacheFiles.length > 0) {
				await fileStorageService.batchDeleteFiles(
					cacheFiles.map((f) => f.id),
					{ showDeleteDialog: false, hardDelete: true }
				);
			}

			try {
				this.getCurrentEngine()?.flushCache();
			} catch {
				// non-fatal
			}

			this.showSuccessNotification(t('LaTeX cache cleared successfully'), {
				operationId,
				duration: 2000,
			});
		} catch (error) {
			console.error('Error clearing cache directories:', error);
			this.showErrorNotification(t('Failed to clear LaTeX cache'), {
				operationId,
				duration: 3000,
			});
			throw error;
		}
	}

	async clearCacheAndCompile(
		mainFileName: string,
		fileTree: FileNode[],
		format: string = 'pdf'
	): Promise<CompileResult> {
		await this.clearCacheDirectories();
		return this.compileLaTeX(mainFileName, fileTree, format);
	}

	stopCompilation(): void {
		if (isBusyTeXEngine(this.currentEngineType)) {
			busyTexService.stopCompilation();
			return;
		}
		try {
			this.getCurrentEngine()?.stopCompilation();
		} catch (error) {
			console.warn('Error stopping compilation:', error);
		}
	}

	async exportDocument(
		mainFileName: string,
		fileTree: FileNode[],
		options: {
			engine?: EngineType;
			format?: 'pdf' | 'dvi';
			includeLog?: boolean;
			includeDvi?: boolean;
			includeBbl?: boolean;
		} = {}
	): Promise<void> {
		if (isBusyTeXEngine(options.engine ?? this.currentEngineType)) {
			// BusyTeX export: compile and download directly
			await this.exportBusyTeX(mainFileName, fileTree, options);
			return;
		}
		await this.exportSwiftLaTeX(mainFileName, fileTree, options);
	}

	private async exportBusyTeX(
		mainFileName: string,
		fileTree: FileNode[],
		options: { format?: 'pdf' | 'dvi'; includeLog?: boolean }
	): Promise<void> {
		const operationId = `latex-export-${nanoid()}`;
		this.showLoadingNotification(t('Compiling for export...'), operationId);

		try {
			const allNodes = this.collectAllFiles(fileTree);
			const nodesWithContent = await this.loadFileContents(allNodes);
			const result = await busyTexService.compile(mainFileName, nodesWithContent);

			if (result.status === 0 && result.pdf) {
				const baseName = this.getBaseName(mainFileName);
				const files: Array<{ content: Uint8Array; name: string; mimeType: string }> = [
					{ content: result.pdf, name: `${baseName}.pdf`, mimeType: 'application/pdf' },
				];
				if (options.includeLog) {
					files.push({
						content: new TextEncoder().encode(result.log),
						name: `${baseName}.log`,
						mimeType: 'text/plain',
					});
				}
				await downloadFiles(files, baseName);
				this.showSuccessNotification(t('Export completed successfully'), {
					operationId,
					duration: 2000,
				});
			} else {
				this.showErrorNotification(t('Export failed'), { operationId, duration: 3000 });
			}
		} catch (error) {
			this.showErrorNotification(
				`Export error: ${error instanceof Error ? error.message : t('Unknown error')}`,
				{ operationId, duration: 5000 }
			);
			throw error;
		}
	}

	// ── Forwarded SwiftLaTeX export (original exportDocument body) ────────────
	private async exportSwiftLaTeX(
		mainFileName: string,
		fileTree: FileNode[],
		options: {
			engine?: EngineType;
			format?: 'pdf' | 'dvi';
			includeLog?: boolean;
			includeDvi?: boolean;
			includeBbl?: boolean;
		}
	): Promise<void> {
		const {
			engine: exportEngine,
			format = 'pdf',
			includeLog = false,
			includeDvi = false,
			includeBbl = false,
		} = options;

		const operationId = `latex-export-${nanoid()}`;
		const originalEngine = this.currentEngineType;
		const targetEngine = (exportEngine as SwiftEngineType) || (this.currentEngineType as SwiftEngineType);
		const originalStoreWorkingDirectory = this.storeWorkingDirectory;

		if (includeBbl) this.storeWorkingDirectory = true;

		if (targetEngine !== this.currentEngineType) {
			await this.setEngine(targetEngine);
		}

		const engine = this.getCurrentEngine();
		if (!engine) throw new Error('No SwiftLaTeX engine for export');

		if (!engine.isReady()) {
			this.showLoadingNotification(t('Initializing LaTeX engine...'), operationId);
			await engine.initialize();
		}
		engine.setTexliveEndpoint(this.texliveEndpoint);

		try {
			this.showLoadingNotification(t('Preparing files for export...'), operationId);
			await this.prepareFileNodes(mainFileName, fileTree);
			await this.writeNodesToMemFS(engine, mainFileName);

			this.showLoadingNotification(t('Compiling for export...'), operationId);
			let result = await engine.compile(mainFileName, this.processedNodes);

			let xdvData: Uint8Array | undefined;
			if (result.status === 0 && !result.pdf && (result as any).xdv) {
				xdvData = (result as any).xdv;
				result = await this.processDviToPdf(xdvData, mainFileName, result.log);
			}

			if (result.status === 0) {
				const baseName = this.getBaseName(mainFileName);
				const files: Array<{ content: Uint8Array; name: string; mimeType: string }> = [];

				if (format === 'pdf' && result.pdf) {
					files.push({ content: result.pdf, name: `${baseName}.pdf`, mimeType: 'application/pdf' });
					if (includeDvi && xdvData) {
						files.push({ content: xdvData, name: `${baseName}.xdv`, mimeType: 'application/x-dvi' });
					}
				} else if (format === 'dvi' && xdvData) {
					files.push({ content: xdvData, name: `${baseName}.xdv`, mimeType: 'application/x-dvi' });
				}

				if (includeLog) {
					files.push({
						content: new TextEncoder().encode(result.log),
						name: `${baseName}.log`,
						mimeType: 'text/plain',
					});
				}

				if (includeBbl) {
					await this.storeOutputDirectories(engine);
					const bblFile = await this.extractBblFile(baseName);
					if (bblFile) files.push(bblFile);
				}

				if (files.length > 0) await downloadFiles(files, baseName);

				this.showSuccessNotification(t('Export completed successfully'), {
					operationId,
					duration: 2000,
				});
			} else {
				this.showErrorNotification(t('Export failed'), { operationId, duration: 3000 });
			}

			engine.flushCache();
		} catch (error) {
			this.showErrorNotification(
				`Export error: ${error instanceof Error ? error.message : t('Unknown error')}`,
				{ operationId, duration: 5000 }
			);
			throw error;
		} finally {
			this.storeWorkingDirectory = originalStoreWorkingDirectory;
			if (targetEngine !== originalEngine) await this.setEngine(originalEngine);
		}
	}

	private getCacheDirectory(engineType: SwiftEngineType | 'dvipdfmx'): string {
		return engineType === 'dvipdfmx' ? '/.texlyre_cache/__dvi' : '/.texlyre_cache/__tex';
	}

	private async processDviToPdf(
		xdvData: Uint8Array,
		mainFileName: string,
		originalLog: string,
	): Promise<CompileResult> {
		const dvipdfmxEngine = this.engines.get('dvipdfmx');
		if (!dvipdfmxEngine) throw new Error(t('DvipdfmxEngine not available'));

		if (!dvipdfmxEngine.isReady()) await dvipdfmxEngine.initialize();
		dvipdfmxEngine.setTexliveEndpoint(this.texliveEndpoint);

		const originalEngineType = this.currentEngineType;
		this.currentEngineType = 'dvipdfmx' as any;

		try {
			await this.writeNodesToMemFS(dvipdfmxEngine, mainFileName, 'dvipdfmx');

			const normalizedMainFile = mainFileName.replace(/^\/+/, '');
			const baseFileName = normalizedMainFile.replace(/\.(tex|ltx)$/i, '');
			const dviFileName = `${baseFileName}.xdv`;
			const dirPath = dviFileName.substring(0, dviFileName.lastIndexOf('/'));
			if (dirPath) this.createDirectoryStructure(dvipdfmxEngine, `/work/${dirPath}`);

			dvipdfmxEngine.writeMemFSFile(`/work/${dviFileName}`, xdvData);
			dvipdfmxEngine.setEngineMainFile(dviFileName);

			const result = await dvipdfmxEngine.compile(dviFileName, []);

			if (result.status === 0 && this.storeCache) {
				await this.storeCacheDirectory(dvipdfmxEngine);
			}

			return {
				pdf: result.pdf,
				status: result.status,
				log: result.status === 0
					? originalLog
					: `${originalLog}\n\nDvipdfmx conversion error:\n${result.log}`,
			};
		} catch (error) {
			return {
				pdf: undefined,
				status: -1,
				log: `${originalLog}\n\nDvipdfmx conversion failed: ${error.message}`,
			};
		} finally {
			this.currentEngineType = originalEngineType;
		}
	}

	private async prepareFileNodes(mainFileName: string, fileTree: FileNode[]): Promise<void> {
		const allNodes = this.collectAllFiles(fileTree);
		this.buildSourceFileTimestamps(allNodes);
		if (this.storeCache) await this.loadAndValidateCachedNodes(allNodes);
		this.processedNodes = this.preprocessNodes(allNodes, mainFileName);
	}

	private buildSourceFileTimestamps(nodes: FileNode[]): void {
		this.sourceFileTimestamps.clear();
		for (const node of nodes) {
			if (node.type === 'file' && !isTemporaryFile(node.path)) {
				this.sourceFileTimestamps.set(node.path, node.lastModified || 0);
			}
		}
	}

	private async loadAndValidateCachedNodes(nodes: FileNode[]): Promise<void> {
		try {
			const existingFiles = await fileStorageService.getAllFiles();
			const cacheDirectory = this.getCacheDirectory(this.currentEngineType as SwiftEngineType);
			const cachedFiles = existingFiles.filter(
				(file) =>
					file.path.startsWith(`${cacheDirectory}/`) &&
					file.type === 'file' &&
					!file.isDeleted,
			);

			const validCachedFiles: FileNode[] = [];
			for (const cachedFile of cachedFiles) {
				if (await this.isCacheEntryValid(cachedFile)) {
					validCachedFiles.push(cachedFile);
				}
			}

			for (const validCache of validCachedFiles) {
				if (!nodes.some((node) => node.path === validCache.path)) {
					nodes.push(validCache);
				}
			}
		} catch (error) {
			console.error('Error loading and validating cached files:', error);
		}
	}

	private async isCacheEntryValid(cachedFile: FileNode): Promise<boolean> {
		const maxAge = 24 * 60 * 60 * 1000;
		const now = Date.now();
		if (!cachedFile.lastModified || now - cachedFile.lastModified > maxAge) return false;
		const latestSourceTimestamp = Math.max(...Array.from(this.sourceFileTimestamps.values()));
		return cachedFile.lastModified >= latestSourceTimestamp;
	}

	private preprocessNodes(nodes: FileNode[], mainFileName: string): FileNode[] {
		const processed: FileNode[] = [];
		let mainFileProcessed = false;
		let mainFileDirectory: string | null = null;

		if (this.flattenMainDirectory) {
			const normalizedMainFile = mainFileName.replace(/^\/+/, '');
			const lastSlashIndex = normalizedMainFile.lastIndexOf('/');
			if (lastSlashIndex !== -1) {
				mainFileDirectory = normalizedMainFile.substring(0, lastSlashIndex);
			}
		}

		for (const node of nodes) {
			if (node.type !== 'file') continue;
			const processedNode = { ...node };

			if (node.path === mainFileName) {
				if (!mainFileName.startsWith('/') || mainFileName === `/${node.name}`) {
					processedNode.path = node.name;
				} else {
					const randomPrefix = '_';
					processedNode.path = `${randomPrefix}${node.name}`;
					processedNode.name = `${randomPrefix}${node.name}`;
				}
				mainFileProcessed = true;
			} else {
				const normalizedPath = node.path.replace(/^\/+/, '');
				if (isTemporaryFile(normalizedPath)) {
					processedNode.path = normalizedPath;
				} else if (this.flattenMainDirectory && mainFileDirectory) {
					const mainDirWithSlash = `${mainFileDirectory}/`;
					if (normalizedPath.startsWith(mainDirWithSlash)) {
						processedNode.path = normalizedPath.substring(mainDirWithSlash.length);
					} else {
						processedNode.path = normalizedPath;
					}
				} else {
					processedNode.path = normalizedPath;
				}
			}

			processed.push(processedNode);
		}

		if (!mainFileProcessed) {
			console.warn(`Main file ${mainFileName} not found in file tree`);
		}

		return processed;
	}

	private async writeNodesToMemFS(
		engine: BaseEngine,
		mainFileName: string,
		engineType?: SwiftEngineType | 'dvipdfmx',
	): Promise<void> {
		const currentEngineType = (engineType || this.currentEngineType) as SwiftEngineType | 'dvipdfmx';
		const cacheDirectory = this.getCacheDirectory(currentEngineType);
		const cacheNodes = this.processedNodes.filter((node) =>
			node.path.startsWith(`${cacheDirectory.substring(1)}/`)
		);
		const workNodes = this.processedNodes.filter((node) => !isTemporaryFile(node.path));

		const workDirectories = new Set<string>();
		const texDirectories = new Set<string>();

		for (const node of workNodes) {
			const dirPath = node.path.substring(0, node.path.lastIndexOf('/'));
			if (dirPath) workDirectories.add(dirPath);
		}

		for (const node of cacheNodes) {
			const cleanPath = node.path.replace(`${cacheDirectory.substring(1)}/`, '');
			const dirPath = cleanPath.substring(0, cleanPath.lastIndexOf('/'));
			if (dirPath) texDirectories.add(dirPath);
		}

		for (const dir of workDirectories) this.createDirectoryStructure(engine, `/work/${dir}`);
		for (const dir of texDirectories) this.createDirectoryStructure(engine, `/work/${dir}`);

		for (const node of workNodes) {
			try {
				const fileContent = await this.getFileContent(node);
				if (fileContent) {
					const cleanedContent = cleanContent(fileContent);
					if (typeof cleanedContent === 'string') {
						engine.writeMemFSFile(`/work/${node.path}`, cleanedContent);
					} else {
						engine.writeMemFSFile(`/work/${node.path}`, new Uint8Array(cleanedContent));
					}
				}
			} catch (error) {
				console.error(`Error writing work file ${node.path} to MemFS:`, error);
			}
		}

		for (const node of cacheNodes) {
			try {
				const fileContent = await this.getFileContent(node);
				if (fileContent) {
					const cleanPath = node.path.replace(`${cacheDirectory.substring(1)}/`, '');
					if (typeof fileContent === 'string') {
						engine.writeMemFSFile(`/work/${cleanPath}`, fileContent);
					} else {
						engine.writeMemFSFile(`/work/${cleanPath}`, new Uint8Array(fileContent));
					}
				}
			} catch (error) {
				console.error(`Error writing cache file ${node.path} to MemFS:`, error);
			}
		}

		const normalizedMainFile = mainFileName.replace(/^\/+/, '');
		const mainFileNode = workNodes.find(
			(node) =>
				node.path === normalizedMainFile ||
				node.path.endsWith(normalizedMainFile.split('/').pop() || '')
		);

		engine.setEngineMainFile(mainFileNode ? mainFileNode.path : normalizedMainFile);
	}

	private async storeOutputDirectories(engine: BaseEngine): Promise<void> {
		if (this.storeCache) await this.storeCacheDirectory(engine);
		if (this.storeWorkingDirectory) {
			await this.cleanupDirectory('/.texlyre_src/__work');
			await this.storeWorkDirectory(engine);
		}
	}

	private async storeCacheDirectory(engine: BaseEngine): Promise<void> {
		try {
			const texFiles = await engine.dumpDirectory('/tex');
			const cacheDirectory = this.getCacheDirectory(this.currentEngineType as SwiftEngineType);
			await this.batchStoreDirectoryContents(texFiles, cacheDirectory);
		} catch (error) {
			console.error('Error saving cache directory:', error);
		}
	}

	private async storeWorkDirectory(engine: BaseEngine): Promise<void> {
		try {
			const workFiles = await engine.dumpDirectory('/work');
			const filteredWorkFiles = await this.filterWorkFilesExcludingCache(workFiles);
			await this.batchStoreDirectoryContents(filteredWorkFiles, '/.texlyre_src/__work');
		} catch (error) {
			console.error('Error saving work directory:', error);
		}
	}

	private async filterWorkFilesExcludingCache(workFiles: {
		[key: string]: ArrayBuffer;
	}): Promise<{ [key: string]: ArrayBuffer }> {
		const filtered: { [key: string]: ArrayBuffer } = {};
		try {
			const existingFiles = await fileStorageService.getAllFiles();
			const cacheDirectory = this.getCacheDirectory(this.currentEngineType as SwiftEngineType);
			const cachePaths = new Set(
				existingFiles
					.filter(
						(file) =>
							file.path.startsWith(`${cacheDirectory}/`) &&
							file.type === 'file' &&
							!file.isDeleted,
					)
					.map((file) => file.path.replace(cacheDirectory, ''))
			);

			for (const [workPath, content] of Object.entries(workFiles)) {
				const normalizedWorkPath = workPath.replace(/^\/work/, '');
				if (!cachePaths.has(normalizedWorkPath)) {
					filtered[workPath] = content;
				}
			}
		} catch (error) {
			console.error('Error filtering work files:', error);
			return workFiles;
		}
		return filtered;
	}

	private async batchStoreDirectoryContents(
		files: { [key: string]: ArrayBuffer },
		baseDir: string,
	): Promise<void> {
		if (Object.keys(files).length === 0) return;

		const filesToStore: FileNode[] = [];
		const directoriesToCreate = new Set<string>();

		for (const [originalPath, content] of Object.entries(files)) {
			const storagePath = originalPath.replace(/^\/(tex|work)/, baseDir);
			const dirPath = storagePath.substring(0, storagePath.lastIndexOf('/'));
			const fileName = storagePath.split('/').pop()!;
			if (dirPath !== baseDir && dirPath) directoriesToCreate.add(dirPath);

			const existingFile = await fileStorageService.getFileByPath(storagePath, true);
			filesToStore.push({
				id: existingFile?.id || nanoid(),
				name: fileName,
				path: storagePath,
				type: 'file',
				content,
				lastModified: Date.now(),
				size: content.byteLength,
				mimeType: getMimeType(fileName),
				isBinary: isBinaryFile(fileName),
				excludeFromSync: true,
				isDeleted: false,
			});
		}

		await this.batchCreateDirectories(Array.from(directoriesToCreate));
		if (filesToStore.length > 0) {
			await fileStorageService.batchStoreFiles(filesToStore, {
				showConflictDialog: false,
				preserveTimestamp: true,
			});
		}
	}

	private async batchCreateDirectories(directoryPaths: string[]): Promise<void> {
		const directoriesToCreate: FileNode[] = [];
		const existingFiles = await fileStorageService.getAllFiles();
		const existingPaths = new Set(existingFiles.map((file) => file.path));

		const allPaths = new Set<string>();
		for (const fullPath of directoryPaths) {
			const parts = fullPath.split('/').filter((p) => p);
			let currentPath = '';
			for (const part of parts) {
				currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
				allPaths.add(currentPath);
			}
		}

		for (const dirPath of allPaths) {
			if (!existingPaths.has(dirPath)) {
				directoriesToCreate.push({
					id: nanoid(),
					name: dirPath.split('/').pop()!,
					path: dirPath,
					type: 'directory',
					lastModified: Date.now(),
				});
			}
		}

		if (directoriesToCreate.length > 0) {
			await fileStorageService.batchStoreFiles(directoriesToCreate, {
				showConflictDialog: false,
			});
		}
	}

	private async saveCompilationOutput(mainFile: string, result: CompileResult): Promise<void> {
		try {
			const outputFiles: FileNode[] = [];

			if (result.pdf && result.pdf.length > 0) {
				const fileName = mainFile.split('/').pop() || mainFile;
				const baseName = fileName.split('.').slice(0, -1).join('.');
				const pdfFileName = `${baseName}.pdf`;
				outputFiles.push({
					id: nanoid(),
					name: pdfFileName,
					path: `/.texlyre_src/__output/${pdfFileName}`,
					type: 'file',
					content: toArrayBuffer(result.pdf.buffer),
					lastModified: Date.now(),
					size: result.pdf.length,
					mimeType: 'application/pdf',
					isBinary: true,
					excludeFromSync: true,
				});
			}

			const logFile = await this.createCompilationLogFile(mainFile, result.log);
			outputFiles.push(logFile);
			await this.ensureOutputDirectoriesExist();
			if (outputFiles.length > 0) {
				await fileStorageService.batchStoreFiles(outputFiles, { showConflictDialog: false });
			}
		} catch (error) {
			console.error('Error saving compilation output:', error);
		}
	}

	private async saveCompilationLog(mainFile: string, log: string): Promise<void> {
		try {
			await this.ensureOutputDirectoriesExist();
			const logFile = await this.createCompilationLogFile(mainFile, log);
			await fileStorageService.batchStoreFiles([logFile], { showConflictDialog: false });
		} catch (error) {
			console.error('Error saving compilation log:', error);
		}
	}

	private async cleanupDirectory(directoryPath: string): Promise<void> {
		try {
			const existingFiles = await fileStorageService.getAllFiles();
			const filesToCleanup = existingFiles.filter(
				(file) => file.path.startsWith(`${directoryPath}/`) && !file.isDeleted,
			);
			if (filesToCleanup.length > 0) {
				await fileStorageService.batchDeleteFiles(filesToCleanup.map((f) => f.id), {
					showDeleteDialog: false,
					hardDelete: true,
				});
			}
		} catch (error) {
			console.error(`Error cleaning up directory ${directoryPath}:`, error);
		}
	}

	private async createCompilationLogFile(mainFile: string, log: string): Promise<FileNode> {
		const fileName = mainFile.split('/').pop() || mainFile;
		const baseName = fileName.split('.').slice(0, -1).join('.');
		const logFileName = `${baseName}.log`;
		const encoder = new TextEncoder();
		const logContent = encoder.encode(log).buffer;
		return {
			id: nanoid(),
			name: logFileName,
			path: `/.texlyre_src/__output/${logFileName}`,
			type: 'file',
			content: logContent,
			lastModified: Date.now(),
			size: encoder.encode(log).length,
			mimeType: 'text/plain',
			isBinary: false,
			excludeFromSync: true,
		};
	}

	private async loadSourceMap(engine: BaseEngine, mainFileName: string): Promise<void> {
		try {
			const baseName = this.getBaseName(mainFileName);
			const workFiles = await engine.dumpDirectory('/work');
			const synctexKey = Object.keys(workFiles).find(
				(key) => key.endsWith(`${baseName}.synctex.gz`) || key.endsWith(`${baseName}.synctex`)
			);
			if (!synctexKey) {
				latexSourceMapService.clear();
				return;
			}
			latexSourceMapService.loadFromBytes(new Uint8Array(workFiles[synctexKey]));
		} catch (error) {
			console.error('[LaTeXService] Failed to load source map:', error);
			latexSourceMapService.clear();
		}
	}

	private async ensureOutputDirectoriesExist(): Promise<void> {
		const requiredDirectories = [
			'/.texlyre_src',
			'/.texlyre_src/__output',
			'/.texlyre_src/__work',
			'/.texlyre_cache',
			'/.texlyre_cache/__tex',
			'/.texlyre_cache/__dvi',
		];
		const directoriesToCreate: FileNode[] = [];
		const existingFiles = await fileStorageService.getAllFiles();
		const existingPaths = new Set(existingFiles.map((file) => file.path));
		for (const dirPath of requiredDirectories) {
			if (!existingPaths.has(dirPath)) {
				directoriesToCreate.push({
					id: nanoid(),
					name: dirPath.split('/').pop()!,
					path: dirPath,
					type: 'directory',
					lastModified: Date.now(),
				});
			}
		}
		if (directoriesToCreate.length > 0) {
			await fileStorageService.batchStoreFiles(directoriesToCreate, { showConflictDialog: false });
		}
	}

	private collectAllFiles(nodes: FileNode[]): FileNode[] {
		const result: FileNode[] = [];
		for (const node of nodes) {
			if (node.type === 'file') result.push(node);
			if (node.children?.length) result.push(...this.collectAllFiles(node.children));
		}
		return result;
	}

	private async getFileContent(node: FileNode): Promise<ArrayBuffer | string | null> {
		if (node.content !== undefined) return node.content;
		try {
			const rawFile = await fileStorageService.getFile(node.id);
			if (rawFile?.content) return rawFile.content;
		} catch (error) {
			console.error('Error retrieving file content:', error);
		}
		return null;
	}

	private createDirectoryStructure(engine: BaseEngine, dirPath: string): void {
		if (!dirPath) return;
		try {
			const parts = dirPath.replace(/\\/g, '/').split('/').filter(Boolean);
			if (parts[0] === 'work') parts.shift();
			if (parts.length === 0) return;

			let currentPath = '';
			for (const part of parts) {
				currentPath = currentPath ? `${currentPath}/${part}` : part;
				try { engine.makeMemFSFolder(currentPath); } catch { }
			}
		} catch (error) {
			console.warn(`Error in directory creation: ${error.message}`);
		}
	}

	private getBaseName(filePath: string): string {
		const fileName = filePath.split('/').pop() || filePath;
		return fileName.includes('.') ? fileName.split('.').slice(0, -1).join('.') : fileName;
	}

	private async extractBblFile(baseName: string): Promise<{ content: Uint8Array; name: string; mimeType: string } | null> {
		const workDirectory = '/.texlyre_src/__work';
		for (const bblPath of [`${workDirectory}/${baseName}.bbl`, `${workDirectory}/_${baseName}.bbl`]) {
			try {
				const bblFile = await fileStorageService.getFileByPath(bblPath, true);
				if (bblFile?.content) {
					const content = typeof bblFile.content === 'string'
						? new TextEncoder().encode(bblFile.content)
						: new Uint8Array(bblFile.content as ArrayBuffer);
					return { content, name: bblPath.split('/').pop() || `${baseName}.bbl`, mimeType: 'text/plain' };
				}
			} catch { continue; }
		}

		try {
			const bblFiles = await fileStorageService.getFilesByPath(
				`${workDirectory}/`, true, { fileExtension: '.bbl', excludeDirectories: true }
			);
			if (bblFiles.length > 0 && bblFiles[0].content) {
				const content = typeof bblFiles[0].content === 'string'
					? new TextEncoder().encode(bblFiles[0].content)
					: new Uint8Array(bblFiles[0].content as ArrayBuffer);
				return { content, name: bblFiles[0].path.split('/').pop() || `${baseName}.bbl`, mimeType: 'text/plain' };
			}
		} catch { }

		return null;
	}

	async reinitializeCurrentEngine(): Promise<void> {
		if (isBusyTeXEngine(this.currentEngineType)) {
			busyTexService.terminate();
			await busyTexService.initialize(this.currentEngineType as BusyTeXEngineType);
			return;
		}
		try {
			await this.getCurrentEngine()?.reinitialize();
		} catch (error) {
			console.error('Failed to reinitialize engine:', error);
			throw error;
		}
	}

	showLoadingNotification(message: string, operationId?: string, format?: string): void {
		if (this.areNotificationsEnabled() && !format?.toLowerCase().includes('canvas')) {
			notificationService.showLoading(message, operationId);
		}
	}

	showSuccessNotification(
		message: string,
		options: { operationId?: string; duration?: number; data?: Record<string, any>; format?: string } = {}
	): void {
		if (this.areNotificationsEnabled() && !options.format?.toLowerCase().includes('canvas')) {
			notificationService.showSuccess(message, options);
		}
	}

	showErrorNotification(
		message: string,
		options: { operationId?: string; duration?: number; data?: Record<string, any>; format?: string } = {}
	): void {
		if (this.areNotificationsEnabled() && !options.format?.toLowerCase().includes('canvas')) {
			notificationService.showError(message, options);
		}
	}

	showInfoNotification(
		message: string,
		options: { operationId?: string; duration?: number; data?: Record<string, any>; format?: string } = {}
	): void {
		if (this.areNotificationsEnabled() && !options.format?.toLowerCase().includes('canvas')) {
			notificationService.showInfo(message, options);
		}
	}

	private areNotificationsEnabled(): boolean {
		const userId = localStorage.getItem('texlyre-current-user');
		const storageKey = userId ? `texlyre-user-${userId}-settings` : 'texlyre-settings';
		try {
			const settings = JSON.parse(localStorage.getItem(storageKey) || '{}');
			return settings['latex-notifications'] !== false;
		} catch {
			return true;
		}
	}
}

export const latexService = new LaTeXService();