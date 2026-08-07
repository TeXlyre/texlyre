import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { registerEditorEventHandlers } from '@src/hooks/editor/EditorEvents';
import { commentService } from '@src/services/CommentService';

const openTag = (id: string, content = 'a note', resolved = false) =>
    `\`<### comment id: ${id}, user: tester, time: 1700000000000, content: '${content}', responses: [], resolved: ${resolved} ###>\``;

const closeTag = (id: string) => `\`</### comment id: ${id} ###>\``;

const wrap = (id: string, text: string) =>
    `${openTag(id)}${text}${closeTag(id)}`;

let view: EditorView | null = null;
let viewRef: { current: EditorView | null };
let cleanup: (() => void) | null = null;
let updateComments: jest.Mock;

const setup = (
    doc: string,
    overrides: Partial<Parameters<typeof registerEditorEventHandlers>[1]> = {},
) => {
    view = new EditorView({
        state: EditorState.create({ doc }),
        parent: document.body,
    });
    viewRef = { current: view };
    updateComments = jest.fn();

    cleanup = registerEditorEventHandlers(viewRef as never, {
        isViewOnly: false,
        isEditingFile: true,
        currentFileId: 'file-1',
        documentId: undefined,
        enableComments: true,
        updateComments,
        saveFileToStorage: jest.fn(),
        saveDocumentToLinkedFile: jest.fn(),
        setShowSaveIndicator: jest.fn(),
        ...overrides,
    });

    return view;
};

const parsedIds = () =>
    commentService.parseComments(view!.state.doc.toString()).map((c) => c.id);

afterEach(() => {
    cleanup?.();
    cleanup = null;
    viewRef.current = null;
    view?.destroy();
    view = null;
});

describe('EditorEvents comment handlers', () => {
    describe('comment-delete', () => {
        it('should remove the tags and keep the commented text', () => {
            setup(`before ${wrap('aaa', 'kept')} after`);

            document.dispatchEvent(
                new CustomEvent('comment-delete', {
                    detail: { commentId: 'aaa' },
                }),
            );

            expect(view!.state.doc.toString()).toBe('before kept after');
        });

        it('should locate the comment after the document shifted', () => {
            setup(`before ${wrap('aaa', 'kept')} after`);

            view!.dispatch({ changes: { from: 0, to: 0, insert: 'prefix ' } });

            document.dispatchEvent(
                new CustomEvent('comment-delete', {
                    detail: { commentId: 'aaa' },
                }),
            );

            expect(view!.state.doc.toString()).toBe(
                'prefix before kept after',
            );
        });

        it('should delete the requested comment only', () => {
            setup(`${wrap('aaa', 'one')} mid ${wrap('bbb', 'two')}`);

            document.dispatchEvent(
                new CustomEvent('comment-delete', {
                    detail: { commentId: 'bbb' },
                }),
            );

            expect(parsedIds()).toEqual(['aaa']);
            expect(view!.state.doc.toString()).toContain('mid two');
        });

        it('should ignore an unknown comment id', () => {
            const doc = `before ${wrap('aaa', 'kept')} after`;
            setup(doc);

            document.dispatchEvent(
                new CustomEvent('comment-delete', {
                    detail: { commentId: 'missing' },
                }),
            );

            expect(view!.state.doc.toString()).toBe(doc);
        });

        it('should do nothing in view-only mode', () => {
            const doc = `before ${wrap('aaa', 'kept')} after`;
            setup(doc, { isViewOnly: true });

            document.dispatchEvent(
                new CustomEvent('comment-delete', {
                    detail: { commentId: 'aaa' },
                }),
            );

            expect(view!.state.doc.toString()).toBe(doc);
        });

        it('should do nothing when comments are disabled', () => {
            const doc = `before ${wrap('aaa', 'kept')} after`;
            setup(doc, { enableComments: false });

            document.dispatchEvent(
                new CustomEvent('comment-delete', {
                    detail: { commentId: 'aaa' },
                }),
            );

            expect(view!.state.doc.toString()).toBe(doc);
        });
    });

    describe('comment-update', () => {
        it('should replace both tags with the new ones', () => {
            setup(`before ${wrap('aaa', 'kept')} after`);

            document.dispatchEvent(
                new CustomEvent('comment-update', {
                    detail: {
                        commentId: 'aaa',
                        rawComment: {
                            openTag: openTag('aaa', 'edited', true),
                            closeTag: closeTag('aaa'),
                        },
                    },
                }),
            );

            const [comment] = commentService.parseComments(
                view!.state.doc.toString(),
            );

            expect(comment.content).toBe('edited');
            expect(comment.resolved).toBe(true);
            expect(comment.commentedText).toBe('kept');
        });

        it('should update the right comment after the document shifted', () => {
            setup(`${wrap('aaa', 'one')} mid ${wrap('bbb', 'two')}`);

            view!.dispatch({ changes: { from: 0, to: 0, insert: 'lead ' } });

            document.dispatchEvent(
                new CustomEvent('comment-update', {
                    detail: {
                        commentId: 'bbb',
                        rawComment: {
                            openTag: openTag('bbb', 'edited', true),
                            closeTag: closeTag('bbb'),
                        },
                    },
                }),
            );

            const comments = commentService.parseComments(
                view!.state.doc.toString(),
            );

            expect(comments.map((c) => c.content)).toEqual([
                'a note',
                'edited',
            ]);
            expect(comments.map((c) => c.commentedText)).toEqual([
                'one',
                'two',
            ]);
        });

        it('should ignore an unknown comment id', () => {
            const doc = `before ${wrap('aaa', 'kept')} after`;
            setup(doc);

            document.dispatchEvent(
                new CustomEvent('comment-update', {
                    detail: {
                        commentId: 'missing',
                        rawComment: {
                            openTag: openTag('missing'),
                            closeTag: closeTag('missing'),
                        },
                    },
                }),
            );

            expect(view!.state.doc.toString()).toBe(doc);
        });
    });

    describe('comment-response-added', () => {
        it('should rewrite the tags of the matching comment', () => {
            setup(`before ${wrap('aaa', 'kept')} after`);

            const responses = `<#### response id: 'r1', user: alice, time: 1700000000001, content: 'a reply' ####/>`;
            const withResponse = openTag('aaa').replace(
                'responses: []',
                `responses: [${responses}]`,
            );

            document.dispatchEvent(
                new CustomEvent('comment-response-added', {
                    detail: {
                        commentId: 'aaa',
                        rawComment: {
                            openTag: withResponse,
                            closeTag: closeTag('aaa'),
                        },
                    },
                }),
            );

            const [comment] = commentService.parseComments(
                view!.state.doc.toString(),
            );

            expect(comment.responses).toHaveLength(1);
            expect(comment.responses[0].user).toBe('alice');
            expect(comment.commentedText).toBe('kept');
        });
    });

    describe('cleanup', () => {
        it('should stop handling events after cleanup', () => {
            const doc = `before ${wrap('aaa', 'kept')} after`;
            setup(doc);

            cleanup?.();
            cleanup = null;

            document.dispatchEvent(
                new CustomEvent('comment-delete', {
                    detail: { commentId: 'aaa' },
                }),
            );

            expect(view!.state.doc.toString()).toBe(doc);
        });
    });
});
