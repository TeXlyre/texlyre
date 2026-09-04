import { fileStoreService } from '@src/services/FileStoreService';
import type { FileNode } from '@src/types/files';

describe.skip('FileStoreService', () => {
    beforeEach(async () => {
        const FDBFactory = require('fake-indexeddb/lib/FDBFactory');
        global.indexedDB = new FDBFactory();
        await fileStoreService.initialize('yjs:test-project');
    });

    afterEach(async () => {
        try {
            const files = await fileStoreService.getAllFiles();
            for (const file of files) {
                await fileStoreService.deleteFile(file.id);
            }
            await fileStoreService.cleanup();
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    describe('File CRUD Operations', () => {
        it('should store and retrieve a file', async () => {
            const file: FileNode = {
                id: 'file-1',
                name: 'test.tex',
                path: '/test.tex',
                type: 'file',
                content: new TextEncoder().encode('Hello World').buffer,
                lastModified: Date.now(),
                size: 11,
                mimeType: 'text/plain',
                isBinary: false,
            };

            await fileStoreService.storeFile(file);
            const retrieved = await fileStoreService.getFile('file-1');

            expect(retrieved).toBeDefined();
            expect(retrieved?.name).toBe('test.tex');
            expect(retrieved?.path).toBe('/test.tex');
        });

        it('should update existing file', async () => {
            const file: FileNode = {
                id: 'file-2',
                name: 'update.tex',
                path: '/update.tex',
                type: 'file',
                content: new TextEncoder().encode('Original').buffer,
                lastModified: Date.now(),
                size: 8,
                mimeType: 'text/plain',
                isBinary: false,
            };

            await fileStoreService.storeFile(file);

            const updated = {
                ...file,
                content: new TextEncoder().encode('Updated').buffer,
                size: 7,
            };
            await fileStoreService.storeFile(updated);

            const retrieved = await fileStoreService.getFile('file-2');
            const content = new TextDecoder().decode(retrieved?.content as ArrayBuffer);

            expect(content).toBe('Updated');
        });

        it('should delete a file', async () => {
            const file: FileNode = {
                id: 'file-3',
                name: 'delete.tex',
                path: '/delete.tex',
                type: 'file',
                content: new ArrayBuffer(0),
                lastModified: Date.now(),
                size: 0,
                mimeType: 'text/plain',
                isBinary: false,
            };

            await fileStoreService.storeFile(file);
            await fileStoreService.deleteFile('file-3');

            const retrieved = await fileStoreService.getFile('file-3');
            expect(retrieved).toBeUndefined();
        });
    });

    describe('File Queries', () => {
        beforeEach(async () => {
            const files: FileNode[] = [
                {
                    id: 'f1',
                    name: 'main.tex',
                    path: '/main.tex',
                    type: 'file',
                    content: new ArrayBuffer(0),
                    lastModified: Date.now(),
                    size: 0,
                    mimeType: 'text/plain',
                    isBinary: false,
                },
                {
                    id: 'f2',
                    name: 'intro.tex',
                    path: '/chapters/intro.tex',
                    type: 'file',
                    content: new ArrayBuffer(0),
                    lastModified: Date.now(),
                    size: 0,
                    mimeType: 'text/plain',
                    isBinary: false,
                },
            ];

            for (const file of files) {
                await fileStoreService.storeFile(file);
            }
        });

        it('should get all files', async () => {
            const files = await fileStoreService.getAllFiles();

            expect(files.length).toBeGreaterThanOrEqual(2);
            expect(files.some(f => f.name === 'main.tex')).toBe(true);
            expect(files.some(f => f.name === 'intro.tex')).toBe(true);
        });

        it('should get files by directory', async () => {
            const files = await fileStoreService.getFilesByDirectory('/chapters');

            expect(files.some(f => f.name === 'intro.tex')).toBe(true);
            expect(files.some(f => f.name === 'main.tex')).toBe(false);
        });
    });

    describe('File Linking', () => {
        it('should link file to document', async () => {
            const file: FileNode = {
                id: 'link-1',
                name: 'linked.tex',
                path: '/linked.tex',
                type: 'file',
                content: new ArrayBuffer(0),
                lastModified: Date.now(),
                size: 0,
                mimeType: 'text/plain',
                isBinary: false,
            };

            await fileStoreService.storeFile(file);
            await fileStoreService.linkFileToDocument('link-1', 'doc-123');

            const retrieved = await fileStoreService.getFile('link-1');
            expect(retrieved?.documentId).toBe('doc-123');
        });

        it('should unlink file from document', async () => {
            const file: FileNode = {
                id: 'unlink-1',
                name: 'unlinked.tex',
                path: '/unlinked.tex',
                type: 'file',
                content: new ArrayBuffer(0),
                lastModified: Date.now(),
                size: 0,
                mimeType: 'text/plain',
                isBinary: false,
                documentId: 'doc-456',
            };

            await fileStoreService.storeFile(file);
            await fileStoreService.unlinkFileFromDocument('unlink-1');

            const retrieved = await fileStoreService.getFile('unlink-1');
            expect(retrieved?.documentId).toBeUndefined();
        });
    });

    describe('Batch Operations', () => {
        it('should batch store multiple files', async () => {
            const files: FileNode[] = [
                {
                    id: 'batch-1',
                    name: 'file1.tex',
                    path: '/file1.tex',
                    type: 'file',
                    content: new ArrayBuffer(0),
                    lastModified: Date.now(),
                    size: 0,
                    mimeType: 'text/plain',
                    isBinary: false,
                },
                {
                    id: 'batch-2',
                    name: 'file2.tex',
                    path: '/file2.tex',
                    type: 'file',
                    content: new ArrayBuffer(0),
                    lastModified: Date.now(),
                    size: 0,
                    mimeType: 'text/plain',
                    isBinary: false,
                },
            ];

            await fileStoreService.batchStoreFiles(files);

            const file1 = await fileStoreService.getFile('batch-1');
            const file2 = await fileStoreService.getFile('batch-2');

            expect(file1).toBeDefined();
            expect(file2).toBeDefined();
        });
    });
});