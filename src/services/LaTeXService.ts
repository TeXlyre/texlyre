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

type EngineType = "pdftex" | "xetex" | "luatex";

class LaTeXService {
	private engines: Map<EngineType | "dvipdfmx", BaseEngine> = new Map();
	private currentEngineType: EngineType = "pdftex";
	private statusListeners: Set<() => void> = new Set();
	private texliveEndpoint = "https://texlive.emaily.re";
	private storeCache = true;
	private storeWorkingDirectory = false;
	private flattenMainDirectory = true; // Flatten main directory structure (keep until we have a better solution)
	private processedNodes: FileNode[] = [];

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
			this.createDirectoryStructure(dvipdfmxEngine, dirPath);
		}

		console.log(
			`Writing XDV file: ${dviFileName}, size: ${xdvData.length} bytes`,
		);
		dvipdfmxEngine.writeMemFSFile(dviFileName, xdvData);
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
			console.log("Engine not ready, initializing...");
			await engine.initialize();
		}

		try {
			await this.prepareFileNodes(mainFileName, fileTree);
			await this.writeNodesToMemFS(engine, mainFileName);

			console.log("Starting compilation...");
			let result = await engine.compile(mainFileName, this.processedNodes);

			console.log("Initial compilation result:", {
				status: result.status,
				hasPdf: !!result.pdf,
				hasXdv: !!(result as any).xdv,
				engineType: this.currentEngineType,
			});

			if (result.status === 0 && !result.pdf && (result as any).xdv) {
				console.log("XDV file detected, converting to PDF with Dvipdfmx...");
				result = await this.processDviToPdf(
					(result as any).xdv,
					mainFileName,
					result.log,
				);
				console.log("Dvipdfmx conversion result:", {
					status: result.status,
					hasPdf: !!result.pdf,
					pdfSize: result.pdf?.length,
				});
			}

			if (result.status === 0 && result.pdf && result.pdf.length > 0) {
				console.log("Compilation successful!");
				await this.cleanupSourceDirectory();
				await this.saveCompilationOutput(
					mainFileName.replace(/^\/+/, ""),
					result,
				);
				await this.storeOutputDirectories(engine);
			} else {
				console.log("Compilation failed with errors");
				await this.saveCompilationLog(
					mainFileName.replace(/^\/+/, ""),
					result.log,
				);
			}

			return result;
		} catch (error) {
			if (this.getStatus() === "error") {
				console.log(
					"LaTeX Engine failed or was stopped by user, no further action needed.",
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

		if (this.storeCache) {
			await this.loadCachedNodes(allNodes);
		}

		this.processedNodes = this.preprocessNodes(allNodes, mainFileName);
	}

	private async loadCachedNodes(nodes: FileNode[]): Promise<void> {
		try {
			const existingFiles = await fileStorageService.getAllFiles();
			const cachedFiles = existingFiles.filter(
				(file) =>
					file.path.startsWith("/.texlyre_cache/__tex/") &&
					file.type === "file" &&
					!file.isDeleted,
			);

			for (const cachedFile of cachedFiles) {
				if (!nodes.some((node) => node.path === cachedFile.path)) {
					nodes.push(cachedFile);
				}
			}

			console.log(`Loaded ${cachedFiles.length} cached TeX files`);
		} catch (error) {
			console.error("Error loading cached files:", error);
		}
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

			if (node.path.startsWith("/.texlyre_cache/__tex/")) {
				const relativePath = node.path.replace("/.texlyre_cache/__tex/", "");
				processedNode.path = relativePath;
				processedNode.name = relativePath.split("/").pop() || node.name;
			} else if (node.path === mainFileName) {
				if (!mainFileName.startsWith("/") || mainFileName === `/${node.name}`) {
					processedNode.path = node.name;
				} else {
					const randomPrefix = Math.random().toString(36).substring(2, 8);
					processedNode.path = `${randomPrefix}_${node.name}`;
					processedNode.name = `${randomPrefix}_${node.name}`;
				}
				mainFileProcessed = true;
			} else {
				const normalizedPath = node.path.replace(/^\/+/, "");

				if (normalizedPath.startsWith(".texlyre_src/") || normalizedPath.startsWith(".texlyre_cache/")) {
					processedNode.path = normalizedPath;
				} else if (this.flattenMainDirectory && mainFileDirectory) {
					const mainDirWithSlash = `${mainFileDirectory}/`;
					if (normalizedPath.startsWith(mainDirWithSlash)) {
						const relativePath = normalizedPath.substring(mainDirWithSlash.length);
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
		const directories = new Set<string>();

		for (const node of this.processedNodes) {
			const dirPath = node.path.substring(0, node.path.lastIndexOf("/"));
			if (dirPath) {
				directories.add(dirPath);
			}
		}

		for (const dir of directories) {
			this.createDirectoryStructure(engine, dir);
		}

		for (const node of this.processedNodes) {
			try {
				const fileContent = await this.getFileContent(node);
				if (fileContent) {
					if (typeof fileContent === "string") {
						engine.writeMemFSFile(node.path, fileContent);
					} else {
						engine.writeMemFSFile(node.path, new Uint8Array(fileContent));
					}
				}
			} catch (error) {
				console.error(`Error writing file ${node.path} to MemFS:`, error);
			}
		}

		const normalizedMainFile = mainFileName.replace(/^\/+/, "");
		const mainFileNode = this.processedNodes.find(
			(node) =>
				node.path === normalizedMainFile ||
				node.path.endsWith(normalizedMainFile.split("/").pop() || ""),
		);

		if (mainFileNode) {
			engine.setEngineMainFile(mainFileNode.path);
		} else {
			engine.setEngineMainFile(normalizedMainFile);
		}

		console.log(`Written ${this.processedNodes.length} files to MemFS`);
	}

	private async storeOutputDirectories(engine: BaseEngine): Promise<void> {
		if (this.storeCache) {
			await this.storeCacheDirectory(engine);
		}
		if (this.storeWorkingDirectory) {
			await this.storeWorkDirectory(engine);
		}
	}

	private async storeCacheDirectory(engine: BaseEngine): Promise<void> {
		try {
			const texFiles = await engine.dumpDirectory("/tex");
			await this.storeDirectoryContents(texFiles, "/.texlyre_cache/__tex");
		} catch (error) {
			console.error("Error saving cache directory:", error);
		}
	}

	private async storeWorkDirectory(engine: BaseEngine): Promise<void> {
		try {
			const workFiles = await engine.dumpDirectory("/work");
			await this.storeDirectoryContents(workFiles, "/.texlyre_src/__work");
		} catch (error) {
			console.error("Error saving work directory:", error);
		}
	}

	private async cleanupSourceDirectory(): Promise<void> {
		try {
			const existingFiles = await fileStorageService.getAllFiles();
			const sourceFiles = existingFiles.filter(
				(file) => file.path.startsWith("/.texlyre_src/") && !file.isDeleted,
			);

			for (const file of sourceFiles) {
				await fileStorageService.deleteFile(file.id, {
					showDeleteDialog: false,
					hardDelete: true,
				});
			}
			console.log("Cleaned up source directory");
		} catch (error) {
			console.error("Error cleaning up source directory:", error);
		}
	}

	private async storeDirectoryContents(
		files: { [key: string]: ArrayBuffer },
		baseDir: string,
	): Promise<void> {
		const directories = new Set<string>();
		const filesToStore: FileNode[] = [];

		for (const [originalPath, _] of Object.entries(files)) {
			const storagePath = originalPath.replace(/^\/(tex|work)/, baseDir);
			const dirPath = storagePath.substring(0, storagePath.lastIndexOf("/"));
			directories.add(dirPath);
		}

		for (const dir of directories) {
			await this.createStorageDirectory(dir);
		}

		for (const [originalPath, content] of Object.entries(files)) {
			const storagePath = originalPath.replace(/^\/(tex|work)/, baseDir);
			const fileName = storagePath.split("/").pop()!;

			filesToStore.push({
				id: nanoid(),
				name: fileName,
				path: storagePath,
				type: "file",
				content: content,
				lastModified: Date.now(),
				size: content.byteLength,
				mimeType: getMimeType(fileName),
				isBinary: isBinaryFile(fileName),
			});
		}

		await fileStorageService.batchStoreFiles(filesToStore, {
			showConflictDialog: false,
		});
	}

	private async createStorageDirectory(fullPath: string): Promise<void> {
		try {
			const parts = fullPath.split("/").filter((p) => p);
			let currentPath = "";

			const existingFiles = await fileStorageService.getAllFiles();
			const existingPaths = new Set(existingFiles.map((file) => file.path));

			for (const part of parts) {
				currentPath = currentPath ? `${currentPath}/${part}` : `/${part}`;

				if (!existingPaths.has(currentPath)) {
					await fileStorageService.storeFile(
						{
							id: nanoid(),
							name: part,
							path: currentPath,
							type: "directory",
							lastModified: Date.now(),
						},
						{ showConflictDialog: false },
					);
				}
			}
		} catch (error) {
			console.error("Error creating storage directory:", error);
		}
	}

	private async saveCompilationOutput(
		mainFile: string,
		result: CompileResult,
	): Promise<void> {
		try {
			await this.createOutputDirectory();

			if (result.pdf && result.pdf.length > 0) {
				const fileName = mainFile.split("/").pop() || mainFile;
				const baseName = fileName.split(".").slice(0, -1).join(".");
				const pdfFileName = `${baseName}.pdf`;

				await fileStorageService.storeFile(
					{
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
					},
					{ showConflictDialog: false },
				);

				console.log(`Saved output PDF: /.texlyre_src/__output/${pdfFileName}`);
			}

			await this.saveCompilationLog(mainFile, result.log);
		} catch (error) {
			console.error("Error saving compilation output:", error);
		}
	}

	private async saveCompilationLog(
		mainFile: string,
		log: string,
	): Promise<void> {
		try {
			await this.createOutputDirectory();

			const fileName = mainFile.split("/").pop() || mainFile;
			const baseName = fileName.split(".").slice(0, -1).join(".");
			const logFileName = `${baseName}.log`;

			const encoder = new TextEncoder();
			const logContent = encoder.encode(log).buffer;

			await fileStorageService.storeFile(
				{
					id: nanoid(),
					name: logFileName,
					path: `/.texlyre_src/__output/${logFileName}`,
					type: "file",
					content: logContent,
					lastModified: Date.now(),
					size: encoder.encode(log).length,
					mimeType: "text/plain",
					isBinary: false,
				},
				{ showConflictDialog: false },
			);

			console.log(
				`Saved compilation log: /.texlyre_src/__output/${logFileName}`,
			);
		} catch (error) {
			console.error("Error saving compilation log:", error);
		}
	}

	private async createOutputDirectory(): Promise<void> {
		try {
			await this.createBaseDirectory();

			const directoriesToCreate = ["__output", "__tex", "__work"];
			const existingFiles = await fileStorageService.getAllFiles();
			const existingPaths = new Set(existingFiles.map((file) => file.path));

			for (const dirName of directoriesToCreate) {
				const dirPath = `/.texlyre_src/${dirName}`;

				if (!existingPaths.has(dirPath)) {
					await fileStorageService.storeFile(
						{
							id: nanoid(),
							name: dirName,
							path: dirPath,
							type: "directory",
							lastModified: Date.now(),
						},
						{ showConflictDialog: false },
					);
				}
			}
		} catch (error) {
			console.error("Error creating output directories:", error);
		}
	}

	private async createBaseDirectory(): Promise<void> {
		try {
			const existingFiles = await fileStorageService.getAllFiles();
			const baseDir = "/.texlyre_src";
			const baseDirExists = existingFiles.some(
				(file) => file.path === baseDir && file.type === "directory",
			);

			if (!baseDirExists) {
				await fileStorageService.storeFile(
					{
						id: nanoid(),
						name: ".texlyre_src",
						path: baseDir,
						type: "directory",
						lastModified: Date.now(),
					},
					{ showConflictDialog: false },
				);
			}
		} catch (error) {
			console.error("Error creating base directory:", error);
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