import {
    deleteCurrentProjectTypesetterCache,
    deleteProjectTypesetterCaches,
    deleteDatabase,
    deleteDatabases,
    deleteTypstPackageCache,
    closeActiveConnections,
    cleanupProjectDatabases,
    hasCurrentProjectTypesetterCache,
    hasProjectTypesetterCache,
    hasTypstPackageCache,
    listReclaimableDatabases,
    projectDbNames,
} from '@src/utils/dbDeleteUtils';
import { fileStoreService } from '@src/services/FileStoreService';
import type { Project } from '@src/types/projects';

jest.mock('@src/services/FileStoreService', () => ({
    fileStoreService: {
        isConnectedToProject: jest.fn(),
        cleanup: jest.fn(),
        getCurrentProjectId: jest.fn().mockReturnValue(''),
        setProjectId: jest.fn(),
        getAllFiles: jest.fn().mockResolvedValue([]),
        batchDeleteFiles: jest.fn().mockResolvedValue(undefined),
    },
}));

jest.mock('@src/services/CollabService', () => ({
    collabService: {
        disconnectAll: jest.fn(),
    },
}));

jest.mock('@src/services/QuotaService', () => ({
    quotaService: {
        markStale: jest.fn(),
    },
}));

describe('DB Delete Utils', () => {
    const deleteDatabaseSpy = jest.fn();
    const databasesSpy = jest.fn();
    const cacheNamesSpy = jest.fn();
    const cacheOpenSpy = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        deleteDatabaseSpy.mockReset();
        databasesSpy.mockReset();
        cacheNamesSpy.mockReset();
        cacheOpenSpy.mockReset();
        (fileStoreService.getCurrentProjectId as jest.Mock).mockReturnValue('');
        (fileStoreService.setProjectId as jest.Mock).mockReset();
        (fileStoreService.getAllFiles as jest.Mock).mockResolvedValue([]);
        (fileStoreService.batchDeleteFiles as jest.Mock).mockResolvedValue(undefined);
        (global as any).indexedDB = {
            deleteDatabase: deleteDatabaseSpy,
            databases: databasesSpy,
        };
        cacheNamesSpy.mockResolvedValue([]);
        (global as any).caches = {
            keys: cacheNamesSpy,
            open: cacheOpenSpy,
        };
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    const makeRequest = () => {
        const request: any = {};
        deleteDatabaseSpy.mockReturnValueOnce(request);
        return request;
    };

    describe('deleteDatabase', () => {
        it('should resolve on success', async () => {
            const request = makeRequest();
            const promise = deleteDatabase('db1');

            request.onsuccess?.();

            await expect(promise).resolves.toBeUndefined();
            expect(deleteDatabaseSpy).toHaveBeenCalledWith('db1');
        });

        it('should reject on error', async () => {
            const request = makeRequest();
            const promise = deleteDatabase('db1');

            request.onerror?.();

            await expect(promise).rejects.toThrow('Failed to delete database: db1');
        });

        it('should retry when blocked', async () => {
            const first = makeRequest();
            const promise = deleteDatabase('db1');

            first.onblocked?.();

            const retry = makeRequest();
            await jest.advanceTimersByTimeAsync(1000);
            retry.onsuccess?.();

            await expect(promise).resolves.toBeUndefined();
            expect(deleteDatabaseSpy).toHaveBeenCalledTimes(2);
        });
    });

    describe('closeActiveConnections', () => {
        it('should clean up when connected', async () => {
            (fileStoreService.isConnectedToProject as jest.Mock).mockReturnValue(
                true,
            );

            await closeActiveConnections('proj1');

            expect(fileStoreService.cleanup).toHaveBeenCalled();
        });

        it('should clear the current project id when that project is deleted', async () => {
            (fileStoreService.getCurrentProjectId as jest.Mock).mockReturnValue(
                'proj1',
            );
            (fileStoreService.isConnectedToProject as jest.Mock).mockReturnValue(
                false,
            );

            await closeActiveConnections('proj1');

            expect(fileStoreService.setProjectId).toHaveBeenCalledWith('');
        });

        it('should do nothing when not connected to another project', async () => {
            (fileStoreService.isConnectedToProject as jest.Mock).mockReturnValue(
                false,
            );
            (fileStoreService.getCurrentProjectId as jest.Mock).mockReturnValue(
                'proj2',
            );

            await closeActiveConnections('proj1');

            expect(fileStoreService.cleanup).not.toHaveBeenCalled();
            expect(fileStoreService.setProjectId).not.toHaveBeenCalled();
        });
    });

    describe('cleanupProjectDatabases', () => {
        it('should delete every database owned by the project prefix', async () => {
            databasesSpy.mockResolvedValue([
                { name: 'texlyre-project-proj1' },
                { name: 'texlyre-project-proj1-yjs_metadata' },
                { name: 'texlyre-project-proj1-yjs_doc-old' },
                { name: 'texlyre-project-proj1-custom' },
                { name: 'texlyre-project-proj2' },
            ]);
            deleteDatabaseSpy.mockImplementation(() => {
                const request: any = {};
                Promise.resolve().then(() => request.onsuccess?.());
                return request;
            });
            (fileStoreService.getCurrentProjectId as jest.Mock).mockReturnValue(
                'proj1',
            );
            (fileStoreService.isConnectedToProject as jest.Mock).mockReturnValue(
                true,
            );

            await cleanupProjectDatabases({
                docUrl: 'yjs:proj1',
                name: 'Project 1',
            } as Project);

            expect(deleteDatabaseSpy).toHaveBeenCalledTimes(4);
            expect(deleteDatabaseSpy).toHaveBeenCalledWith(
                'texlyre-project-proj1',
            );
            expect(deleteDatabaseSpy).toHaveBeenCalledWith(
                'texlyre-project-proj1-yjs_doc-old',
            );
            expect(deleteDatabaseSpy).toHaveBeenCalledWith(
                'texlyre-project-proj1-custom',
            );
            expect(deleteDatabaseSpy).not.toHaveBeenCalledWith(
                'texlyre-project-proj2',
            );
            expect(fileStoreService.setProjectId).toHaveBeenCalledWith('');
        });
    });

    describe('projectDbNames', () => {
        it('should strip the yjs prefix and build collection names', () => {
            expect(projectDbNames('yjs:abc123')).toEqual([
                'texlyre-project-abc123-yjs_metadata',
                'texlyre-project-abc123-chat',
                'texlyre-project-abc123-file_sync',
                'texlyre-project-abc123',
            ]);
        });

        it('should use the docUrl as-is when no yjs prefix is present', () => {
            expect(projectDbNames('abc123')).toEqual([
                'texlyre-project-abc123-yjs_metadata',
                'texlyre-project-abc123-chat',
                'texlyre-project-abc123-file_sync',
                'texlyre-project-abc123',
            ]);
        });
    });

    describe('listReclaimableDatabases', () => {
        const project = (docUrl: string) => ({ docUrl }) as Project;

        const listNames = (names: string[]) => {
            databasesSpy.mockResolvedValue(names.map((name) => ({ name })));
        };

        it('should return nothing when the browser cannot enumerate databases', async () => {
            (global as any).indexedDB = { deleteDatabase: deleteDatabaseSpy };

            await expect(listReclaimableDatabases([])).resolves.toEqual([]);
        });

        it('should return nothing when enumeration fails', async () => {
            databasesSpy.mockRejectedValue(new Error('denied'));

            await expect(listReclaimableDatabases([])).resolves.toEqual([]);
        });

        it('should report SwiftLaTeX and BusyTeX Emscripten caches', async () => {
            listNames([
                'EM_FS_/texlyre',
                'EM_PRELOAD_CACHE',
                'EM_UNRELATED',
                'texlyre-auth',
            ]);

            await expect(listReclaimableDatabases([])).resolves.toEqual([
                { name: 'EM_FS_/texlyre', kind: 'typesetter-cache' },
                { name: 'EM_PRELOAD_CACHE', kind: 'typesetter-cache' },
            ]);
        });

        it('should report project databases that no project references', async () => {
            listNames(['texlyre-project-gone', 'texlyre-project-kept']);

            const reclaimable = await listReclaimableDatabases([
                project('yjs:kept'),
            ]);

            expect(reclaimable).toEqual([
                { name: 'texlyre-project-gone', kind: 'orphan-project' },
            ]);
        });

        it('should keep databases belonging to any local user', async () => {
            listNames([
                'texlyre-project-mine',
                'texlyre-project-theirs-yjs_metadata',
            ]);

            const reclaimable = await listReclaimableDatabases([
                project('yjs:mine'),
                project('yjs:theirs'),
            ]);

            expect(reclaimable).toEqual([]);
        });

        it('should not treat a different project with the same id prefix as active', async () => {
            listNames(['texlyre-project-abc', 'texlyre-project-abc2']);

            await expect(
                listReclaimableDatabases([project('yjs:abc')]),
            ).resolves.toEqual([
                { name: 'texlyre-project-abc2', kind: 'orphan-project' },
            ]);
        });

        it('should keep the document databases of a referenced project', async () => {
            listNames([
                'texlyre-project-kept',
                'texlyre-project-kept-chat',
                'texlyre-project-kept-yjs_doc1',
            ]);

            await expect(
                listReclaimableDatabases([project('yjs:kept')]),
            ).resolves.toEqual([]);
        });

        it('should treat a stale open-project id as leftover when auth metadata is gone', async () => {
            (fileStoreService.getCurrentProjectId as jest.Mock).mockReturnValue(
                'open',
            );
            listNames(['texlyre-project-open']);

            await expect(listReclaimableDatabases([])).resolves.toEqual([
                { name: 'texlyre-project-open', kind: 'orphan-project' },
            ]);
        });

        it('should ignore databases outside the project namespace', async () => {
            listNames(['texlyre-auth', 'texlyre-share-target', 'unrelated']);

            await expect(listReclaimableDatabases([])).resolves.toEqual([]);
        });
    });

    describe('project typesetter cache across local projects', () => {
        const project = (docUrl: string) => ({ docUrl }) as Project;

        const createClosedProjectCache = async () => {
            const FDBFactory = require('fake-indexeddb/lib/FDBFactory');
            (global as any).indexedDB = new FDBFactory();

            const db = await new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open('texlyre-project-closed', 1);
                request.onupgradeneeded = () => {
                    const store = request.result.createObjectStore('files', {
                        keyPath: 'id',
                    });
                    store.createIndex('path', 'path', { unique: false });
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });

            const tx = db.transaction('files', 'readwrite');
            tx.objectStore('files').put({
                id: 'cache',
                path: '/.texlyre_cache/__tex/pkg.sty',
                content: 'cached',
            });
            await new Promise<void>((resolve) => {
                tx.oncomplete = () => resolve();
            });
            db.close();
        };

        it('should detect cache data in another active local project', async () => {
            await createClosedProjectCache();

            await expect(
                hasProjectTypesetterCache([project('yjs:closed')]),
            ).resolves.toBe(true);
        });

        it('should clear cache data in another active local project', async () => {
            await createClosedProjectCache();

            await expect(
                deleteProjectTypesetterCaches([project('yjs:closed')]),
            ).resolves.toBe(1);

            const db = await new Promise<IDBDatabase>((resolve, reject) => {
                const request = indexedDB.open('texlyre-project-closed');
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            const tx = db.transaction('files', 'readonly');
            const remaining = await new Promise((resolve, reject) => {
                const request = tx.objectStore('files').getAll();
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            db.close();

            expect(remaining).toEqual([]);
        });
    });

    describe('current project typesetter cache', () => {
        beforeEach(() => {
            (fileStoreService.getCurrentProjectId as jest.Mock).mockReturnValue(
                'open',
            );
        });

        it('should detect SwiftLaTeX and BusyTeX cache files', async () => {
            (fileStoreService.getAllFiles as jest.Mock).mockResolvedValue([
                {
                    id: 'swift-cache',
                    path: '/.texlyre_cache/__tex/pkg.sty',
                    isDeleted: false,
                },
                {
                    id: 'busy-cache',
                    path: '/.texlyre_cache/__btex/remote/font.otf',
                    isDeleted: false,
                },
                { id: 'source', path: '/main.tex', isDeleted: false },
            ]);

            await expect(hasCurrentProjectTypesetterCache()).resolves.toBe(true);
            expect(fileStoreService.getAllFiles).toHaveBeenCalledWith(
                true,
                false,
                false,
            );
        });

        it('should include deleted cache entries because they still use storage', async () => {
            (fileStoreService.getAllFiles as jest.Mock).mockResolvedValue([
                {
                    id: 'old-cache',
                    path: '/.texlyre_cache/__tex/pkg.sty',
                    isDeleted: true,
                },
            ]);

            await expect(hasCurrentProjectTypesetterCache()).resolves.toBe(true);
        });

        it('should hard-delete only current-project typesetter cache entries', async () => {
            (fileStoreService.getAllFiles as jest.Mock).mockResolvedValue([
                {
                    id: 'swift-cache',
                    path: '/.texlyre_cache/__tex/pkg.sty',
                    isDeleted: false,
                },
                {
                    id: 'busy-cache',
                    path: '/.texlyre_cache/__btex/.misses.json',
                    isDeleted: false,
                },
                { id: 'source', path: '/main.tex', isDeleted: false },
            ]);

            await expect(deleteCurrentProjectTypesetterCache()).resolves.toBe(2);
            expect(fileStoreService.batchDeleteFiles).toHaveBeenCalledWith(
                ['swift-cache', 'busy-cache'],
                {
                    showDeleteDialog: false,
                    hardDelete: true,
                },
            );
        });

        it('should not inspect files when no project is open', async () => {
            (fileStoreService.getCurrentProjectId as jest.Mock).mockReturnValue('');
        (fileStoreService.setProjectId as jest.Mock).mockReset();

            await expect(hasCurrentProjectTypesetterCache()).resolves.toBe(false);
            expect(fileStoreService.getAllFiles).not.toHaveBeenCalled();
        });
    });

    describe('Typst package cache', () => {
        const typstRequest = {
            url: 'https://packages.typst.org/preview/cetz-0.4.2.tar.gz',
        } as Request;
        const typstIndexRequest = {
            url: 'https://packages.typst.org/preview/index.json',
        } as Request;
        const appRequest = {
            url: 'https://texlyre.org/assets/app.js',
        } as Request;

        it('should detect Typst packages in Cache Storage', async () => {
            const cache = {
                keys: jest.fn().mockResolvedValue([typstRequest, appRequest]),
                delete: jest.fn(),
            };
            cacheNamesSpy.mockResolvedValue(['texlyre-v1']);
            cacheOpenSpy.mockResolvedValue(cache);

            await expect(hasTypstPackageCache()).resolves.toBe(true);
        });

        it('should ignore unrelated Cache Storage entries', async () => {
            const cache = {
                keys: jest.fn().mockResolvedValue([appRequest]),
                delete: jest.fn(),
            };
            cacheNamesSpy.mockResolvedValue(['texlyre-v1']);
            cacheOpenSpy.mockResolvedValue(cache);

            await expect(hasTypstPackageCache()).resolves.toBe(false);
        });

        it('should delete only Typst package registry entries', async () => {
            const deleteSpy = jest.fn().mockResolvedValue(true);
            const cache = {
                keys: jest
                    .fn()
                    .mockResolvedValue([typstRequest, typstIndexRequest, appRequest]),
                delete: deleteSpy,
            };
            cacheNamesSpy.mockResolvedValue(['texlyre-v1']);
            cacheOpenSpy.mockResolvedValue(cache);

            await expect(deleteTypstPackageCache()).resolves.toBe(2);
            expect(deleteSpy).toHaveBeenCalledTimes(2);
            expect(deleteSpy).toHaveBeenCalledWith(typstRequest);
            expect(deleteSpy).toHaveBeenCalledWith(typstIndexRequest);
            expect(deleteSpy).not.toHaveBeenCalledWith(appRequest);
        });

        it('should tolerate browsers without Cache Storage', async () => {
            delete (global as any).caches;

            await expect(hasTypstPackageCache()).resolves.toBe(false);
            await expect(deleteTypstPackageCache()).resolves.toBe(0);
        });
    });

    describe('deleteDatabases', () => {
        const mockDeletions = (outcomes: ('success' | 'error')[]) => {
            for (const outcome of outcomes) {
                deleteDatabaseSpy.mockImplementationOnce(() => {
                    const request: any = {};
                    Promise.resolve().then(() => {
                        if (outcome === 'success') request.onsuccess?.();
                        else request.onerror?.();
                    });
                    return request;
                });
            }
        };

        it('should count the databases it removed', async () => {
            mockDeletions(['success', 'success']);

            await expect(deleteDatabases(['db1', 'db2'])).resolves.toBe(2);
        });

        it('should continue after a failure', async () => {
            mockDeletions(['error', 'success']);

            await expect(deleteDatabases(['db1', 'db2'])).resolves.toBe(1);
        });
    });
});
