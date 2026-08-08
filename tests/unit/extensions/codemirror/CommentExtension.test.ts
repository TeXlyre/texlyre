import { Annotation, EditorState, Transaction } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { annotationSystemExtension } from '@src/extensions/codemirror/AnnotationExtension';
import {
	commentRanges,
	commentState,
	commentSystemExtension,
	deleteCommentById,
	unwrapCommentById,
} from '@src/extensions/codemirror/CommentExtension';
import { commentService } from '@src/services/CommentService';
import { computeReplacementChange } from '@src/utils/textDiffUtils';

const remoteAnnotation = Annotation.define<string>();

const openTag = (id: string) =>
	`\`<### comment id: ${id}, user: tester, time: 1700000000000, content: 'a note', responses: [], resolved: false ###>\``;
const closeTag = (id: string) => `\`</### comment id: ${id} ###>\``;
const wrap = (id: string, text: string) => `${openTag(id)}${text}${closeTag(id)}`;

let views: EditorView[] = [];

const createView = (
	doc: string,
	extensions = [annotationSystemExtension, commentSystemExtension],
) => {
	const view = new EditorView({
		state: EditorState.create({ doc, extensions }),
		parent: document.body,
	});
	views.push(view);
	return view;
};

const parsedIds = (view: EditorView) =>
	commentService.parseComments(view.state.doc.toString()).map((comment) => comment.id);

const rangeIds = (view: EditorView) =>
	view.state.field(commentRanges).map((range) => range.id);

afterEach(() => {
	for (const view of views) view.destroy();
	views = [];
});

