import { deleteCharBackward } from '@codemirror/commands';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { annotationSystemExtension } from '@src/extensions/codemirror/AnnotationExtension';
import {
	commentRanges,
	commentSystemExtension,
} from '@src/extensions/codemirror/CommentExtension';
import { getAnnotationMaskRanges } from '@src/extensions/codemirror/annotations/annotationMasking';
import { reviewSnapshots } from '@src/extensions/codemirror/review/reviewDecorations';
import {
	getReviewChunks,
	reviewSystemExtension,
	setTrackChanges,
} from '@src/extensions/codemirror/ReviewExtension';
import { commentService } from '@src/services/CommentService';
import { reviewService } from '@src/services/ReviewService';
import {
	type AnnotationKind,
	collectAnnotationTagRanges,
	encodeAnnotationText,
	scanAnnotationTags,
	stripAnnotationTags,
	stripAnnotationTagTokens,
} from '@src/utils/annotationTagUtils';

const commentOpen = (id: string) =>
	`\`<### comment id: ${id}, user: tester, time: 1700000000000, content: 'note', responses: [], resolved: false ###>\``;
const commentClose = (id: string) => `\`</### comment id: ${id} ###>\``;
const commentWrap = (id: string, text: string) =>
	`${commentOpen(id)}${text}${commentClose(id)}`;

const reviewOpen = (id: string, original: string) =>
	`\`<### review id: ${id}, user: tester, time: 1700000000000, original: '${encodeAnnotationText(original)}', responses: [] ###>\``;
const reviewClose = (id: string) => `\`</### review id: ${id} ###>\``;
const reviewWrap = (id: string, original: string, current: string) =>
	`${reviewOpen(id, original)}${current}${reviewClose(id)}`;

let views: EditorView[] = [];

function createView(doc: string, tracking = true) {
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
	setTrackChanges(view, { tracking, author: 'tester' });
	return view;
}

function type(view: EditorView, from: number, insert: string) {
	view.dispatch({
		changes: { from, insert },
		selection: { anchor: from + insert.length },
		userEvent: 'input.type',
	});
}

function remove(
	view: EditorView,
	from: number,
	to: number,
	userEvent = 'delete.selection',
) {
	view.dispatch({ changes: { from, to }, userEvent });
}

function addComment(view: EditorView, from: number, to: number) {
	const raw = commentService.addComment('nested note', 'tester');
	view.dispatch({
		changes: [
			{ from: to, insert: raw.closeTag },
			{ from, insert: raw.openTag },
		],
	});
}

function expectBalanced(view: EditorView) {
	const text = view.state.doc.toString();

	for (const kind of ['comment', 'review'] as const satisfies readonly AnnotationKind[]) {
		const withoutTokens = stripAnnotationTagTokens(text, [kind]);
		expect(withoutTokens).toBe(stripAnnotationTags(text, [kind]));
		expect(withoutTokens).not.toContain(`### ${kind}`);
	}
}

function expectProperNesting(view: EditorView) {
	const text = view.state.doc.toString();
	const ranges = (['comment', 'review'] as const).flatMap((kind) =>
		scanAnnotationTags(text, kind).map((tag) => ({
			kind,
			id: tag.id,
			from: tag.openTagStart,
			to: tag.closeTagEnd,
		})),
	);

	for (let i = 0; i < ranges.length; i++) {
		for (let j = i + 1; j < ranges.length; j++) {
			const a = ranges[i];
			const b = ranges[j];
			const overlap = a.from < b.to && b.from < a.to;
			if (!overlap) continue;

			const nested =
				(a.from <= b.from && a.to >= b.to) ||
				(b.from <= a.from && b.to >= a.to);
			expect(nested).toBe(true);
		}
	}
}

function expectIntegrity(view: EditorView) {
	expectBalanced(view);
	expectProperNesting(view);

	const text = view.state.doc.toString();
	const comments = commentService.parseComments(text).map((comment) => comment.id);
	const reviews = reviewService.parseReviews(text).map((review) => review.id);

	expect(view.state.field(commentRanges).map((range) => range.id)).toEqual(comments);
	expect(getReviewChunks(view.state).map((range) => range.id)).toEqual(reviews);
	expect(getAnnotationMaskRanges(view.state)).toEqual(collectAnnotationTagRanges(text));
	expect(view.contentDOM.textContent ?? '').not.toContain('### comment');
	expect(view.contentDOM.textContent ?? '').not.toContain('### review');
}

