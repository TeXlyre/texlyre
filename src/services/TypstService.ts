// src/services/TypstService.ts
import { nanoid } from 'nanoid';

import type { TypstCompileResult, TypstOutputFormat } from '../types/typst';
import type { FileNode } from '../types/files';
import { fileStorageService } from './FileStorageService';
import { notificationService } from './NotificationService';
import { fileCommentProcessor } from '../utils/fileCommentProcessor';
import { TypstCompilerEngine } from '../extensions/typst.ts/TypstCompilerEngine';
import { toArrayBuffer } from '../utils/fileUtils';

type CompilationStatus = 'unloaded' | 'loading' | 'ready' | 'compiling' | 'error';

class TypstService {
    private status: CompilationStatus = 'unloaded';
    private statusListeners: Set<() => void> = new Set();
    private defaultFormat: TypstOutputFormat = 'pdf';
    private compilationAbortController: AbortController | null = null;
    private compilerEngine: TypstCompilerEngine = new TypstCompilerEngine();

    async initialize(): Promise<void> {
        if (this.status === 'ready') return;
        if (this.status === 'loading') {
            return this.waitForReady();
        }

        this.setStatus('loading');
        try {
            await this.warmWorker();
            this.setStatus('ready');
        } catch (error) {
            this.setStatus('error');
            throw new Error(`Failed to initialize Typst worker: ${error}`);
        }
    }

    private async waitForReady(): Promise<void> {
        return new Promise((resolve, reject) => {
            const checkStatus = () => {
                if (this.status === 'ready') resolve();
                else if (this.status === 'error') reject(new Error('Typst worker failed to load'));
                else setTimeout(checkStatus, 100);
            };
            checkStatus();
        });
    }

    private async warmWorker(): Promise<void> {
        await this.compilerEngine.ping();
    }

    async compileTypst(
        mainFileName: string,
        fileTree: FileNode[],
        format: TypstOutputFormat = this.defaultFormat
    ): Promise<TypstCompileResult> {
        if (!this.isReady()) {
            await this.initialize();
        }

        const operationId = `typst-compile-${nanoid()}`;
        this.setStatus('compiling');
        this.compilationAbortController = new AbortController();

        const normalizedMainFileName = this.normalizePath(mainFileName);

        try {
            this.showNotification('info', 'Preparing files for compilation...', operationId);

            const { mainContent, sources } = await this.prepareSources(
                normalizedMainFileName,
                fileTree,
                this.compilationAbortController.signal
            );

            if (!mainContent?.trim()) {
                const result: TypstCompileResult = {
                    status: 1,
                    log: `Main file '${normalizedMainFileName}' is empty or not found`,
                    format,
                };
                this.handleCompilationError(operationId, result.log);
                return result;
            }

            this.showNotification('info', `Compiling to ${format.toUpperCase()}...`, operationId);

            const { output, diagnostics } = await this.performCompilationInWorker(
                normalizedMainFileName,
                sources,
                format,
                this.compilationAbortController.signal
            );

            const formattedLog = this.formatDiagnostics(diagnostics);
            const hasErrors = diagnostics?.some((d: any) => d.severity === 'error');

            if (hasErrors) {
                const result: TypstCompileResult = {
                    status: 1,
                    log: formattedLog || 'Compilation failed with errors',
                    format,
                };
                this.handleCompilationError(operationId, 'Compilation failed');
                await this.saveCompilationLog(normalizedMainFileName, result.log);
                return result;
            }

            const result = this.createSuccessResult(output, format, formattedLog);
            await this.saveCompilationOutput(normalizedMainFileName, result);

            this.showNotification('success', `${format.toUpperCase()} compilation completed`, operationId, 3000);

            return result;
        } catch (error) {
            if (error instanceof Error && /cancel/i.test(error.message)) {
                const result: TypstCompileResult = {
                    status: 1,
                    log: 'Compilation was cancelled',
                    format,
                };
                return result;
            }

            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            const result: TypstCompileResult = {
                status: 1,
                log: `Compilation failed: ${errorMessage}`,
                format,
            };

            this.handleCompilationError(operationId, errorMessage);
            await this.saveCompilationLog(normalizedMainFileName, result.log);

            return result;
        } finally {
            this.setStatus('ready');
            this.compilationAbortController = null;
        }
    }

