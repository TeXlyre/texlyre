// src/services/TypstService.ts
import { nanoid } from "nanoid";

import type { TypstCompileResult, TypstOutputFormat } from "../types/typst";
import type { FileNode } from "../types/files";
import { fileStorageService } from "./FileStorageService";
import { notificationService } from "./NotificationService";
import { fileCommentProcessor } from "../utils/fileCommentProcessor";

interface TypstInstance {
    pdf(options: { mainContent: string; sources?: Record<string, string | Uint8Array> }): Promise<Uint8Array>;
    svg(options: { mainContent: string; sources?: Record<string, string | Uint8Array> }): Promise<string>;
}

declare global {
    interface Window {
        $typst?: TypstInstance;
    }
}

class TypstService {
    private status: "unloaded" | "loading" | "ready" | "compiling" | "error" = "unloaded";
    private statusListeners: Set<() => void> = new Set();
    private processedNodes: FileNode[] = [];
    private defaultFormat: TypstOutputFormat = "pdf";

    async initialize(): Promise<void> {
        if (this.status === "ready") return;
        if (this.status === "loading") {
            return new Promise((resolve, reject) => {
                const checkStatus = () => {
                    if (this.status === "ready") {
                        resolve();
                    } else if (this.status === "error") {
                        reject(new Error("Failed to initialize Typst engine"));
                    } else {
                        setTimeout(checkStatus, 100);
                    }
                };
                checkStatus();
            });
        }

        this.setStatus("loading");
        try {
            await this.loadTypst();
            this.setStatus("ready");
        } catch (error) {
            this.setStatus("error");
            throw error;
        }
    }

    private async loadTypst(): Promise<void> {
        if (window.$typst) return;

        try {
            const { $typst } = await import("@myriaddreamin/typst.ts");

            await $typst.setCompilerInitOptions({
                getModule: () => "/texlyre/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm",
            });

            await $typst.setRendererInitOptions({
                getModule: () => "/texlyre/typst-ts-renderer/pkg/typst_ts_renderer_bg.wasm",
            });

            window.$typst = $typst;
        } catch (error) {
            throw new Error(`Failed to load Typst: ${error}`);
        }
    }

    setDefaultFormat(format: TypstOutputFormat): void {
        this.defaultFormat = format;
    }

    getDefaultFormat(): TypstOutputFormat {
        return this.defaultFormat;
    }

    getSupportedFormats(): TypstOutputFormat[] {
        return ["pdf", "svg"];
    }

    async compileTypst(
        mainFileName: string,
        fileTree: FileNode[],
        format: TypstOutputFormat = this.defaultFormat
    ): Promise<TypstCompileResult> {
        if (!window.$typst || !this.isReady()) {
            await this.initialize();
        }

        const operationId = `typst-compile-${nanoid()}`;
        this.setStatus("compiling");

        const normalizedMainFileName = mainFileName.replace(/^\/+/, "");
        console.log(`[TypstService] Starting compilation of: ${mainFileName} -> ${normalizedMainFileName}`);
        console.log(`[TypstService] Target format: ${format}`);
        console.log(`[TypstService] Total files in tree: ${fileTree.length}`);

        try {
            this.showLoadingNotification("Preparing files for compilation...", operationId);
            await this.prepareFileNodes(normalizedMainFileName, fileTree);

            this.showLoadingNotification(`Compiling Typst document to ${format.toUpperCase()}...`, operationId);
            const { mainContent, sources } = await this.prepareSources(normalizedMainFileName);

            if (!mainContent || mainContent.trim() === "") {
                const result: TypstCompileResult = {
                    status: 1,
                    log: `Compilation failed: Main file '${normalizedMainFileName}' is empty or not found. Available files: ${Object.keys(sources).join(', ')}`,
                    format
                };
                await this.saveCompilationLog(normalizedMainFileName, result.log);
                this.showErrorNotification("Typst compilation failed: Main file is empty", {
                    operationId,
                    duration: 5000,
                });
                this.setStatus("ready");
                return result;
            }

            console.log(`[TypstService] Compiling with main content length: ${mainContent.length} chars`);
            console.log(`[TypstService] Sources count: ${Object.keys(sources).length}`);
            console.log(`[TypstService] Target format: ${format}`);
            console.log(`[TypstService] Main content preview:`, mainContent.substring(0, 200));

            let output: Uint8Array | string | undefined;

            switch (format) {
                case "pdf":
                    output = await window.$typst!.pdf({ mainContent, sources });
                    break;
                case "svg":
                    output = await window.$typst!.svg({ mainContent, sources });
                    break;
                default:
                    throw new Error(`Unsupported format: ${format}`);
            }

            console.log(`[TypstService] Compilation result - ${format} output length: ${typeof output === 'string' ? output.length : output?.length || 0
                } ${typeof output === 'string' ? 'chars' : 'bytes'}`);

            if (output && (typeof output === 'string' ? output.length > 0 : output.length > 0)) {
                this.showLoadingNotification("Saving compilation output...", operationId);

                const result: TypstCompileResult = {
                    status: 0,
                    log: "Compilation successful",
                    format
                };

                switch (format) {
                    case "pdf":
                        result.pdf = output as Uint8Array;
                        break;
                    case "svg":
                        result.svg = output as string;
                        break;
                }

                await this.saveCompilationOutput(normalizedMainFileName, result);
                this.showSuccessNotification(`Typst compilation to ${format.toUpperCase()} completed successfully`, {
                    operationId,
                    duration: 3000,
                });

                this.setStatus("ready");
                return result;
            } else {
                const result: TypstCompileResult = {
                    status: 1,
                    log: `Compilation failed: No ${format.toUpperCase()} output generated or output is empty`,
                    format
                };
                await this.saveCompilationLog(normalizedMainFileName, result.log);
                this.showErrorNotification(`Typst compilation failed: Empty ${format.toUpperCase()} output`, {
                    operationId,
                    duration: 5000,
                });

                this.setStatus("ready");
                return result;
            }
        } catch (error) {
            this.setStatus("error");
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            console.error("[TypstService] Compilation error:", error);
            this.showErrorNotification(`Compilation error: ${errorMessage}`, {
                operationId,
                duration: 5000,
            });

            const result: TypstCompileResult = {
                status: 1,
                log: `Compilation error: ${errorMessage}`,
                format
            };

            try {
                await this.saveCompilationLog(normalizedMainFileName, result.log);
            } catch (saveError) {
                console.error("Failed to save compilation log:", saveError);
            }

            return result;
        }
    }

