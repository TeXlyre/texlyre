import {
	calculateLineNumber,
	createLineCounter,
} from '@src/utils/annotationTagUtils';

describe('annotation performance helpers', () => {
	it('matches calculateLineNumber at every position', () => {
		const text = 'one\ntwo\nthree\n\nfive';
		const lineAt = createLineCounter(text);

		for (let position = 0; position <= text.length; position++) {
			expect(lineAt(position)).toBe(calculateLineNumber(text, position));
		}
	});

	it('handles a document without newlines', () => {
		const lineAt = createLineCounter('plain text');
		expect(lineAt(0)).toBe(1);
		expect(lineAt(10)).toBe(1);
	});
});