    getSupportedFormats(): TypstOutputFormat[] {
        return ['pdf', 'svg', 'canvas'];
    }

    setDefaultFormat(format: TypstOutputFormat): void {
        this.defaultFormat = format;
    }

    getDefaultFormat(): TypstOutputFormat {
        return this.defaultFormat;
    }

    getStatus(): string {
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

    stopCompilation(): void {
        if (this.compilationAbortController) {
            this.compilationAbortController.abort();
        }
        if (this.isCompiling()) {
            this.setStatus('ready');
        }
    }

    clearCache(): void {
        this.compilerEngine.terminate();
    }

    private async performCompilationInWorker(
        mainFilePath: string,
        sources: Record<string, string | Uint8Array>,
        format: TypstOutputFormat,
        signal: AbortSignal
    ): Promise<{ output: Uint8Array | string; diagnostics?: any[] }> {
        const result = await this.compilerEngine.compile(
            mainFilePath,
            sources,
            format,
            signal
        );

        return { output: result.output, diagnostics: result.diagnostics };
    }

    private createSuccessResult(output: Uint8Array | string, format: TypstOutputFormat, log?: string): TypstCompileResult {
        console.log('[TypstService] createSuccessResult', {
            format,
            outputType: typeof output,
            isUint8Array: output instanceof Uint8Array,
            isString: typeof output === 'string',
            outputLength: output instanceof Uint8Array ? output.length : output.length
        });

        const result: TypstCompileResult = {
            status: 0,
            log: log || 'Compilation successful',
            format,
        };

        switch (format) {
            case 'pdf':
                result.pdf = output as Uint8Array;
                break;
            case 'svg':
                result.svg = output as string;
                break;
            case 'canvas':
                console.log('[TypstService] Creating canvas result, encoding string to Uint8Array');
                result.canvas = new TextEncoder().encode(output as string);
                console.log('[TypstService] Canvas result created', { canvasLength: result.canvas.length });
                break;
        }

        return result;
    }

    private async prepareSources(
        mainFileName: string,
        fileTree: FileNode[],
        signal: AbortSignal
    ): Promise<{ mainContent: string; sources: Record<string, string | Uint8Array> }> {
        const relevantFiles = this.filterRelevantFiles(fileTree, mainFileName);
        const sources: Record<string, string | Uint8Array> = {};
        let mainContent = '';

        for (const fileNode of relevantFiles) {
            if (signal.aborted) throw new Error('Compilation cancelled');

            try {
                const content = await this.getFileContent(fileNode);
                if (!content) continue;

                const cleanedContent = fileCommentProcessor.cleanContent(content);
                const normalizedPath = this.normalizePath(fileNode.path);

                if (this.isMainFile(fileNode, mainFileName)) {
                    mainContent =
                        typeof cleanedContent === 'string'
                            ? cleanedContent
                            : new TextDecoder().decode(cleanedContent);
                }

                if (typeof cleanedContent === 'string') {
                    sources[normalizedPath] = cleanedContent;
                } else {
                    sources[normalizedPath] = new Uint8Array(cleanedContent);
                }
            } catch (error) {
                console.warn(`Failed to process file ${fileNode.path}:`, error);
            }
        }

        if (!mainContent) {
            for (const [path, content] of Object.entries(sources)) {
                if (path.endsWith('.typ') && typeof content === 'string' && content.trim()) {
                    mainContent = content;
                    break;
                }
            }
        }

        return { mainContent, sources };
    }

    private filterRelevantFiles(fileTree: FileNode[], mainFileName: string): FileNode[] {
        const allFiles = this.collectFiles(fileTree);
        const normalizedMainPath = this.normalizePath(mainFileName);
        const mainDir = this.getDirectoryPath(normalizedMainPath);

        return allFiles.filter((file) => {
            if (file.type !== 'file' || file.isDeleted || file.path.startsWith('/.texlyre_')) {
                return false;
            }

            const normalizedPath = this.normalizePath(file.path);

            if (this.isMainFile(file, mainFileName) || normalizedPath.endsWith('.typ')) {
                return true;
            }

            if (normalizedPath.match(/\.(toml|yaml|yml)$/)) {
                return true;
            }

            if (normalizedPath.match(/\.(png|jpg|jpeg|gif|svg|pdf|bib|cls|sty)$/i)) {
                return true;
            }

            const fileDir = this.getDirectoryPath(normalizedPath);
            if (fileDir === mainDir) {
                return true;
            }

            return false;
        });
    }

    private collectFiles(nodes: FileNode[]): FileNode[] {
        const files: FileNode[] = [];
        const traverse = (nodeList: FileNode[]) => {
            for (const node of nodeList) {
                if (node.type === 'file') files.push(node);
                if (node.children) traverse(node.children);
            }
        };
        traverse(nodes);
        return files;
    }

    private async getFileContent(file: FileNode): Promise<ArrayBuffer | string | null> {
        if (file.content !== undefined) {
            return file.content;
        }
        try {
            const storedFile = await fileStorageService.getFile(file.id);
            return storedFile?.content || null;
        } catch (error) {
            console.warn(`Failed to retrieve content for ${file.path}:`, error);
            return null;
        }
    }

    private isMainFile(file: FileNode, mainFileName: string): boolean {
        const normalizedMainPath = this.normalizePath(mainFileName);
        const normalizedFilePath = this.normalizePath(file.path);
        return (
            normalizedFilePath === normalizedMainPath ||
            file.name === mainFileName ||
            file.name === normalizedMainPath.split('/').pop()
        );
    }

    private normalizePath(path: string): string {
        return path.replace(/^\/+/, '');
    }

    private getDirectoryPath(path: string): string {
        const lastSlash = path.lastIndexOf('/');
        return lastSlash >= 0 ? path.substring(0, lastSlash) : '';
    }

    private async saveCompilationOutput(mainFile: string, result: TypstCompileResult): Promise<void> {
        try {
            await this.cleanupOutputDirectory();
            const outputFiles = this.createOutputFiles(mainFile, result);

            if (outputFiles.length > 0) {
                await this.ensureOutputDirectories();
                await fileStorageService.batchStoreFiles(outputFiles, {
                    showConflictDialog: false,
                });
            }
        } catch (error) {
            console.error('Failed to save compilation output:', error);
        }
    }

    private createOutputFiles(mainFile: string, result: TypstCompileResult): FileNode[] {
        const files: FileNode[] = [];
        const baseName = this.getBaseName(mainFile);

        if (result.pdf && result.format === 'pdf') {
            const buffer = result.pdf instanceof Uint8Array ? result.pdf.buffer : result.pdf;
            files.push(this.createFileNode(`${baseName}.pdf`, buffer, 'application/pdf', true));
        } else if ((result.svg || result.canvas) && (result.format === 'svg' || result.format === 'canvas')) {
            const content = result.format === 'svg' ? result.svg : new TextDecoder().decode(result.canvas!);
            const buffer = new TextEncoder().encode(content).buffer;
            files.push(this.createFileNode(`${baseName}.svg`, buffer, 'image/svg+xml', false));
        }

        files.push(this.createLogFile(baseName, result.log));

        return files;
    }

    private createFileNode(name: string, content: ArrayBuffer | ArrayBufferLike, mimeType: string, isBinary: boolean): FileNode {
        const buffer = content instanceof ArrayBuffer ? content : toArrayBuffer(content) as ArrayBuffer;
        return {
            id: nanoid(),
            name,
            path: `/.texlyre_src/__output/${name}`,
            type: 'file',
            content: buffer,
            lastModified: Date.now(),
            size: buffer.byteLength,
            mimeType,
            isBinary,
            excludeFromSync: true,
        };
    }

    private createLogFile(baseName: string, log: string): FileNode {
        const logContent = new TextEncoder().encode(log).buffer;
        return this.createFileNode(`${baseName}.log`, logContent, 'text/plain', false);
    }

    private async saveCompilationLog(mainFile: string, log: string): Promise<void> {
        try {
            await this.cleanupOutputDirectory();
            await this.ensureOutputDirectories();
            const logFile = this.createLogFile(this.getBaseName(mainFile), log);
            await fileStorageService.batchStoreFiles([logFile], {
                showConflictDialog: false,
            });
        } catch (error) {
            console.error('Failed to save compilation log:', error);
        }
    }

    private async cleanupOutputDirectory(): Promise<void> {
        try {
            const existingFiles = await fileStorageService.getAllFiles();
            const outputFiles = existingFiles.filter(
                (file) => file.path.startsWith('/.texlyre_src/__output/') && !file.isDeleted
            );

            if (outputFiles.length > 0) {
                const fileIds = outputFiles.map((file) => file.id);
                await fileStorageService.batchDeleteFiles(fileIds, {
                    showDeleteDialog: false,
                    hardDelete: true,
                });
            }
        } catch (error) {
            console.error('Failed to cleanup output directory:', error);
        }
    }

    private async ensureOutputDirectories(): Promise<void> {
        const directories = ['/.texlyre_src', '/.texlyre_src/__output'];
        const existingFiles = await fileStorageService.getAllFiles();
        const existingPaths = new Set(existingFiles.map((file) => file.path));

        const directoriesToCreate = directories
            .filter((dir) => !existingPaths.has(dir))
            .map((dir) => ({
                id: nanoid(),
                name: dir.split('/').pop()!,
                path: dir,
                type: 'directory' as const,
                lastModified: Date.now(),
            }));

        if (directoriesToCreate.length > 0) {
            await fileStorageService.batchStoreFiles(directoriesToCreate, {
                showConflictDialog: false,
            });
        }
    }

    private getBaseName(filePath: string): string {
        const fileName = filePath.split('/').pop() || filePath;
        return fileName.includes('.') ? fileName.split('.').slice(0, -1).join('.') : fileName;
    }

    private handleCompilationError(operationId: string, message: string): void {
        this.setStatus('ready');
        this.showNotification('error', `Compilation failed: ${message}`, operationId, 5000);
    }

    private showNotification(
        type: 'info' | 'success' | 'error',
        message: string,
        operationId?: string,
        duration?: number
    ): void {
        if (!this.areNotificationsEnabled()) return;

        switch (type) {
            case 'info':
                notificationService.showLoading(message, operationId);
                break;
            case 'success':
                notificationService.showSuccess(message, { operationId, duration });
                break;
            case 'error':
                notificationService.showError(message, { operationId, duration });
                break;
        }
    }

    private formatDiagnostics(diagnostics?: any[]): string {
        if (!diagnostics || diagnostics.length === 0) {
            return 'Compilation successful';
        }

        const lines: string[] = [];

        for (const diag of diagnostics) {
            const severity = diag.severity || 'error';
            const message = diag.message || 'Unknown error';
            const path = diag.path || '';
            const range = diag.range || '';

            let location = '';
            if (path) {
                location = path.replace(/^\//, '');
                if (range) {
                    const startPos = range.split('-')[0];
                    location += `:${startPos}`;
                }
            }

            const prefix = severity === 'error' ? 'error' : severity === 'warning' ? 'warning' : 'info';
            lines.push(location ? `${prefix}[${location}]: ${message}` : `${prefix}: ${message}`);

            if (diag.hints && Array.isArray(diag.hints) && diag.hints.length > 0) {
                for (const hint of diag.hints) {
                    lines.push(`  hint: ${hint}`);
                }
            }
        }

        return lines.join('\n');
    }

    private areNotificationsEnabled(): boolean {
        try {
            const userId = localStorage.getItem('texlyre-current-user');
            const storageKey = userId ? `texlyre-user-${userId}-settings` : 'texlyre-settings';
            const settings = JSON.parse(localStorage.getItem(storageKey) || '{}');
            return settings['typst-notifications'] !== false;
        } catch {
            return true;
        }
    }

    private setStatus(status: CompilationStatus): void {
        this.status = status;
        this.statusListeners.forEach((listener) => listener());
    }
}

export const typstService = new TypstService();