function bodyStart(view: EditorView) {
	const pos = view.state.doc.toString().indexOf('target');
	expect(pos).toBeGreaterThanOrEqual(0);
	return pos;
}

const fixtures = [
	{
		name: 'comment only',
		doc: () => `L ${commentWrap('ccc', 'target')} R`,
	},
	{
		name: 'review only',
		doc: () => `L ${reviewWrap('rrr', 'old', 'target')} R`,
	},
	{
		name: 'comment nested in review',
		doc: () =>
			`L ${reviewOpen('rrr', 'old')}${commentWrap('ccc', 'target')}${reviewClose('rrr')} R`,
	},
	{
		name: 'review nested in comment',
		doc: () =>
			`L ${commentOpen('ccc')}${reviewWrap('rrr', 'old', 'target')}${commentClose('ccc')} R`,
	},
] as const;

afterEach(() => {
	for (const view of views) view.destroy();
	views = [];
});

describe('annotation editing integrity', () => {
	it('treats tag-looking comment metadata as ordinary encoded content', () => {
		const note = "literal ###> and '</### comment id: fake ###>'";
		const raw = commentService.addComment(note, 'tester');
		const view = createView(`${raw.openTag}target${raw.closeTag}`, false);

		const [comment] = commentService.parseComments(view.state.doc.toString());
		expect(comment.content).toBe(note);
		expect(comment.commentedText).toBe('target');
		expectIntegrity(view);
	});

	describe.each(fixtures)('$name', ({ doc }) => {
		it('keeps tags balanced while adding a nested comment', () => {
			const view = createView(doc());
			const start = bodyStart(view);

			addComment(view, start + 1, start + 5);

			expectIntegrity(view);
			expect(commentService.parseComments(view.state.doc.toString()).length).toBeGreaterThan(0);
		});

		it('keeps tags balanced while editing annotated text', () => {
			const view = createView(doc());
			const start = bodyStart(view);

			type(view, start + 2, 'X');

			expectIntegrity(view);
			expect(view.state.doc.toString()).toContain('X');
		});

		it('keeps tags balanced while removing annotated text', () => {
			const view = createView(doc());
			const start = bodyStart(view);

			remove(view, start + 1, start + 4);

			expectIntegrity(view);
		});

		it('keeps tags balanced when a cut starts inside hidden syntax', () => {
			const view = createView(doc());
			const text = view.state.doc.toString();
			const outer = (['comment', 'review'] as const)
				.flatMap((kind) => scanAnnotationTags(text, kind))
				.sort((a, b) => a.openTagStart - b.openTagStart)[0];
			const start = bodyStart(view);

			remove(view, outer.openTagStart + 5, start + 2);

			expectIntegrity(view);
		});
	});

	it('keeps review history across repeated select-all deletion', () => {
		const doc =
			`head ${commentWrap('ccc', 'commented')} ` +
			`${reviewWrap('rrr', 'old', 'new')} tail`;
		const view = createView(doc);

		remove(view, 0, view.state.doc.length);

		let reviews = reviewService.parseReviews(view.state.doc.toString());
		expect(reviews).toHaveLength(1);
		expect(reviews[0].originalText).toBe('head commented old tail');
		expect(reviews[0].currentText).toBe('');

		const onceDeleted = view.state.doc.toString();
		remove(view, 0, view.state.doc.length);

		reviews = reviewService.parseReviews(view.state.doc.toString());
		expect(reviews).toHaveLength(1);
		expect(reviews[0].originalText).toBe('head commented old tail');
		expect(reviews[0].currentText).toBe('');
		expect(view.state.doc.toString()).toBe(onceDeleted);
		expectIntegrity(view);
	});

	it('never deletes an already-empty review wrapper through selection delete', () => {
		const view = createView(reviewWrap('rrr', 'deleted', ''));
		const before = view.state.doc.toString();

		remove(view, 0, view.state.doc.length);

		expect(view.state.doc.toString()).toBe(before);
		expect(reviewService.parseReviews(view.state.doc.toString())).toHaveLength(1);
		expectIntegrity(view);
	});

	it('keeps tracking active across two consecutive backspaces', () => {
		const view = createView('abc');

		type(view, 1, 'X');
		deleteCharBackward(view);

		expect(reviewService.parseReviews(view.state.doc.toString())).toHaveLength(0);
		deleteCharBackward(view);

		const review = reviewService.parseReviews(view.state.doc.toString())[0];
		expect(review).toBeDefined();
		expect(review.originalText).toBe('a');
		expect(review.currentText).toBe('');
		expectIntegrity(view);
	});

	it('allows adding a comment to a tracked phrase and continuing the same review', () => {
		const view = createView('hello world');

		type(view, 5, ' brave');
		let review = reviewService.parseReviews(view.state.doc.toString())[0];
		const brave = view.state.doc.toString().indexOf('brave', review.openTagEnd);
		addComment(view, brave, brave + 5);

		let comments = commentService.parseComments(view.state.doc.toString());
		let reviews = reviewService.parseReviews(view.state.doc.toString());
		expect(comments).toHaveLength(1);
		expect(reviews).toHaveLength(1);
		expect(reviews[0].id).toBe(review.id);

		type(view, comments[0].openTagEnd, 'X');

		comments = commentService.parseComments(view.state.doc.toString());
		reviews = reviewService.parseReviews(view.state.doc.toString());
		expect(comments).toHaveLength(1);
		expect(reviews).toHaveLength(1);
		expect(reviews[0].id).toBe(review.id);
		expectIntegrity(view);
	});

	it('never leaves residue when a selection partially crosses both nested tags', () => {
		const doc =
			`L ${reviewOpen('rrr', 'old')}` +
			`${commentWrap('ccc', 'target')}${reviewClose('rrr')} R`;
		const view = createView(doc);
		const review = reviewService.parseReviews(doc)[0];
		const comment = commentService.parseComments(doc)[0];

		remove(
			view,
			review.openTagStart + 5,
			comment.closeTagStart + 5,
		);

		expectIntegrity(view);
	});

	it('removes fully covered nested annotations without orphan tokens', () => {
		const doc =
			`L ${commentOpen('ccc')}` +
			`${reviewWrap('rrr', 'old', 'target')}${commentClose('ccc')} R`;
		const view = createView(doc);
		const comment = commentService.parseComments(doc)[0];

		remove(view, comment.openTagStart, comment.closeTagEnd);

		expectIntegrity(view);
		expect(commentService.parseComments(view.state.doc.toString())).toHaveLength(0);
	});

	it('keeps comment geometry synchronous without external processing', () => {
		const view = createView(
			`${reviewOpen('rrr', 'old')}${commentWrap('ccc', 'target')}${reviewClose('rrr')}`,
		);
		const comment = commentService.parseComments(view.state.doc.toString())[0];

		remove(view, comment.openTagStart + 4, comment.closeTagStart + 2);
		expectIntegrity(view);

		const remaining = commentService.parseComments(view.state.doc.toString())[0];
		if (remaining) type(view, remaining.openTagEnd, 'X');
		expectIntegrity(view);
	});

	it('renders a zero-width anchor for empty annotation bodies', () => {
		const view = createView(
			`${commentWrap('ccc', '')}\n${reviewWrap('rrr', 'deleted', '')}`,
			false,
		);

		const anchors = view.contentDOM.querySelectorAll(
			'.comment-open-tag, .comment-close-tag, .review-open-tag, .review-close-tag',
		);
		expect(anchors).toHaveLength(4);
		for (const anchor of anchors) expect(anchor.textContent).toBe('\u200b');
		expectIntegrity(view);
	});

	it.each([
		['review around comment', () =>
			`L ${reviewOpen('rrr', 'old')}${commentWrap('ccc', 'target')}${reviewClose('rrr')} R`],
		['comment around review', () =>
			`L ${commentOpen('ccc')}${reviewWrap('rrr', 'old', 'target')}${commentClose('ccc')} R`],
	] as const)('survives difficult boundary cuts: %s', (_name, makeDoc) => {
		const doc = makeDoc();
		const review = reviewService.parseReviews(doc)[0];
		const comment = commentService.parseComments(doc)[0];
		const cuts = [
			[review.openTagStart + 1, comment.openTagEnd + 1],
			[comment.openTagStart + 1, review.closeTagEnd - 1],
			[review.openTagEnd - 1, comment.closeTagStart + 2],
			[comment.openTagEnd - 1, review.closeTagStart + 1],
			[comment.openTagStart, comment.closeTagEnd],
			[review.openTagStart, review.closeTagEnd],
			[0, review.closeTagStart + 3],
			[comment.openTagStart + 3, doc.length],
		] as const;

		for (const [from, to] of cuts) {
			const view = createView(doc);
			remove(view, Math.min(from, to), Math.max(from, to));
			expectIntegrity(view);
		}
	});

	it('stays consistent through a sequence of nested destructive edits', () => {
		const view = createView(
			`A ${reviewOpen('rrr', 'before')}${commentWrap('ccc', 'target')}${reviewClose('rrr')} Z`,
		);

		for (let step = 0; step < 5; step++) {
			const text = view.state.doc.toString();
			const comment = commentService.parseComments(text)[0];
			const review = reviewService.parseReviews(text)[0];

			if (step === 0 && comment) {
				remove(view, review.openTagStart + 3, comment.openTagEnd + 2);
			} else if (step === 1 && comment) {
				remove(view, comment.openTagEnd, Math.min(comment.openTagEnd + 2, comment.closeTagStart));
			} else if (step === 2 && review) {
				type(view, review.closeTagStart, '!');
			} else if (step === 3 && review) {
				remove(view, Math.max(review.openTagStart, review.closeTagStart - 2), review.closeTagEnd - 2);
			} else {
				remove(view, 0, view.state.doc.length);
			}

			expectIntegrity(view);
		}
	});


	it('expands tracked deletions so reviews never split comments', () => {
		const view = createView(
			`head ${commentWrap('ccc', 'this is a test\nwe are going to publish it there\nclear')} tail`,
		);
		let comment = commentService.parseComments(view.state.doc.toString())[0];

		remove(view, comment.openTagEnd + 5, comment.closeTagEnd + 3);
		expectIntegrity(view);

		const text = view.state.doc.toString();
		comment = commentService.parseComments(text)[0];
		const review = reviewService.parseReviews(text)[0];
		expect(comment).toBeDefined();
		expect(review).toBeDefined();
		expect(review.openTagStart).toBeLessThanOrEqual(comment.openTagStart!);
		expect(review.closeTagEnd).toBeGreaterThanOrEqual(comment.closeTagEnd!);
	});

	it('stays laminar through repeated overlapping deletions', () => {
		const view = createView(
			`start ${commentWrap('ccc', 'this is a test\nwe are going to publish it there\nclear')} finish`,
		);

		for (let step = 0; step < 6; step++) {
			const text = view.state.doc.toString();
			const comment = commentService.parseComments(text)[0];
			const review = reviewService.parseReviews(text)[0];

			if (step === 0 && comment) {
				remove(view, comment.openTagEnd + 2, Math.min(text.length, comment.closeTagEnd! + 2));
			} else if (step === 1 && review) {
				remove(view, Math.max(review.openTagStart, review.closeTagStart - 8), review.closeTagEnd - 1);
			} else if (step === 2 && comment) {
				remove(view, Math.max(0, comment.openTagStart! - 2), comment.openTagEnd! + 3);
			} else if (step === 3 && review) {
				remove(view, review.openTagEnd, Math.min(review.closeTagStart, review.openTagEnd + 5));
			} else if (step === 4) {
				remove(view, 0, Math.min(8, view.state.doc.length));
			} else {
				const len = view.state.doc.length;
				remove(view, Math.max(0, len - 8), len);
			}

			expectIntegrity(view);
		}
	});


	it('never exposes a legacy crossing comment token in review snapshots', () => {
		const doc =
			`${commentOpen('ccc')}before ` +
			`${reviewOpen('rrr', 'old')}this is a test\nwe are going to publish it there` +
			`${commentClose('ccc')}\nclear${reviewClose('rrr')}`;
		const view = createView(doc, false);
		const [snapshot] = reviewSnapshots(
			getReviewChunks(view.state),
			view.state.doc,
			() => 0,
		);

		expect(snapshot.currentText).not.toContain('### comment');
		expect(snapshot.currentText).toContain('this is a test');
		expect(snapshot.currentText).toContain('clear');
	});

});