    private async prepareFileNodes(mainFileName: string, fileTree: FileNode[]): Promise<void> {
        const allNodes = this.collectAllFiles(fileTree);
        this.processedNodes = this.preprocessNodes(allNodes, mainFileName);
        console.log(`[TypstService] Prepared ${this.processedNodes.length} files for compilation`);
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

    private preprocessNodes(nodes: FileNode[], mainFileName: string): FileNode[] {
        const filteredNodes = nodes.filter(node => {
            if (node.type !== "file") {
                console.log(`[TypstService] Skipping non-file: ${node.path}`);
                return false;
            }
            if (node.path.startsWith("/.texlyre_")) {
                console.log(`[TypstService] Skipping system file: ${node.path}`);
                return false;
            }
            if (node.isDeleted) {
                console.log(`[TypstService] Skipping deleted file: ${node.path}`);
                return false;
            }

            const hasContent = node.content !== undefined;
            if (!hasContent) {
                console.log(`[TypstService] Warning: File has no content: ${node.path}`);
            }

            const normalizedMainPath = mainFileName.replace(/^\/+/, "");
            const normalizedNodePath = node.path.replace(/^\/+/, "");

            if (normalizedNodePath.endsWith('.typ') ||
                normalizedNodePath.endsWith('.toml') ||
                normalizedNodePath.endsWith('.yaml') ||
                normalizedNodePath.endsWith('.yml') ||
                normalizedNodePath === normalizedMainPath ||
                node.path === mainFileName ||
                node.name === mainFileName ||
                node.name === normalizedMainPath) {
                console.log(`[TypstService] Including relevant file: ${node.path} (reason: typ/config/main file)`);
                return true;
            }

            if (normalizedNodePath.match(/\.(png|jpg|jpeg|gif|svg|pdf|bib|cls|sty)$/i)) {
                console.log(`[TypstService] Including asset file: ${node.path}`);
                return true;
            }

            const mainDir = normalizedMainPath.includes('/') ?
                normalizedMainPath.substring(0, normalizedMainPath.lastIndexOf('/')) : '';
            const nodeDir = normalizedNodePath.includes('/') ?
                normalizedNodePath.substring(0, normalizedNodePath.lastIndexOf('/')) : '';

            if (mainDir === nodeDir) {
                console.log(`[TypstService] Including file from same directory: ${node.path}`);
                return true;
            }

            console.log(`[TypstService] Excluding file: ${node.path}`);
            return false;
        });

        console.log(`[TypstService] Filtered ${filteredNodes.length} from ${nodes.length} total files`);
        filteredNodes.forEach(node => {
            console.log(`[TypstService] Final included file: ${node.path}, hasContent: ${!!node.content}, contentType: ${typeof node.content}`);
        });

        return filteredNodes;
    }

    private async prepareSources(mainFileName: string): Promise<{
        mainContent: string;
        sources: Record<string, string | Uint8Array>;
    }> {
        const sources: Record<string, string | Uint8Array> = {};
        let mainContent = "";

        const normalizedMainFileName = mainFileName.replace(/^\/+/, "");
        const mainFileVariants = [
            mainFileName,
            normalizedMainFileName,
            `/${normalizedMainFileName}`,
        ];

        console.log(`[TypstService] Looking for main file variants:`, mainFileVariants);
        console.log(`[TypstService] Available files:`, this.processedNodes.map(n => ({
            path: n.path,
            normalizedPath: n.path.replace(/^\/+/, ""),
            hasContent: !!n.content,
            contentType: typeof n.content,
            contentSize: n.content instanceof ArrayBuffer ? n.content.byteLength :
                typeof n.content === 'string' ? n.content.length : 0
        })));

        for (const node of this.processedNodes) {
            try {
                const fileContent = await this.getFileContent(node);
                if (!fileContent) {
                    console.log(`[TypstService] No content for file: ${node.path}`);
                    continue;
                }

                const cleanedContent = fileCommentProcessor.cleanContent(fileContent);
                const normalizedPath = node.path.replace(/^\/+/, "");

                const isMainFile = mainFileVariants.some(variant => {
                    const normalizedVariant = variant.replace(/^\/+/, "");
                    return normalizedPath === normalizedVariant ||
                        node.path === variant ||
                        node.name === variant ||
                        node.name === normalizedVariant;
                });

                console.log(`[TypstService] Processing file: ${normalizedPath}, is main: ${isMainFile}, content length: ${typeof cleanedContent === 'string' ? cleanedContent.length :
                    cleanedContent instanceof ArrayBuffer ? cleanedContent.byteLength : 0
                    }`);

                if (isMainFile) {
                    if (typeof cleanedContent === "string") {
                        mainContent = cleanedContent;
                    } else {
                        mainContent = new TextDecoder().decode(cleanedContent);
                    }
                    console.log(`[TypstService] Found main file content length: ${mainContent.length}`);
                    console.log(`[TypstService] Main content preview:`, mainContent.substring(0, 100) + "...");
                }

                if (typeof cleanedContent === "string") {
                    sources[normalizedPath] = cleanedContent;
                } else {
                    sources[normalizedPath] = new Uint8Array(cleanedContent);
                }
            } catch (error) {
                console.error(`Error preparing source file ${node.path}:`, error);
            }
        }

        if (!mainContent || mainContent.trim() === "") {
            console.log(`[TypstService] Main file ${normalizedMainFileName} not found or empty, searching for alternatives`);

            for (const [path, content] of Object.entries(sources)) {
                if (path.endsWith('.typ') && typeof content === 'string' && content.trim()) {
                    console.log(`[TypstService] Using alternative main file: ${path}`);
                    mainContent = content;
                    break;
                }
            }

            if (!mainContent) {
                const mainBaseName = normalizedMainFileName.split('/').pop() || normalizedMainFileName;
                for (const [path, content] of Object.entries(sources)) {
                    const baseName = path.split('/').pop() || path;
                    if (baseName === mainBaseName && typeof content === 'string' && content.trim()) {
                        console.log(`[TypstService] Found main file by basename: ${path}`);
                        mainContent = content;
                        break;
                    }
                }
            }

            if (!mainContent) {
                for (const [path, content] of Object.entries(sources)) {
                    if (typeof content === 'string' && content.trim()) {
                        console.log(`[TypstService] Using first available text file as main: ${path}`);
                        mainContent = content;
                        break;
                    }
                }
            }
        }

        console.log(`[TypstService] Final main content length: ${mainContent.length}`);
        console.log(`[TypstService] Total sources: ${Object.keys(sources).length}`);

        if (mainContent.trim() === "") {
            console.error(`[TypstService] ERROR: Main content is still empty after all fallback strategies`);
            console.error(`[TypstService] Available sources:`, Object.keys(sources));
            console.error(`[TypstService] Processed nodes:`, this.processedNodes.map(n => n.path));
        }

        return { mainContent, sources };
    }

    private async getFileContent(node: FileNode): Promise<ArrayBuffer | string | null> {
        try {
            if (node.content !== undefined) {
                console.log(`[TypstService] Using node content for ${node.path}, type: ${typeof node.content}, size: ${node.content instanceof ArrayBuffer ? node.content.byteLength :
                    typeof node.content === 'string' ? node.content.length : 0
                    }`);
                return node.content;
            }

            const rawFile = await fileStorageService.getFile(node.id);
            if (rawFile?.content) {
                console.log(`[TypstService] Retrieved content from storage for ${node.path}, type: ${typeof rawFile.content}, size: ${rawFile.content instanceof ArrayBuffer ? rawFile.content.byteLength :
                    typeof rawFile.content === 'string' ? rawFile.content.length : 0
                    }`);
                return rawFile.content;
            }

            console.warn(`[TypstService] No content found for file: ${node.path} (id: ${node.id})`);
            return null;
        } catch (error) {
            console.error(`[TypstService] Error retrieving file content for ${node.path}:`, error);
            return null;
        }
    }

    private async saveCompilationOutput(mainFile: string, result: TypstCompileResult): Promise<void> {
        try {
            await this.cleanupDirectory("/.texlyre_src/__output");
            const outputFiles: FileNode[] = [];

            const fileName = mainFile.split("/").pop() || mainFile;
            const baseName = fileName.split(".").slice(0, -1).join(".");

            switch (result.format) {
                case "pdf":
                    if (result.pdf && result.pdf.length > 0) {
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
                    break;

                case "svg":
                    if (result.svg) {
                        const svgFileName = `${baseName}.svg`;
                        const svgContent = new TextEncoder().encode(result.svg).buffer;
                        outputFiles.push({
                            id: nanoid(),
                            name: svgFileName,
                            path: `/.texlyre_src/__output/${svgFileName}`,
                            type: "file",
                            content: svgContent,
                            lastModified: Date.now(),
                            size: svgContent.byteLength,
                            mimeType: "image/svg+xml",
                            isBinary: false,
                            excludeFromSync: true,
                        });
                    }
                    break;
            }

            const logFile = await this.createCompilationLogFile(mainFile, result.log);
            outputFiles.push(logFile);

            await this.ensureOutputDirectoriesExist();

            if (outputFiles.length > 0) {
                await fileStorageService.batchStoreFiles(outputFiles, {
                    showConflictDialog: false,
                });
            }
        } catch (error) {
            console.error("Error saving compilation output:", error);
        }
    }

    private async saveCompilationLog(mainFile: string, log: string): Promise<void> {
        try {
            await this.cleanupDirectory("/.texlyre_src/__output");
            await this.ensureOutputDirectoriesExist();
            const logFile = await this.createCompilationLogFile(mainFile, log);

            await fileStorageService.batchStoreFiles([logFile], {
                showConflictDialog: false,
            });
        } catch (error) {
            console.error("Error saving compilation log:", error);
        }
    }

    private async createCompilationLogFile(mainFile: string, log: string): Promise<FileNode> {
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
            }
        } catch (error) {
            console.error(`Error cleaning up directory ${directoryPath}:`, error);
        }
    }

