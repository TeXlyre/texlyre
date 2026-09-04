import { File as NodeFile } from 'node:buffer';

import { batchExtractArchive } from '@src/utils/archiveUtils';
import JSZip from 'jszip';

describe('Archive Utils', () => {
    const createZipFile = async (
        setup: (zip: JSZip) => void,
        name = 'test.zip',
    ): Promise<File> => {
        const zip = new JSZip();
        setup(zip);

        const data = await zip.generateAsync({ type: 'uint8array' });

        return new NodeFile([data], name, {
            type: 'application/zip',
        }) as unknown as File;
    };

    describe('batchExtractArchive', () => {
        it('should extract files from zip', async () => {
            const archiveFile = await createZipFile((zip) => {
                zip.file('main.tex', '\\documentclass{article}');
                zip.file('chapters/intro.tex', '\\chapter{Introduction}');
                zip.folder('images');
            });

            const result = await batchExtractArchive(archiveFile, '/extracted');

            expect(result.files).toHaveLength(2);
            expect(result.directories.length).toBeGreaterThan(0);

            const mainFile = result.files.find((file) => file.name === 'main.tex');
            expect(mainFile).toBeDefined();
            expect(mainFile?.path).toBe('/extracted/main.tex');

            const chapterFile = result.files.find(
                (file) => file.name === 'intro.tex',
            );
            expect(chapterFile).toBeDefined();
            expect(chapterFile?.path).toBe('/extracted/chapters/intro.tex');
        });

        it('should handle nested directories', async () => {
            const archiveFile = await createZipFile((zip) => {
                zip.file('level1/level2/level3/deep.tex', 'deep content');
            });

            const result = await batchExtractArchive(archiveFile, '/');

            const deepFile = result.files.find(
                (file) => file.name === 'deep.tex',
            );

            expect(deepFile?.path).toBe('/level1/level2/level3/deep.tex');

            expect(
                result.directories.some(
                    (directory) => directory.path === '/level1',
                ),
            ).toBe(true);

            expect(
                result.directories.some(
                    (directory) => directory.path === '/level1/level2',
                ),
            ).toBe(true);

            expect(
                result.directories.some(
                    (directory) => directory.path === '/level1/level2/level3',
                ),
            ).toBe(true);
        });

        it('should handle binary files', async () => {
            const archiveFile = await createZipFile((zip) => {
                const binaryData = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
                zip.file('image.png', binaryData);
            });

            const result = await batchExtractArchive(archiveFile, '/');

            const imageFile = result.files.find(
                (file) => file.name === 'image.png',
            );

            expect(imageFile).toBeDefined();
            expect(imageFile?.isBinary).toBe(true);
            expect(imageFile?.size).toBe(4);
        });

        it('should preserve files in __MACOSX directories', async () => {
            const archiveFile = await createZipFile((zip) => {
                zip.file('main.tex', 'content');
                zip.file('__MACOSX/._main.tex', 'metadata');
            });

            const result = await batchExtractArchive(archiveFile, '/');

            const mainFile = result.files.find(
                (file) => file.path === '/main.tex',
            );
            const metadataFile = result.files.find(
                (file) => file.path === '/__MACOSX/._main.tex',
            );

            expect(mainFile).toBeDefined();
            expect(metadataFile).toBeDefined();
        });

        it('should handle empty zip', async () => {
            const archiveFile = await createZipFile(
                () => { },
                'empty.zip',
            );

            const result = await batchExtractArchive(archiveFile, '/');

            expect(result.files).toHaveLength(0);
            expect(result.directories).toHaveLength(0);
        });
    });
});
