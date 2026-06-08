import {
    hasComments,
    cleanText,
    cleanContent,
    processFile,
    processFilesWithStats,
} from '@src/utils/fileCommentUtils';
import { commentService } from '@src/services/CommentService';
import type { FileNode } from '@src/types/files';

const wrap = (text: string) => {
    const { openTag, closeTag } = commentService.addComment('a note', 'tester');
    return `${openTag}${text}${closeTag}`;
};

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
    });

    describe('cleanContent', () => {
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