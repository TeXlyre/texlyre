// src/extensions/swiftlatex/SwiftLaTeXService.ts
import { nanoid } from 'nanoid';

import { BaseEngine, type CompileResult } from './BaseEngine';
import { DvipdfmxEngine } from './DvipdfmxEngine';
import { PdfTeXEngine } from './PdfTeXEngine';
import { XeTeXEngine } from './XeTeXEngine';
import type { FileNode } from '../../types/files';
import { fileStorageService } from '../../services/FileStorageService';
import { cleanContent } from '../../utils/fileCommentUtils';
import { getMimeType, isBinaryFile, isTemporaryFile, toArrayBuffer } from '../../utils/fileUtils';

export type SwiftEngineType = 'pdftex' | 'xetex' | 'luatex';
type InternalEngineKey = SwiftEngineType | 'dvipdfmx';

export interface SwiftExportOptions {
    engine?: SwiftEngineType;
    format?: 'pdf' | 'dvi';
    includeLog?: boolean;
    includeDvi?: boolean;
    includeBbl?: boolean;
    includeWorkDir?: boolean;
}

export interface SwiftExportArtifact {
    content: Uint8Array;
    name: string;
    mimeType: string;
}

export interface SwiftExportResult {
    status: number;
    log: string;
    files: SwiftExportArtifact[];
}

class SwiftLaTeXService {
    private engines: Map<InternalEngineKey, BaseEngine> = new Map();
    private currentEngineType: SwiftEngineType = 'pdftex';
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

    setTexliveEndpoint(endpoint: string): void { this.texliveEndpoint = endpoint; }
    setStoreCache(store: boolean): void { this.storeCache = store; }
    setStoreWorkingDirectory(store: boolean): void { this.storeWorkingDirectory = store; }
    setFlattenMainDirectory(flatten: boolean): void { this.flattenMainDirectory = flatten; }

    getCurrentEngineType(): SwiftEngineType {
        return this.currentEngineType;
    }

    getCurrentEngine(): BaseEngine | null {
        return this.engines.get(this.currentEngineType) ?? null;
    }

    getStoreWorkingDirectory(): boolean {
        return this.storeWorkingDirectory;
    }

    getStatus(): string {
        try { return this.getCurrentEngine()?.getStatus() ?? 'unloaded'; } catch { return 'unloaded'; }
    }

    isReady(): boolean {
        try { return this.getCurrentEngine()?.isReady() ?? false; } catch { return false; }
    }

    isCompiling(): boolean {
        try { return this.getCurrentEngine()?.isCompiling() ?? false; } catch { return false; }
    }

    addStatusListener(listener: () => void): () => void {
        const unsubs = Array.from(this.engines.values()).map((e) => e.addStatusListener(listener));
        return () => unsubs.forEach((u) => u());
    }

    async initialize(engineType: SwiftEngineType = 'pdftex'): Promise<void> {
        this.currentEngineType = engineType;
        const engine = this.engines.get(engineType);
        if (!engine) throw new Error(`Unsupported engine type: ${engineType}`);
        await engine.initialize();
        engine.setTexliveEndpoint(this.texliveEndpoint);
    }

    async setEngine(engineType: SwiftEngineType): Promise<void> {
        if (this.currentEngineType === engineType) return;
        this.currentEngineType = engineType;
        await this.initialize(engineType);
    }

    async reinitialize(): Promise<void> {
        await this.getCurrentEngine()?.reinitialize();
    }

    stopCompilation(): void {
        try { this.getCurrentEngine()?.stopCompilation(); } catch (err) {
            console.warn('Error stopping compilation:', err);
        }
    }

    async compile(mainFileName: string, fileTree: FileNode[]): Promise<CompileResult> {
        const engine = this.getCurrentEngine();
        if (!engine) throw new Error('No SwiftLaTeX engine available');

        if (!engine.isReady()) await engine.initialize();
        engine.setTexliveEndpoint(this.texliveEndpoint);

        await this.prepareFileNodes(mainFileName, fileTree);
        await this.writeNodesToMemFS(engine, mainFileName);

        let result = await engine.compile(mainFileName, this.processedNodes);

        if (result.status === 0 && !result.pdf && (result as any).xdv) {
            result = await this.processDviToPdf((result as any).xdv, mainFileName, result.log);
        }

        if (result.status === 0 && result.pdf && result.pdf.length > 0) {
            await this.saveCompilationOutput(mainFileName.replace(/^\/+/, ''), result);
            await this.storeOutputDirectories(engine);
        } else {
            await this.saveCompilationLog(mainFileName.replace(/^\/+/, ''), result.log);
        }

        return result;
    }

