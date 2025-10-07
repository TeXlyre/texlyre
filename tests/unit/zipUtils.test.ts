import { batchExtractZip } from '@src/utils/zipUtils';
import JSZip from 'jszip';

describe('Zip Utils', () => {
    describe('batchExtractZip', () => {
        it('should extract files from zip', async () => {
            const zip = new JSZip();

            zip.file('main.tex', '\\documentclass{article}');
            zip.file('chapters/intro.tex', '\\chapter{Introduction}');
            zip.folder('images');

            const zipBlob = await zip.generateAsync({ type: 'arraybuffer' });
            const zipFile = {
                arrayBuffer: async () => zipBlob,
                name: 'test.zip',
                type: 'application/zip',
            } as File;

            const result = await batchExtractZip(zipFile, '/extracted');

            expect(result.files.length).toBe(2);
            expect(result.directories.length).toBeGreaterThan(0);

            const mainFile = result.files.find(f => f.name === 'main.tex');
            expect(mainFile).toBeDefined();
            expect(mainFile?.path).toBe('/extracted/main.tex');

            const chapterFile = result.files.find(f => f.name === 'intro.tex');
            expect(chapterFile).toBeDefined();
            expect(chapterFile?.path).toBe('/extracted/chapters/intro.tex');
        });

        it('should handle nested directories', async () => {
            const zip = new JSZip();

            zip.file('level1/level2/level3/deep.tex', 'deep content');

            const zipBlob = await zip.generateAsync({ type: 'arraybuffer' });
            const zipFile = {
                arrayBuffer: async () => zipBlob,
                name: 'test.zip',
                type: 'application/zip',
            } as File;

            const result = await batchExtractZip(zipFile, '/');

            const deepFile = result.files.find(f => f.name === 'deep.tex');
            expect(deepFile?.path).toBe('/level1/level2/level3/deep.tex');

            expect(result.directories).toContain('/level1');
            expect(result.directories).toContain('/level1/level2');
            expect(result.directories).toContain('/level1/level2/level3');
        });

        it('should handle binary files', async () => {
            const zip = new JSZip();

            const binaryData = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);
            zip.file('image.png', binaryData);

            const zipBlob = await zip.generateAsync({ type: 'arraybuffer' });
            const zipFile = {
                arrayBuffer: async () => zipBlob,
                name: 'test.zip',
                type: 'application/zip',
            } as File;

            const result = await batchExtractZip(zipFile, '/');

            const imageFile = result.files.find(f => f.name === 'image.png');
            expect(imageFile?.isBinary).toBe(true);
        });

        it('should skip __MACOSX directories', async () => {
            const zip = new JSZip();

            zip.file('main.tex', 'content');
            zip.file('__MACOSX/._main.tex', 'metadata');

            const zipBlob = await zip.generateAsync({ type: 'arraybuffer' });
            const zipFile = {
                arrayBuffer: async () => zipBlob,
                name: 'test.zip',
                type: 'application/zip',
            } as File;

            const result = await batchExtractZip(zipFile, '/');

            expect(result.files.length).toBe(1);
            expect(result.files[0].name).toBe('main.tex');
        });

        it('should handle empty zip', async () => {
            const zip = new JSZip();

            const zipBlob = await zip.generateAsync({ type: 'arraybuffer' });
            const zipFile = {
                arrayBuffer: async () => zipBlob,
                name: 'empty.zip',
                type: 'application/zip',
            } as File;

            const result = await batchExtractZip(zipFile, '/');

            expect(result.files.length).toBe(0);
            expect(result.directories.length).toBe(0);
        });
    });
});