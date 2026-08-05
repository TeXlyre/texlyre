import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { annotationSystemExtension } from '@src/extensions/codemirror/AnnotationExtension';
import {
	commentRanges,
	commentState,
	commentSystemExtension,
} from '@src/extensions/codemirror/CommentExtension';
import {
	getReviewChunks,
	reviewState,
	reviewSystemExtension,
} from '@src/extensions/codemirror/ReviewExtension';
import { encodeAnnotationText } from '@src/utils/annotationTagUtils';

const commentOpen = (id: string) =>
	`\`<### comment id: ${id}, user: tester, time: 1, content: 'note', responses: [], resolved: false ###>\``;
const commentClose = (id: string) => `\`</### comment id: ${id} ###>\``;
const comment = (id: string, body: string) =>
	`${commentOpen(id)}${body}${commentClose(id)}`;

const reviewOpen = (id: string, original: string) =>
	`\`<### review id: ${id}, user: tester, time: 1, original: '${encodeAnnotationText(original)}', responses: [], resolved: false ###>\``;
const reviewClose = (id: string) => `\`</### review id: ${id} ###>\``;
const review = (id: string, original: string, body: string) =>
	`${reviewOpen(id, original)}${body}${reviewClose(id)}`;

let views: EditorView[] = [];

const createView = (doc: string) => {
	const view = new EditorView({
		state: EditorState.create({
			doc,
			extensions: [
				annotationSystemExtension,
				commentSystemExtension,
				reviewSystemExtension,
			],
		}),
		parent: document.body,
	});
	views.push(view);
	return view;
};

const decorationRanges = (
	view: EditorView,
	field: typeof commentState,
	className: string,
) => {
	const ranges: Array<{ from: number; to: number }> = [];
	view.state.field(field).between(0, view.state.doc.length, (from, to, value) => {
		if (value.spec.class === className) ranges.push({ from, to });
	});
	return ranges;
};

afterEach(() => {
	for (const view of views) view.destroy();
	views = [];
});

describe('incremental annotation decorations', () => {
	it('rebuilds a comment body mark when text is inserted at its start edge', () => {
		const view = createView(comment('c1', 'body'));
		const [before] = view.state.field(commentRanges);

		view.dispatch({ changes: { from: before.openEnd, insert: 'X' } });

		const [after] = view.state.field(commentRanges);
		expect(decorationRanges(view, commentState, 'cm-comment-content')).toEqual([
			{ from: after.openEnd, to: after.closeStart },
		]);
		expect(view.state.doc.sliceString(after.openEnd, after.closeStart)).toBe(
			'Xbody',
		);
	});

	it('rebuilds review diff marks when its body changes', () => {
		const view = createView(review('r1', 'old', 'new'));
		const [before] = getReviewChunks(view.state);

		view.dispatch({ changes: { from: before.closeStart, insert: '!' } });

		const [after] = getReviewChunks(view.state);
		const inserted = decorationRanges(view, reviewState, 'cm-review-inserted');
		expect(inserted.length).toBeGreaterThan(0);
		expect(inserted.some((range) => range.to === after.closeStart)).toBe(true);
	});
});
