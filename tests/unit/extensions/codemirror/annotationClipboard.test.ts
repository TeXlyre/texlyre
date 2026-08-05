import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { annotationSystemExtension } from '@src/extensions/codemirror/AnnotationExtension';
import { commentSystemExtension } from '@src/extensions/codemirror/CommentExtension';
import {
    getReviewChunks,
    reviewSystemExtension,
    setTrackChanges,
} from '@src/extensions/codemirror/ReviewExtension';
import { commentService } from '@src/services/CommentService';
import {
    containsAnnotationMarker,
    encodeAnnotationText,
} from '@src/utils/annotationTagUtils';
import { processTextSelection } from '@src/utils/fileCommentUtils';

const reviewOpen = (id: string, original: string) =>
    `\`<### review id: ${id}, user: tester, time: 1700000000000, original: '${encodeAnnotationText(original)}', responses: [] ###>\``;
const reviewClose = (id: string) => `\`</### review id: ${id} ###>\``;
const reviewWrap = (id: string, original: string, current: string) =>
    `${reviewOpen(id, original)}${current}${reviewClose(id)}`;

const commentOpen = (id: string) =>
    `\`<### comment id: ${id}, user: tester, time: 1700000000000, content: 'a note', responses: [], resolved: false ###>\``;
const commentClose = (id: string) => `\`</### comment id: ${id} ###>\``;
const commentWrap = (id: string, text: string) =>
    `${commentOpen(id)}${text}${commentClose(id)}`;

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
    setTrackChanges(view, { tracking: true, author: 'tester' });

    return view;
};

const copy = (view: EditorView, from: number, to: number) =>
    processTextSelection(view.state.doc.sliceString(from, to));

const paste = (view: EditorView, text: string, at: number) => {
    view.dispatch({ selection: { anchor: at, head: at } });

    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', {
        value: { getData: () => text },
    });
    view.contentDOM.dispatchEvent(event);

    return event;
};

afterEach(() => {
    for (const view of views) view.destroy();
    views = [];
});

describe('annotation clipboard round-trip', () => {
    describe('reviews', () => {
        const doc = () =>
            `\\begin{document}\n${reviewWrap('aaa', 'hello world', '')}kept\n\\end{document}`;

        it('should copy no markers whichever side of a strikeout is selected', () => {
            const view = createView(doc());
            const [chunk] = getReviewChunks(view.state);

            expect(copy(view, chunk.openStart, chunk.closeEnd)).toBe('');
            expect(copy(view, chunk.openStart, chunk.closeStart)).toBe('');
            expect(copy(view, chunk.openEnd, chunk.closeEnd)).toBe('');
        });

        it('should not inject an orphan open tag on paste', () => {
            const view = createView(doc());
            const event = paste(view, reviewOpen('aaa', 'hello world'), 0);

            expect(event.defaultPrevented).toBe(true);
            expect(
                containsAnnotationMarker(
                    view.state.doc.sliceString(0, 20),
                    'review',
                ),
            ).toBe(false);
            expect(getReviewChunks(view.state)).toHaveLength(1);
        });

        it('should keep the strikeout in place after pasting an orphan open tag', () => {
            const view = createView(doc());
            const before = getReviewChunks(view.state)[0].openStart;

            paste(view, reviewOpen('aaa', 'hello world'), 0);

            const [chunk] = getReviewChunks(view.state);
            expect(chunk.openStart).toBe(before);
            expect(
                view.state.doc.sliceString(chunk.openEnd, chunk.closeStart),
            ).toBe('');
        });

        it('should not duplicate a review id when a whole chunk is pasted', () => {
            const view = createView(doc());

            paste(view, reviewWrap('aaa', 'hello world', ''), 0);

            expect(getReviewChunks(view.state).map((chunk) => chunk.id)).toEqual([
                'aaa',
            ]);
        });

        it('should track the pasted text and drop its markers', () => {
            const view = createView(doc());

            paste(view, `x ${reviewWrap('bbb', 'old', 'new')} y`, 0);

            const chunks = getReviewChunks(view.state);
            const inserted = chunks.find((chunk) => chunk.id !== 'aaa');

            expect(chunks.map((chunk) => chunk.id)).not.toContain('bbb');
            expect(inserted).toBeDefined();
            expect(
                view.state.doc.sliceString(inserted!.openEnd, inserted!.closeStart),
            ).toBe('x new y');
        });
    });

    describe('comments', () => {
        const doc = () =>
            `\\begin{document}\n${commentWrap('ccc', 'kept')}\n\\end{document}`;

        it('should copy no markers whichever side of a comment is selected', () => {
            const view = createView(doc());
            const start = view.state.doc.toString().indexOf(commentOpen('ccc'));
            const bodyStart = start + commentOpen('ccc').length;
            const bodyEnd = bodyStart + 'kept'.length;

            expect(
                copy(view, start, bodyEnd + commentClose('ccc').length),
            ).toBe('kept');
            expect(copy(view, start, bodyEnd)).toBe('kept');
            expect(
                copy(view, bodyStart, bodyEnd + commentClose('ccc').length),
            ).toBe('kept');
        });

        it('should not inject an orphan open tag on paste', () => {
            const view = createView(doc());
            const event = paste(view, commentOpen('ccc'), 0);

            expect(event.defaultPrevented).toBe(true);
            expect(
                containsAnnotationMarker(
                    view.state.doc.sliceString(0, 20),
                    'comment',
                ),
            ).toBe(false);
        });

        it('should not duplicate a comment id when a whole comment is pasted', () => {
            const view = createView(doc());

            paste(view, commentWrap('ccc', 'kept'), 0);

            expect(
                commentService.parseComments(view.state.doc.toString()),
            ).toHaveLength(1);
        });
    });
});
