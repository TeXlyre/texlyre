// src/extensions/texlyre-busytex/BusyTeXEngine.ts
import { BusyTexRunner } from 'texlyre-busytex';
import type { FileInput, TexliveRemoteFile } from 'texlyre-busytex';

import type { CompileResult } from '../swiftlatex/BaseEngine';
import type { FileNode } from '../../types/files';
import { isTemporaryFile, toArrayBuffer } from '../../utils/fileUtils';

export type BusyTeXEngineType = 'busytex-pdftex' | 'busytex-xetex' | 'busytex-luatex';

const BUSYTEX_CACHE_DIR = '/.texlyre_cache/__btex';
const MISSES_KEY = `${BUSYTEX_CACHE_DIR}/.misses.json`;

const DRIVER_MAP: Record<BusyTeXEngineType, 'pdftex_bibtex8' | 'xetex_bibtex8_dvipdfmx' | 'luahbtex_bibtex8' | 'luatex_bibtex8'> = {
    'busytex-pdftex': 'pdftex_bibtex8',
    'busytex-xetex': 'xetex_bibtex8_dvipdfmx',
    'busytex-luatex': 'luahbtex_bibtex8',
};

export interface BusyTeXCompileResult extends CompileResult {
    synctex?: Uint8Array;
}

export class BusyTeXEngine {
    private runner: BusyTexRunner | null = null;
    private status: 'unloaded' | 'loading' | 'ready' | 'compiling' | 'error' = 'unloaded';
    private statusListeners: Set<() => void> = new Set();
    private currentEngineType: BusyTeXEngineType = 'busytex-xetex';
    private busytexBasePath = `${__BASE_PATH__}/core/busytex`;
    private texliveEndpoint = '';
    private selectedBundles: string[] = [];
    private useWorker = true;

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

    private setStatus(status: typeof this.status): void {
        this.status = status;
        this.statusListeners.forEach((l) => l());
    }

    setBusytexBasePath(path: string): void {
        this.busytexBasePath = path;
    }

    setTexliveEndpoint(endpoint: string): void {
        this.texliveEndpoint = endpoint;
    }

    setSelectedBundles(bundles: string[]): void {
        const changed = JSON.stringify(bundles) !== JSON.stringify(this.selectedBundles);
        this.selectedBundles = bundles;
        if (changed) {
            this.terminate();
        }
    }

    setUseWorker(useWorker: boolean): void {
        if (useWorker !== this.useWorker) {
            this.useWorker = useWorker;
            this.terminate();
        }
    }

    async initialize(engineType: BusyTeXEngineType = this.currentEngineType): Promise<void> {
        this.currentEngineType = engineType;

        if (this.runner?.isInitialized()) return;

        this.setStatus('loading');
        try {
            this.runner = new BusyTexRunner({
                busytexBasePath: this.busytexBasePath,
                verbose: false,
                engineMode: 'combined',
                preloadDataPackages: this.selectedBundles,
                catalogDataPackages: [],
            });

            await this.runner.initialize(this.useWorker);
            this.setStatus('ready');
        } catch (error) {
            this.setStatus('error');
            throw error;
        }
    }

    async setEngine(engineType: BusyTeXEngineType): Promise<void> {
        this.currentEngineType = engineType;
        if (!this.runner?.isInitialized()) {
            await this.initialize(engineType);
        }
    }

    getCurrentEngineType(): BusyTeXEngineType {
        return this.currentEngineType;
    }

    async compile(
        mainFileName: string,
        fileNodes: FileNode[],
        options: {
            bibtex?: boolean;
            makeindex?: boolean | null;
            rerun?: boolean;
            remoteEndpoint?: string;
            cachedMisses?: string[];
        } = {}
    ): Promise<BusyTeXCompileResult> {
        if (!this.runner?.isInitialized()) {
            await this.initialize(this.currentEngineType);
        }

        this.setStatus('compiling');

        try {
            const { mainTexPath, files } = this.prepareFiles(mainFileName, fileNodes);

            if (options.cachedMisses?.length) {
                await this.runner!.writeTexliveRemoteMisses(options.cachedMisses);
            }

            const result = await this.runner!.compile(
                files,
                mainTexPath,
                options.bibtex ?? null,
                options.makeindex ?? null,
                options.rerun ?? null,
                'silent',
                DRIVER_MAP[this.currentEngineType],
                null,
                options.remoteEndpoint || this.texliveEndpoint || undefined,
            );

            await this.runner!.writeTexliveRemoteMisses([]);

            this.setStatus('ready');

            return {
                pdf: result.success ? result.pdf : undefined,
                status: result.exitCode,
                log: result.log,
                synctex: result.synctex,
            };
        } catch (error) {
            this.setStatus('error');
            this.status = 'ready';
            throw error;
        }
    }