    async export(
        mainFileName: string,
        fileTree: FileNode[],
        options: SwiftExportOptions,
    ): Promise<SwiftExportResult> {
        const {
            engine: exportEngine,
            format = 'pdf',
            includeLog = false,
            includeDvi = false,
            includeBbl = false,
            includeWorkDir = false,
        } = options;

        const originalEngine = this.currentEngineType;
        const targetEngine = exportEngine ?? this.currentEngineType;
        const originalStoreWorking = this.storeWorkingDirectory;
        const needsWorkDir = includeBbl || includeWorkDir;

        if (needsWorkDir) this.storeWorkingDirectory = true;
        if (targetEngine !== this.currentEngineType) await this.setEngine(targetEngine);

        const engine = this.getCurrentEngine();
        if (!engine) throw new Error('No SwiftLaTeX engine for export');
        if (!engine.isReady()) await engine.initialize();
        engine.setTexliveEndpoint(this.texliveEndpoint);

        try {
            await this.prepareFileNodes(mainFileName, fileTree);
            await this.writeNodesToMemFS(engine, mainFileName);

            let result = await engine.compile(mainFileName, this.processedNodes);
            let xdvData: Uint8Array | undefined;

            if (result.status === 0 && !result.pdf && (result as any).xdv) {
                xdvData = (result as any).xdv;
                result = await this.processDviToPdf(xdvData!, mainFileName, result.log);
            }

            const files: SwiftExportArtifact[] = [];
            if (result.status === 0) {
                const baseName = this.getBaseName(mainFileName);

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

                if (needsWorkDir) {
                    await this.storeOutputDirectories(engine);
                    if (includeBbl) {
                        const bbl = await this.extractBblFile(mainFileName);
                        if (bbl) files.push(bbl);
                    }
                    if (includeWorkDir) {
                        const workArtifacts = await this.collectStoredWorkFiles();
                        files.push(...workArtifacts);
                    }
                }
            }

            engine.flushCache();
            return { status: result.status, log: result.log, files };
        } finally {
            this.storeWorkingDirectory = originalStoreWorking;
            if (needsWorkDir && !originalStoreWorking) {
                await this.cleanupStoredWorkDirectory();
            }
            if (targetEngine !== originalEngine) await this.setEngine(originalEngine);
        }
    }

    async clearCache(): Promise<void> {
        const existing = await fileStorageService.getAllFiles(true, false, false);
        const cacheFiles = existing.filter((f) => isTemporaryFile(f.path) && !f.isDeleted);
        if (cacheFiles.length > 0) {
            await fileStorageService.batchDeleteFiles(cacheFiles.map((f) => f.id), {
                showDeleteDialog: false, hardDelete: true,
            });
        }
        try { this.getCurrentEngine()?.flushCache(); } catch { }
    }

    private getCacheDirectory(engineType: InternalEngineKey): string {
        return engineType === 'dvipdfmx' ? '/.texlyre_cache/__dvi' : '/.texlyre_cache/__tex';
    }

