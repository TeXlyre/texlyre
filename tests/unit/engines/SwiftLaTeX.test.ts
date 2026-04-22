import { swiftLaTeXService } from '@src/extensions/swiftlatex/SwiftLaTeXService';
import { fileStorageService } from '@src/services/FileStorageService';
import type { FileNode } from '@src/types/files';

jest.mock('@src/services/FileStorageService');

const { setupSwiftLaTeXMocks } = require('../../mocks/swiftlatex-engines');

// EngineLoader injects scripts via <script> tags; mock it to a no-op so engines
// fall through to the window globals set up by setupSwiftLaTeXMocks.
jest.mock('@src/extensions/swiftlatex/EngineLoader', () => ({
    EngineLoader: {
        loadScripts: jest.fn(() => Promise.resolve()),
        loadScript: jest.fn(() => Promise.resolve()),
        isScriptLoaded: jest.fn(() => false),
        removeScript: jest.fn(),
    },
}));

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

function storedPaths(): string[] {
    return (fileStorageService.batchStoreFiles as jest.Mock).mock.calls
        .flatMap(([files]: [FileNode[]]) => files)
        .map((f: FileNode) => f?.path)
        .filter(Boolean);
}

// Sets up fresh window globals, reinitializes the singleton engine so it picks
// up the new mock instances, and returns the mock handles.
async function resetService(engineType: 'pdftex' | 'xetex' = 'pdftex') {
    const mocks = setupSwiftLaTeXMocks();
    // Switch to the target engine type first so reinitialize() targets the right wrapper.
    swiftLaTeXService['currentEngineType'] = engineType;
    await swiftLaTeXService.reinitialize();
    await swiftLaTeXService.initialize(engineType);
    return mocks;
}

