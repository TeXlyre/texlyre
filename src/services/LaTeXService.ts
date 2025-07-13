// src/services/LaTeXService.ts
import { nanoid } from "nanoid";

import type {
	BaseEngine,
	CompileResult,
} from "../extensions/switftlatex/BaseEngine";
import { DvipdfmxEngine } from "../extensions/switftlatex/DvipdfmxEngine";
import { PdfTeXEngine } from "../extensions/switftlatex/PdfTeXEngine";
import { XeTeXEngine } from "../extensions/switftlatex/XeTeXEngine";
import type { FileNode } from "../types/files";
import { getMimeType, isBinaryFile } from "../utils/fileUtils";
import { fileStorageService } from "./FileStorageService";
import {fileCommentProcessor} from "../utils/fileCommentProcessor.ts";

type EngineType = "pdftex" | "xetex" | "luatex";

class LaTeXService {
	private engines: Map<EngineType | "dvipdfmx", BaseEngine> = new Map();
	private currentEngineType: EngineType = "pdftex";
	private statusListeners: Set<() => void> = new Set();
	private texliveEndpoint = "https://texlive.emaily.re";
	private storeCache = true;
	private storeWorkingDirectory = false;
	// Flatten main directory causes the main file's directory to be the root of the compilation, Forced with true for now.
	private flattenMainDirectory = true;
	private processedNodes: FileNode[] = [];
	private sourceFileTimestamps: Map<string, number> = new Map();

	constructor() {
		this.engines.set("pdftex", new PdfTeXEngine());
		this.engines.set("xetex", new XeTeXEngine());
		this.engines.set("dvipdfmx", new DvipdfmxEngine());
	}

	setTexliveEndpoint(endpoint: string): void {
		this.texliveEndpoint = endpoint;
		this.engines.forEach((engine) => {
			engine.setTexliveEndpoint(endpoint);
		});
	}

	setStoreCache(store: boolean): void {
		this.storeCache = store;
	}

	setStoreWorkingDirectory(store: boolean): void {
		this.storeWorkingDirectory = store;
	}

	setFlattenMainDirectory(flatten: boolean): void {
		this.flattenMainDirectory = flatten;
	}

