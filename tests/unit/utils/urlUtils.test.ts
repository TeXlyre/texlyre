import {
    isValidYjsUrl,
    parseUrlFragments,
    buildUrlWithFragments,
} from '@src/utils/urlUtils';

describe('URL Utils', () => {
    describe('isValidYjsUrl', () => {
        it('should validate correct yjs URLs', () => {
            expect(isValidYjsUrl('yjs:abc123')).toBe(true);
            expect(isValidYjsUrl('yjs:test-project-456')).toBe(true);
        });

        it('should reject invalid URLs', () => {
            expect(isValidYjsUrl('')).toBe(false);
            expect(isValidYjsUrl('abc123')).toBe(false);
            expect(isValidYjsUrl('http://example.com')).toBe(false);
        });
    });

    describe('parseUrlFragments', () => {
        it('should parse simple yjs URL', () => {
            const result = parseUrlFragments('yjs:project123');

            expect(result.yjsUrl).toBe('yjs:project123');
            expect(result.docId).toBeUndefined();
            expect(result.filePath).toBeUndefined();
        });

        it('should parse URL with docId', () => {
            const result = parseUrlFragments('yjs:project123&doc:doc456');

            expect(result.yjsUrl).toBe('yjs:project123');
            expect(result.docId).toBe('doc456');
            expect(result.filePath).toBeUndefined();
        });

        it('should parse URL with filePath', () => {
            const result = parseUrlFragments('yjs:project123&file:%2Fmain.tex');

            expect(result.yjsUrl).toBe('yjs:project123');
            expect(result.docId).toBeUndefined();
            expect(result.filePath).toBe('/main.tex');
        });

        it('should parse URL with both docId and filePath', () => {
            const result = parseUrlFragments('yjs:project123&doc:doc456&file:%2Fmain.tex');

            expect(result.yjsUrl).toBe('yjs:project123');
            expect(result.docId).toBe('doc456');
            expect(result.filePath).toBe('/main.tex');
        });

        it('should handle URL-encoded values', () => {
            const result = parseUrlFragments('yjs:project123&file:%2Fpath%2Fto%2Ffile.tex');

            expect(result.filePath).toBe('/path/to/file.tex');
        });
    });

    describe('buildUrlWithFragments', () => {
        it('should build URL with only base', () => {
            const url = buildUrlWithFragments('yjs:project123');

            expect(url).toBe('yjs:project123');
        });

        it('should build URL with docId', () => {
            const url = buildUrlWithFragments('yjs:project123', 'doc456');

            expect(url).toBe('yjs:project123&doc:doc456');
        });

        it('should build URL with filePath', () => {
            const url = buildUrlWithFragments('yjs:project123', undefined, '/main.tex');

            expect(url).toBe('yjs:project123&file:%2Fmain.tex');
        });

        it('should build URL with both docId and filePath', () => {
            const url = buildUrlWithFragments('yjs:project123', 'doc456', '/main.tex');

            expect(url).toContain('yjs:project123');
            expect(url).toContain('doc:doc456');
            expect(url).toContain('file:%2Fmain.tex');
        });

        it('should properly encode special characters', () => {
            const url = buildUrlWithFragments('yjs:project123', undefined, '/path with spaces/file.tex');

            expect(url).toContain('file:%2Fpath%20with%20spaces%2Ffile.tex');
        });
    });

    describe('Round-trip parsing', () => {
        it('should maintain data through build->parse cycle', () => {
            const original = {
                baseUrl: 'yjs:test-project',
                docId: 'document-123',
                filePath: '/chapters/intro.tex',
            };

            const built = buildUrlWithFragments(
                original.baseUrl,
                original.docId,
                original.filePath
            );
            const parsed = parseUrlFragments(built);

            expect(parsed.yjsUrl).toBe(original.baseUrl);
            expect(parsed.docId).toBe(original.docId);
            expect(parsed.filePath).toBe(original.filePath);
        });
    });
});