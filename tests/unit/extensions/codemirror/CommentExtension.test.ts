import { Annotation, EditorState, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import {
    clearComments,
    commentState,
    commentSystemExtension,
    deleteCommentById,
    processComments,
    unwrapCommentById,
} from '@src/extensions/codemirror/CommentExtension';
import { commentService } from '@src/services/CommentService';
import { computeReplacementChange } from '@src/utils/textDiffUtils';

const remoteAnnotation = Annotation.define<string>();

const openTag = (id: string) =>
    `\`<### comment id: ${id}, user: tester, time: 1700000000000, content: 'a note', responses: [], resolved: false ###>\``;

const closeTag = (id: string) => `\`</### comment id: ${id} ###>\``;

const wrap = (id: string, text: string) =>
    `${openTag(id)}${text}${closeTag(id)}`;

let views: EditorView[] = [];

const createView = (doc: string) => {
    const view = new EditorView({
        state: EditorState.create({ doc, extensions: [commentSystemExtension] }),
        parent: document.body,
    });

    views.push(view);
    processComments(view, commentService.parseComments(doc));

    return view;
};

const parsedIds = (view: EditorView) =>
    commentService.parseComments(view.state.doc.toString()).map((c) => c.id);

afterEach(() => {
    for (const view of views) view.destroy();
    views = [];
});

describe('CommentExtension', () => {
    describe('processComments', () => {
        it('should decorate both tags and the commented content', () => {
            const view = createView(`before ${wrap('aaa', 'kept')} after`);

            expect(view.state.field(commentState).size).toBe(3);
        });

        it('should not decorate content of a resolved comment', () => {
            const doc = `before ${wrap('aaa', 'kept')} after`.replace(
                'resolved: false',
                'resolved: true',
            );
            const view = createView(doc);

            expect(view.state.field(commentState).size).toBe(2);
        });

        it('should decorate nested comments', () => {
            const view = createView(wrap('outer', `x ${wrap('inner', 'deep')} y`));

            expect(view.state.field(commentState).size).toBe(6);
        });

        it('should skip comments with out-of-range positions', () => {
            const doc = `before ${wrap('aaa', 'kept')} after`;
            const view = createView(doc);
            const [comment] = commentService.parseComments(doc);

            processComments(view, [
                { ...comment, closeTagEnd: doc.length + 50 },
            ]);

            expect(view.state.field(commentState).size).toBe(0);
        });

        it('should clear decorations when all comments are gone', () => {
            const view = createView(`before ${wrap('aaa', 'kept')} after`);

            processComments(view, []);

            expect(view.state.field(commentState).size).toBe(0);
        });

        it('should be idempotent when called repeatedly', () => {
            const doc = `before ${wrap('aaa', 'kept')} after`;
            const view = createView(doc);

            processComments(view, commentService.parseComments(doc));
            processComments(view, commentService.parseComments(doc));

            expect(view.state.field(commentState).size).toBe(3);
        });
    });

    describe('transaction protection', () => {
        it('should apply a formatter replacement spanning tags verbatim', () => {
            const doc = `alpha beta ${wrap('aaa', 'kept')} gamma delta`;
            const view = createView(doc);
            const formatted = doc
                .replace('alpha beta', 'alpha\nbeta')
                .replace('gamma delta', 'gamma\ndelta');

            view.dispatch({
                changes: computeReplacementChange(doc, formatted),
            });

            expect(view.state.doc.toString()).toBe(formatted);
            expect(parsedIds(view)).toEqual(['aaa']);
        });

        it('should apply a remote replacement spanning tags without duplicating them', () => {
            const doc = `alpha ${wrap('aaa', 'kept')} omega`;
            const view = createView(doc);
            const remote = `ALPHA ${wrap('aaa', 'kept')} OMEGA`;

            view.dispatch({
                changes: computeReplacementChange(doc, remote),
                annotations: remoteAnnotation.of('remote'),
            });

            expect(view.state.doc.toString()).toBe(remote);
            expect(parsedIds(view)).toEqual(['aaa']);
        });

        it('should apply a formatter replacement that ends inside a tag verbatim', () => {
            const doc = `alpha beta ${wrap('aaa', 'one')} gamma ${wrap('bbb', 'two')} delta`;
            const view = createView(doc);
            const formatted = doc
                .replace('alpha beta', 'alpha\nbeta')
                .replace('id: bbb, user:', 'id: bbb,\nuser:');

            view.dispatch({
                changes: computeReplacementChange(doc, formatted),
            });

            expect(view.state.doc.toString()).toBe(formatted);
            expect(parsedIds(view)).toEqual(['aaa', 'bbb']);
        });

        it('should apply a remote change that ends inside a tag verbatim', () => {
            const doc = `alpha ${wrap('aaa', 'kept')} omega`;
            const view = createView(doc);
            const [comment] = commentService.parseComments(doc);
            const to = comment.openTagEnd! - 5;

            view.dispatch({
                changes: { from: 0, to, insert: 'NEW' },
                annotations: remoteAnnotation.of('remote'),
            });

            expect(view.state.doc.toString()).toBe(`NEW${doc.slice(to)}`);
        });

        it('should preserve annotations on transactions it does not own', () => {
            const doc = `Intro ${wrap('aaa', 'kept')} tail.`;
            const seen: (string | undefined)[] = [];
            const view = new EditorView({
                state: EditorState.create({
                    doc,
                    extensions: [
                        commentSystemExtension,
                        EditorView.updateListener.of((update) => {
                            for (const tr of update.transactions) {
                                if (tr.docChanged) {
                                    seen.push(tr.annotation(remoteAnnotation));
                                }
                            }
                        }),
                    ],
                }),
                parent: document.body,
            });

            views.push(view);
            processComments(view, commentService.parseComments(doc));

            view.dispatch({
                changes: { from: 0, to: doc.length, insert: doc.replace('Intro', 'Outro') },
                annotations: remoteAnnotation.of('remote'),
            });

            expect(seen).toContain('remote');
        });

        it('should protect tags from a user edit that partially covers them', () => {
            const doc = `before ${wrap('aaa', 'kept')} after`;
            const view = createView(doc);
            const [comment] = commentService.parseComments(doc);

            view.dispatch({
                changes: {
                    from: comment.openTagStart! - 3,
                    to: comment.openTagEnd! + 2,
                    insert: 'X',
                },
                annotations: Transaction.userEvent.of('input.type'),
            });

            expect(view.state.doc.toString()).toContain(openTag('aaa'));
            expect(parsedIds(view)).toEqual(['aaa']);
        });

        it('should protect tags from a multi-change user edit', () => {
            const doc = `before ${wrap('aaa', 'kept')} after`;
            const view = createView(doc);
            const [comment] = commentService.parseComments(doc);

            view.dispatch({
                changes: [
                    {
                        from: comment.openTagStart! + 4,
                        to: comment.openTagStart! + 10,
                        insert: '',
                    },
                    {
                        from: comment.closeTagStart! - 1,
                        to: comment.closeTagStart! - 1,
                        insert: '}',
                    },
                ],
                annotations: Transaction.userEvent.of('input.type'),
            });

            expect(view.state.doc.toString()).toContain(openTag('aaa'));
            expect(view.state.doc.toString()).toContain(closeTag('aaa'));
            expect(parsedIds(view)).toEqual(['aaa']);
        });

        it('should drop a comment fully covered by a deleted paragraph', () => {
            const doc = `Para one.\nPara ${wrap('aaa', 'kept')} tail.\nPara three.`;
            const view = createView(doc);
            const line = view.state.doc.line(2);

            view.dispatch({
                changes: { from: line.from, to: line.to + 1, insert: '' },
                annotations: Transaction.userEvent.of('delete.selection'),
            });

            expect(view.state.doc.toString()).toBe('Para one.\nPara three.');
            expect(parsedIds(view)).toEqual([]);
            expect(view.state.field(commentState).size).toBe(0);
        });

        it('should drop every comment fully covered by a deleted selection', () => {
            const doc = `head ${wrap('aaa', 'one')} mid ${wrap('bbb', 'two')} tail`;
            const view = createView(doc);

            view.dispatch({
                changes: { from: 5, to: doc.length - 5, insert: '' },
                annotations: Transaction.userEvent.of('delete.selection'),
            });

            expect(view.state.doc.toString()).toBe('head  tail');
            expect(parsedIds(view)).toEqual([]);
        });

        it('should keep a comment whose tags are only partially deleted', () => {
            const doc = `head ${wrap('aaa', 'one')} tail`;
            const view = createView(doc);
            const [comment] = commentService.parseComments(doc);

            view.dispatch({
                changes: { from: 0, to: comment.closeTagStart! - 1, insert: '' },
                annotations: Transaction.userEvent.of('delete.selection'),
            });

            expect(parsedIds(view)).toEqual(['aaa']);
        });

        it('should not rewrite later edits once comments are cleared', () => {
            const doc = `head ${wrap('aaa', 'one')} tail`;
            const view = createView(doc);

            view.dispatch({ changes: { from: 0, to: doc.length, insert: 'clean' } });
            processComments(view, []);

            view.dispatch({
                changes: { from: 0, to: 5, insert: 'replaced' },
                annotations: Transaction.userEvent.of('input.type'),
            });

            expect(view.state.doc.toString()).toBe('replaced');
        });

        it('should leave documents without comments untouched', () => {
            const view = createView('plain \\textbf{text}');

            view.dispatch({
                changes: { from: 0, to: 5, insert: 'other' },
                annotations: Transaction.userEvent.of('input.type'),
            });

            expect(view.state.doc.toString()).toBe('other \\textbf{text}');
        });
    });

    describe('clearComments', () => {
        it('should remove all decorations', () => {
            const view = createView(`before ${wrap('aaa', 'kept')} after`);

            view.dispatch({ effects: [clearComments.of(null)] });

            expect(view.state.field(commentState).size).toBe(0);
        });
    });

    describe('unwrapCommentById', () => {
        it('should remove the tags and keep the commented text', () => {
            const view = createView(`before ${wrap('aaa', 'kept')} after`);

            expect(unwrapCommentById(view, 'aaa')).toBe(true);
            expect(view.state.doc.toString()).toBe('before kept after');
            expect(view.state.field(commentState).size).toBe(0);
        });

        it('should return false for an unknown id', () => {
            const view = createView(`before ${wrap('aaa', 'kept')} after`);

            expect(unwrapCommentById(view, 'missing')).toBe(false);
        });

        it('should unwrap the inner comment only', () => {
            const view = createView(wrap('outer', `x ${wrap('inner', 'deep')} y`));

            expect(unwrapCommentById(view, 'inner')).toBe(true);
            expect(parsedIds(view)).toEqual(['outer']);
            expect(view.state.doc.toString()).toContain('x deep y');
        });
    });

    describe('deleteCommentById', () => {
        it('should remove the tags and the commented text', () => {
            const view = createView(`before ${wrap('aaa', 'kept')} after`);

            expect(deleteCommentById(view, 'aaa')).toBe(true);
            expect(view.state.doc.toString()).toBe('before  after');
        });

        it('should return false for an unknown id', () => {
            const view = createView(`before ${wrap('aaa', 'kept')} after`);

            expect(deleteCommentById(view, 'missing')).toBe(false);
        });

        it('should leave sibling comments intact', () => {
            const view = createView(
                `${wrap('aaa', 'one')} mid ${wrap('bbb', 'two')}`,
            );

            expect(deleteCommentById(view, 'aaa')).toBe(true);
            expect(parsedIds(view)).toEqual(['bbb']);
        });
    });
});
