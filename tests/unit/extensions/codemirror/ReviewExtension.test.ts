import {
    deleteCharBackward,
    insertNewlineAndIndent,
} from '@codemirror/commands';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import {
    commentSystemExtension,
    processComments,
} from '@src/extensions/codemirror/CommentExtension';
import { reviewSnapshots } from '@src/extensions/codemirror/review/reviewDecorations';
import {
    acceptReviewById,
    getReviewChunks,
    rejectReviewById,
    resolveAllReviews,
    reviewState,
    reviewSystemExtension,
    setTrackChanges,
} from '@src/extensions/codemirror/ReviewExtension';
import { commentService } from '@src/services/CommentService';
import { reviewService } from '@src/services/ReviewService';
import { encodeAnnotationText } from '@src/utils/annotationTagUtils';
import { cleanText } from '@src/utils/fileCommentUtils';

const openTag = (id: string, original: string) =>
    `\`<### review id: ${id}, user: tester, time: 1700000000000, original: '${encodeAnnotationText(original)}', responses: [] ###>\``;

const closeTag = (id: string) => `\`</### review id: ${id} ###>\``;

const wrap = (id: string, original: string, current: string) =>
    `${openTag(id, original)}${current}${closeTag(id)}`;

let views: EditorView[] = [];

const createView = (doc: string, tracking = false) => {
    const view = new EditorView({
        state: EditorState.create({
            doc,
            extensions: [commentSystemExtension, reviewSystemExtension],
        }),
        parent: document.body,
    });

    views.push(view);
    setTrackChanges(view, { tracking, author: 'tester' });
    processComments(view, commentService.parseComments(doc));

    return view;
};

const sync = (view: EditorView) => {
    processComments(view, commentService.parseComments(view.state.doc.toString()));
};

const type = (view: EditorView, from: number, insert: string) => {
    view.dispatch({
        changes: { from, insert },
        selection: { anchor: from + insert.length },
        userEvent: 'input.type',
    });
};

const typeAt = (view: EditorView, insert: string) => {
    type(view, view.state.selection.main.head, insert);
};

const remove = (view: EditorView, from: number, to: number) => {
    view.dispatch({ changes: { from, to }, userEvent: 'delete.backward' });
};

const reviews = (view: EditorView) =>
    reviewService.parseReviews(view.state.doc.toString());

afterEach(() => {
    for (const view of views) view.destroy();
    views = [];
});

const commentOpen =
    "`<### comment id: ccc, user: tester, time: 1, content: 'note', responses: [], resolved: false ###>`";
const commentClose = '`</### comment id: ccc ###>`';

