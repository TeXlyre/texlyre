import {
    computeReviewSegments,
    countReviewChanges,
} from '@src/extensions/codemirror/review/reviewSegments';

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
});