	async initialize(engineType: EngineType = "pdftex"): Promise<void> {
		this.currentEngineType = engineType;
		const engine = this.engines.get(engineType);
		if (!engine) {
			throw new Error(`Unsupported engine type: ${engineType}`);
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
		if (this.currentEngineType === engineType) {
			return;
		}

		this.currentEngineType = engineType;
		await this.initialize(engineType);
	}

	getCurrentEngine(): BaseEngine {
		const engine = this.engines.get(this.currentEngineType);
		if (!engine) {
			throw new Error(`Engine ${this.currentEngineType} not found`);
		}
		return engine;
	}

	getCurrentEngineType(): EngineType {
		return this.currentEngineType;
	}

	getSupportedEngines(): EngineType[] {
		return Array.from(this.engines.keys()).filter(
			(key) => key !== "dvipdfmx",
		) as EngineType[];
	}

	getStatus(): string {
		try {
			const engine = this.getCurrentEngine();
			return engine.getStatus();
		} catch {
			return "unloaded";
		}
	}

	isReady(): boolean {
		try {
			const engine = this.getCurrentEngine();
			return engine.isReady();
		} catch {
			return false;
		}
	}

	isCompiling(): boolean {
		try {
			const engine = this.getCurrentEngine();
			return engine.isCompiling();
		} catch {
			return false;
		}
	}

	addStatusListener(listener: () => void): () => void {
		this.statusListeners.add(listener);

		const engines = Array.from(this.engines.values());
		const engineUnsubscribers = engines.map((engine) =>
			engine.addStatusListener(() => this.notifyStatusChange()),
		);

		return () => {
			this.statusListeners.delete(listener);
			engineUnsubscribers.forEach((unsubscribe) => unsubscribe());
		};
	}

	private notifyStatusChange(): void {
		this.statusListeners.forEach((listener) => listener());
	}

	private async processDviToPdf(
		xdvData: Uint8Array,
		mainFileName: string,
		originalLog: string,
	): Promise<CompileResult> {
		const dvipdfmxEngine = this.engines.get("dvipdfmx");
		if (!dvipdfmxEngine) {
			throw new Error("DvipdfmxEngine not available");
		}

		if (!dvipdfmxEngine.isReady()) {
			await dvipdfmxEngine.initialize();
			dvipdfmxEngine.setTexliveEndpoint(this.texliveEndpoint);
		}

		const normalizedMainFile = mainFileName.replace(/^\/+/, "");
		const baseFileName = normalizedMainFile.replace(/\.(tex|ltx)$/i, "");
		const dviFileName = `${baseFileName}.xdv`;

		const dirPath = dviFileName.substring(0, dviFileName.lastIndexOf("/"));
		if (dirPath) {
			this.createDirectoryStructure(dvipdfmxEngine, `/work/${dirPath}`);
		}

		console.log(
			`[LaTeXService] Writing XDV file: ${dviFileName}, size: ${xdvData.length} bytes`,
		);
		dvipdfmxEngine.writeMemFSFile(`/work/${dviFileName}`, xdvData);
		dvipdfmxEngine.setEngineMainFile(dviFileName);

		try {
			const result = await dvipdfmxEngine.compile(dviFileName, []);
			return {
				pdf: result.pdf,
				status: result.status,
				log:
					result.status === 0
						? originalLog
						: `${originalLog}\n\nDvipdfmx conversion error:\n${result.log}`,
			};
		} catch (error) {
			return {
				pdf: undefined,
				status: -1,
				log: `${originalLog}\n\nDvipdfmx conversion failed: ${error.message}`,
			};
		}
	}

	async compileLaTeX(
		mainFileName: string,
		fileTree: FileNode[],
	): Promise<CompileResult> {
		const engine = this.getCurrentEngine();

		if (!engine.isReady()) {
			console.log("[LaTeXService] Engine not ready, initializing...");
			await engine.initialize();
		}

		try {
			await this.prepareFileNodes(mainFileName, fileTree);
			await this.writeNodesToMemFS(engine, mainFileName);
			let result = await engine.compile(mainFileName, this.processedNodes);

			console.log("[LaTeXService] Initial compilation result:", {
				status: result.status,
				hasPdf: !!result.pdf,
				hasXdv: !!(result as any).xdv,
				engineType: this.currentEngineType,
			});

			if (result.status === 0 && !result.pdf && (result as any).xdv) {
				console.log("[LaTeXService] XDV file detected, converting to PDF with Dvipdfmx...");
				result = await this.processDviToPdf(
					(result as any).xdv,
					mainFileName,
					result.log,
				);
				console.log("[LaTeXService] Dvipdfmx conversion result:", {
					status: result.status,
					hasPdf: !!result.pdf,
					pdfSize: result.pdf?.length,
				});
			}

			if (result.status === 0 && result.pdf && result.pdf.length > 0) {
				console.log("[LaTeXService] Compilation successful!");
				await this.cleanupStaleFiles();
				await this.saveCompilationOutput(
					mainFileName.replace(/^\/+/, ""),
					result,
				);
				await this.storeOutputDirectories(engine);
			} else {
				console.log("[LaTeXService] Compilation failed with errors");
				await this.cleanupStaleFiles();
				await this.saveCompilationLog(
					mainFileName.replace(/^\/+/, ""),
					result.log,
				);
			}

			engine.flushCache();

			return result;
		} catch (error) {
			if (this.getStatus() === "error") {
				console.log(
					"[LaTeXService] LaTeX Engine failed or was stopped by user, no further action needed.",
				);
				return {
					pdf: null,
					status: -1,
					log: "Compilation failed or was stopped by user.",
				};
			}
			throw error;
		}
	}

	private async prepareFileNodes(
		mainFileName: string,
		fileTree: FileNode[],
	): Promise<void> {
		const allNodes = this.collectAllFiles(fileTree);

		this.buildSourceFileTimestamps(allNodes);

		if (this.storeCache) {
			await this.loadAndValidateCachedNodes(allNodes);
		}

		this.processedNodes = this.preprocessNodes(allNodes, mainFileName);
	}

	private buildSourceFileTimestamps(nodes: FileNode[]): void {
		this.sourceFileTimestamps.clear();

		for (const node of nodes) {
			if (
				node.type === "file" &&
				!node.path.startsWith("/.texlyre_cache/") &&
				!node.path.startsWith("/.texlyre_src/")
			) {
				this.sourceFileTimestamps.set(node.path, node.lastModified || 0);
			}
		}
	}

	private async loadAndValidateCachedNodes(nodes: FileNode[]): Promise<void> {
		try {
			const existingFiles = await fileStorageService.getAllFiles();
			const cachedFiles = existingFiles.filter(
				(file) =>
					file.path.startsWith("/.texlyre_cache/__tex/") &&
					file.type === "file" &&
					!file.isDeleted,
			);

			const validCachedFiles: FileNode[] = [];
			const staleCacheIds: string[] = [];

			for (const cachedFile of cachedFiles) {
				if (await this.isCacheEntryValid(cachedFile)) {
					validCachedFiles.push(cachedFile);
				} else {
					staleCacheIds.push(cachedFile.id);
				}
			}

			if (staleCacheIds.length > 0) {
				console.log(`[LaTeXService] Cleaning up ${staleCacheIds.length} stale cache entries`);
				await fileStorageService.batchDeleteFiles(staleCacheIds, {
					showDeleteDialog: false,
					hardDelete: true,
				});
			}

			for (const validCache of validCachedFiles) {
				if (!nodes.some((node) => node.path === validCache.path)) {
					nodes.push(validCache);
				}
			}

			console.log(`[LaTeXService] Loaded ${validCachedFiles.length} valid cached TeX files`);
		} catch (error) {
			console.error("Error loading and validating cached files:", error);
		}
	}

	private async isCacheEntryValid(cachedFile: FileNode): Promise<boolean> {
		const maxAge = 24 * 60 * 60 * 1000;
		const now = Date.now();

		if (!cachedFile.lastModified || now - cachedFile.lastModified > maxAge) {
			return false;
		}

		const latestSourceTimestamp = Math.max(
			...Array.from(this.sourceFileTimestamps.values()),
		);
		return cachedFile.lastModified >= latestSourceTimestamp;
	}

	private preprocessNodes(nodes: FileNode[], mainFileName: string): FileNode[] {
		const processed: FileNode[] = [];
		let mainFileProcessed = false;
		let mainFileDirectory: string | null = null;

		if (this.flattenMainDirectory) {
			const normalizedMainFile = mainFileName.replace(/^\/+/, "");
			const lastSlashIndex = normalizedMainFile.lastIndexOf("/");
			if (lastSlashIndex !== -1) {
				mainFileDirectory = normalizedMainFile.substring(0, lastSlashIndex);
			}
		}

		for (const node of nodes) {
			if (node.type !== "file") continue;

			const processedNode = { ...node };

			if (node.path === mainFileName) {
				if (!mainFileName.startsWith("/") || mainFileName === `/${node.name}`) {
					processedNode.path = node.name;
				} else {
					// const randomPrefix = `${Math.random().toString(36).substring(2, 8)}_`;
					const randomPrefix = "_";
					processedNode.path = `${randomPrefix}${node.name}`;
					processedNode.name = `${randomPrefix}${node.name}`;
				}
				mainFileProcessed = true;
			} else {
				const normalizedPath = node.path.replace(/^\/+/, "");

				if (
					normalizedPath.startsWith(".texlyre_src/") ||
					normalizedPath.startsWith(".texlyre_cache/")
				) {
					processedNode.path = normalizedPath;
				} else if (this.flattenMainDirectory && mainFileDirectory) {
					const mainDirWithSlash = `${mainFileDirectory}/`;
					if (normalizedPath.startsWith(mainDirWithSlash)) {
						const relativePath = normalizedPath.substring(
							mainDirWithSlash.length,
						);
						processedNode.path = relativePath;
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
	): Promise<void> {
		const cacheNodes = this.processedNodes.filter((node) =>
			node.path.startsWith(".texlyre_cache/__tex/"),
		);
		const workNodes = this.processedNodes.filter(
			(node) =>
				!node.path.startsWith(".texlyre_cache/__tex/") &&
				!node.path.startsWith(".texlyre_src/"),
		);

		const workDirectories = new Set<string>();
		const texDirectories = new Set<string>();

		for (const node of workNodes) {
			const dirPath = node.path.substring(0, node.path.lastIndexOf("/"));
			if (dirPath) {
				workDirectories.add(dirPath);
			}
		}

		for (const node of cacheNodes) {
			const cleanPath = node.path.replace(".texlyre_cache/__tex/", "");
			const dirPath = cleanPath.substring(0, cleanPath.lastIndexOf("/"));
			if (dirPath) {
				texDirectories.add(dirPath);
			}
		}

		for (const dir of workDirectories) {
			this.createDirectoryStructure(engine, `/work/${dir}`);
		}

		for (const dir of texDirectories) {
			// this.createDirectoryStructure(engine, `/tex/${dir}`);
			this.createDirectoryStructure(engine, `/work/${dir}`);
		}

		for (const node of workNodes) {
			try {
			   const fileContent = await this.getFileContent(node);
			   if (fileContent) {
				  const cleanedFileContent = fileCommentProcessor.cleanContent(fileContent);
				  if (typeof cleanedFileContent === "string") {
					 engine.writeMemFSFile(`/work/${node.path}`, cleanedFileContent);
				  } else {
					 engine.writeMemFSFile(
						`/work/${node.path}`,
						new Uint8Array(cleanedFileContent),
					 );
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
					const cleanPath = node.path.replace(".texlyre_cache/__tex/", "");
					if (typeof fileContent === "string") {
						// engine.writeMemFSFile(`/tex/${cleanPath}`, fileContent);
						engine.writeMemFSFile(`/work/${cleanPath}`, fileContent);
					} else {
						// engine.writeMemFSFile(`/tex/${cleanPath}`, new Uint8Array(fileContent));
						engine.writeMemFSFile(
							`/work/${cleanPath}`,
							new Uint8Array(fileContent),
						);
					}
				}
			} catch (error) {
				console.error(`Error writing cache file ${node.path} to MemFS:`, error);
			}
		}

		const normalizedMainFile = mainFileName.replace(/^\/+/, "");
		const mainFileNode = workNodes.find(
			(node) =>
				node.path === normalizedMainFile ||
				node.path.endsWith(normalizedMainFile.split("/").pop() || ""),
		);

		if (mainFileNode) {
			engine.setEngineMainFile(mainFileNode.path);
		} else {
			engine.setEngineMainFile(normalizedMainFile);
		}

		console.log(
			`[LaTeXService] Written ${workNodes.length} work files and ${cacheNodes.length} cache files to MemFS`,
		);
	}

	private async storeOutputDirectories(engine: BaseEngine): Promise<void> {
		if (this.storeCache) {
			await this.storeCacheDirectory(engine);
		}

		if (this.storeWorkingDirectory) {
			await this.cleanupDirectory("/.texlyre_src/__work");
			await this.storeWorkDirectory(engine);
		}
	}

	private async storeCacheDirectory(engine: BaseEngine): Promise<void> {
		try {
			const texFiles = await engine.dumpDirectory("/tex");
			await this.batchStoreDirectoryContents(texFiles, "/.texlyre_cache/__tex");
		} catch (error) {
			console.error("Error saving cache directory:", error);
		}
	}

	private async storeWorkDirectory(engine: BaseEngine): Promise<void> {
		try {
			const workFiles = await engine.dumpDirectory("/work");
			const filteredWorkFiles =
				await this.filterWorkFilesExcludingCache(workFiles);
			await this.batchStoreDirectoryContents(
				filteredWorkFiles,
				"/.texlyre_src/__work",
			);
		} catch (error) {
			console.error("Error saving work directory:", error);
		}
	}

	private async filterWorkFilesExcludingCache(workFiles: {
		[key: string]: ArrayBuffer;
	}): Promise<{ [key: string]: ArrayBuffer }> {
		const filtered: { [key: string]: ArrayBuffer } = {};

		try {
			const existingFiles = await fileStorageService.getAllFiles();
			const cacheFiles = existingFiles.filter(
				(file) =>
					file.path.startsWith("/.texlyre_cache/__tex/") &&
					file.type === "file" &&
					!file.isDeleted,
			);

			const cachePaths = new Set(
				cacheFiles.map((file) =>
					file.path.replace("/.texlyre_cache/__tex", ""),
				),
			);

			for (const [workPath, content] of Object.entries(workFiles)) {
				const normalizedWorkPath = workPath.replace(/^\/work/, "");
				if (!cachePaths.has(normalizedWorkPath)) {
					filtered[workPath] = content;
				}
			}
		} catch (error) {
			console.error("Error filtering work files:", error);
			return workFiles;
		}

		return filtered;
	}

	private async cleanupStaleFiles(): Promise<void> {
		try {
			const existingFiles = await fileStorageService.getAllFiles();
			const staleFiles = existingFiles.filter(
				(file) => file.path.startsWith("/.texlyre_src/") && !file.isDeleted,
			);

			if (staleFiles.length > 0) {
				const fileIds = staleFiles.map((file) => file.id);
				await fileStorageService.batchDeleteFiles(fileIds, {
					showDeleteDialog: false,
					hardDelete: true,
				});
				console.log(`[LaTeXService] Cleaned up ${staleFiles.length} stale LaTeX files`);
			}
		} catch (error) {
			console.error("Error cleaning up stale files:", error);
		}
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
			const dirPath = storagePath.substring(0, storagePath.lastIndexOf("/"));
			const fileName = storagePath.split("/").pop()!;

			if (dirPath !== baseDir && dirPath) {
				directoriesToCreate.add(dirPath);
			}

			const existingFile = await fileStorageService.getFileByPath(
				storagePath,
				true,
			);

			filesToStore.push({
				id: existingFile?.id || nanoid(),
				name: fileName,
				path: storagePath,
				type: "file",
				content: content,
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
			console.log(`[LaTeXService] Batch stored ${filesToStore.length} files to ${baseDir}`);
		}
	}

	private async batchCreateDirectories(
		directoryPaths: string[],
	): Promise<void> {
		const directoriesToCreate: FileNode[] = [];
		const existingFiles = await fileStorageService.getAllFiles();
		const existingPaths = new Set(existingFiles.map((file) => file.path));

		const allPaths = new Set<string>();
		for (const fullPath of directoryPaths) {
			const parts = fullPath.split("/").filter((p) => p);
			let currentPath = "";
			for (const part of parts) {
				currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;
				allPaths.add(currentPath);
			}
		}

		for (const dirPath of allPaths) {
			if (!existingPaths.has(dirPath)) {
				const dirName = dirPath.split("/").pop()!;
				directoriesToCreate.push({
					id: nanoid(),
					name: dirName,
					path: dirPath,
					type: "directory",
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

	private async saveCompilationOutput(
		mainFile: string,
		result: CompileResult,
	): Promise<void> {
		try {
			await this.cleanupDirectory("/.texlyre_src/__output");

			const outputFiles: FileNode[] = [];

			if (result.pdf && result.pdf.length > 0) {
				const fileName = mainFile.split("/").pop() || mainFile;
				const baseName = fileName.split(".").slice(0, -1).join(".");
				const pdfFileName = `${baseName}.pdf`;

				outputFiles.push({
					id: nanoid(),
					name: pdfFileName,
					path: `/.texlyre_src/__output/${pdfFileName}`,
					type: "file",
					content: result.pdf.buffer,
					lastModified: Date.now(),
					size: result.pdf.length,
					mimeType: "application/pdf",
					isBinary: true,
					excludeFromSync: true,
				});
			}

			const logFile = await this.createCompilationLogFile(mainFile, result.log);
			outputFiles.push(logFile);

			await this.ensureOutputDirectoriesExist();

			if (outputFiles.length > 0) {
				await fileStorageService.batchStoreFiles(outputFiles, {
					showConflictDialog: false,
				});
				console.log(`[LaTeXService] Batch stored ${outputFiles.length} output files`);
			}
		} catch (error) {
			console.error("Error saving compilation output:", error);
		}
	}

	private async saveCompilationLog(
		mainFile: string,
		log: string,
	): Promise<void> {
		try {
			await this.cleanupDirectory("/.texlyre_src/__output");
			await this.ensureOutputDirectoriesExist();
			const logFile = await this.createCompilationLogFile(mainFile, log);

			await fileStorageService.batchStoreFiles([logFile], {
				showConflictDialog: false,
			});
			console.log("[LaTeXService] Saved compilation log");
		} catch (error) {
			console.error("Error saving compilation log:", error);
		}
	}

	private async cleanupDirectory(directoryPath: string): Promise<void> {
		try {
			const existingFiles = await fileStorageService.getAllFiles();
			const filesToCleanup = existingFiles.filter(
				(file) => file.path.startsWith(`${directoryPath}/`) && !file.isDeleted,
			);

			if (filesToCleanup.length > 0) {
				const fileIds = filesToCleanup.map((file) => file.id);
				await fileStorageService.batchDeleteFiles(fileIds, {
					showDeleteDialog: false,
					hardDelete: true,
				});
				console.log(
					`[LaTeXService] Cleaned up ${filesToCleanup.length} files from ${directoryPath}`,
				);
			}
		} catch (error) {
			console.error(`Error cleaning up directory ${directoryPath}:`, error);
		}
	}

	private async createCompilationLogFile(
		mainFile: string,
		log: string,
	): Promise<FileNode> {
		const fileName = mainFile.split("/").pop() || mainFile;
		const baseName = fileName.split(".").slice(0, -1).join(".");
		const logFileName = `${baseName}.log`;

		const encoder = new TextEncoder();
		const logContent = encoder.encode(log).buffer;

		return {
			id: nanoid(),
			name: logFileName,
			path: `/.texlyre_src/__output/${logFileName}`,
			type: "file",
			content: logContent,
			lastModified: Date.now(),
			size: encoder.encode(log).length,
			mimeType: "text/plain",
			isBinary: false,
			excludeFromSync: true,
		};
	}

	private async ensureOutputDirectoriesExist(): Promise<void> {
		const requiredDirectories = [
			"/.texlyre_src",
			"/.texlyre_src/__output",
			"/.texlyre_src/__work",
			"/.texlyre_cache",
			"/.texlyre_cache/__tex",
		];

		const directoriesToCreate: FileNode[] = [];
		const existingFiles = await fileStorageService.getAllFiles();
		const existingPaths = new Set(existingFiles.map((file) => file.path));

		for (const dirPath of requiredDirectories) {
			if (!existingPaths.has(dirPath)) {
				const dirName = dirPath.split("/").pop()!;
				directoriesToCreate.push({
					id: nanoid(),
					name: dirName,
					path: dirPath,
					type: "directory",
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

	private collectAllFiles(nodes: FileNode[]): FileNode[] {
		const result: FileNode[] = [];

		for (const node of nodes) {
			if (node.type === "file") {
				result.push(node);
			}
			if (node.children && node.children.length > 0) {
				result.push(...this.collectAllFiles(node.children));
			}
		}

		return result;
	}

	private async getFileContent(
		node: FileNode,
	): Promise<ArrayBuffer | string | null> {
		try {
			const rawFile = await fileStorageService.getFile(node.id);
			if (rawFile?.content) {
				return rawFile.content;
			}
		} catch (error) {
			console.error("Error retrieving file content:", error);
		}
		return null;
	}

	private createDirectoryStructure(engine: BaseEngine, dirPath: string): void {
		if (!dirPath || dirPath === "") return;

		try {
			const normalizedPath = dirPath.replace(/\\/g, "/");
			const parts = normalizedPath.split("/").filter((part) => part.length > 0);
			// remove /work/ prefix if it exists
			if (parts.length > 0 && parts[0] === "work") {
				parts.shift();
			}
			if (parts.length === 0) return;

			let currentPath = "";

			for (const part of parts) {
				if (currentPath) {
					currentPath += `/${part}`;
				} else {
					currentPath = part;
				}

				try {
					engine.makeMemFSFolder(currentPath);
				} catch (_e) {}
			}
		} catch (error) {
			console.warn(`Error in directory creation: ${error.message}`);
		}
	}

	stopCompilation(): void {
		try {
			const engine = this.getCurrentEngine();
			engine.stopCompilation();
		} catch (error) {
			console.warn("Error stopping compilation:", error);
		}
	}

	async reinitializeCurrentEngine(): Promise<void> {
		try {
			const engine = this.getCurrentEngine();
			await engine.reinitialize();
		} catch (error) {
			console.error("Failed to reinitialize engine:", error);
			throw error;
		}
	}
}

export const latexService = new LaTeXService();