describe('ReviewExtension', () => {
    describe('processReviews', () => {
        it('should track chunks without an external processing step', () => {
            const view = createView(wrap('aaa', 'old', 'new'));

            expect(getReviewChunks(view.state).map((chunk) => chunk.id)).toEqual([
                'aaa',
            ]);
        });

        it('should decorate both tags and the inserted text', () => {
            const view = createView(wrap('aaa', 'old', 'new'));

            expect(view.state.field(reviewState).size).toBe(4);
        });

        it('should decorate a pure insertion without a deletion widget', () => {
            const view = createView(wrap('aaa', '', 'added'));

            expect(view.state.field(reviewState).size).toBe(3);
        });

        it('should decorate a pure deletion with a deletion widget only', () => {
            const view = createView(wrap('aaa', 'gone', ''));

            expect(view.state.field(reviewState).size).toBe(3);
        });

        it('should drop decorations when the tags are removed from the document', () => {
            const view = createView(wrap('aaa', 'old', 'new'));

            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: 'plain' } });

            expect(view.state.field(reviewState).size).toBe(0);
            expect(getReviewChunks(view.state)).toHaveLength(0);
        });

        it('should keep decorations aligned while the body grows', () => {
            const view = createView(`x ${wrap('aaa', 'old', 'new')} y`, true);
            const [chunk] = getReviewChunks(view.state);

            type(view, chunk.closeStart, '!');

            const [updated] = getReviewChunks(view.state);
            expect(
                view.state.doc.sliceString(updated.openEnd, updated.closeStart),
            ).toBe('new!');
            expect(view.state.field(reviewState).size).toBe(4);
        });
    });

    describe('tracking disabled', () => {
        it('should leave typed text untagged', () => {
            const view = createView('hello world');

            type(view, 5, ' brave');

            expect(view.state.doc.toString()).toBe('hello brave world');
            expect(reviews(view)).toHaveLength(0);
        });
    });

    describe('tracking enabled', () => {
        it('should wrap an insertion as a review with empty original', () => {
            const view = createView('hello world', true);

            type(view, 5, ' brave');

            const [review] = reviews(view);
            expect(review.originalText).toBe('');
            expect(review.currentText).toBe(' brave');
            expect(review.user).toBe('tester');
        });

        it('should extend the same review while typing on', () => {
            const view = createView('hello world', true);

            type(view, 5, ' a');
            const [first] = reviews(view);
            type(view, first.closeTagStart, 'b');

            const parsed = reviews(view);
            expect(parsed).toHaveLength(1);
            expect(parsed[0].id).toBe(first.id);
            expect(parsed[0].currentText).toBe(' ab');
        });

        it('should keep one review across a fast run of keystrokes', () => {
            const view = createView('hello world', true);

            type(view, 5, ' ');
            for (const character of 'brave') typeAt(view, character);

            const parsed = reviews(view);
            expect(parsed).toHaveLength(1);
            expect(parsed[0].currentText).toBe(' brave');
            expect(view.state.doc.toString()).toContain('hello');
            expect(view.state.doc.toString()).toContain('world');
        });

        it('should keep one review across a fast run of newlines', () => {
            const view = createView('hello world', true);

            type(view, 5, '\n');
            for (let index = 0; index < 4; index++) typeAt(view, '\n');

            const parsed = reviews(view);
            expect(parsed).toHaveLength(1);
            expect(parsed[0].currentText).toBe('\n\n\n\n\n');
        });

        it('should not lose characters typed into a fresh review', () => {
            const view = createView('ab', true);

            type(view, 1, 'x');
            for (const character of 'yz') typeAt(view, character);

            expect(reviews(view)[0].currentText).toBe('xyz');
            expect(cleanText(view.state.doc.toString())).toBe('axyzb');
        });

        it('should delete body characters one at a time on repeated backspace', () => {
            const view = createView('hello world', true);

            type(view, 5, ' abc');
            const [first] = reviews(view);
            remove(view, first.closeTagStart - 1, first.closeTagStart);

            const afterOne = reviews(view);
            expect(afterOne).toHaveLength(1);
            expect(afterOne[0].currentText).toBe(' ab');

            remove(view, afterOne[0].closeTagStart - 1, afterOne[0].closeTagStart);

            const afterTwo = reviews(view);
            expect(afterTwo).toHaveLength(1);
            expect(afterTwo[0].currentText).toBe(' a');
        });

        it('should record a deletion as a review with an empty body', () => {
            const view = createView('hello world', true);

            remove(view, 5, 11);

            const [review] = reviews(view);
            expect(review.originalText).toBe(' world');
            expect(review.currentText).toBe('');
            expect(view.state.doc.toString().startsWith('hello`<### review')).toBe(
                true,
            );
        });

        it('should merge consecutive deletions into one review', () => {
            const view = createView('abcdef', true);

            remove(view, 5, 6);
            const [first] = reviews(view);
            remove(view, first.openTagStart - 1, first.openTagStart);

            const parsed = reviews(view);
            expect(parsed).toHaveLength(1);
            expect(parsed[0].originalText).toBe('ef');
        });

        it('should drop the review when the text returns to the original', () => {
            const view = createView('hello world', true);

            type(view, 5, 'X');
            const [review] = reviews(view);
            remove(view, review.closeTagStart - 1, review.closeTagStart);

            expect(reviews(view)).toHaveLength(0);
            expect(view.state.doc.toString()).toBe('hello world');
        });

        it('should keep the original when text inside the body is edited', () => {
            const view = createView('hello world', true);

            remove(view, 0, 5);
            const [review] = reviews(view);
            type(view, review.openTagEnd, 'hi');

            const parsed = reviews(view);
            expect(parsed).toHaveLength(1);
            expect(parsed[0].originalText).toBe('hello');
            expect(parsed[0].currentText).toBe('hi');
        });

        it('should track a deletion that encloses a whole comment', () => {
            const doc = `a ${commentOpen}kept${commentClose} b`;
            const view = createView(doc, true);

            view.dispatch({
                changes: { from: 1, to: doc.length - 1 },
                userEvent: 'delete.selection',
            });
            sync(view);

            const parsed = reviews(view);
            expect(parsed).toHaveLength(1);
            expect(parsed[0].originalText).toBe(' kept ');
            expect(parsed[0].currentText).toBe('');
        });

        it('should not track a deletion that splits a comment tag', () => {
            const doc = `a ${commentOpen}kept${commentClose} b`;
            const view = createView(doc, true);
            const [comment] = commentService.parseComments(doc);

            view.dispatch({
                changes: { from: comment.openTagStart + 5, to: doc.length - 1 },
                userEvent: 'delete.selection',
            });
            sync(view);

            expect(reviews(view)).toHaveLength(0);
        });

        it('should keep deleting backwards on every keypress', () => {
            const view = createView('one two', true);
            view.dispatch({ selection: { anchor: 7 } });
            const lengths: number[] = [];

            for (let step = 0; step < 3; step++) {
                const head = view.state.selection.main.head;
                view.dispatch({
                    changes: { from: head - 1, to: head },
                    userEvent: 'delete.backward',
                });
                lengths.push(reviews(view)[0]?.originalText.length ?? 0);
            }

            expect(lengths).toEqual([1, 2, 3]);
        });

        it('should leave the cursor outside the tags after a backward deletion', () => {
            const view = createView('one two', true);
            view.dispatch({ selection: { anchor: 7 } });
            view.dispatch({
                changes: { from: 6, to: 7 },
                userEvent: 'delete.backward',
            });

            const [chunk] = getReviewChunks(view.state);
            expect(view.state.selection.main.head).toBe(chunk.openStart);
        });

        it('should leave the cursor outside the tags after a forward deletion', () => {
            const view = createView('one two', true);
            view.dispatch({ selection: { anchor: 0 } });
            view.dispatch({
                changes: { from: 0, to: 1 },
                userEvent: 'delete.forward',
            });

            const [chunk] = getReviewChunks(view.state);
            expect(view.state.selection.main.head).toBe(chunk.closeEnd);
        });

        it('should keep deleting forwards on every keypress', () => {
            const view = createView('one two', true);
            view.dispatch({ selection: { anchor: 0 } });
            const lengths: number[] = [];

            for (let step = 0; step < 3; step++) {
                const head = view.state.selection.main.head;
                view.dispatch({
                    changes: { from: head, to: head + 1 },
                    userEvent: 'delete.forward',
                });
                lengths.push(reviews(view)[0]?.originalText.length ?? 0);
            }

            expect(lengths).toEqual([1, 2, 3]);
        });

        it('should track a multi-line deletion as one review', () => {
            const view = createView('one\ntwo\nthree\nfour', true);

            view.dispatch({
                changes: { from: 4, to: 13 },
                userEvent: 'delete.selection',
            });

            const parsed = reviews(view);
            expect(parsed).toHaveLength(1);
            expect(parsed[0].originalText).toBe('two\nthree');
            expect(parsed[0].currentText).toBe('');
        });

        it('should strip nested comment tags from the stored original text', () => {
            const doc = `a ${commentOpen}kept${commentClose} b`;
            const view = createView(doc, true);

            view.dispatch({
                changes: { from: 1, to: doc.length - 1 },
                userEvent: 'delete.selection',
            });
            sync(view);

            expect(reviews(view)[0].originalText).not.toContain('###');
        });

        it('should track an edit inside a comment body without losing the comment', () => {
            const doc = `a ${commentOpen}kept${commentClose} b`;
            const view = createView(doc, true);
            const [comment] = commentService.parseComments(doc);

            type(view, comment.openTagEnd, 'X');

            expect(view.state.doc.toString()).toContain('comment id: ccc');
            expect(reviews(view)).toHaveLength(1);
            expect(reviews(view)[0].currentText).toBe('X');
        });

        it('should absorb a whole review deleted from the outside', () => {
            const view = createView(`start ${wrap('aaa', 'old', 'new')} end`, true);
            const [review] = reviews(view);

            view.dispatch({
                changes: { from: review.openTagStart - 1, to: review.closeTagEnd },
                userEvent: 'delete.selection',
            });
            sync(view);

            const parsed = reviews(view);
            expect(parsed).toHaveLength(1);
            expect(parsed[0].originalText).toBe(' old');
            expect(parsed[0].currentText).toBe('');
        });
    });

    describe('accept and reject', () => {
        it('should accept a review by keeping the current text', () => {
            const view = createView(`x ${wrap('aaa', 'old', 'new')} y`);

            acceptReviewById(view, 'aaa');

            expect(view.state.doc.toString()).toBe('x new y');
        });

        it('should reject a review by restoring the original text', () => {
            const view = createView(`x ${wrap('aaa', 'old', 'new')} y`);

            rejectReviewById(view, 'aaa');

            expect(view.state.doc.toString()).toBe('x old y');
        });

        it('should reject a deletion by restoring the removed text', () => {
            const view = createView(`x ${wrap('aaa', 'gone', '')} y`);

            rejectReviewById(view, 'aaa');

            expect(view.state.doc.toString()).toBe('x gone y');
        });

        it('should accept every review at once', () => {
            const view = createView(
                `${wrap('aaa', 'old', 'new')} and ${wrap('bbb', 'gone', '')}kept`,
            );

            resolveAllReviews(view, true);

            expect(view.state.doc.toString()).toBe('new and kept');
        });

        it('should reject every review at once', () => {
            const view = createView(
                `${wrap('aaa', 'old', 'new')} and ${wrap('bbb', 'gone', '')}kept`,
            );

            resolveAllReviews(view, false);

            expect(view.state.doc.toString()).toBe('old and gonekept');
        });

        it('should keep a nested comment when a review is rejected', () => {
            const view = createView(
                `x ${openTag('aaa', 'old')}${commentOpen}new${commentClose}${closeTag('aaa')} y`,
            );

            rejectReviewById(view, 'aaa');

            expect(view.state.doc.toString()).toBe(
                `x ${commentOpen}old${commentClose} y`,
            );
            expect(commentService.parseComments(view.state.doc.toString())).toHaveLength(1);
        });

        it('should keep a nested comment when every review is rejected', () => {
            const view = createView(
                `${openTag('aaa', 'old')}${commentOpen}new${commentClose}${closeTag('aaa')}`,
            );

            resolveAllReviews(view, false);

            expect(view.state.doc.toString()).toBe(
                `${commentOpen}old${commentClose}`,
            );
        });

        it('should keep a nested comment when a review is accepted', () => {
            const view = createView(
                `x ${openTag('aaa', 'old')}${commentOpen}new${commentClose}${closeTag('aaa')} y`,
            );

            acceptReviewById(view, 'aaa');

            expect(view.state.doc.toString()).toBe(
                `x ${commentOpen}new${commentClose} y`,
            );
        });

        it('should report failure for an unknown review id', () => {
            const view = createView(`x ${wrap('aaa', 'old', 'new')} y`);

            expect(acceptReviewById(view, 'missing')).toBe(false);
        });
    });

    describe('editor commands', () => {
        const insertText = (view: EditorView, text: string) => {
            view.dispatch(
                view.state.changeByRange((range) => ({
                    changes: { from: range.from, to: range.to, insert: text },
                    range: EditorSelection.cursor(range.from + text.length),
                })),
                { userEvent: 'input.type' },
            );
        };

        const visibleText = (view: EditorView) =>
            view.contentDOM.textContent ?? '';

        it('should never render tag syntax while typing', () => {
            const view = createView('hello world', true);
            view.dispatch({ selection: { anchor: 5 } });

            for (const character of ' brave') {
                insertText(view, character);
                expect(visibleText(view)).not.toContain('###');
            }

            expect(reviews(view)).toHaveLength(1);
        });

        it('should never render tag syntax across repeated newlines', () => {
            const view = createView('hello world', true);
            view.dispatch({ selection: { anchor: 5 } });

            for (let index = 0; index < 5; index++) {
                insertNewlineAndIndent(view);
                expect(visibleText(view)).not.toContain('###');
            }

            expect(reviews(view)).toHaveLength(1);
        });

        it('should keep the review after two backspaces in its body', () => {
            const view = createView('hello world', true);
            view.dispatch({ selection: { anchor: 5 } });

            for (const character of ' abc') insertText(view, character);

            deleteCharBackward(view);
            deleteCharBackward(view);

            const parsed = reviews(view);
            expect(parsed).toHaveLength(1);
            expect(parsed[0].currentText).toBe(' a');
            expect(cleanText(view.state.doc.toString())).toBe('hello a world');
        });

        it('should keep the surrounding text intact while tracking', () => {
            const view = createView('hello world', true);
            view.dispatch({ selection: { anchor: 5 } });

            for (const character of ' brave') insertText(view, character);

            expect(cleanText(view.state.doc.toString())).toBe('hello brave world');
        });
    });

	describe('panel snapshots', () => {
		const snapshots = (view: EditorView) =>
			reviewSnapshots(getReviewChunks(view.state), view.state.doc, (pos) =>
				view.lineBlockAt(pos).top,
			);

		it('should report a snapshot for every review in the document', () => {
			const view = createView(
				`${wrap('aaa', 'old', 'new')}\nmiddle\n${wrap('bbb', 'gone', '')}`,
			);

			expect(snapshots(view).map((review) => review.id)).toEqual(['aaa', 'bbb']);
		});

		it('should report document-relative tops that are independent of scrolling', () => {
			const view = createView(`${wrap('aaa', 'old', 'new')}\nline\nline`);
			const before = snapshots(view).map((review) => review.docTop);

			view.scrollDOM.scrollTop = 400;
			view.scrollDOM.dispatchEvent(new Event('scroll'));

			expect(snapshots(view).map((review) => review.docTop)).toEqual(before);
			expect(before.every((top) => Number.isFinite(top))).toBe(true);
		});

		it('should report the line each review starts on', () => {
			const view = createView(`line one\nline two ${wrap('aaa', 'old', 'new')}`);

			expect(snapshots(view)[0].line).toBe(2);
		});

		it('should report a nested comment body without its tags', () => {
			const view = createView(
				`${openTag('aaa', 'old')}${commentOpen}new${commentClose}${closeTag('aaa')}`,
			);

			expect(snapshots(view)[0].currentText).toBe('new');
		});

		it('should report the live body text of a review', () => {
			const view = createView(`x ${wrap('aaa', 'old', 'new')} y`, true);
			const [chunk] = getReviewChunks(view.state);

			type(view, chunk.closeStart, '!');

			expect(snapshots(view)[0].currentText).toBe('new!');
		});
	});
});