    async readWorkFiles(): Promise<{ [key: string]: ArrayBuffer }> {
        if (!this.runner?.isInitialized()) return {};
        try {
            const files = await this.runner.readProjectFiles();
            const result: { [key: string]: ArrayBuffer } = {};
            for (const f of files) {
                const content = f.content;
                if (typeof content === 'string') {
                    result[f.path] = new TextEncoder().encode(content).buffer;
                } else {
                    result[f.path] = toArrayBuffer((content as Uint8Array).buffer.slice(
                        (content as Uint8Array).byteOffset,
                        (content as Uint8Array).byteOffset + (content as Uint8Array).byteLength
                    ));
                }
            }
            return result;
        } catch {
            return {};
        }
    }

    async readMisses(): Promise<string[]> {
        if (!this.runner?.isInitialized()) return [];
        try {
            const files = await this.runner.readProjectFiles('/tmp/texlive_remote');
            const missesFile = files.find((f) => f.path.endsWith('.misses.json'));
            if (!missesFile) return [];
            const text = typeof missesFile.content === 'string'
                ? missesFile.content
                : new TextDecoder().decode(missesFile.content as Uint8Array);
            return JSON.parse(text);
        } catch {
            return [];
        }
    }

    async writeMisses(misses: string[]): Promise<void> {
        if (!this.runner?.isInitialized()) return;
        try {
            await this.runner.writeTexliveRemoteMisses(misses);
        } catch {
            // non-fatal
        }
    }

    async readRemoteFiles(): Promise<TexliveRemoteFile[]> {
        if (!this.runner?.isInitialized()) return [];
        try {
            const files = await this.runner.readProjectFiles('/tmp/texlive_remote');
            const result: TexliveRemoteFile[] = [];
            for (const f of files) {
                const base = f.path.slice(f.path.lastIndexOf('/') + 1);
                if (base === '.misses.json') continue;
                const content = typeof f.content === 'string'
                    ? new TextEncoder().encode(f.content)
                    : (f.content as Uint8Array);
                const match = base.match(/^(\d+)_(.+)$/);
                result.push(match
                    ? { name: match[2], format: Number.parseInt(match[1], 10), content }
                    : { name: base, content });
            }
            return result;
        } catch {
            return [];
        }
    }

    async writeRemoteFiles(files: TexliveRemoteFile[]): Promise<void> {
        if (!this.runner?.isInitialized() || !files.length) return;
        try {
            await this.runner.writeTexliveRemoteFiles(files);
        } catch (error) {
            console.warn('[BusyTeXEngine] Failed to write remote files:', error);
        }
    }

    stopCompilation(): void {
        if (this.isCompiling() && this.runner) {
            this.runner.terminate();
            this.runner = null;
            this.setStatus('unloaded');
        }
    }

    terminate(): void {
        if (this.runner) {
            this.runner.terminate();
            this.runner = null;
        }
        this.setStatus('unloaded');
    }

    private prepareFiles(
        mainFileName: string,
        fileNodes: FileNode[]
    ): { mainTexPath: string; files: FileInput[] } {
        const normalizedMain = mainFileName.replace(/^\/+/, '');
        const mainDirPrefix = normalizedMain.includes('/')
            ? normalizedMain.substring(0, normalizedMain.lastIndexOf('/') + 1)
            : '';
        const mainTexPath = normalizedMain.includes('/')
            ? normalizedMain.substring(mainDirPrefix.length)
            : normalizedMain;

        const files: FileInput[] = [];

        for (const node of fileNodes) {
            if (node.type !== 'file' || isTemporaryFile(node.path)) continue;
            if (!node.content) continue;

            const normalized = node.path.replace(/^\/+/, '');
            const targetPath = mainDirPrefix && normalized.startsWith(mainDirPrefix)
                ? normalized.substring(mainDirPrefix.length)
                : normalized;

            const content = node.content instanceof ArrayBuffer
                ? new Uint8Array(node.content)
                : node.content as string | Uint8Array;

            files.push({ path: targetPath, content });
        }

        return { mainTexPath, files };
    }
}

export const busyTeXEngine = new BusyTeXEngine();
export { BUSYTEX_CACHE_DIR, MISSES_KEY };