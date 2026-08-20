import {
    estimateDetailedStorageUsage,
    isTypesetterCacheDatabase,
    isTypstPackageRequest,
} from '@src/utils/storageUsageUtils';
import type { Project } from '@src/types/projects';

const openDatabase = (name: string, setup: (db: IDBDatabase) => void) =>
    new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(name, 1);
        request.onupgradeneeded = () => setup(request.result);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

const putRecords = async (
    db: IDBDatabase,
    storeName: string,
    records: unknown[],
) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    records.forEach((record) => store.put(record));
    await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
    });
};

const createProjectDb = async (
    name: string,
    records: Array<Record<string, unknown>>,
) => {
    const db = await openDatabase(name, (database) => {
        const store = database.createObjectStore('files', { keyPath: 'id' });
        store.createIndex('path', 'path', { unique: false });
    });
    await putRecords(db, 'files', records);
    db.close();
};

const createSimpleDb = async (
    name: string,
    records: Array<Record<string, unknown>>,
) => {
    const db = await openDatabase(name, (database) => {
        database.createObjectStore('data', { keyPath: 'id' });
    });
    await putRecords(db, 'data', records);
    db.close();
};

const deleteAllDatabases = async () => {
    if (typeof indexedDB.databases !== 'function') return;
    const databases = await indexedDB.databases();
    await Promise.all(
        databases
            .map((database) => database.name)
            .filter((name): name is string => Boolean(name))
            .map(
                (name) =>
                    new Promise<void>((resolve) => {
                        const request = indexedDB.deleteDatabase(name);
                        request.onsuccess = () => resolve();
                        request.onerror = () => resolve();
                        request.onblocked = () => resolve();
                    }),
            ),
    );
};

