import {
    hasComments,
    cleanText,
    cleanContent,
    processFile,
    processFilesWithStats,
} from '@src/utils/fileCommentUtils';
import { commentService } from '@src/services/CommentService';
import { reviewService } from '@src/services/ReviewService';
import type { FileNode } from '@src/types/files';

const wrap = (text: string) => {
    const { openTag, closeTag } = commentService.addComment('a note', 'tester');
    return `${openTag}${text}${closeTag}`;
};

const reviewWrap = (original: string, text: string) => {
    const { openTag, closeTag } = reviewService.createReview(original, 'tester');
    return `${openTag}${text}${closeTag}`;
};

const rawWrap = (id: string, text: string) =>
    `\`<### comment id: ${id}, user: tester, time: 1700000000000, content: 'a note', responses: [], resolved: false ###>\`${text}\`</### comment id: ${id} ###>\``;

describe('File Comment Utils', () => {
    describe('hasComments', () => {
        it('should detect comments in a string', () => {
            expect(hasComments(wrap('hello'))).toBe(true);
        });

        it('should return false for plain text', () => {
            expect(hasComments('just some text')).toBe(false);
        });

        it('should detect comments in an ArrayBuffer', () => {
            const buffer = new TextEncoder().encode(wrap('hi')).buffer;
            expect(hasComments(buffer)).toBe(true);
        });

        it('should return false for a buffer without comments', () => {
            const buffer = new TextEncoder().encode('plain content').buffer;
            expect(hasComments(buffer)).toBe(false);
        });

        it('should detect comments whose id starts with a dash', () => {
            expect(hasComments(rawWrap('-XyZ_09', 'hello'))).toBe(true);
        });

        it('should detect tags wrapped across lines by a formatter', () => {
            const wrapped = `\`<### comment\nid: wrapped, user: tester, time: 1700000000000, content: 'a note', responses: [], resolved: false ###>\`kept\`</### comment id: wrapped ###>\``;
            expect(hasComments(wrapped)).toBe(true);
        });

        it('should detect reviews in a string', () => {
            expect(hasComments(reviewWrap('old', 'new'))).toBe(true);
        });

        it('should detect reviews in an ArrayBuffer', () => {
            const buffer = new TextEncoder().encode(reviewWrap('old', 'new')).buffer;
            expect(hasComments(buffer)).toBe(true);
        });

        it('should not treat lookalike text as a comment', () => {
            expect(hasComments('a <### heading ###> b')).toBe(false);
        });
    });

    describe('cleanText', () => {
        it('should leave text without comments untouched', () => {
            expect(cleanText('no comments here')).toBe('no comments here');
        });

        it('should strip a comment and keep its inner content', () => {
            const input = `before ${wrap('kept')} after`;
            expect(cleanText(input)).toBe('before kept after');
        });

        it('should strip multiple comments', () => {
            const input = `${wrap('one')} mid ${wrap('two')}`;
            expect(cleanText(input)).toBe('one mid two');
        });

        it('should leave content unchanged when close tag is missing', () => {
            const { openTag } = commentService.addComment('x', 'tester');
            const input = `before ${openTag}kept without close`;
            expect(cleanText(input)).toBe(input);
        });

        it('should strip a comment whose id starts with a dash', () => {
            expect(cleanText(`before ${rawWrap('-XyZ_09', 'kept')} after`)).toBe(
                'before kept after',
            );
        });

        it('should strip nested comments', () => {
            const input = rawWrap('outer', `x ${rawWrap('inner', 'deep')} y`);
            expect(cleanText(input)).toBe('x deep y');
        });

        it('should strip adjacent comments without touching the gap', () => {
            const input = `${rawWrap('aaa', 'one')} mid ${rawWrap('bbb', 'two')}`;
            expect(cleanText(input)).toBe('one mid two');
        });

        it('should keep braces and math in the commented text', () => {
            const text = '\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}';
            expect(cleanText(`\\[ ${rawWrap('math', text)} \\]`)).toBe(
                `\\[ ${text} \\]`,
            );
        });

        it('should keep multi-line commented text', () => {
            expect(cleanText(rawWrap('multi', 'first\nsecond'))).toBe(
                'first\nsecond',
            );
        });

        it('should strip tags without surrounding backticks', () => {
            const input =
                "before <### comment id: nobt, user: tester, time: 1, content: 'a', responses: [], resolved: false ###>kept</### comment id: nobt ###> after";
            expect(cleanText(input)).toBe('before kept after');
        });

        it('should keep stripping after an unmatched open tag', () => {
            const orphan =
                "`<### comment id: orphan, user: tester, time: 1700000000000, content: 'a note', responses: [], resolved: false ###>`";
            const input = `${orphan}stray ${rawWrap('good', 'kept')} end`;

            expect(cleanText(input)).toBe(`${orphan}stray kept end`);
        });

        it('should strip every comment in a full document', () => {
            const orphan =
                "`<### comment id: orphan, user: tester, time: 1700000000000, content: 'a note', responses: [], resolved: false ###>`";
            const input = `${rawWrap('aaa', 'one')} ${orphan} ${rawWrap('bbb', 'two')} ${rawWrap('ccc', 'three')}`;

            expect(cleanText(input)).toBe(`one ${orphan} two three`);
        });

        it('should strip a review and keep the changed text', () => {
            expect(cleanText(`before ${reviewWrap('old', 'new')} after`)).toBe(
                'before new after',
            );
        });

        it('should strip a deletion review, dropping the removed text', () => {
            expect(cleanText(`before ${reviewWrap('gone ', '')}after`)).toBe(
                'before after',
            );
        });

        it('should strip comments and reviews from the same document', () => {
            const input = `${wrap('kept')} and ${reviewWrap('old', 'new')}`;
            expect(cleanText(input)).toBe('kept and new');
        });

        it('should strip a review nested inside a comment', () => {
            const input = rawWrap('outer', `x ${reviewWrap('old', 'new')} y`);
            expect(cleanText(input)).toBe('x new y');
        });

        it('should leave a stray close tag untouched', () => {
            const input = 'before `</### comment id: aaa ###>` after';
            expect(cleanText(input)).toBe(input);
        });
    });

    describe('cleanContent', () => {
        it('should clean review content', () => {
            expect(cleanContent(reviewWrap('old', 'new'))).toBe('new');
        });

        it('should clean string content', () => {
            expect(cleanContent(wrap('kept'))).toBe('kept');
        });

        it('should return the same buffer when no comments present', () => {
            const buffer = new TextEncoder().encode('plain').buffer;
            expect(cleanContent(buffer)).toBe(buffer);
        });

        it('should clean buffer content and return a buffer', () => {
            const buffer = new TextEncoder().encode(wrap('kept')).buffer;
            const result = cleanContent(buffer);

            expect(new TextDecoder().decode(result as ArrayBuffer)).toBe('kept');
        });
    });

    describe('processFile', () => {
        it('should skip directories', () => {
            const node = { type: 'directory' } as FileNode;
            expect(processFile(node)).toBe(node);
        });

        it('should skip binary files', () => {
            const node = { type: 'file', isBinary: true, content: 'x' } as FileNode;
            expect(processFile(node)).toBe(node);
        });

        it('should clean a copy by default', () => {
            const node = {
                type: 'file',
                isBinary: false,
                content: wrap('kept'),
            } as FileNode;

            const result = processFile(node);

            expect(result).not.toBe(node);
            expect(result.content).toBe('kept');
        });

        it('should mutate in place when requested', () => {
            const node = {
                type: 'file',
                isBinary: false,
                content: wrap('kept'),
            } as FileNode;

            const result = processFile(node, { inPlace: true });

            expect(result).toBe(node);
            expect(node.content).toBe('kept');
        });
    });

    describe('processFilesWithStats', () => {
        it('should count cleaned and skipped files', () => {
            const nodes = [
                { type: 'file', isBinary: false, content: wrap('x') },
                { type: 'file', isBinary: false, content: 'no comments' },
                { type: 'directory' },
                { type: 'file', isBinary: true, content: 'bin' },
            ] as FileNode[];

            const { stats } = processFilesWithStats(nodes);

            expect(stats.total).toBe(4);
            expect(stats.cleaned).toBe(1);
            expect(stats.skipped).toBe(3);
        });
    });
});