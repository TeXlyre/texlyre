import { stripAnnotationTagsWithSpans } from '@src/utils/annotationTagUtils';

const comment = (id: string, inner: string) =>
	`\`<### comment id: ${id}, user: alice, time: 1, content64: 'aGk=', responses: [], resolved: false ###>\`${inner}\`</### comment id: ${id} ###>\``;

describe('stripAnnotationTagsWithSpans', () => {
	it('should return the text unchanged when there are no annotations', () => {
		const result = stripAnnotationTagsWithSpans('plain text');

		expect(result.content).toBe('plain text');
		expect(result.spans).toEqual([]);
	});

	it('should point each span at the annotated text in the cleaned output', () => {
		const source = `before ${comment('c1', 'flagged')} after`;

		const result = stripAnnotationTagsWithSpans(source);

		expect(result.content).toBe('before flagged after');
		expect(result.spans).toHaveLength(1);
		expect(
			result.content.slice(result.spans[0].from, result.spans[0].to),
		).toBe('flagged');
	});

	it('should keep offsets correct across several annotations', () => {
		const source = `${comment('c1', 'first')} middle ${comment('c2', 'second')}`;

		const result = stripAnnotationTagsWithSpans(source);

		expect(result.content).toBe('first middle second');
		expect(
			result.spans.map((span) => result.content.slice(span.from, span.to)),
		).toEqual(['first', 'second']);
	});

	it('should keep offsets correct across lines', () => {
		const source = `intro\n${comment('c1', 'flagged')}\ntail`;

		const result = stripAnnotationTagsWithSpans(source);

		expect(result.content).toBe('intro\nflagged\ntail');
		expect(
			result.content.slice(result.spans[0].from, result.spans[0].to),
		).toBe('flagged');
	});

	it('should handle an annotation spanning multiple lines', () => {
		const source = `intro\n${comment('c1', 'one\ntwo')}\ntail`;

		const result = stripAnnotationTagsWithSpans(source);

		expect(result.content).toBe('intro\none\ntwo\ntail');
		expect(
			result.content.slice(result.spans[0].from, result.spans[0].to),
		).toBe('one\ntwo');
	});

	it('should return spans in document order', () => {
		const source = `${comment('c2', 'alpha')} ${comment('c1', 'beta')}`;

		const result = stripAnnotationTagsWithSpans(source);

		expect(result.spans[0].from).toBeLessThan(result.spans[1].from);
	});
});
