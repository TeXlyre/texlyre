import { commentService } from '@src/services/CommentService';
import { encodeAnnotationText } from '@src/utils/annotationTagUtils';

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
		it('returns an empty list without comments', () => {
			expect(commentService.parseComments('plain \\LaTeX{} text')).toEqual([]);
		});

		it('parses legacy plain-text metadata', () => {
			const [comment] = commentService.parseComments(
				`before ${wrap('abc123', 'kept')} after`,
			);

			expect(comment).toMatchObject({
				id: 'abc123',
				user: 'tester',
				timestamp: 1700000000000,
				content: 'a note',
				commentedText: 'kept',
				resolved: false,
				responses: [],
			});
		});

		it('reports raw tag positions', () => {
			const content = `before ${wrap('abc123', 'kept')} after`;
			const [comment] = commentService.parseComments(content);

			expect(content.substring(comment.openTagStart!, comment.openTagEnd!)).toBe(
				openTag('abc123'),
			);
			expect(content.substring(comment.closeTagStart!, comment.closeTagEnd!)).toBe(
				closeTag('abc123'),
			);
			expect(comment.startPosition).toBe(comment.openTagStart);
			expect(comment.endPosition).toBe(comment.closeTagEnd);
		});

		it.each(['-XyZ_09', '_lead', '9lead'])('parses id %s', (id) => {
			const [comment] = commentService.parseComments(wrap(id, 'kept'));
			expect(comment.id).toBe(id);
		});

		it('parses adjacent comments in document order', () => {
			const comments = commentService.parseComments(
				`${wrap('aaa', 'one')} mid ${wrap('bbb', 'two')}`,
			);
			expect(comments.map((comment) => comment.id)).toEqual(['aaa', 'bbb']);
			expect(comments.map((comment) => comment.commentedText)).toEqual([
				'one',
				'two',
			]);
		});

		it('parses nested comments', () => {
			const comments = commentService.parseComments(
				wrap('outer', `x ${wrap('inner', 'deep')} y`),
			);
			const outer = comments.find((comment) => comment.id === 'outer')!;
			const inner = comments.find((comment) => comment.id === 'inner')!;

			expect(inner.openTagStart!).toBeGreaterThan(outer.openTagEnd!);
			expect(inner.closeTagEnd!).toBeLessThanOrEqual(outer.closeTagStart!);
		});

		it('skips unmatched comments but continues parsing later comments', () => {
			const comments = commentService.parseComments(
				`${openTag('lonely')}orphan ${wrap('good', 'kept')}`,
			);
			expect(comments.map((comment) => comment.id)).toEqual(['good']);
		});

		it('parses tags without surrounding backticks', () => {
			const content = wrap('nobt', 'kept', { backticks: false });
			const [comment] = commentService.parseComments(content);
			expect(comment.commentedText).toBe('kept');
		});

		it('parses formatter-wrapped tag syntax', () => {
			const content = `\`<### comment id: wrapped, user: tester, time:\n1700000000000, content: 'a note', responses: [], resolved: false ###>\`kept\`</###\ncomment id: wrapped ###>\``;
			const [comment] = commentService.parseComments(content);

			expect(comment).toBeDefined();
			expect(comment.id).toBe('wrapped');
			expect(comment.content).toBe('a note');
			expect(comment.commentedText).toBe('kept');
		});

		it('parses resolved comments and responses', () => {
			const responses = [
				responseTag('r1', 'alice', 1700000000001, 'first'),
				responseTag('r2', 'bob', 1700000000002, 'second'),
			].join(', ');
			const [comment] = commentService.parseComments(
				wrap('withresp', 'kept', { responses, resolved: true }),
			);

			expect(comment.resolved).toBe(true);
			expect(comment.responses.map((response) => response.content)).toEqual([
				'first',
				'second',
			]);
		});

		it('preserves commented body text exactly', () => {
			const text = '\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}\nsecond line';
			const [comment] = commentService.parseComments(wrap('math', text));
			expect(comment.commentedText).toBe(text);
		});

		it('reports the starting line', () => {
			const [comment] = commentService.parseComments(
				`line one\nline two\n${wrap('line3', 'kept')}`,
			);
			expect(comment.line).toBe(3);
		});
	});

	describe('serialization', () => {
		it('round-trips new comment metadata', () => {
			const raw = commentService.addComment('hello there', 'tester');
			const [comment] = commentService.parseComments(
				`${raw.openTag}selected${raw.closeTag}`,
			);

			expect(comment.id).toBe(raw.commentId);
			expect(comment.content).toBe('hello there');
			expect(comment.commentedText).toBe('selected');
		});

		it('encodes free-form comment text so ###> cannot terminate the tag', () => {
			const note = "before ###> after 'quote'\n你好 \\command";
			const raw = commentService.addComment(note, 'tester');
			const [comment] = commentService.parseComments(
				`${raw.openTag}selected${raw.closeTag}`,
			);

			expect(raw.openTag.match(/###>/g)).toHaveLength(1);
			expect(raw.openTag).toContain(`content64: '${encodeAnnotationText(note)}'`);
			expect(comment.content).toBe(note);
			expect(comment.commentedText).toBe('selected');
		});

		it('encodes replies so tag-looking text and quotes round-trip exactly', () => {
			const raw = commentService.addComment('note', 'tester');
			const [comment] = commentService.parseComments(
				`${raw.openTag}selected${raw.closeTag}`,
			);
			const reply = "reply ###> with '</### comment id: fake ###>'\n第二行";
			comment.responses = commentService.addResponse(
				comment.responses,
				reply,
				'alice',
			);

			const updated = commentService.updateCommentResponses(comment);
			const [reparsed] = commentService.parseComments(
				`${updated.openTag}selected${updated.closeTag}`,
			);

			expect(updated.openTag.match(/###>/g)).toHaveLength(1);
			expect(reparsed.responses).toHaveLength(1);
			expect(reparsed.responses[0].content).toBe(reply);
		});

		it('serializes resolution without changing encoded content', () => {
			const raw = commentService.addComment('note ###>', 'tester');
			const [comment] = commentService.parseComments(
				`${raw.openTag}selected${raw.closeTag}`,
			);
			const resolved = commentService.resolveComment({ ...comment, resolved: true });
			const [reparsed] = commentService.parseComments(
				`${resolved.openTag}selected${resolved.closeTag}`,
			);

			expect(reparsed.resolved).toBe(true);
			expect(reparsed.content).toBe('note ###>');
		});
	});

	describe('responses', () => {
		it('deletes only the requested response', () => {
			const responses = commentService.addResponse(
				commentService.addResponse([], 'first', 'alice'),
				'second',
				'bob',
			);
			const remaining = commentService.deleteResponse(responses, responses[0].id);

			expect(remaining).toHaveLength(1);
			expect(remaining[0].content).toBe('second');
		});
	});
});
