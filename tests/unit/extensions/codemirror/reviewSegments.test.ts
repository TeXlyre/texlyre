import {
    computeReviewSegments,
    countReviewChanges,
    readReviewBody,
    restoreReviewBody,
} from '@src/extensions/codemirror/review/reviewSegments';

const commentOpen =
    "`<### comment id: ccc, user: tester, time: 1, content: 'n', responses: [], resolved: false ###>`";
const commentClose = '`</### comment id: ccc ###>`';

const types = (original: string, current: string) =>
    computeReviewSegments(original, current).map((segment) => segment.type);

describe('reviewSegments', () => {
    it('should return a single equal segment for unchanged text', () => {
        expect(computeReviewSegments('same', 'same')).toEqual([
            { type: 'equal', text: 'same', from: 0, to: 4 },
        ]);
    });

    it('should return nothing for two empty texts', () => {
        expect(computeReviewSegments('', '')).toEqual([]);
    });

    it('should mark a pure insertion', () => {
        expect(computeReviewSegments('', 'added')).toEqual([
            { type: 'insert', text: 'added', from: 0, to: 5 },
        ]);
    });

    it('should mark a pure deletion with a zero-width range', () => {
        expect(computeReviewSegments('gone', '')).toEqual([
            { type: 'delete', text: 'gone', from: 0, to: 0 },
        ]);
    });

    it('should keep insert ranges addressable in the current text', () => {
        const current = 'hello brave world';
        const segment = computeReviewSegments('hello world', current).find(
            (entry) => entry.type === 'insert',
        );

        expect(current.slice(segment!.from, segment!.to)).toBe(segment!.text);
    });

    it('should place a deletion at its position in the current text', () => {
        const segments = computeReviewSegments('hello brave world', 'hello world');
        const deletion = segments.find((segment) => segment.type === 'delete');

        expect(deletion!.text.trim()).toBe('brave');
        expect(deletion!.from).toBe(deletion!.to);
        expect('hello world'.slice(0, deletion!.from)).toBe('hello ');
    });

    it('should report both sides of a replacement', () => {
        expect(types('cat', 'dog')).toEqual(['delete', 'insert']);
    });

    it('should cover the whole current text with equal and insert segments', () => {
        const current = 'the quick brown fox';
        const covered = computeReviewSegments('the slow fox', current)
            .filter((segment) => segment.type !== 'delete')
            .map((segment) => segment.text)
            .join('');

        expect(covered).toBe(current);
    });

    it('should count inserted and deleted characters', () => {
        const segments = computeReviewSegments('one two', 'one three');

        expect(countReviewChanges(segments)).toEqual({ inserted: 5, deleted: 3 });
    });

    it('should align changes to whole words for readability', () => {
        const segments = computeReviewSegments('abc', 'axc');

        expect(segments.map((segment) => segment.text)).toEqual(['abc', 'axc']);
    });

    it('should count nothing for unchanged text', () => {
        expect(countReviewChanges(computeReviewSegments('same', 'same'))).toEqual({
            inserted: 0,
            deleted: 0,
        });
    });

    describe('readReviewBody', () => {
        it('should return the raw text when there is nothing nested', () => {
            const body = readReviewBody('plain');

            expect(body.text).toBe('plain');
            expect(body.docOffset(3)).toBe(3);
        });

        it('should hide a nested comment from the body text', () => {
            const raw = `a${commentOpen}x${commentClose}b`;

            expect(readReviewBody(raw).text).toBe('axb');
        });

        it('should map body offsets back onto document offsets', () => {
            const raw = `a${commentOpen}x${commentClose}b`;
            const body = readReviewBody(raw);

            expect(body.docOffset(0)).toBe(0);
            expect(body.docOffset(1)).toBe(raw.indexOf('x'));
            expect(body.docOffset(2)).toBe(raw.lastIndexOf('b'));
            expect(body.docOffset(3)).toBe(raw.length);
        });

        it('should diff against the masked body instead of the tag syntax', () => {
            const raw = `${commentOpen}new${commentClose}`;

            expect(types('old', readReviewBody(raw).text)).toEqual([
                'delete',
                'insert',
            ]);
        });
    });

    describe('restoreReviewBody', () => {
        it('should return the original text when there is nothing nested', () => {
            expect(restoreReviewBody('new', 'old')).toBe('old');
        });

        it('should wrap the original text in a nested comment', () => {
            const raw = `${commentOpen}new${commentClose}`;

            expect(restoreReviewBody(raw, 'old')).toBe(
                `${commentOpen}old${commentClose}`,
            );
        });

        it('should ignore an unbalanced comment tag', () => {
            expect(restoreReviewBody(`${commentOpen}new`, 'old')).toBe('old');
        });
    });
});
