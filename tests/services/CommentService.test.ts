import { commentService } from '@src/services/CommentService';

const openTag = (
    id: string,
    options: {
        user?: string;
        time?: number;
        content?: string;
        responses?: string;
        resolved?: boolean;
        backticks?: boolean;
    } = {},
) => {
    const {
        user = 'tester',
        time = 1700000000000,
        content = 'a note',
        responses = '',
        resolved = false,
        backticks = true,
    } = options;

    const tag = `<### comment id: ${id}, user: ${user}, time: ${time}, content: '${content}', responses: [${responses}], resolved: ${resolved} ###>`;

    return backticks ? `\`${tag}\`` : tag;
};

const closeTag = (id: string, backticks = true) => {
    const tag = `</### comment id: ${id} ###>`;

    return backticks ? `\`${tag}\`` : tag;
};

const wrap = (
    id: string,
    text: string,
    options: Parameters<typeof openTag>[1] = {},
) => `${openTag(id, options)}${text}${closeTag(id, options.backticks !== false)}`;

const responseTag = (
    id: string,
    user: string,
    time: number,
    content: string,
) =>
    `<#### response id: '${id}', user: ${user}, time: ${time}, content: '${content}' ####/>`;

describe('CommentService', () => {
    describe('parseComments', () => {
        it('should return an empty list for text without comments', () => {
            expect(commentService.parseComments('plain \\LaTeX{} text')).toEqual(
                [],
            );
        });

        it('should parse a single comment with its metadata', () => {
            const content = `before ${wrap('abc123', 'kept')} after`;
            const [comment] = commentService.parseComments(content);

            expect(comment.id).toBe('abc123');
            expect(comment.user).toBe('tester');
            expect(comment.timestamp).toBe(1700000000000);
            expect(comment.content).toBe('a note');
            expect(comment.commentedText).toBe('kept');
            expect(comment.resolved).toBe(false);
            expect(comment.responses).toEqual([]);
        });

        it('should report tag positions that map back to the raw tags', () => {
            const content = `before ${wrap('abc123', 'kept')} after`;
            const [comment] = commentService.parseComments(content);

            expect(
                content.substring(comment.openTagStart!, comment.openTagEnd!),
            ).toBe(openTag('abc123'));
            expect(
                content.substring(comment.closeTagStart!, comment.closeTagEnd!),
            ).toBe(closeTag('abc123'));
            expect(comment.startPosition).toBe(comment.openTagStart);
            expect(comment.endPosition).toBe(comment.closeTagEnd);
        });

        it('should parse ids that start with a dash', () => {
            const content = wrap('-XyZ_09', 'kept');
            const [comment] = commentService.parseComments(content);

            expect(comment).toBeDefined();
            expect(comment.id).toBe('-XyZ_09');
            expect(comment.commentedText).toBe('kept');
        });

        it('should parse ids that start with an underscore or a digit', () => {
            const content = `${wrap('_lead', 'one')} ${wrap('9lead', 'two')}`;
            const ids = commentService.parseComments(content).map((c) => c.id);

            expect(ids).toEqual(['_lead', '9lead']);
        });

        it('should parse adjacent comments', () => {
            const content = `${wrap('aaa', 'one')} mid ${wrap('bbb', 'two')}`;
            const comments = commentService.parseComments(content);

            expect(comments.map((c) => c.id)).toEqual(['aaa', 'bbb']);
            expect(comments.map((c) => c.commentedText)).toEqual([
                'one',
                'two',
            ]);
            expect(comments[0].closeTagEnd!).toBeLessThanOrEqual(
                comments[1].openTagStart!,
            );
        });

        it('should parse nested comments', () => {
            const inner = wrap('inner', 'deep');
            const content = wrap('outer', `x ${inner} y`);
            const comments = commentService.parseComments(content);

            expect(comments.map((c) => c.id).sort()).toEqual([
                'inner',
                'outer',
            ]);

            const outer = comments.find((c) => c.id === 'outer')!;
            const nested = comments.find((c) => c.id === 'inner')!;

            expect(outer.openTagEnd!).toBeLessThan(nested.openTagStart!);
            expect(nested.closeTagEnd!).toBeLessThanOrEqual(
                outer.closeTagStart!,
            );
        });

        it('should skip a comment without a matching close tag', () => {
            const content = `before ${openTag('lonely')}kept`;

            expect(commentService.parseComments(content)).toEqual([]);
        });

        it('should skip an unmatched comment but keep parsing later ones', () => {
            const content = `${openTag('lonely')}orphan ${wrap('good', 'kept')}`;
            const comments = commentService.parseComments(content);

            expect(comments.map((c) => c.id)).toEqual(['good']);
        });

        it('should parse tags without surrounding backticks', () => {
            const content = `before ${wrap('nobt', 'kept', { backticks: false })} after`;
            const [comment] = commentService.parseComments(content);

            expect(comment.commentedText).toBe('kept');
            expect(
                content.substring(comment.openTagStart!, comment.openTagEnd!),
            ).toBe(openTag('nobt', { backticks: false }));
        });

        it('should parse tags that a formatter wrapped across lines', () => {
            const wrapped = `\`<### comment id: wrapped, user: tester, time:\n1700000000000, content: 'a note', responses: [], resolved: false ###>\`kept\`</###\ncomment id: wrapped ###>\``;
            const [comment] = commentService.parseComments(wrapped);

            expect(comment).toBeDefined();
            expect(comment.id).toBe('wrapped');
            expect(comment.user).toBe('tester');
            expect(comment.timestamp).toBe(1700000000000);
            expect(comment.commentedText).toBe('kept');
        });

        it('should parse resolved comments', () => {
            const content = wrap('res', 'kept', { resolved: true });
            const [comment] = commentService.parseComments(content);

            expect(comment.resolved).toBe(true);
        });

        it('should parse responses', () => {
            const responses = [
                responseTag('r1', 'alice', 1700000000001, 'first'),
                responseTag('r2', 'bob', 1700000000002, 'second'),
            ].join(', ');
            const content = wrap('withresp', 'kept', { responses });
            const [comment] = commentService.parseComments(content);

            expect(comment.responses).toEqual([
                {
                    id: 'r1',
                    user: 'alice',
                    timestamp: 1700000000001,
                    content: 'first',
                },
                {
                    id: 'r2',
                    user: 'bob',
                    timestamp: 1700000000002,
                    content: 'second',
                },
            ]);
        });

        it('should preserve commented text containing braces and math', () => {
            const text = '\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}';
            const content = `\\[ ${wrap('math', text)} \\]`;
            const [comment] = commentService.parseComments(content);

            expect(comment.commentedText).toBe(text);
        });

        it('should preserve commented text spanning multiple lines', () => {
            const content = wrap('multi', 'first line\nsecond line');
            const [comment] = commentService.parseComments(content);

            expect(comment.commentedText).toBe('first line\nsecond line');
        });

        it('should report the line the comment starts on', () => {
            const content = `line one\nline two\n${wrap('line3', 'kept')}`;
            const [comment] = commentService.parseComments(content);

            expect(comment.line).toBe(3);
        });

        it('should deduplicate nothing and keep document order', () => {
            const content = `${wrap('first', 'a')}${wrap('second', 'b')}${wrap('third', 'c')}`;
            const comments = commentService.parseComments(content);

            expect(comments.map((c) => c.id)).toEqual([
                'first',
                'second',
                'third',
            ]);
        });
    });

    describe('addComment', () => {
        it('should produce tags that parse back into the same comment', () => {
            const raw = commentService.addComment('hello there', 'tester');
            const content = `${raw.openTag}selected${raw.closeTag}`;
            const [comment] = commentService.parseComments(content);

            expect(comment.id).toBe(raw.commentId);
            expect(comment.user).toBe('tester');
            expect(comment.content).toBe('hello there');
            expect(comment.commentedText).toBe('selected');
            expect(comment.resolved).toBe(false);
        });

        it('should produce a unique id per comment', () => {
            const first = commentService.addComment('one', 'tester');
            const second = commentService.addComment('two', 'tester');

            expect(first.commentId).not.toBe(second.commentId);
        });
    });

    describe('updateCommentResponses', () => {
        it('should serialize responses that parse back', () => {
            const raw = commentService.addComment('note', 'tester');
            const [comment] = commentService.parseComments(
                `${raw.openTag}selected${raw.closeTag}`,
            );

            comment.responses = commentService.addResponse(
                comment.responses,
                'a reply',
                'alice',
            );

            const updated = commentService.updateCommentResponses(comment);
            const [reparsed] = commentService.parseComments(
                `${updated.openTag}selected${updated.closeTag}`,
            );

            expect(reparsed.responses).toHaveLength(1);
            expect(reparsed.responses[0].user).toBe('alice');
            expect(reparsed.responses[0].content).toBe('a reply');
        });
    });

    describe('resolveComment', () => {
        it('should serialize the resolved flag', () => {
            const raw = commentService.addComment('note', 'tester');
            const [comment] = commentService.parseComments(
                `${raw.openTag}selected${raw.closeTag}`,
            );

            const resolved = commentService.resolveComment({
                ...comment,
                resolved: true,
            });
            const [reparsed] = commentService.parseComments(
                `${resolved.openTag}selected${resolved.closeTag}`,
            );

            expect(reparsed.resolved).toBe(true);
        });
    });

    describe('deleteResponse', () => {
        it('should remove only the matching response', () => {
            const responses = commentService.addResponse(
                commentService.addResponse([], 'first', 'alice'),
                'second',
                'bob',
            );

            const remaining = commentService.deleteResponse(
                responses,
                responses[0].id,
            );

            expect(remaining).toHaveLength(1);
            expect(remaining[0].content).toBe('second');
        });
    });
});
