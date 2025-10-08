import { fileStorageService } from '@src/services/FileStorageService';
import type { FileNode } from '@src/types/files';

describe.skip('FileStorageService', () => {
    beforeEach(async () => {
        const FDBFactory = require('fake-indexeddb/lib/FDBFactory');
        global.indexedDB = new FDBFactory();
        await fileStorageService.initialize('yjs:test-project');
    });

    afterEach(async () => {
        try {
            const files = await fileStorageService.getAllFiles();
            for (const file of files) {
                await fileStorageService.deleteFile(file.id);
            }
            await fileStorageService.cleanup();
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

            await fileStorageService.storeFile(file);
            const retrieved = await fileStorageService.getFile('file-1');

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

            await fileStorageService.storeFile(file);

            const updated = {
                ...file,
                content: new TextEncoder().encode('Updated').buffer,
                size: 7,
            };
            await fileStorageService.storeFile(updated);

            const retrieved = await fileStorageService.getFile('file-2');
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

            await fileStorageService.storeFile(file);
            await fileStorageService.deleteFile('file-3');

            const retrieved = await fileStorageService.getFile('file-3');
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
                await fileStorageService.storeFile(file);
            }
        });

        it('should get all files', async () => {
            const files = await fileStorageService.getAllFiles();

            expect(files.length).toBeGreaterThanOrEqual(2);
            expect(files.some(f => f.name === 'main.tex')).toBe(true);
            expect(files.some(f => f.name === 'intro.tex')).toBe(true);
        });

        it('should get files by directory', async () => {
            const files = await fileStorageService.getFilesByDirectory('/chapters');

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

            await fileStorageService.storeFile(file);
            await fileStorageService.linkFileToDocument('link-1', 'doc-123');

            const retrieved = await fileStorageService.getFile('link-1');
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

            await fileStorageService.storeFile(file);
            await fileStorageService.unlinkFileFromDocument('unlink-1');

            const retrieved = await fileStorageService.getFile('unlink-1');
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

            await fileStorageService.batchStoreFiles(files);

            const file1 = await fileStorageService.getFile('batch-1');
            const file2 = await fileStorageService.getFile('batch-2');

            expect(file1).toBeDefined();
            expect(file2).toBeDefined();
        });
    });
});