// src/extensions/texlyre-busytex/BusyTeXService.ts
import { nanoid } from 'nanoid';
import { isPackageCached, deletePackageCache } from 'texlyre-busytex';

import { busyTeXEngine, BUSYTEX_CACHE_DIR, MISSES_KEY } from './BusyTeXEngine';
import type { BusyTeXEngineType, BusyTeXCompileResult } from './BusyTeXEngine';
import type { CompileResult } from '../switftlatex/BaseEngine';
import type { FileNode } from '../../types/files';
import { getMimeType, isBinaryFile, toArrayBuffer } from '../../utils/fileUtils';
import { fileStorageService } from '../../services/FileStorageService';
import { latexSourceMapService } from '../../services/LaTeXSourceMapService';

export const BUSYTEX_BUNDLE_URLS: Record<string, string> = {
    basic: `${__BASE_PATH__}/core/busytex/texlive-basic.js`,
    recommended: `${__BASE_PATH__}/core/busytex/texlive-recommended.js`,
    extra: `${__BASE_PATH__}/core/busytex/texlive-extra.js`,
};

export const BUSYTEX_BUNDLE_LABELS: Record<string, string> = {
    basic: 'TeX Live Basic (~90 MB)',
    recommended: 'TeX Live Recommended (~200 MB)',
    extra: 'TeX Live Extra (~340 MB)',
};

class BusyTeXService {
    private storeWorkingDirectory = false;
    private texliveEndpoint = '';
    private selectedBundles: string[] = ['recommended'];

    setTexliveEndpoint(endpoint: string): void {
        this.texliveEndpoint = endpoint;
        busyTeXEngine.setTexliveEndpoint(endpoint);
    }

    setStoreWorkingDirectory(store: boolean): void {
        this.storeWorkingDirectory = store;
    }

    setSelectedBundles(bundles: string[]): void {
        this.selectedBundles = bundles;
        const urls = bundles.map((b) => BUSYTEX_BUNDLE_URLS[b]).filter(Boolean);
        busyTeXEngine.setSelectedBundles(urls);
    }

    setUseWorker(useWorker: boolean): void {
        busyTeXEngine.setUseWorker(useWorker);
    }

    getStatus(): string {
        return busyTeXEngine.getStatus();
    }

    isReady(): boolean {
        return busyTeXEngine.isReady();
    }

    isCompiling(): boolean {
        return busyTeXEngine.isCompiling();
    }

    addStatusListener(listener: () => void): () => void {
        return busyTeXEngine.addStatusListener(listener);
    }

    async initialize(engineType: BusyTeXEngineType = 'busytex-xetex'): Promise<void> {
        const urls = this.selectedBundles.map((b) => BUSYTEX_BUNDLE_URLS[b]).filter(Boolean);
        busyTeXEngine.setSelectedBundles(urls);
        busyTeXEngine.setTexliveEndpoint(this.texliveEndpoint);
        await busyTeXEngine.initialize(engineType);
    }

    async setEngine(engineType: BusyTeXEngineType): Promise<void> {
        await busyTeXEngine.setEngine(engineType);
    }

    async compile(
        mainFileName: string,
        fileNodes: FileNode[],
    ): Promise<CompileResult & { synctex?: Uint8Array }> {
        if (!busyTeXEngine.isReady()) {
            await this.initialize(busyTeXEngine.getCurrentEngineType());
        }

        const cachedMisses = await this.loadCachedMisses();

        const result = await busyTeXEngine.compile(mainFileName, fileNodes, {
            bibtex: true,
            makeindex: true,
            rerun: true,
            remoteEndpoint: this.texliveEndpoint || undefined,
            cachedMisses,
        });

        await this.persistMisses();

        if (result.status === 0 && result.pdf) {
            await this.saveCompilationOutput(mainFileName, result);

            if (result.synctex) {
                latexSourceMapService.loadFromBytes(result.synctex);
            } else {
                latexSourceMapService.clear();
            }

            if (this.storeWorkingDirectory) {
                await this.storeWorkFiles(mainFileName);
            }
        } else {
            await this.saveCompilationLog(mainFileName, result.log);
            latexSourceMapService.clear();
        }

        return result;
    }

    stopCompilation(): void {
        busyTeXEngine.stopCompilation();
    }

    terminate(): void {
        busyTeXEngine.terminate();
    }

    async isBundleCached(bundleId: string): Promise<boolean> {
        const url = BUSYTEX_BUNDLE_URLS[bundleId];
        if (!url) return false;
        return isPackageCached(url);
    }

    async deleteBundle(bundleId: string): Promise<void> {
        const url = BUSYTEX_BUNDLE_URLS[bundleId];
        if (!url) return;
        await deletePackageCache(url);
        busyTeXEngine.terminate();
    }

    private async loadCachedMisses(): Promise<string[]> {
        try {
            const file = await fileStorageService.getFileByPath(MISSES_KEY, true);
            if (!file?.content) return [];
            const text = typeof file.content === 'string'
                ? file.content
                : new TextDecoder().decode(new Uint8Array(file.content as ArrayBuffer));
            return JSON.parse(text);
        } catch {
            return [];
        }
    }