describe('storageUsageUtils', () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        await deleteAllDatabases();

        Object.defineProperty(navigator, 'storage', {
            configurable: true,
            value: {
                estimate: jest.fn().mockResolvedValue({
                    usage: 2000,
                    quota: 10000,
                    usageDetails: {
                        indexedDB: 1500,
                        caches: 400,
                        serviceWorkerRegistrations: 20,
                    },
                }),
            },
        });

        (global as any).caches = {
            keys: jest.fn().mockResolvedValue(['texlyre-v1']),
            open: jest.fn().mockResolvedValue({
                keys: jest.fn().mockResolvedValue([
                    { url: 'https://packages.typst.org/preview/example-1.0.0.tar.gz' },
                    { url: 'https://texlyre.org/app.js' },
                ]),
                match: jest.fn().mockImplementation(async (request: { url: string }) => {
                    if (!request.url.includes('packages.typst.org')) return undefined;
                    return {
                        headers: {
                            get: (name: string) =>
                                name.toLowerCase() === 'content-length' ? '100' : null,
                        },
                        clone: () => ({
                            arrayBuffer: async () => new ArrayBuffer(100),
                        }),
                    };
                }),
            }),
        };
    });

    afterEach(async () => {
        await deleteAllDatabases();
    });

    it('falls back to the existing coarse meter when usage details are unavailable', async () => {
        (navigator.storage.estimate as jest.Mock).mockResolvedValue({
            usage: 2000,
            quota: 10000,
        });

        await expect(estimateDetailedStorageUsage([])).resolves.toEqual([]);
    });

    it('recognizes the shared typesetter cache database names', () => {
        expect(isTypesetterCacheDatabase('EM_PRELOAD_CACHE')).toBe(true);
        expect(isTypesetterCacheDatabase('EM_FS_/texlyre/')).toBe(true);
        expect(isTypesetterCacheDatabase('EM_UNRELATED')).toBe(false);
    });

    it('recognizes only Typst preview package requests', () => {
        expect(
            isTypstPackageRequest(
                'https://packages.typst.org/preview/example-1.0.0.tar.gz',
            ),
        ).toBe(true);
        expect(
            isTypstPackageRequest('https://packages.typst.org/other/example'),
        ).toBe(false);
        expect(isTypstPackageRequest('https://texlyre.org/preview/example')).toBe(
            false,
        );
    });

    it('separates active projects, typesetter cache, leftovers, app data, and offline cache', async () => {
        await createProjectDb('texlyre-project-active', [
            {
                id: 'main',
                path: '/main.tex',
                type: 'file',
                content: 'x'.repeat(200),
            },
            {
                id: 'cache',
                path: '/.texlyre_cache/__btex/remote/font.otf',
                type: 'file',
                content: new ArrayBuffer(120),
            },
        ]);
        await createSimpleDb('texlyre-project-active-yjs_metadata', [
            { id: 'updates', value: new ArrayBuffer(400) },
        ]);
        await createSimpleDb('texlyre-project-gone', [
            { id: 'orphan', value: new ArrayBuffer(180) },
        ]);
        await createSimpleDb('EM_PRELOAD_CACHE', [
            { id: 'package', value: new ArrayBuffer(260) },
        ]);
        await createSimpleDb('texlyre-auth', [
            { id: 'account', value: 'local user' },
        ]);

        const project = { docUrl: 'yjs:active' } as Project;
        const segments = await estimateDetailedStorageUsage([project]);
        const bytes = Object.fromEntries(
            segments.map((segment) => [segment.id, segment.bytes]),
        );

        expect(bytes['projects-documents']).toBeGreaterThan(0);
        expect(bytes['typesetter-cache']).toBeGreaterThan(100);
        expect(bytes['leftover-projects']).toBeGreaterThan(0);
        expect(bytes['app-data']).toBeGreaterThan(0);
        expect(bytes['offline-cache']).toBe(300);
        expect(bytes.other).toBeGreaterThanOrEqual(20);
        expect(
            segments.reduce((total, segment) => total + segment.bytes, 0),
        ).toBeCloseTo(2000, 5);
    });

    it('treats an unreferenced project database as leftover data', async () => {
        await createProjectDb('texlyre-project-open', [
            {
                id: 'main',
                path: '/main.tex',
                type: 'file',
                content: 'hello',
            },
        ]);

        const segments = await estimateDetailedStorageUsage([]);
        const leftover = segments.find(
            (segment) => segment.id === 'leftover-projects',
        );

        expect(leftover?.bytes).toBeGreaterThan(0);
        expect(
            segments.find((segment) => segment.id === 'projects-documents'),
        ).toBeUndefined();
    });

    it('keeps project data visible when a large typesetter cache is also present', async () => {
        await createProjectDb('texlyre-project-active', [
            {
                id: 'main',
                path: '/main.tex',
                type: 'file',
                content: 'project source',
            },
        ]);
        await createSimpleDb('texlyre-project-active-yjs_metadata', [
            { id: 'updates', value: new ArrayBuffer(300) },
        ]);
        await createSimpleDb('EM_PRELOAD_CACHE', [
            { id: 'package', value: new ArrayBuffer(20_000) },
        ]);

        (navigator.storage.estimate as jest.Mock).mockResolvedValue({
            usage: 25_000,
            quota: 100_000,
            usageDetails: {
                indexedDB: 24_000,
                caches: 1000,
            },
        });

        const segments = await estimateDetailedStorageUsage([
            { docUrl: 'yjs:active' } as Project,
        ]);

        expect(
            segments.find((segment) => segment.id === 'projects-documents')?.bytes,
        ).toBeGreaterThan(0);
        expect(
            segments.find((segment) => segment.id === 'typesetter-cache')?.bytes,
        ).toBeGreaterThan(0);
    });

    it('returns whole-byte segment sizes after normalization', async () => {
        await createSimpleDb('texlyre-auth', [
            { id: 'account', value: 'local user' },
        ]);

        const segments = await estimateDetailedStorageUsage([]);

        for (const segment of segments) {
            expect(Number.isInteger(segment.bytes)).toBe(true);
        }
    });

    it('uses browser storage overhead for reported IndexedDB bytes that cannot be assigned', async () => {
        (navigator.storage.estimate as jest.Mock).mockResolvedValue({
            usage: 1400,
            quota: 10_000,
            usageDetails: {
                indexedDB: 1400,
            },
        });

        const segments = await estimateDetailedStorageUsage([]);

        expect(
            segments.find((segment) => segment.id === 'storage-overhead')?.bytes,
        ).toBe(1400);
        expect(
            segments.find((segment) => segment.id === 'projects-documents'),
        ).toBeUndefined();
    });
});
