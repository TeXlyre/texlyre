import {
    deleteDatabase,
    deleteDatabases,
    closeActiveConnections,
    listReclaimableDatabases,
    projectDbNames,
} from '@src/utils/dbDeleteUtils';
import { fileStorageService } from '@src/services/FileStorageService';
import type { Project } from '@src/types/projects';

jest.mock('@src/services/FileStorageService', () => ({
    fileStorageService: {
        isConnectedToProject: jest.fn(),
        cleanup: jest.fn(),
        getCurrentProjectId: jest.fn().mockReturnValue(''),
    },
}));

describe('DB Delete Utils', () => {
    const deleteDatabaseSpy = jest.fn();
    const databasesSpy = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        deleteDatabaseSpy.mockReset();
        databasesSpy.mockReset();
        (fileStorageService.getCurrentProjectId as jest.Mock).mockReturnValue('');
        (global as any).indexedDB = {
            deleteDatabase: deleteDatabaseSpy,
            databases: databasesSpy,
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
            (fileStorageService.isConnectedToProject as jest.Mock).mockReturnValue(
                true,
            );

            await closeActiveConnections('proj1');

            expect(fileStorageService.cleanup).toHaveBeenCalled();
        });

        it('should do nothing when not connected', async () => {
            (fileStorageService.isConnectedToProject as jest.Mock).mockReturnValue(
                false,
            );

            await closeActiveConnections('proj1');

            expect(fileStorageService.cleanup).not.toHaveBeenCalled();
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

        it('should report the typesetter cache', async () => {
            listNames(['EM_FS_/texlyre', 'texlyre-auth']);

            await expect(listReclaimableDatabases([])).resolves.toEqual([
                { name: 'EM_FS_/texlyre', kind: 'typesetter-cache' },
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

        it('should keep the open project even when it is missing from the list', async () => {
            (fileStorageService.getCurrentProjectId as jest.Mock).mockReturnValue(
                'open',
            );
            listNames(['texlyre-project-open']);

            await expect(listReclaimableDatabases([])).resolves.toEqual([]);
        });

        it('should ignore databases outside the project namespace', async () => {
            listNames(['texlyre-auth', 'texlyre-share-target', 'unrelated']);

            await expect(listReclaimableDatabases([])).resolves.toEqual([]);
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
