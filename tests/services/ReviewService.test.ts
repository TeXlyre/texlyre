import { reviewService } from '@src/services/ReviewService';
import { encodeAnnotationText } from '@src/utils/annotationTagUtils';

const wrap = (original: string, current: string, username = 'tester') => {
    const { openTag, closeTag } = reviewService.createReview(original, username);
    return `${openTag}${current}${closeTag}`;
};

describe('ReviewService', () => {
    describe('createReview', () => {
        it('should encode the original text as base64', () => {
            const { openTag } = reviewService.createReview("it's 50%\nnew", 'tester');

            expect(openTag).toContain(
                `original: '${encodeAnnotationText("it's 50%\nnew")}'`,
            );
        });

        it('should produce matching open and close tag ids', () => {
            const { openTag, closeTag, reviewId } = reviewService.createReview(
                'old',
                'tester',
            );

            expect(openTag).toContain(`review id: ${reviewId}`);
            expect(closeTag).toBe(`\`</### review id: ${reviewId} ###>\``);
        });

        it('should keep the identity of an existing review when given one', () => {
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
        it('should decode the original and read the current text', () => {
            const [review] = reviewService.parseReviews(wrap('old text', 'new text'));

            expect(review.originalText).toBe('old text');
            expect(review.currentText).toBe('new text');
            expect(review.user).toBe('tester');
        });

        it('should round-trip an original containing quotes and newlines', () => {
            const original = "it's\n100% done";
            const [review] = reviewService.parseReviews(wrap(original, 'redone'));

            expect(review.originalText).toBe(original);
        });

        it('should parse an insertion with an empty original', () => {
            const [review] = reviewService.parseReviews(wrap('', 'added'));

            expect(review.originalText).toBe('');
            expect(review.currentText).toBe('added');
        });

        it('should parse a deletion with an empty body', () => {
            const [review] = reviewService.parseReviews(wrap('gone', ''));

            expect(review.originalText).toBe('gone');
            expect(review.currentText).toBe('');
        });

        it('should report tag boundaries that bracket the body', () => {
            const doc = `before ${wrap('old', 'new')} after`;
            const [review] = reviewService.parseReviews(doc);

            expect(doc.slice(review.openTagEnd, review.closeTagStart)).toBe('new');
            expect(doc.slice(0, review.openTagStart)).toBe('before ');
        });

        it('should report the line of the review', () => {
            const [review] = reviewService.parseReviews(
                `line one\nline two ${wrap('old', 'new')}`,
            );

            expect(review.line).toBe(2);
        });

        it('should parse several reviews in order', () => {
            const doc = `${wrap('a', 'A')} mid ${wrap('b', 'B')}`;

            expect(
                reviewService.parseReviews(doc).map((review) => review.currentText),
            ).toEqual(['A', 'B']);
        });

        it('should ignore comment tags', () => {
            const doc =
                "`<### comment id: ccc, user: tester, time: 1, content: 'note', responses: [], resolved: false ###>`kept`</### comment id: ccc ###>`";

            expect(reviewService.parseReviews(doc)).toHaveLength(0);
        });
    });

    describe('responses', () => {
        it('should round-trip responses through update and parse', () => {
            const [review] = reviewService.parseReviews(wrap('old', 'new'));
            const updated = {
                ...review,
                responses: reviewService.addResponse([], 'looks good', 'reviewer'),
            };

            const { openTag, closeTag } = reviewService.updateReview(updated);
            const [parsed] = reviewService.parseReviews(`${openTag}new${closeTag}`);

            expect(parsed.responses).toHaveLength(1);
            expect(parsed.responses[0].content).toBe('looks good');
            expect(parsed.responses[0].user).toBe('reviewer');
            expect(parsed.originalText).toBe('old');
        });

        it('should delete a response by id', () => {
            const responses = reviewService.addResponse([], 'note', 'reviewer');

            expect(
                reviewService.deleteResponse(responses, responses[0].id),
            ).toHaveLength(0);
        });
    });
});