    private async processDviToPdf(
        xdvData: Uint8Array, mainFileName: string, originalLog: string,
    ): Promise<CompileResult> {
        const dvipdfmxEngine = this.engines.get('dvipdfmx');
        if (!dvipdfmxEngine) throw new Error('DvipdfmxEngine not available');

        if (!dvipdfmxEngine.isReady()) await dvipdfmxEngine.initialize();
        dvipdfmxEngine.setTexliveEndpoint(this.texliveEndpoint);

        const originalEngineType = this.currentEngineType;
        (this as any).currentEngineType = 'dvipdfmx';

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
            if (result.status === 0 && this.storeCache) await this.storeCacheDirectory(dvipdfmxEngine);

            return {
                pdf: result.pdf,
                status: result.status,
                log: result.status === 0
                    ? originalLog
                    : `${originalLog}\n\nDvipdfmx conversion error:\n${result.log}`,
            };
        } catch (error: any) {
            return { pdf: undefined, status: -1, log: `${originalLog}\n\nDvipdfmx conversion failed: ${error.message}` };
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
            const existing = await fileStorageService.getAllFiles(true, false, false);
            const cacheDir = this.getCacheDirectory(this.currentEngineType);
            const cached = existing.filter(
                (f) => f.path.startsWith(`${cacheDir}/`) && f.type === 'file' && !f.isDeleted,
            );
            for (const cachedFile of cached) {
                if (await this.isCacheEntryValid(cachedFile)) {
                    if (!nodes.some((n) => n.path === cachedFile.path)) nodes.push(cachedFile);
                }
            }
        } catch (error) {
            console.error('Error loading cached files:', error);
        }
    }

    private async isCacheEntryValid(cachedFile: FileNode): Promise<boolean> {
        const maxAge = 24 * 60 * 60 * 1000;
        const now = Date.now();
        if (!cachedFile.lastModified || now - cachedFile.lastModified > maxAge) return false;
        const latest = Math.max(...Array.from(this.sourceFileTimestamps.values()));
        return cachedFile.lastModified >= latest;
    }

    private preprocessNodes(nodes: FileNode[], mainFileName: string): FileNode[] {
        const processed: FileNode[] = [];
        let mainFileProcessed = false;
        let mainFileDirectory: string | null = null;

        if (this.flattenMainDirectory) {
            const normalized = mainFileName.replace(/^\/+/, '');
            const lastSlash = normalized.lastIndexOf('/');
            if (lastSlash !== -1) mainFileDirectory = normalized.substring(0, lastSlash);
        }

        for (const node of nodes) {
            if (node.type !== 'file' || isTemporaryFile(node.path)) continue;
            const p = { ...node };

            if (node.path === mainFileName) {
                if (!mainFileName.startsWith('/') || mainFileName === `/${node.name}`) {
                    p.path = node.name;
                } else {
                    p.path = `_${node.name}`;
                    p.name = `_${node.name}`;
                }
                mainFileProcessed = true;
            } else {
                const normalizedPath = node.path.replace(/^\/+/, '');
                if (isTemporaryFile(normalizedPath)) {
                    p.path = normalizedPath;
                } else if (this.flattenMainDirectory && mainFileDirectory) {
                    const dirSlash = `${mainFileDirectory}/`;
                    p.path = normalizedPath.startsWith(dirSlash)
                        ? normalizedPath.substring(dirSlash.length)
                        : normalizedPath;
                } else {
                    p.path = normalizedPath;
                }
            }
            processed.push(p);
        }

        if (!mainFileProcessed) console.warn(`Main file ${mainFileName} not found in file tree`);
        return processed;
    }

    private async writeNodesToMemFS(
        engine: BaseEngine, mainFileName: string, engineType?: InternalEngineKey,
    ): Promise<void> {
        const currentType = (engineType || this.currentEngineType) as InternalEngineKey;
        const cacheDir = this.getCacheDirectory(currentType);
        const cacheNodes = this.processedNodes.filter((n) => n.path.startsWith(`${cacheDir.substring(1)}/`));
        const workNodes = this.processedNodes.filter((n) => !isTemporaryFile(n.path));

        const workDirs = new Set<string>();
        const texDirs = new Set<string>();

        for (const n of workNodes) {
            const d = n.path.substring(0, n.path.lastIndexOf('/'));
            if (d) workDirs.add(d);
        }
        for (const n of cacheNodes) {
            const clean = n.path.replace(`${cacheDir.substring(1)}/`, '');
            const d = clean.substring(0, clean.lastIndexOf('/'));
            if (d) texDirs.add(d);
        }

        for (const d of workDirs) this.createDirectoryStructure(engine, `/work/${d}`);
        for (const d of texDirs) this.createDirectoryStructure(engine, `/work/${d}`);

        for (const node of workNodes) {
            try {
                const content = await this.getFileContent(node);
                if (content) {
                    const cleaned = cleanContent(content);
                    engine.writeMemFSFile(
                        `/work/${node.path}`,
                        typeof cleaned === 'string' ? cleaned : new Uint8Array(cleaned as ArrayBuffer),
                    );
                }
            } catch (error) {
                console.error(`Error writing work file ${node.path}:`, error);
            }
        }

        for (const node of cacheNodes) {
            try {
                const content = await this.getFileContent(node);
                if (content) {
                    const cleanPath = node.path.replace(`${cacheDir.substring(1)}/`, '');
                    engine.writeMemFSFile(
                        `/work/${cleanPath}`,
                        typeof content === 'string' ? content : new Uint8Array(content as ArrayBuffer),
                    );
                }
            } catch (error) {
                console.error(`Error writing cache file ${node.path}:`, error);
            }
        }

        const normalizedMain = mainFileName.replace(/^\/+/, '');
        const mainFileNode = workNodes.find(
            (n) => n.path === normalizedMain || n.path.endsWith(normalizedMain.split('/').pop() || ''),
        );
        engine.setEngineMainFile(mainFileNode ? mainFileNode.path : normalizedMain);
    }

    private async storeOutputDirectories(engine: BaseEngine): Promise<void> {
        if (this.storeCache) await this.storeCacheDirectory(engine);
        if (this.storeWorkingDirectory) {
            await fileStorageService.cleanupDirectory('/.texlyre_src/__work');
            await this.storeWorkDirectory(engine);
        }
    }

    private async storeCacheDirectory(engine: BaseEngine): Promise<void> {
        try {
            const texFiles = await engine.dumpDirectory('/tex');
            await this.batchStoreDirectoryContents(texFiles, this.getCacheDirectory(this.currentEngineType));
        } catch (error) {
            console.error('Error saving cache directory:', error);
        }
    }

    private async storeWorkDirectory(engine: BaseEngine): Promise<void> {
        try {
            const workFiles = await engine.dumpDirectory('/work');
            const filtered = await this.filterWorkFilesExcludingCache(workFiles);
            await this.batchStoreDirectoryContents(filtered, '/.texlyre_src/__work');
        } catch (error) {
            console.error('Error saving work directory:', error);
        }
    }

    private async filterWorkFilesExcludingCache(
        workFiles: { [key: string]: ArrayBuffer },
    ): Promise<{ [key: string]: ArrayBuffer }> {
        const filtered: { [key: string]: ArrayBuffer } = {};
        try {
            const existing = await fileStorageService.getAllFiles(true, false, false);
            const cacheDir = this.getCacheDirectory(this.currentEngineType);
            const cachePaths = new Set(
                existing
                    .filter((f) => f.path.startsWith(`${cacheDir}/`) && f.type === 'file' && !f.isDeleted)
                    .map((f) => f.path.replace(cacheDir, '')),
            );
            for (const [p, c] of Object.entries(workFiles)) {
                const normalized = p.replace(/^\/work/, '');
                if (!cachePaths.has(normalized)) filtered[p] = c;
            }
        } catch (error) {
            console.error('Error filtering work files:', error);
            return workFiles;
        }
        return filtered;
    }

    private async batchStoreDirectoryContents(
        files: { [key: string]: ArrayBuffer }, baseDir: string,
    ): Promise<void> {
        if (Object.keys(files).length === 0) return;

        const toStore: FileNode[] = [];
        const dirs = new Set<string>();

        for (const [originalPath, content] of Object.entries(files)) {
            const storagePath = originalPath.replace(/^\/(tex|work)/, baseDir);
            const dirPath = storagePath.substring(0, storagePath.lastIndexOf('/'));
            const fileName = storagePath.split('/').pop()!;
            if (dirPath !== baseDir && dirPath) dirs.add(dirPath);

            const existing = await fileStorageService.getFileByPath(storagePath, true);
            toStore.push({
                id: existing?.id || nanoid(),
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

        await this.batchCreateDirectories(Array.from(dirs));
        if (toStore.length > 0) {
            await fileStorageService.batchStoreFiles(toStore, {
                showConflictDialog: false, preserveTimestamp: true,
            });
        }
    }

    private async batchCreateDirectories(paths: string[]): Promise<void> {
        const toCreate: FileNode[] = [];
        const existing = await fileStorageService.getAllFiles(true, false, false);
        const existingPaths = new Set(existing.map((f) => f.path));

        const all = new Set<string>();
        for (const fullPath of paths) {
            const parts = fullPath.split('/').filter((p) => p);
            let current = '';
            for (const part of parts) {
                current = current ? `${current}/${part}` : `/${part}`;
                all.add(current);
            }
        }

        for (const d of all) {
            if (!existingPaths.has(d)) {
                toCreate.push({
                    id: nanoid(),
                    name: d.split('/').pop()!,
                    path: d,
                    type: 'directory',
                    lastModified: Date.now(),
                });
            }
        }

        if (toCreate.length > 0) {
            await fileStorageService.batchStoreFiles(toCreate, { showConflictDialog: false });
        }
    }

    private async saveCompilationOutput(mainFile: string, result: CompileResult): Promise<void> {
        try {
            const outputs: FileNode[] = [];

            if (result.pdf && result.pdf.length > 0) {
                const fileName = mainFile.split('/').pop() || mainFile;
                const baseName = fileName.split('.').slice(0, -1).join('.');
                const pdfName = `${baseName}.pdf`;
                outputs.push({
                    id: nanoid(),
                    name: pdfName,
                    path: `/.texlyre_src/__output/${pdfName}`,
                    type: 'file',
                    content: toArrayBuffer(result.pdf.buffer),
                    lastModified: Date.now(),
                    size: result.pdf.length,
                    mimeType: 'application/pdf',
                    isBinary: true,
                    excludeFromSync: true,
                });
            }

            outputs.push(await this.createCompilationLogFile(mainFile, result.log));
            await this.ensureOutputDirectoriesExist();
            if (outputs.length > 0) {
                await fileStorageService.batchStoreFiles(outputs, { showConflictDialog: false });
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

    async cleanupStoredWorkDirectory(): Promise<void> {
        await fileStorageService.cleanupDirectory('/.texlyre_src/__work');
    }

    private async createCompilationLogFile(mainFile: string, log: string): Promise<FileNode> {
        const fileName = mainFile.split('/').pop() || mainFile;
        const baseName = fileName.split('.').slice(0, -1).join('.');
        const encoded = new TextEncoder().encode(log);
        return {
            id: nanoid(),
            name: `${baseName}.log`,
            path: `/.texlyre_src/__output/${baseName}.log`,
            type: 'file',
            content: encoded.buffer,
            lastModified: Date.now(),
            size: encoded.length,
            mimeType: 'text/plain',
            isBinary: false,
            excludeFromSync: true,
        };
    }

    private async ensureOutputDirectoriesExist(): Promise<void> {
        const required = [
            '/.texlyre_src', '/.texlyre_src/__output', '/.texlyre_src/__work',
            '/.texlyre_cache', '/.texlyre_cache/__tex', '/.texlyre_cache/__dvi',
        ];
        const toCreate: FileNode[] = [];
        const existing = await fileStorageService.getAllFiles(true, false, false);
        const existingPaths = new Set(existing.map((f) => f.path));
        for (const d of required) {
            if (!existingPaths.has(d)) {
                toCreate.push({
                    id: nanoid(), name: d.split('/').pop()!, path: d, type: 'directory', lastModified: Date.now(),
                });
            }
        }
        if (toCreate.length > 0) {
            await fileStorageService.batchStoreFiles(toCreate, { showConflictDialog: false });
        }
    }

    private collectAllFiles(nodes: FileNode[]): FileNode[] {
        const result: FileNode[] = [];
        for (const n of nodes) {
            if (n.type === 'file') result.push(n);
            if (n.children?.length) result.push(...this.collectAllFiles(n.children));
        }
        return result;
    }

    private async getFileContent(node: FileNode): Promise<ArrayBuffer | string | null> {
        if (node.content !== undefined) return node.content;
        try {
            const raw = await fileStorageService.getFile(node.id);
            if (raw?.content) return raw.content;
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

            let current = '';
            for (const part of parts) {
                current = current ? `${current}/${part}` : part;
                try { engine.makeMemFSFolder(current); } catch { }
            }
        } catch (error: any) {
            console.warn(`Error in directory creation: ${error.message}`);
        }
    }

    private getBaseName(filePath: string): string {
        const name = filePath.split('/').pop() || filePath;
        return name.includes('.') ? name.split('.').slice(0, -1).join('.') : name;
    }

    async extractBblFile(mainFileName: string): Promise<SwiftExportArtifact | null> {
        const baseName = this.getBaseName(mainFileName);
        const workDir = '/.texlyre_src/__work';
        for (const p of [`${workDir}/${baseName}.bbl`, `${workDir}/_${baseName}.bbl`]) {
            try {
                const file = await fileStorageService.getFileByPath(p, true);
                if (file?.content) {
                    const content = typeof file.content === 'string'
                        ? new TextEncoder().encode(file.content)
                        : new Uint8Array(file.content as ArrayBuffer);
                    return { content, name: p.split('/').pop() || `${baseName}.bbl`, mimeType: 'text/plain' };
                }
            } catch { continue; }
        }

        try {
            const bblFiles = await fileStorageService.getFilesByPath(
                `${workDir}/`, true, { fileExtension: '.bbl', excludeDirectories: true },
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

    async collectStoredWorkFiles(): Promise<SwiftExportArtifact[]> {
        const workDir = '/.texlyre_src/__work';
        const artifacts: SwiftExportArtifact[] = [];
        try {
            const files = await fileStorageService.getFilesByPath(
                `${workDir}/`, true, { excludeDirectories: true },
            );
            for (const file of files) {
                if (!file.content || file.isDeleted) continue;
                const content = typeof file.content === 'string'
                    ? new TextEncoder().encode(file.content)
                    : new Uint8Array(file.content as ArrayBuffer);
                const relativePath = file.path.substring(workDir.length + 1);
                artifacts.push({
                    content,
                    name: `work/${relativePath}`,
                    mimeType: file.mimeType || 'application/octet-stream',
                });
            }
        } catch (error) {
            console.error('Error collecting stored work files:', error);
        }
        return artifacts;
    }
}

export const swiftLaTeXService = new SwiftLaTeXService();