    private async ensureOutputDirectoriesExist(): Promise<void> {
        const requiredDirectories = ["/.texlyre_src", "/.texlyre_src/__output"];

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

    getStatus(): string {
        return this.status;
    }

    isReady(): boolean {
        return this.status === "ready";
    }

    isCompiling(): boolean {
        return this.status === "compiling";
    }

    addStatusListener(listener: () => void): () => void {
        this.statusListeners.add(listener);
        return () => this.statusListeners.delete(listener);
    }

    private setStatus(status: typeof this.status): void {
        this.status = status;
        this.notifyStatusChange();
    }

    private notifyStatusChange(): void {
        this.statusListeners.forEach((listener) => listener());
    }

    stopCompilation(): void {
        if (this.isCompiling()) {
            this.setStatus("ready");
        }
    }

    clearCache(): void {
    }

    private showLoadingNotification(message: string, operationId?: string): void {
        if (this.areNotificationsEnabled()) {
            notificationService.showLoading(message, operationId);
        }
    }

    private showSuccessNotification(message: string, options: { operationId?: string; duration?: number } = {}): void {
        if (this.areNotificationsEnabled()) {
            notificationService.showSuccess(message, options);
        }
    }

    private showErrorNotification(message: string, options: { operationId?: string; duration?: number } = {}): void {
        if (this.areNotificationsEnabled()) {
            notificationService.showError(message, options);
        }
    }

    private areNotificationsEnabled(): boolean {
        const userId = localStorage.getItem("texlyre-current-user");
        const storageKey = userId ? `texlyre-user-${userId}-settings` : "texlyre-settings";
        try {
            const settings = JSON.parse(localStorage.getItem(storageKey) || "{}");
            return settings["typst-notifications"] !== false;
        } catch {
            return true;
        }
    }
}

export const typstService = new TypstService();