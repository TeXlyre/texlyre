import { BusyTeXEngine } from '@src/extensions/texlyre-busytex/BusyTeXEngine';
import { busyTexService, BUSYTEX_BUNDLE_URLS } from '@src/extensions/texlyre-busytex/BusyTeXService';
import { latexSourceMapService } from '@src/services/LaTeXSourceMapService';
import { fileStorageService } from '@src/services/FileStorageService';
import type { FileNode } from '@src/types/files';

jest.mock('texlyre-busytex');
jest.mock('@src/services/FileStorageService');
jest.mock('@src/services/LaTeXSourceMapService');

const { BusyTexRunner, isPackageCached, deletePackageCache } = require('texlyre-busytex');

function makeRunner() {
    return BusyTexRunner.mock.results[BusyTexRunner.mock.results.length - 1]?.value;
}

function makeFileNode(overrides: Partial<FileNode> = {}): FileNode {
    return {
        id: 'node-1',
        name: 'main.tex',
        path: '/main.tex',
        type: 'file',
        content: '\\documentclass{article}',
        lastModified: Date.now(),
        size: 24,
        mimeType: 'text/plain',
        isBinary: false,
        ...overrides,
    };
}

beforeEach(() => {
    jest.clearAllMocks();
    busyTexService.terminate();

    (fileStorageService.getFileByPath as jest.Mock).mockResolvedValue(null);
    (fileStorageService.getFilesByPath as jest.Mock).mockResolvedValue([]);
    (fileStorageService.getAllFiles as jest.Mock).mockResolvedValue([]);
    (fileStorageService.batchStoreFiles as jest.Mock).mockResolvedValue(undefined);
    (latexSourceMapService.loadFromBytes as jest.Mock) = jest.fn();
    (latexSourceMapService.clear as jest.Mock) = jest.fn();
});

// ---------------------------------------------------------------------------
// BusyTeXEngine
// ---------------------------------------------------------------------------

