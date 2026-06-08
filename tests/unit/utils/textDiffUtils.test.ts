import {
    threeWayMerge,
    computeReplacementChange,
} from '@src/utils/textDiffUtils';

describe('Text Diff Utils', () => {
    describe('threeWayMerge', () => {
        it('should return local when local and remote are identical', () => {
            const result = threeWayMerge('base', 'same', 'same');

            expect(result.merged).toBe('same');
            expect(result.hasConflicts).toBe(false);
        });

        it('should take remote when local is unchanged from base', () => {
            const result = threeWayMerge('base', 'base', 'remote change');

            expect(result.merged).toBe('remote change');
            expect(result.hasConflicts).toBe(false);
        });

        it('should take local when remote is unchanged from base', () => {
            const result = threeWayMerge('base', 'local change', 'base');

            expect(result.merged).toBe('local change');
            expect(result.hasConflicts).toBe(false);
        });

        it('should merge non-overlapping changes without conflicts', () => {
            const base = 'line1\nline2\nline3';
            const local = 'local1\nline2\nline3';
            const remote = 'line1\nline2\nremote3';

            const result = threeWayMerge(base, local, remote);

            expect(result.hasConflicts).toBe(false);
            expect(result.merged).toContain('local1');
            expect(result.merged).toContain('remote3');
        });

        it('should mark conflicts on overlapping changes', () => {
            const base = 'line1\nline2\nline3';
            const local = 'line1\nlocalchange\nline3';
            const remote = 'line1\nremotechange\nline3';

            const result = threeWayMerge(base, local, remote);

            expect(result.hasConflicts).toBe(true);
            expect(result.merged).toContain('<<<<<<< local');
            expect(result.merged).toContain('=======');
            expect(result.merged).toContain('>>>>>>> remote');
        });

        it('should handle all three inputs empty', () => {
            const result = threeWayMerge('', '', '');

            expect(result.merged).toBe('');
            expect(result.hasConflicts).toBe(false);
        });
    });

    describe('computeReplacementChange', () => {
        it('should return empty array for identical strings', () => {
            expect(computeReplacementChange('same', 'same')).toEqual([]);
        });

        it('should return empty array when only line endings differ', () => {
            expect(computeReplacementChange('a\r\nb', 'a\nb')).toEqual([]);
        });

        it('should produce a deletion when original is longer', () => {
            const changes = computeReplacementChange('hello world', 'hello');

            expect(changes).toHaveLength(1);
            expect(changes[0].from).toBe(5);
            expect(changes[0].to).toBe(11);
            expect(changes[0].insert).toBe('');
        });

        it('should produce an insertion when formatted is longer', () => {
            const changes = computeReplacementChange('hello', 'hello world');

            expect(changes).toHaveLength(1);
            expect(changes[0].from).toBe(5);
            expect(changes[0].to).toBe(5);
            expect(changes[0].insert).toBe(' world');
        });

        it('should compute a middle replacement using prefix and suffix', () => {
            const changes = computeReplacementChange('foo BAR baz', 'foo QUX baz');

            expect(changes).toHaveLength(1);
            expect(changes[0].from).toBe(4);
            expect(changes[0].to).toBe(7);
            expect(changes[0].insert).toBe('QUX');
        });

        it('should produce a change that reconstructs the formatted text', () => {
            const original = 'the quick brown fox';
            const formatted = 'the slow red fox';

            const [change] = computeReplacementChange(original, formatted);
            const reconstructed =
                original.substring(0, change.from) +
                change.insert +
                original.substring(change.to);

            expect(reconstructed).toBe(formatted);
        });

        it('should insert the whole string when original is empty', () => {
            expect(computeReplacementChange('', 'hello')).toEqual([
                { from: 0, to: 0, insert: 'hello' },
            ]);
        });

        it('should delete everything when formatted is empty', () => {
            expect(computeReplacementChange('hello', '')).toEqual([
                { from: 0, to: 5, insert: '' },
            ]);
        });

        it('should return empty array when both strings are empty', () => {
            expect(computeReplacementChange('', '')).toEqual([]);
        });

        it('should reconstruct correctly for a multibyte-only change', () => {
            const original = 'café';
            const formatted = 'cafè';

            const [change] = computeReplacementChange(original, formatted);
            const reconstructed =
                original.substring(0, change.from) +
                change.insert +
                original.substring(change.to);

            expect(reconstructed).toBe(formatted);
        });
    });
});