beforeEach(async () => {
    jest.clearAllMocks();

    (fileStorageService.getFileByPath as jest.Mock).mockResolvedValue(null);
    (fileStorageService.getFilesByPath as jest.Mock).mockResolvedValue([]);
    (fileStorageService.getAllFiles as jest.Mock).mockResolvedValue([]);
    (fileStorageService.batchStoreFiles as jest.Mock).mockResolvedValue(undefined);
    (fileStorageService.batchDeleteFiles as jest.Mock).mockResolvedValue(undefined);
    (fileStorageService.getFile as jest.Mock).mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// SwiftLaTeXService
// ---------------------------------------------------------------------------

describe('SwiftLaTeXService', () => {
    describe('initialize', () => {
        it('becomes ready after initialization', async () => {
            await resetService('pdftex');
            expect(swiftLaTeXService.isReady()).toBe(true);
            expect(swiftLaTeXService.getStatus()).toBe('ready');
        });

        it('sets current engine type', async () => {
            await resetService('xetex');
            expect(swiftLaTeXService.getCurrentEngineType()).toBe('xetex');
        });
    });

    describe('setEngine', () => {
        it('is a no-op when switching to the already-current engine', async () => {
            await resetService('pdftex');
            const constructionsBefore = (global as any).PdfTeXEngine.mock.calls.length;
            await swiftLaTeXService.setEngine('pdftex');
            expect((global as any).PdfTeXEngine.mock.calls.length).toBe(constructionsBefore);
        });

        it('switches engine type and reinitializes', async () => {
            await resetService('pdftex');
            setupSwiftLaTeXMocks();
            await swiftLaTeXService.setEngine('xetex');
            expect(swiftLaTeXService.getCurrentEngineType()).toBe('xetex');
            expect(swiftLaTeXService.isReady()).toBe(true);
        });
    });

    describe('compile — pdftex success', () => {
        it('returns pdf and status 0 on success', async () => {
            await resetService('pdftex');
            const result = await swiftLaTeXService.compile('/main.tex', [makeFileNode()]);
            expect(result.status).toBe(0);
            expect(result.pdf).toBeInstanceOf(Uint8Array);
        });

        it('saves pdf output file on success', async () => {
            await resetService('pdftex');
            await swiftLaTeXService.compile('/main.tex', [makeFileNode()]);
            expect(storedPaths().some(p => p.endsWith('.pdf'))).toBe(true);
        });

        it('saves log file alongside pdf on success', async () => {
            await resetService('pdftex');
            await swiftLaTeXService.compile('/main.tex', [makeFileNode()]);
            expect(storedPaths().some(p => p.endsWith('.log'))).toBe(true);
        });
    });

    describe('compile — failure path', () => {
        it('saves only log file on compilation failure', async () => {
            const { pdftex } = await resetService('pdftex');
            pdftex.compileLaTeX.mockResolvedValue({ status: 1, pdf: undefined, log: 'error log' });

            await swiftLaTeXService.compile('/main.tex', [makeFileNode()]);

            expect(storedPaths().some(p => p.endsWith('.log'))).toBe(true);
            expect(storedPaths().some(p => p.endsWith('.pdf'))).toBe(false);
        });

        it('returns the error status and log', async () => {
            const { pdftex } = await resetService('pdftex');
            pdftex.compileLaTeX.mockResolvedValue({ status: 1, pdf: undefined, log: 'compile error' });

            const result = await swiftLaTeXService.compile('/main.tex', [makeFileNode()]);

            expect(result.status).toBe(1);
            expect(result.log).toBe('compile error');
            expect(result.pdf).toBeUndefined();
        });
    });

    describe('compile — xetex xdv conversion', () => {
        it('passes XDV output through dvipdfmx and returns pdf', async () => {
            const xdvData = new Uint8Array([0xde, 0xad]);
            const { xetex, dvipdfmx } = await resetService('xetex');

            // XeTeXEngine.compile calls compileLaTeX three times; all must return xdv.
            xetex.compileLaTeX.mockResolvedValue({ status: 0, pdf: xdvData, log: 'xetex log' });
            dvipdfmx.compilePDF.mockResolvedValue({ status: 0, pdf: new Uint8Array([0xbe, 0xef]), log: '' });

            const result = await swiftLaTeXService.compile('/main.tex', [makeFileNode()]);

            expect(dvipdfmx.loadEngine).toHaveBeenCalled();
            expect(result.status).toBe(0);
        });
    });

    describe('preprocessNodes (via compile)', () => {
        it('strips leading slash from main file path passed to setEngineMainFile', async () => {
            const { pdftex } = await resetService('pdftex');

            await swiftLaTeXService.compile('/main.tex', [makeFileNode({ path: '/main.tex' })]);

            expect(pdftex.setEngineMainFile).toHaveBeenCalledWith(
                expect.not.stringMatching(/^\//),
            );
        });

        it('flattens sibling files relative to main file directory', async () => {
            const { pdftex } = await resetService('pdftex');

            await swiftLaTeXService.compile('/chapters/main.tex', [
                makeFileNode({ path: '/chapters/main.tex', name: 'main.tex' }),
                makeFileNode({ id: 'n2', path: '/chapters/intro.tex', name: 'intro.tex', content: 'x' }),
            ]);

            const writeCalls: string[] = pdftex.writeMemFSFile.mock.calls.map((c: any[]) => c[0] as string);
            expect(writeCalls.some(p => p.includes('intro.tex') && !p.includes('chapters'))).toBe(true);
        });

        it('skips directory nodes', async () => {
            const { pdftex } = await resetService('pdftex');

            await swiftLaTeXService.compile('/main.tex', [
                makeFileNode(),
                { id: 'd1', name: 'chapters', path: '/chapters', type: 'directory', lastModified: Date.now() },
            ]);

            const writeCalls: string[] = pdftex.writeMemFSFile.mock.calls.map((c: any[]) => c[0] as string);
            expect(writeCalls.every((p: string) => !p.endsWith('chapters'))).toBe(true);
        });
    });

    describe('clearCache', () => {
        it('deletes only files under temporary cache paths', async () => {
            (fileStorageService.getAllFiles as jest.Mock).mockResolvedValue([
                makeFileNode({ id: 'cache-1', path: '/.texlyre_cache/__tex/main.aux' }),
                makeFileNode({ id: 'src-1', path: '/main.tex' }),
            ]);

            await swiftLaTeXService.clearCache();

            expect(fileStorageService.batchDeleteFiles).toHaveBeenCalledWith(
                ['cache-1'],
                expect.objectContaining({ hardDelete: true }),
            );
        });

        it('does not delete non-cache files', async () => {
            (fileStorageService.getAllFiles as jest.Mock).mockResolvedValue([
                makeFileNode({ id: 'src-1', path: '/main.tex' }),
                makeFileNode({ id: 'src-2', path: '/figures/fig.png' }),
            ]);

            await swiftLaTeXService.clearCache();

            expect(fileStorageService.batchDeleteFiles).not.toHaveBeenCalled();
        });
    });

    describe('export', () => {
        it('restores the original engine type after export with a different engine', async () => {
            await resetService('pdftex');
            setupSwiftLaTeXMocks();

            await swiftLaTeXService.export('/main.tex', [makeFileNode()], { engine: 'xetex' });

            expect(swiftLaTeXService.getCurrentEngineType()).toBe('pdftex');
        });

        it('returns compiled pdf in files array on success', async () => {
            await resetService('pdftex');
            const result = await swiftLaTeXService.export('/main.tex', [makeFileNode()], {});
            expect(result.status).toBe(0);
            expect(result.files.some(f => f.name.endsWith('.pdf'))).toBe(true);
        });

        it('includes log file when includeLog is true', async () => {
            await resetService('pdftex');
            const result = await swiftLaTeXService.export('/main.tex', [makeFileNode()], { includeLog: true });
            expect(result.files.some(f => f.name.endsWith('.log'))).toBe(true);
        });

        it('returns empty files array on compile failure', async () => {
            const { pdftex } = await resetService('pdftex');
            pdftex.compileLaTeX.mockResolvedValue({ status: 1, pdf: undefined, log: 'fail' });

            const result = await swiftLaTeXService.export('/main.tex', [makeFileNode()], {});

            expect(result.files).toHaveLength(0);
            expect(result.status).toBe(1);
        });
    });

    describe('addStatusListener', () => {
        it('notifies listener when engine status changes', async () => {
            setupSwiftLaTeXMocks();
            const listener = jest.fn();
            const unsub = swiftLaTeXService.addStatusListener(listener);
            await swiftLaTeXService.reinitialize();
            await swiftLaTeXService.initialize('pdftex');
            expect(listener).toHaveBeenCalled();
            unsub();
        });

        it('stops notifying after unsubscribe', async () => {
            setupSwiftLaTeXMocks();
            const listener = jest.fn();
            const unsub = swiftLaTeXService.addStatusListener(listener);
            unsub();
            listener.mockClear();
            await swiftLaTeXService.reinitialize();
            await swiftLaTeXService.initialize('pdftex');
            expect(listener).not.toHaveBeenCalled();
        });
    });
});