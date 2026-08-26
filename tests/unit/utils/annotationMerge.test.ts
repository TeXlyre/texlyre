import { mergeAnnotatedContent } from '@src/utils/annotationMerge';
import { stripAnnotations } from '@src/utils/fileCommentUtils';

const comment = (id: string, inner: string) =>
	`\`<### comment id: ${id}, user: alice, time: 1, content64: 'aGk=', responses: [], resolved: false ###>\`${inner}\`</### comment id: ${id} ###>\``;

describe('mergeAnnotatedContent', () => {
	it('should take the incoming content when nothing is annotated', () => {
		const result = mergeAnnotatedContent('one\ntwo', 'one\nthree');

		expect(result.content).toBe('one\nthree');
		expect(result.dropped).toBe(0);
	});

	it('should keep annotations on lines the external editor left alone', () => {
		const annotated = `intro\n${comment('c1', 'flagged')}\noutro`;
		const incoming = 'intro\nflagged\nchanged outro';

		const result = mergeAnnotatedContent(annotated, incoming);

		expect(result.content).toContain('### comment id: c1');
		expect(result.content).toContain('changed outro');
		expect(result.preserved).toBe(1);
		expect(result.dropped).toBe(0);
	});

	it('should re-anchor an annotation when its text survives an edited line', () => {
		const annotated = `${comment('c1', 'first')}\n${comment('c2', 'second')}`;
		const incoming = 'first\nrewritten second';

		const result = mergeAnnotatedContent(annotated, incoming);

		expect(result.content).toContain('### comment id: c1');
		expect(result.content).toContain('### comment id: c2');
		expect(stripAnnotations(result.content)).toBe(incoming);
		expect(result.preserved).toBe(2);
		expect(result.dropped).toBe(0);
	});

	it('should keep an annotation when another part of its line is edited', () => {
		const annotated = `The quick ${comment('c1', 'brown fox')} jumps over`;
		const incoming = 'The slow brown fox leaps over';

		const result = mergeAnnotatedContent(annotated, incoming);

		expect(result.preserved).toBe(1);
		expect(result.dropped).toBe(0);
		expect(stripAnnotations(result.content)).toBe(incoming);
		expect(result.content).toContain('###>`brown fox`</###');
	});

	it('should keep two annotations on one edited line in order', () => {
		const annotated = `${comment('c1', 'alpha')} and ${comment('c2', 'beta')} end`;
		const incoming = 'alpha and beta finish';

		const result = mergeAnnotatedContent(annotated, incoming);

		expect(result.preserved).toBe(2);
		expect(stripAnnotations(result.content)).toBe(incoming);
	});

	it('should drop an annotation whose text was rewritten away', () => {
		const annotated = `${comment('c1', 'first')}\n${comment('c2', 'second')}`;
		const incoming = 'first\nsomething else entirely';

		const result = mergeAnnotatedContent(annotated, incoming);

		expect(result.content).toContain('### comment id: c1');
		expect(result.content).not.toContain('### comment id: c2');
		expect(result.preserved).toBe(1);
		expect(result.dropped).toBe(1);
	});

	it('should survive insertions above an annotated line', () => {
		const annotated = `intro\n${comment('c1', 'flagged')}`;
		const incoming = 'intro\nbrand new line\nflagged';

		const result = mergeAnnotatedContent(annotated, incoming);

		expect(result.content).toBe(`intro\nbrand new line\n${comment('c1', 'flagged')}`);
		expect(result.dropped).toBe(0);
	});

	it('should drop annotations whose line was deleted externally', () => {
		const annotated = `intro\n${comment('c1', 'flagged')}\noutro`;
		const incoming = 'intro\noutro';

		const result = mergeAnnotatedContent(annotated, incoming);

		expect(result.content).toBe('intro\noutro');
		expect(result.dropped).toBe(1);
	});

	it('should produce content whose cleaned form matches the incoming file', () => {
		const annotated = `intro\n${comment('c1', 'flagged')}\noutro`;
		const incoming = 'intro\nflagged\nrewritten';

		const result = mergeAnnotatedContent(annotated, incoming);

		expect(stripAnnotations(result.content)).toBe(incoming);
	});

	it('should return the incoming content unchanged when the file was fully rewritten', () => {
		const annotated = `${comment('c1', 'first')}\n${comment('c2', 'second')}`;
		const incoming = 'totally\ndifferent\ntext';

		const result = mergeAnnotatedContent(annotated, incoming);

		expect(result.content).toBe(incoming);
		expect(result.dropped).toBe(2);
	});

	it('should keep annotations when the tag wraps text across several lines', () => {
		const annotated = `intro\n${comment('c1', 'first\nsecond')}\noutro`;
		const incoming = 'intro\nfirst\nsecond\nrewritten';

		const result = mergeAnnotatedContent(annotated, incoming);

		expect(result.content).toContain('### comment id: c1');
		expect(result.content).toContain('rewritten');
		expect(result.dropped).toBe(0);
		expect(stripAnnotations(result.content)).toBe(incoming);
	});

	it('should not leave an orphan tag when a multi-line span is half edited', () => {
		const annotated = `intro\n${comment('c1', 'first\nsecond\nthird')}\ntail`;
		const incoming = 'intro\nrewritten opening\nsecond\nthird\ntail';

		const result = mergeAnnotatedContent(annotated, incoming);

		expect(result.content).not.toContain('###>');
		expect(result.content).not.toContain('</###');
		expect(stripAnnotations(result.content)).toBe(incoming);
		expect(result.dropped).toBe(1);
	});

	it('should keep a multi-line span when none of its lines changed', () => {
		const annotated = `intro\n${comment('c1', 'first\nsecond')}\ntail`;
		const incoming = 'intro\nfirst\nsecond\nrewritten tail';

		const result = mergeAnnotatedContent(annotated, incoming);

		expect(result.preserved).toBe(1);
		expect(stripAnnotations(result.content)).toBe(incoming);
	});

	it('should keep a multi-line span when its opening line is edited before the tag', () => {
		const annotated = `intro\nprefix ${comment('c1', 'alpha\nbeta')}\ntail`;
		const incoming = 'intro\nXX prefix alpha\nbeta\ntail';

		const result = mergeAnnotatedContent(annotated, incoming);

		expect(result.preserved).toBe(1);
		expect(result.dropped).toBe(0);
		expect(result.content).toContain('### comment id: c1');
		expect(stripAnnotations(result.content)).toBe(incoming);
	});

	it('should keep a multi-line span when its closing line is edited after the tag', () => {
		const annotated = `intro\n${comment('c1', 'alpha\nbeta')} suffix\ntail`;
		const incoming = 'intro\nalpha\nbeta suffix ZZ\ntail';

		const result = mergeAnnotatedContent(annotated, incoming);

		expect(result.preserved).toBe(1);
		expect(stripAnnotations(result.content)).toBe(incoming);
	});

	it('should handle large files without an expensive comparison', () => {
		const body = Array.from({ length: 4000 }, (_, i) => `line ${i}`);
		const annotated = [...body, comment('c1', 'tail')].join('\n');
		const incoming = [...body, 'tail'].join('\n');

		const started = Date.now();
		const result = mergeAnnotatedContent(annotated, incoming);

		expect(Date.now() - started).toBeLessThan(500);
		expect(result.preserved).toBe(1);
	});
});