describe('BusyTeXEngine', () => {
    describe('initialize', () => {
        it('transitions status to ready after successful initialization', async () => {
            const engine = new BusyTeXEngine();
            expect(engine.getStatus()).toBe('unloaded');
            await engine.initialize('busytex-xetex');
            expect(engine.getStatus()).toBe('ready');
            expect(engine.isReady()).toBe(true);
        });

        it('does not reinitialize when runner is already initialized', async () => {
            const engine = new BusyTeXEngine();
            await engine.initialize('busytex-xetex');
            const firstRunner = makeRunner();
            await engine.initialize('busytex-xetex');
            expect(BusyTexRunner).toHaveBeenCalledTimes(1);
            expect(firstRunner).toBe(makeRunner());
        });

        it('transitions to error status and rethrows when initialization fails', async () => {
            BusyTexRunner.mockImplementationOnce(() => ({
                isInitialized: jest.fn(() => false),
                initialize: jest.fn(() => Promise.reject(new Error('init failed'))),
                terminate: jest.fn(),
            }));

            const engine = new BusyTeXEngine();
            await expect(engine.initialize()).rejects.toThrow('init failed');
            expect(engine.getStatus()).toBe('error');
        });

        it('notifies status listeners on status transitions', async () => {
            const engine = new BusyTeXEngine();
            const statuses: string[] = [];
            engine.addStatusListener(() => statuses.push(engine.getStatus()));
            await engine.initialize('busytex-pdftex');
            expect(statuses).toContain('loading');
            expect(statuses).toContain('ready');
        });
    });

    describe('setSelectedBundles', () => {
        it('terminates when bundles change', async () => {
            const engine = new BusyTeXEngine();
            await engine.initialize('busytex-xetex');
            const runner = makeRunner();
            engine.setSelectedBundles(['basic']);
            expect(runner.terminate).toHaveBeenCalled();
            expect(engine.getStatus()).toBe('unloaded');
        });

        it('does not terminate when bundles are unchanged', async () => {
            const engine = new BusyTeXEngine();
            engine.setSelectedBundles(['recommended']);
            await engine.initialize('busytex-xetex');
            const runner = makeRunner();
            engine.setSelectedBundles(['recommended']);
            expect(runner.terminate).not.toHaveBeenCalled();
        });
    });

    describe('compile', () => {
        it('returns pdf and status on success', async () => {
            const engine = new BusyTeXEngine();
            await engine.initialize('busytex-xetex');
            const runner = makeRunner();
            const fakePdf = new Uint8Array([1, 2, 3]);
            runner.compile.mockResolvedValueOnce({
                success: true, exitCode: 0, log: 'ok', pdf: fakePdf, synctex: undefined,
            });

            const result = await engine.compile('main.tex', [makeFileNode()]);

            expect(result.status).toBe(0);
            expect(result.pdf).toBe(fakePdf);
            expect(engine.getStatus()).toBe('ready');
        });

        it('returns undefined pdf when success is false', async () => {
            const engine = new BusyTeXEngine();
            await engine.initialize('busytex-xetex');
            makeRunner().compile.mockResolvedValueOnce({
                success: false, exitCode: 1, log: 'error', pdf: new Uint8Array(), synctex: undefined,
            });

            const result = await engine.compile('main.tex', [makeFileNode()]);

            expect(result.pdf).toBeUndefined();
            expect(result.status).toBe(1);
        });

        it('transitions back to ready after a compile error', async () => {
            const engine = new BusyTeXEngine();
            await engine.initialize('busytex-xetex');
            makeRunner().compile.mockRejectedValueOnce(new Error('compile crash'));

            await expect(engine.compile('main.tex', [])).rejects.toThrow('compile crash');
            expect(engine.getStatus()).toBe('ready');
        });

        it('initializes engine automatically if not yet ready', async () => {
            const engine = new BusyTeXEngine();
            await engine.compile('main.tex', []);
            expect(BusyTexRunner).toHaveBeenCalledTimes(1);
            expect(engine.getStatus()).toBe('ready');
        });

        it('passes cachedMisses to the runner when provided', async () => {
            const engine = new BusyTeXEngine();
            await engine.initialize('busytex-xetex');
            const runner = makeRunner();

            await engine.compile('main.tex', [], { cachedMisses: ['missing.sty'] });

            expect(runner.writeTexliveRemoteMisses).toHaveBeenCalledWith(['missing.sty']);
        });

        it('clears misses after compile', async () => {
            const engine = new BusyTeXEngine();
            await engine.initialize('busytex-xetex');
            const runner = makeRunner();

            await engine.compile('main.tex', []);

            const calls = runner.writeTexliveRemoteMisses.mock.calls;
            const lastCall = calls[calls.length - 1];
            expect(lastCall[0]).toEqual([]);
        });
    });

    describe('prepareFiles path normalization', () => {
        it('strips leading slashes from main file path', async () => {
            const engine = new BusyTeXEngine();
            await engine.initialize('busytex-xetex');
            const runner = makeRunner();

            await engine.compile('/main.tex', [makeFileNode({ path: '/main.tex' })]);

            const [files, mainTexPath] = runner.compile.mock.calls[0];
            expect(mainTexPath).toBe('main.tex');
            expect(files[0].path).toBe('main.tex');
        });

        it('strips main directory prefix from sibling files', async () => {
            const engine = new BusyTeXEngine();
            await engine.initialize('busytex-xetex');
            const runner = makeRunner();
            const nodes = [
                makeFileNode({ path: '/chapters/main.tex', name: 'main.tex' }),
                makeFileNode({ id: 'node-2', path: '/chapters/intro.tex', name: 'intro.tex' }),
            ];

            await engine.compile('/chapters/main.tex', nodes);

            const [files] = runner.compile.mock.calls[0];
            expect(files.find((f: any) => f.path === 'intro.tex')).toBeDefined();
        });

        it('skips files with no content', async () => {
            const engine = new BusyTeXEngine();
            await engine.initialize('busytex-xetex');
            const runner = makeRunner();

            await engine.compile('main.tex', [
                makeFileNode({ content: undefined }),
                makeFileNode({ id: 'n2', path: '/other.tex', content: 'content' }),
            ]);

            const [files] = runner.compile.mock.calls[0];
            expect(files.every((f: any) => f.content !== undefined)).toBe(true);
        });
    });

    describe('terminate and stopCompilation', () => {
        it('terminate sets status to unloaded', async () => {
            const engine = new BusyTeXEngine();
            await engine.initialize('busytex-xetex');
            engine.terminate();
            expect(engine.getStatus()).toBe('unloaded');
            expect(engine.isReady()).toBe(false);
        });
    });
});

// ---------------------------------------------------------------------------
// BusyTeXService
// ---------------------------------------------------------------------------

