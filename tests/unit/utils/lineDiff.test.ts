import { collapseUnchanged, diffLines } from '@src/utils/lineDiff';

const render = (lines: ReturnType<typeof diffLines>) =>
	lines.map((line) =>
		line.kind === 'skipped'
			? `… ${line.count}`
			: `${line.kind === 'same' ? ' ' : line.kind === 'added' ? '+' : '-'}${line.text}`,
	);

describe('diffLines', () => {
	it('reports a changed line between shared context', () => {
		expect(render(diffLines('a\nb\nc', 'a\nB\nc'))).toEqual([' a', '-b', '+B', ' c']);
	});

	it('keeps line numbers for both sides', () => {
		const lines = diffLines('a\nb\nc', 'a\nx\ny\nc');
		expect(lines.at(-1)).toEqual({ kind: 'same', text: 'c', oldLine: 3, newLine: 4 });
	});

	it('finds common lines inside the changed region', () => {
		expect(render(diffLines('a\nb\nc\nd', 'x\nb\nc\ny'))).toEqual([
			'-a',
			'+x',
			' b',
			' c',
			'-d',
			'+y',
		]);
	});

	it('handles creation and deletion', () => {
		expect(render(diffLines('', 'new\n'))).toEqual(['+new', '+']);
		expect(render(diffLines('gone', ''))).toEqual(['-gone']);
		expect(render(diffLines('old\nkeep', 'keep'))).toEqual(['-old', ' keep']);
	});

	it('returns only unchanged lines for equal input', () => {
		expect(diffLines('a\nb', 'a\nb').every((line) => line.kind === 'same')).toBe(
			true,
		);
	});
});

describe('collapseUnchanged', () => {
	it('folds unchanged runs outside the context window', () => {
		const before = Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n');
		const after = before.replace('l10', 'L10');

		expect(render(collapseUnchanged(diffLines(before, after), 1))).toEqual([
			'… 9',
			' l9',
			'-l10',
			'+L10',
			' l11',
			'… 8',
		]);
	});
});
