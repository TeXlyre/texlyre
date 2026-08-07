import { EditorState } from '@codemirror/state';
import { syntaxTree, ensureSyntaxTree } from '@codemirror/language';
import { json } from '@codemirror/lang-json';

import {
    commentMaskingExtension,
    maskCommentTags,
    maskCommentText,
    getCommentMaskRanges,
    withCommentMasking,
} from '@src/extensions/codemirror/commentMasking';

const openTag = (id: string) =>
    `\`<### comment id: ${id}, user: t, time: 1, content: 'n', responses: [], resolved: false ###>\``;
const closeTag = (id: string) => `\`</### comment id: ${id} ###>\``;
const wrap = (id: string, text: string) => `${openTag(id)}${text}${closeTag(id)}`;

const create = (doc: string) =>
    EditorState.create({
        doc,
        extensions: [commentMaskingExtension, withCommentMasking(json())],
    });

describe('commentMasking', () => {
    it('masks tags with same-length whitespace', () => {
        const doc = `{"a": ${wrap('aaa', '1')}}`;
        const state = create(doc);
        const masked = maskCommentText(state);

        expect(masked.length).toBe(doc.length);
        expect(masked).toBe(`{"a": ${' '.repeat(openTag('aaa').length)}1${' '.repeat(closeTag('aaa').length)}}`);
    });

    it('preserves newlines inside masked tags', () => {
        const doc = `x\`<### comment\nid: aaa, user: t, time: 1, content: 'n', responses: [], resolved: false ###>\`y${closeTag('aaa')}`;
        const state = create(doc);
        const masked = maskCommentText(state);

        expect(masked.length).toBe(doc.length);
        expect(masked.split('\n')).toHaveLength(2);
        expect(masked).toContain('y');
    });

    it('reports mask ranges', () => {
        const doc = `{"a": ${wrap('aaa', '1')}}`;
        const ranges = getCommentMaskRanges(create(doc));

        expect(ranges).toHaveLength(2);
        expect(doc.slice(ranges[0].from, ranges[0].to)).toBe(openTag('aaa'));
        expect(doc.slice(ranges[1].from, ranges[1].to)).toBe(closeTag('aaa'));
    });

    it('parses the document as if the tags were not there', () => {
        const doc = `{"a": ${wrap('aaa', '1')}, "b": 2}`;
        const state = create(doc);
        const tree = ensureSyntaxTree(state, doc.length, 5000)!;

        const types: string[] = [];
        tree.iterate({ enter: (n) => { types.push(n.name); } });

        expect(types).toContain('JsonText');
        expect(types).not.toContain('⚠');
    });

    it('produces errors without masking', () => {
        const doc = `{"a": ${wrap('aaa', '1')}, "b": 2}`;
        const state = EditorState.create({ doc, extensions: [json()] });
        const tree = ensureSyntaxTree(state, doc.length, 5000)!;

        const types: string[] = [];
        tree.iterate({ enter: (n) => { types.push(n.name); } });

        expect(types).toContain('⚠');
    });

    it('leaves comment-free documents untouched', () => {
        const doc = '{"a": 1}';
        const state = create(doc);

        expect(maskCommentText(state)).toBe(doc);
        expect(getCommentMaskRanges(state)).toEqual([]);
    });

    it('recomputes ranges on document changes', () => {
        const state = create('{"a": 1}');
        const next = state.update({
            changes: { from: 6, to: 7, insert: wrap('aaa', '1') },
        }).state;

        expect(getCommentMaskRanges(next)).toHaveLength(2);
    });

    it('joins text split by a tag into one token', () => {
        const doc = `{"a${wrap('aaa', 'b')}": 1}`;
        const state = create(doc);
        const tree = ensureSyntaxTree(state, doc.length, 5000)!;

        const strings: string[] = [];
        tree.iterate({
            enter: (n) => {
                if (n.name === 'PropertyName') strings.push(doc.slice(n.from, n.to));
            },
        });

        expect(strings).toHaveLength(1);
    });

    it('reparses when a comment is removed', () => {
        const doc = `{"a": ${wrap('aaa', '1')}, "b": 2}`;
        const state = create(doc);
        ensureSyntaxTree(state, doc.length, 5000);

        const [comment] = require('@src/services/CommentService').commentService.parseComments(doc);
        const next = state.update({
            changes: [
                { from: comment.closeTagStart, to: comment.closeTagEnd, insert: '' },
                { from: comment.openTagStart, to: comment.openTagEnd, insert: '' },
            ],
        }).state;

        expect(getCommentMaskRanges(next)).toEqual([]);

        const types: string[] = [];
        ensureSyntaxTree(next, next.doc.length, 5000)!.iterate({
            enter: (n) => { types.push(n.name); },
        });

        expect(types).not.toContain('\u26a0');
    });

    it('shifts ranges without rescanning for edits that cannot form tags', () => {
        const doc = `{"a": ${wrap('aaa', '1')}}`;
        const state = create(doc);
        const before = getCommentMaskRanges(state);

        const next = state.update({
            changes: { from: 0, to: 0, insert: '\n\n' },
        }).state;
        const after = getCommentMaskRanges(next);

        expect(after.map((r) => r.from)).toEqual(before.map((r) => r.from + 2));
        expect(next.doc.toString().slice(after[0].from, after[0].to)).toBe(
            openTag('aaa'),
        );
    });

    it('keeps tag boundaries when typing next to a tag', () => {
        const doc = `{"a": ${wrap('aaa', '1')}}`;
        const state = create(doc);
        const [before] = getCommentMaskRanges(state);

        const next = state.update({
            changes: { from: before.to, to: before.to, insert: '0' },
        }).state;
        const [after] = getCommentMaskRanges(next);

        expect(after.to).toBe(before.to);
    });

    it('rescans when a tag is broken by a deletion', () => {
        const doc = `{"a": ${wrap('aaa', '1')}}`;
        const state = create(doc);
        const [range] = getCommentMaskRanges(state);

        const next = state.update({
            changes: { from: range.from + 1, to: range.from + 5, insert: '' },
        }).state;

        expect(getCommentMaskRanges(next)).toEqual([]);
    });

    it('maskCommentTags is a no-op for empty ranges', () => {
        expect(maskCommentTags('abc', [])).toBe('abc');
    });
});
