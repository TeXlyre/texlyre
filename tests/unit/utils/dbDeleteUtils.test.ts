import {
    deleteDatabase,
    closeActiveConnections,
    projectDbNames,
} from '@src/utils/dbDeleteUtils';
import { fileStorageService } from '@src/services/FileStorageService';

jest.mock('@src/services/FileStorageService', () => ({
    fileStorageService: {
        isConnectedToProject: jest.fn(),
        cleanup: jest.fn(),
    },
}));

describe('DB Delete Utils', () => {
    const deleteDatabaseSpy = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();

        deleteDatabaseSpy.mockReset();
        (global as any).indexedDB = {
            deleteDatabase: deleteDatabaseSpy,
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
});