// src/services/TypstService.ts
import { nanoid } from "nanoid";
import type { FileNode } from "../types/files";
import { fileStorageService } from "./FileStorageService";
import { notificationService } from "./NotificationService";
import { fileCommentProcessor } from "../utils/fileCommentProcessor";

export interface TypstCompileResult {
    pdf?: Uint8Array;
    status: number;
    log: string;
}

interface TypstInstance {
    pdf(options: { mainContent: string; sources?: Record<string, string | Uint8Array> }): Promise<Uint8Array>;
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

            window.$typst = $typst;
        } catch (error) {
            throw new Error(`Failed to load Typst: ${error}`);
        }
    }

    async compileTypst(mainFileName: string, fileTree: FileNode[]): Promise<TypstCompileResult> {
        if (!window.$typst || !this.isReady()) {
            await this.initialize();
        }

        const operationId = `typst-compile-${nanoid()}`;
        this.setStatus("compiling");

        try {
            this.showLoadingNotification("Preparing files for compilation...", operationId);
            await this.prepareFileNodes(mainFileName, fileTree);

            this.showLoadingNotification("Compiling Typst document...", operationId);
            const { mainContent, sources } = await this.prepareSources(mainFileName);

            const pdf = await window.$typst!.pdf({
                mainContent,
                sources
            });

            if (pdf && pdf.length > 0) {
                this.showLoadingNotification("Saving compilation output...", operationId);
                const result: TypstCompileResult = {
                    pdf,
                    status: 0,
                    log: "Compilation successful"
                };
                await this.saveCompilationOutput(mainFileName.replace(/^\/+/, ""), result);
                this.showSuccessNotification("Typst compilation completed successfully", {
                    operationId,
                    duration: 3000,
                });

                this.setStatus("ready");
                return result;
            } else {
                const result: TypstCompileResult = {
                    pdf: undefined,
                    status: 1,
                    log: "Compilation failed: No PDF output generated"
                };
                await this.saveCompilationLog(mainFileName.replace(/^\/+/, ""), result.log);
                this.showErrorNotification("Typst compilation failed", {
                    operationId,
                    duration: 5000,
                });

                this.setStatus("ready");
                return result;
            }
        } catch (error) {
            this.setStatus("error");
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            this.showErrorNotification(`Compilation error: ${errorMessage}`, {
                operationId,
                duration: 5000,
            });

            const result: TypstCompileResult = {
                pdf: undefined,
                status: 1,
                log: `Compilation error: ${errorMessage}`
            };

            try {
                await this.saveCompilationLog(mainFileName.replace(/^\/+/, ""), result.log);
            } catch (saveError) {
                console.error("Failed to save compilation log:", saveError);
            }

            return result;
        }
    }

    private async prepareFileNodes(mainFileName: string, fileTree: FileNode[]): Promise<void> {
        const allNodes = this.collectAllFiles(fileTree);
        this.processedNodes = this.preprocessNodes(allNodes, mainFileName);
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
        return nodes.filter(node =>
            node.type === "file" &&
            !node.path.startsWith("/.texlyre_") &&
            node.content !== undefined
        );
    }

    private async prepareSources(mainFileName: string): Promise<{
        mainContent: string;
        sources: Record<string, string | Uint8Array>;
    }> {
        const sources: Record<string, string | Uint8Array> = {};
        let mainContent = "";

        for (const node of this.processedNodes) {
            try {
                const fileContent = await this.getFileContent(node);
                if (fileContent) {
                    const cleanedContent = fileCommentProcessor.cleanContent(fileContent);
                    const normalizedPath = node.path.replace(/^\/+/, "");

                    if (normalizedPath === mainFileName.replace(/^\/+/, "")) {
                        if (typeof cleanedContent === "string") {
                            mainContent = cleanedContent;
                        } else {
                            mainContent = new TextDecoder().decode(cleanedContent);
                        }
                    }

                    if (typeof cleanedContent === "string") {
                        sources[normalizedPath] = cleanedContent;
                    } else {
                        sources[normalizedPath] = new Uint8Array(cleanedContent);
                    }
                }
            } catch (error) {
                console.error(`Error preparing source file ${node.path}:`, error);
            }
        }

        return { mainContent, sources };
    }

    private async getFileContent(node: FileNode): Promise<ArrayBuffer | string | null> {
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

    private async saveCompilationOutput(mainFile: string, result: TypstCompileResult): Promise<void> {
        try {
            await this.cleanupDirectory("/.typst_output");
            const outputFiles: FileNode[] = [];

            if (result.pdf && result.pdf.length > 0) {
                const fileName = mainFile.split("/").pop() || mainFile;
                const baseName = fileName.split(".").slice(0, -1).join(".");
                const pdfFileName = `${baseName}.pdf`;

                outputFiles.push({
                    id: nanoid(),
                    name: pdfFileName,
                    path: `/.typst_output/${pdfFileName}`,
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
            }
        } catch (error) {
            console.error("Error saving compilation output:", error);
        }
    }

    private async saveCompilationLog(mainFile: string, log: string): Promise<void> {
        try {
            await this.cleanupDirectory("/.typst_output");
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
            path: `/.typst_output/${logFileName}`,
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
        const requiredDirectories = ["/.typst_output"];

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
        // The high-level API doesn't expose cache clearing
        // This is a no-op for now
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