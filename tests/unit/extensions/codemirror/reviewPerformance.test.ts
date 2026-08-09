import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { annotationSystemExtension } from '@src/extensions/codemirror/AnnotationExtension';
import {
	getReviewChunks,
	reviewState,
	reviewSystemExtension,
	setTrackChanges,
} from '@src/extensions/codemirror/ReviewExtension';
import { computeReviewSegments } from '@src/extensions/codemirror/review/reviewSegments';
import { reviewService } from '@src/services/ReviewService';
import { encodeAnnotationText } from '@src/utils/annotationTagUtils';

const openTag = (id: string, original: string) =>
	`\`<### review id: ${id}, user: tester, time: 1700000000000, original: '${encodeAnnotationText(original)}', responses: [], resolved: false ###>\``;
const closeTag = (id: string) => `\`</### review id: ${id} ###>\``;
const wrap = (id: string, original: string, current: string) =>
	`${openTag(id, original)}${current}${closeTag(id)}`;

let views: EditorView[] = [];

const createView = (doc: string, tracking = false) => {
	const view = new EditorView({
		state: EditorState.create({
			doc,
			extensions: [annotationSystemExtension, reviewSystemExtension],
		}),
		parent: document.body,
	});
	views.push(view);
	setTrackChanges(view, { tracking, author: 'tester' });
	return view;
};

const typeAt = (view: EditorView, text: string) => {
	const from = view.state.selection.main.head;
	view.dispatch({
		changes: { from, insert: text },
		selection: { anchor: from + text.length },
		userEvent: 'input.type',
	});
};

afterEach(() => {
	for (const view of views) view.destroy();
	views = [];
});

describe('review typing performance regressions', () => {
	it('uses the exact pure-insertion/pure-deletion segment shapes', () => {
		expect(computeReviewSegments('', 'aaaa')).toEqual([
			{ type: 'insert', text: 'aaaa', from: 0, to: 4 },
		]);
		expect(computeReviewSegments('aaaa', '')).toEqual([
			{ type: 'delete', text: 'aaaa', from: 0, to: 0 },
		]);
	});

	it('keeps a long held-key run inside one insertion review', () => {
		const view = createView('ab', true);
		view.dispatch({ selection: { anchor: 1 } });

		for (let index = 0; index < 300; index++) typeAt(view, 'x');

		const parsed = reviewService.parseReviews(view.state.doc.toString());
		expect(parsed).toHaveLength(1);
		expect(parsed[0].originalText).toBe('');
		expect(parsed[0].currentText).toBe('x'.repeat(300));
	});

	it('keeps all review decorations intact when one of many reviews changes', () => {
		const doc = Array.from({ length: 80 }, (_, index) =>
			wrap(`r${index}`, '', 'x'),
		).join(' ');
		const view = createView(doc);
		const beforeSize = view.state.field(reviewState).size;
		const first = getReviewChunks(view.state)[0];

		view.dispatch({
			changes: { from: first.closeStart, insert: '!' },
			userEvent: 'input.type',
		});

		const chunks = getReviewChunks(view.state);
		expect(chunks).toHaveLength(80);
		expect(view.state.field(reviewState).size).toBe(beforeSize);
		expect(
			view.state.doc.sliceString(chunks[0].openEnd, chunks[0].closeStart),
		).toBe('x!');
		expect(chunks.at(-1)?.id).toBe('r79');
	});

	it('maps many review decorations when typing outside every review body', () => {
		const doc = Array.from({ length: 80 }, (_, index) =>
			wrap(`r${index}`, '', 'x'),
		).join(' ');
		const view = createView(`prefix ${doc}`);
		const beforeSize = view.state.field(reviewState).size;

		view.dispatch({
			changes: { from: 0, insert: 'A' },
			userEvent: 'input.type',
		});

		expect(getReviewChunks(view.state)).toHaveLength(80);
		expect(view.state.field(reviewState).size).toBe(beforeSize);
		expect(getReviewChunks(view.state)[0].openStart).toBeGreaterThan(7);
	});
});