describe('BusyTeXService', () => {
    describe('compile', () => {
        it('calls latexSourceMapService.loadFromBytes on successful compile with synctex', async () => {
            const synctex = new Uint8Array([0x1f, 0x8b]);
            await busyTexService.initialize('busytex-xetex');
            const runner = makeRunner();
            runner.compile.mockResolvedValueOnce({
                success: true, exitCode: 0, log: '', pdf: new Uint8Array([1]), synctex,
            });

            await busyTexService.compile('main.tex', [makeFileNode()]);

            expect(latexSourceMapService.loadFromBytes).toHaveBeenCalledWith(synctex);
        });

        it('calls latexSourceMapService.clear on failed compile', async () => {
            await busyTexService.initialize('busytex-xetex');
            makeRunner().compile.mockResolvedValueOnce({
                success: false, exitCode: 1, log: 'error', pdf: undefined, synctex: undefined,
            });

            await busyTexService.compile('main.tex', [makeFileNode()]);

            expect(latexSourceMapService.clear).toHaveBeenCalled();
        });

        it('loads cached misses and passes them to the engine', async () => {
            const missesContent = JSON.stringify(['missing.sty']);
            (fileStorageService.getFileByPath as jest.Mock).mockResolvedValueOnce({
                content: missesContent,
            });

            await busyTexService.initialize('busytex-xetex');
            const runner = makeRunner();

            await busyTexService.compile('main.tex', [makeFileNode()]);

            expect(runner.writeTexliveRemoteMisses).toHaveBeenCalledWith(['missing.sty']);
        });
    });

    describe('setSelectedBundles', () => {
        it('maps bundle IDs to URLs', () => {
            const spy = jest.spyOn(require('@src/extensions/texlyre-busytex/BusyTeXEngine').busyTeXEngine, 'setSelectedBundles');
            busyTexService.setSelectedBundles(['basic', 'recommended']);
            expect(spy).toHaveBeenCalledWith([
                BUSYTEX_BUNDLE_URLS['basic'],
                BUSYTEX_BUNDLE_URLS['recommended'],
            ]);
        });

        it('ignores unknown bundle IDs', () => {
            const spy = jest.spyOn(require('@src/extensions/texlyre-busytex/BusyTeXEngine').busyTeXEngine, 'setSelectedBundles');
            busyTexService.setSelectedBundles(['nonexistent']);
            expect(spy).toHaveBeenCalledWith([]);
        });
    });

    describe('isBundleCached / deleteBundle', () => {
        it('delegates isBundleCached to isPackageCached with the correct URL', async () => {
            (isPackageCached as jest.Mock).mockResolvedValueOnce(true);
            const result = await busyTexService.isBundleCached('basic');
            expect(isPackageCached).toHaveBeenCalledWith(BUSYTEX_BUNDLE_URLS['basic']);
            expect(result).toBe(true);
        });

        it('returns false for unknown bundle ID', async () => {
            const result = await busyTexService.isBundleCached('nonexistent');
            expect(isPackageCached).not.toHaveBeenCalled();
            expect(result).toBe(false);
        });

        it('delegates deleteBundle to deletePackageCache', async () => {
            await busyTexService.deleteBundle('recommended');
            expect(deletePackageCache).toHaveBeenCalledWith(BUSYTEX_BUNDLE_URLS['recommended']);
        });
    });

    describe('flattenNodePath (via compile)', () => {
        async function compileFlattenedPaths(mainFile: string, nodes: FileNode[]) {
            busyTexService.terminate();
            busyTexService.setFlattenMainDirectory(true);
            await busyTexService.initialize('busytex-xetex');
            const runner = makeRunner();
            await busyTexService.compile(mainFile, nodes);
            return runner.compile.mock.calls[0][0] as Array<{ path: string }>;
        }

        it('strips the main file directory prefix from sibling nodes', async () => {
            const files = await compileFlattenedPaths('/src/main.tex', [
                makeFileNode({ path: '/src/main.tex', name: 'main.tex', content: 'a' }),
                makeFileNode({ id: 'n2', path: '/src/chapter.tex', name: 'chapter.tex', content: 'b' }),
            ]);
            expect(files.find(f => f.path === 'chapter.tex')).toBeDefined();
        });

        it('does not strip prefix from files outside the main directory', async () => {
            const files = await compileFlattenedPaths('/src/main.tex', [
                makeFileNode({ path: '/src/main.tex', name: 'main.tex', content: 'a' }),
                makeFileNode({ id: 'n2', path: '/images/fig.png', name: 'fig.png', content: 'b' }),
            ]);
            expect(files.find(f => f.path === 'images/fig.png')).toBeDefined();
        });

        it('handles main file at root level', async () => {
            const files = await compileFlattenedPaths('main.tex', [
                makeFileNode({ path: '/main.tex', name: 'main.tex', content: 'a' }),
                makeFileNode({ id: 'n2', path: '/other.tex', name: 'other.tex', content: 'b' }),
            ]);
            expect(files.find(f => f.path === 'other.tex')).toBeDefined();
        });
    });
});