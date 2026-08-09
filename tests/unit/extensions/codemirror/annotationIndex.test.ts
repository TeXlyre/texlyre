import { EditorState } from '@codemirror/state';

import {
	getAnnotationRanges,
	reconcileTagRanges,
} from '@src/extensions/codemirror/annotations/annotationIndex';
import {
	annotationMaskingExtension,
	maskAnnotationText,
} from '@src/extensions/codemirror/annotations/annotationMasking';
import { scanAnnotationTags } from '@src/utils/annotationTagUtils';

const commentOpen = (id: string) =>
	`\`<### comment id: ${id}, user: tester, time: 1, content: 'note', responses: [], resolved: false ###>\``;
const commentClose = (id: string) => `\`</### comment id: ${id} ###>\``;
const comment = (id: string, body: string) =>
	`${commentOpen(id)}${body}${commentClose(id)}`;

const reviewOpen = (id: string) =>
	`\`<### review id: ${id}, user: tester, time: 1, original: 'b2xk', responses: [], resolved: false ###>\``;
const reviewClose = (id: string) => `\`</### review id: ${id} ###>\``;
const review = (id: string, body: string) =>
	`${reviewOpen(id)}${body}${reviewClose(id)}`;

const create = (doc: string) =>
	EditorState.create({ doc, extensions: [annotationMaskingExtension] });

const assertRangesMatchDocument = (state: EditorState) => {
	const indexed = getAnnotationRanges(state);
	const scanned = (['comment', 'review'] as const)
		.flatMap((kind) =>
			scanAnnotationTags(state.doc.toString(), kind).map((match) => ({
				kind,
				id: match.id,
				openStart: match.openTagStart,
				openEnd: match.openTagEnd,
				closeStart: match.closeTagStart,
				closeEnd: match.closeTagEnd,
			})),
		)
		.sort((a, b) => a.openStart - b.openStart);

	expect(indexed).toEqual(scanned);
};

describe('annotationIndex', () => {
	it('maps a normal edit inside an annotation body without invalidating ranges', () => {
		const state = create(`x ${review('r1', 'new')} y`);
		const [before] = getAnnotationRanges(state);
		const tr = state.update({ changes: { from: before.closeStart, insert: '!' } });
		const reconciled = reconcileTagRanges([before], tr, [before]);

		expect(reconciled).not.toBeNull();
		expect(reconciled![0].openStart).toBe(before.openStart);
		expect(reconciled![0].openEnd).toBe(before.openEnd);
		expect(reconciled![0].closeStart).toBe(before.closeStart + 1);
		expect(reconciled![0].closeEnd).toBe(before.closeEnd + 1);
		assertRangesMatchDocument(tr.state);
	});

	it('maps both outer and nested annotations while editing visible text', () => {
		const doc = review('r1', `a ${comment('c1', 'kept')} b`);
		const state = create(doc);
		const before = getAnnotationRanges(state);
		const nested = before.find((range) => range.kind === 'comment')!;
		const next = state.update({
			changes: { from: nested.openEnd + 2, insert: 'X' },
		}).state;

		expect(getAnnotationRanges(next)).toHaveLength(2);
		assertRangesMatchDocument(next);
	});

	it('keeps tag boundaries stable for body insertions at both edges', () => {
		const state = create(comment('c1', 'body'));
		const [before] = getAnnotationRanges(state);
		const atStart = state.update({
			changes: { from: before.openEnd, insert: 'A' },
		}).state;
		const [afterStart] = getAnnotationRanges(atStart);

		expect(afterStart.openEnd).toBe(before.openEnd);
		expect(afterStart.closeStart).toBe(before.closeStart + 1);

		const atEnd = atStart.update({
			changes: { from: afterStart.closeStart, insert: 'B' },
		}).state;
		const [afterEnd] = getAnnotationRanges(atEnd);

		expect(afterEnd.closeStart).toBe(afterStart.closeStart + 1);
		assertRangesMatchDocument(atEnd);
	});

	it('rescans when existing tag syntax is broken', () => {
		const state = create(comment('c1', 'body'));
		const [before] = getAnnotationRanges(state);
		const next = state.update({
			changes: { from: before.openStart + 2, to: before.openStart + 6 },
		}).state;

		expect(getAnnotationRanges(next)).toEqual([]);
	});

	it('discovers annotation syntax introduced by an edit', () => {
		const state = create('before  after');
		const next = state.update({
			changes: { from: 7, insert: comment('new', 'body') },
		}).state;

		expect(getAnnotationRanges(next).map((range) => range.id)).toEqual(['new']);
		assertRangesMatchDocument(next);
	});

	it('falls back when a whole annotation is removed', () => {
		const state = create(`x ${review('r1', 'new')} y`);
		const [before] = getAnnotationRanges(state);
		const next = state.update({
			changes: {
				from: before.openStart,
				to: before.closeEnd,
				insert: 'new',
			},
		}).state;

		expect(getAnnotationRanges(next)).toEqual([]);
	});

	it('reconciles a byte-identical wrapper rewrite without id collisions', () => {
		const doc = `${comment('same', 'one')} ${review('same', 'two')}`;
		const state = create(doc);
		const before = getAnnotationRanges(state);
		const first = before[0];
		const open = state.doc.sliceString(first.openStart, first.openEnd);
		const close = state.doc.sliceString(first.closeStart, first.closeEnd);
		const tr = state.update({
			changes: {
				from: first.openStart,
				to: first.closeEnd,
				insert: `${open}longer body${close}`,
			},
		});
		const reconciled = reconcileTagRanges(before, tr, before);

		expect(reconciled).not.toBeNull();
		expect(reconciled).toHaveLength(2);
		expect(reconciled![0].kind).toBe('comment');
		expect(reconciled![1].kind).toBe('review');
		expect(reconciled![0].closeStart).toBe(
			reconciled![0].openEnd + 'longer body'.length,
		);
		expect(reconciled![1].openStart).toBeGreaterThan(
			reconciled![0].closeEnd,
		);
	});

	it('uses a full rescan for wrapper rewrites containing nested annotations', () => {
		const doc = review('r1', comment('c1', 'body'));
		const state = create(doc);
		const before = getAnnotationRanges(state);
		const outer = before.find((range) => range.kind === 'review')!;
		const open = state.doc.sliceString(outer.openStart, outer.openEnd);
		const close = state.doc.sliceString(outer.closeStart, outer.closeEnd);
		const tr = state.update({
			changes: {
				from: outer.openStart,
				to: outer.closeEnd,
				insert: `${open}${comment('c2', 'new')}${close}`,
			},
		});

		expect(reconcileTagRanges(before, tr, before)).toBeNull();
		assertRangesMatchDocument(tr.state);
	});
});

describe('annotation mask mapping', () => {
	it('keeps adjacent tag spans separate so inserted visible text is not masked', () => {
		const doc = `${comment('c1', '')}${review('r1', '')}`;
		const state = create(doc);
		const boundary = getAnnotationRanges(state).find(
			(range) => range.kind === 'comment',
		)!.closeEnd;
		const next = state.update({ changes: { from: boundary, insert: 'VISIBLE' } }).state;

		assertRangesMatchDocument(next);
		expect(next.doc.sliceString(boundary, boundary + 7)).toBe('VISIBLE');
		expect(maskAnnotationText(next).slice(boundary, boundary + 7)).toBe('VISIBLE');
	});
});