    private async persistMisses(): Promise<void> {
        try {
            const misses = await busyTeXEngine.readMisses();
            const content = JSON.stringify(misses);
            const encoded = new TextEncoder().encode(content);
            await fileStorageService.batchStoreFiles([{
                id: nanoid(),
                name: '.misses.json',
                path: MISSES_KEY,
                type: 'file',
                content: encoded.buffer,
                lastModified: Date.now(),
                size: encoded.length,
                mimeType: 'application/json',
                isBinary: false,
                excludeFromSync: true,
                isDeleted: false,
            }], { showConflictDialog: false });
        } catch (error) {
            console.warn('[BusyTeXService] Failed to persist misses cache:', error);
        }
    }

    private async storeWorkFiles(mainFileName: string): Promise<void> {
        try {
            const workFiles = await busyTeXEngine.readWorkFiles();
            const filesToStore: FileNode[] = [];
            const dirsToCreate = new Set<string>();

            for (const [path, buffer] of Object.entries(workFiles)) {
                const storagePath = `/.texlyre_src/__work${path.startsWith('/') ? path : `/${path}`}`;
                const dirPath = storagePath.substring(0, storagePath.lastIndexOf('/'));
                if (dirPath) dirsToCreate.add(dirPath);

                const existing = await fileStorageService.getFileByPath(storagePath, true);
                const fileName = storagePath.split('/').pop()!;

                filesToStore.push({
                    id: existing?.id || nanoid(),
                    name: fileName,
                    path: storagePath,
                    type: 'file',
                    content: buffer,
                    lastModified: Date.now(),
                    size: buffer.byteLength,
                    mimeType: getMimeType(fileName),
                    isBinary: isBinaryFile(fileName),
                    excludeFromSync: true,
                    isDeleted: false,
                });
            }

            await this.ensureDirectoriesExist(Array.from(dirsToCreate));

            if (filesToStore.length > 0) {
                await fileStorageService.batchStoreFiles(filesToStore, {
                    showConflictDialog: false,
                    preserveTimestamp: true,
                });
            }
        } catch (error) {
            console.error('[BusyTeXService] Failed to store work files:', error);
        }
    }

    private async saveCompilationOutput(mainFile: string, result: BusyTeXCompileResult): Promise<void> {
        try {
            const outputFiles: FileNode[] = [];
            const baseName = this.getBaseName(mainFile);

            if (result.pdf && result.pdf.length > 0) {
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
                    isDeleted: false,
                });
            }

            outputFiles.push(this.createLogFileNode(baseName, result.log));

            await this.ensureOutputDirsExist();
            await fileStorageService.batchStoreFiles(outputFiles, { showConflictDialog: false });
        } catch (error) {
            console.error('[BusyTeXService] Failed to save output:', error);
        }
    }

    private async saveCompilationLog(mainFile: string, log: string): Promise<void> {
        try {
            await this.ensureOutputDirsExist();
            const baseName = this.getBaseName(mainFile);
            await fileStorageService.batchStoreFiles(
                [this.createLogFileNode(baseName, log)],
                { showConflictDialog: false }
            );
        } catch (error) {
            console.error('[BusyTeXService] Failed to save log:', error);
        }
    }

    private createLogFileNode(baseName: string, log: string): FileNode {
        const encoder = new TextEncoder();
        const encoded = encoder.encode(log);
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
            isDeleted: false,
        };
    }

    private getBaseName(filePath: string): string {
        const name = filePath.split('/').pop() || filePath;
        return name.includes('.') ? name.split('.').slice(0, -1).join('.') : name;
    }

    private async ensureOutputDirsExist(): Promise<void> {
        const dirs = [
            '/.texlyre_src',
            '/.texlyre_src/__output',
            '/.texlyre_src/__work',
            BUSYTEX_CACHE_DIR.split('/').slice(0, -1).join('/'),
            BUSYTEX_CACHE_DIR,
        ];
        await this.ensureDirectoriesExist(dirs);
    }

    private async ensureDirectoriesExist(paths: string[]): Promise<void> {
        const existing = await fileStorageService.getAllFiles();
        const existingPaths = new Set(existing.map((f) => f.path));

        const allPaths = new Set<string>();
        for (const fullPath of paths) {
            const parts = fullPath.split('/').filter(Boolean);
            let current = '';
            for (const part of parts) {
                current = `${current}/${part}`;
                allPaths.add(current);
            }
        }

        const toCreate: FileNode[] = [];
        for (const dirPath of allPaths) {
            if (!existingPaths.has(dirPath)) {
                toCreate.push({
                    id: nanoid(),
                    name: dirPath.split('/').pop()!,
                    path: dirPath,
                    type: 'directory',
                    lastModified: Date.now(),
                });
            }
        }

        if (toCreate.length > 0) {
            await fileStorageService.batchStoreFiles(toCreate, { showConflictDialog: false });
        }
    }
}

export const busyTexService = new BusyTeXService();