describe('CommentExtension', () => {
	describe('document-derived state', () => {
		it('derives tags and content decoration on creation', () => {
			const view = createView(`before ${wrap('aaa', 'kept')} after`);

			expect(rangeIds(view)).toEqual(['aaa']);
			expect(view.state.field(commentState).size).toBe(3);
		});

		it('does not mark resolved comment content', () => {
			const doc = wrap('aaa', 'kept').replace('resolved: false', 'resolved: true');
			const view = createView(doc);

			expect(rangeIds(view)).toEqual(['aaa']);
			expect(view.state.field(commentState).size).toBe(2);
		});

		it('derives nested comments directly from the document', () => {
			const view = createView(wrap('outer', `x ${wrap('inner', 'deep')} y`));

			expect(rangeIds(view).sort()).toEqual(['inner', 'outer']);
			expect(view.state.field(commentState).size).toBe(6);
		});

		it('updates ranges and decorations immediately after document changes', () => {
			const doc = `before ${wrap('aaa', 'kept')} after`;
			const view = createView(doc);

			view.dispatch({ changes: { from: 0, to: doc.length, insert: 'plain' } });

			expect(rangeIds(view)).toEqual([]);
			expect(view.state.field(commentState).size).toBe(0);
		});
	});

	describe('transaction protection', () => {
		it('applies formatter replacements spanning tags verbatim', () => {
			const doc = `alpha beta ${wrap('aaa', 'kept')} gamma delta`;
			const view = createView(doc);
			const formatted = doc
				.replace('alpha beta', 'alpha\nbeta')
				.replace('gamma delta', 'gamma\ndelta');

			view.dispatch({ changes: computeReplacementChange(doc, formatted) });

			expect(view.state.doc.toString()).toBe(formatted);
			expect(parsedIds(view)).toEqual(['aaa']);
		});

		it('applies remote replacements spanning tags without duplication', () => {
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

		it('applies formatter replacements ending inside tag syntax verbatim', () => {
			const doc = `alpha beta ${wrap('aaa', 'one')} gamma ${wrap('bbb', 'two')} delta`;
			const view = createView(doc);
			const formatted = doc
				.replace('alpha beta', 'alpha\nbeta')
				.replace('id: bbb, user:', 'id: bbb,\nuser:');

			view.dispatch({ changes: computeReplacementChange(doc, formatted) });

			expect(view.state.doc.toString()).toBe(formatted);
			expect(parsedIds(view)).toEqual(['aaa', 'bbb']);
		});

		it('does not rewrite remote changes ending inside tag syntax', () => {
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

		it('preserves annotations on transactions it does not own', () => {
			const doc = `Intro ${wrap('aaa', 'kept')} tail.`;
			const seen: (string | undefined)[] = [];
			const view = createView(doc, [
				annotationSystemExtension,
				commentSystemExtension,
				EditorView.updateListener.of((update) => {
					for (const tr of update.transactions) {
						if (tr.docChanged) seen.push(tr.annotation(remoteAnnotation));
					}
				}),
			]);

			view.dispatch({
				changes: { from: 0, to: doc.length, insert: doc.replace('Intro', 'Outro') },
				annotations: remoteAnnotation.of('remote'),
			});

			expect(seen).toContain('remote');
		});

		it('protects tags from a partial user edit', () => {
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

		it('protects tags from a multi-change user edit', () => {
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

		it('drops comments fully covered by a deleted paragraph', () => {
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

		it('drops every fully covered comment in a selection', () => {
			const doc = `head ${wrap('aaa', 'one')} mid ${wrap('bbb', 'two')} tail`;
			const view = createView(doc);

			view.dispatch({
				changes: { from: 5, to: doc.length - 5, insert: '' },
				annotations: Transaction.userEvent.of('delete.selection'),
			});

			expect(view.state.doc.toString()).toBe('head  tail');
			expect(parsedIds(view)).toEqual([]);
		});

		it('keeps comments whose tags are only partially selected', () => {
			const doc = `head ${wrap('aaa', 'one')} tail`;
			const view = createView(doc);
			const [comment] = commentService.parseComments(doc);

			view.dispatch({
				changes: { from: 0, to: comment.closeTagStart! - 1, insert: '' },
				annotations: Transaction.userEvent.of('delete.selection'),
			});

			expect(parsedIds(view)).toEqual(['aaa']);
		});

		it('stops protecting once the document no longer contains comments', () => {
			const doc = `head ${wrap('aaa', 'one')} tail`;
			const view = createView(doc);

			view.dispatch({ changes: { from: 0, to: doc.length, insert: 'clean' } });
			expect(rangeIds(view)).toEqual([]);

			view.dispatch({
				changes: { from: 0, to: 5, insert: 'replaced' },
				annotations: Transaction.userEvent.of('input.type'),
			});

			expect(view.state.doc.toString()).toBe('replaced');
		});

		it('leaves documents without comments untouched', () => {
			const view = createView('plain \\textbf{text}');

			view.dispatch({
				changes: { from: 0, to: 5, insert: 'other' },
				annotations: Transaction.userEvent.of('input.type'),
			});

			expect(view.state.doc.toString()).toBe('other \\textbf{text}');
		});
	});

	describe('explicit comment actions', () => {
		it('unwraps a comment and keeps its text', () => {
			const view = createView(`before ${wrap('aaa', 'kept')} after`);

			expect(unwrapCommentById(view, 'aaa')).toBe(true);
			expect(view.state.doc.toString()).toBe('before kept after');
			expect(view.state.field(commentState).size).toBe(0);
		});

		it('returns false when unwrapping an unknown id', () => {
			const view = createView(wrap('aaa', 'kept'));
			expect(unwrapCommentById(view, 'missing')).toBe(false);
		});

		it('unwraps only the requested nested comment', () => {
			const view = createView(wrap('outer', `x ${wrap('inner', 'deep')} y`));

			expect(unwrapCommentById(view, 'inner')).toBe(true);
			expect(parsedIds(view)).toEqual(['outer']);
			expect(view.state.doc.toString()).toContain('x deep y');
		});

		it('deletes a comment and its text', () => {
			const view = createView(`before ${wrap('aaa', 'kept')} after`);

			expect(deleteCommentById(view, 'aaa')).toBe(true);
			expect(view.state.doc.toString()).toBe('before  after');
		});

		it('returns false when deleting an unknown id', () => {
			const view = createView(wrap('aaa', 'kept'));
			expect(deleteCommentById(view, 'missing')).toBe(false);
		});

		it('leaves sibling comments intact', () => {
			const view = createView(`${wrap('aaa', 'one')} mid ${wrap('bbb', 'two')}`);

			expect(deleteCommentById(view, 'aaa')).toBe(true);
			expect(parsedIds(view)).toEqual(['bbb']);
		});
	});
});
