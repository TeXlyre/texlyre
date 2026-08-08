import { reviewService } from '@src/services/ReviewService';
import { encodeAnnotationText } from '@src/utils/annotationTagUtils';

const wrap = (original: string, current: string, username = 'tester') => {
	const { openTag, closeTag } = reviewService.createReview(original, username);
	return `${openTag}${current}${closeTag}`;
};

describe('ReviewService', () => {
	describe('createReview', () => {
		it('encodes original text as base64', () => {
			const { openTag } = reviewService.createReview("it's 50%\nnew", 'tester');
			expect(openTag).toContain(
				`original: '${encodeAnnotationText("it's 50%\nnew")}'`,
			);
		});

		it('produces matching tag ids', () => {
			const { openTag, closeTag, reviewId } = reviewService.createReview(
				'old',
				'tester',
			);
			expect(openTag).toContain(`review id: ${reviewId}`);
			expect(closeTag).toBe(`\`</### review id: ${reviewId} ###>\``);
		});

		it('reuses existing review identity', () => {
			const existing = {
				id: 'keep-me',
				user: 'author',
				timestamp: 1700000000000,
				responses: [],
			};
			const { openTag, reviewId } = reviewService.createReview(
				'old',
				'tester',
				existing,
			);

			expect(reviewId).toBe('keep-me');
			expect(openTag).toContain('user: author');
			expect(openTag).toContain('time: 1700000000000');
		});
	});

	describe('parseReviews', () => {
		it.each([
			['old text', 'new text'],
			["it's\n100% done", 'redone'],
			['', 'added'],
			['gone', ''],
		])('round-trips original %p and current %p', (original, current) => {
			const [review] = reviewService.parseReviews(wrap(original, current));
			expect(review.originalText).toBe(original);
			expect(review.currentText).toBe(current);
		});

		it('reports tag boundaries around the body', () => {
			const doc = `before ${wrap('old', 'new')} after`;
			const [review] = reviewService.parseReviews(doc);
			expect(doc.slice(review.openTagEnd, review.closeTagStart)).toBe('new');
			expect(doc.slice(0, review.openTagStart)).toBe('before ');
		});

		it('parses multiple reviews in order and ignores comments', () => {
			const reviews = reviewService.parseReviews(`${wrap('a', 'A')} ${wrap('b', 'B')}`);
			expect(reviews.map((review) => review.currentText)).toEqual(['A', 'B']);

			const comment =
				"`<### comment id: ccc, user: tester, time: 1, content: 'note', responses: [], resolved: false ###>`kept`</### comment id: ccc ###>`";
			expect(reviewService.parseReviews(comment)).toHaveLength(0);
		});
	});

	describe('responses', () => {
		it('round-trips arbitrary response content safely', () => {
			const [review] = reviewService.parseReviews(wrap('old', 'new'));
			const response = "looks ###> good 'quoted'\n第二行";
			const updated = {
				...review,
				responses: reviewService.addResponse([], response, 'reviewer'),
			};
			const { openTag, closeTag } = reviewService.updateReview(updated);
			const [parsed] = reviewService.parseReviews(`${openTag}new${closeTag}`);

			expect(openTag.match(/###>/g)).toHaveLength(1);
			expect(parsed.responses).toHaveLength(1);
			expect(parsed.responses[0].content).toBe(response);
			expect(parsed.originalText).toBe('old');
		});

		it('deletes a response by id', () => {
			const responses = reviewService.addResponse([], 'note', 'reviewer');
			expect(reviewService.deleteResponse(responses, responses[0].id)).toHaveLength(0);
		});
	});
});
