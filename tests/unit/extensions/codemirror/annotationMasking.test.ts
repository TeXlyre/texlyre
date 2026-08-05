import { json } from '@codemirror/lang-json';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';

import {
	annotationMaskingExtension,
	getAnnotationMaskRanges,
	maskAnnotationTags,
	maskAnnotationText,
	withAnnotationMasking,
} from '@src/extensions/codemirror/annotations/annotationMasking';
import { commentService } from '@src/services/CommentService';

const openTag = (id: string) =>
	`\`<### comment id: ${id}, user: t, time: 1, content: 'n', responses: [], resolved: false ###>\``;
const closeTag = (id: string) => `\`</### comment id: ${id} ###>\``;
const wrap = (id: string, text: string) => `${openTag(id)}${text}${closeTag(id)}`;
const reviewOpenTag = (id: string) =>
	`\`<### review id: ${id}, user: t, time: 1, original: 'b2xk', responses: [] ###>\``;
const reviewCloseTag = (id: string) => `\`</### review id: ${id} ###>\``;
const reviewWrap = (id: string, text: string) =>
	`${reviewOpenTag(id)}${text}${reviewCloseTag(id)}`;

const create = (doc: string) =>
	EditorState.create({
		doc,
		extensions: [annotationMaskingExtension, withAnnotationMasking(json())],
	});

const parseTypes = (state: EditorState) => {
	const types: string[] = [];
	ensureSyntaxTree(state, state.doc.length, 5000)!.iterate({
		enter: (node) => {
			types.push(node.name);
		},
	});
	return types;
};

describe('annotationMasking', () => {
	it('masks comment tags with same-length whitespace', () => {
		const doc = `{"a": ${wrap('aaa', '1')}}`;
		const masked = maskAnnotationText(create(doc));

		expect(masked.length).toBe(doc.length);
		expect(masked).toBe(
			`{"a": ${' '.repeat(openTag('aaa').length)}1${' '.repeat(closeTag('aaa').length)}}`,
		);
	});

	it('preserves newlines inside masked tags', () => {
		const doc = `x\`<### comment\nid: aaa, user: t, time: 1, content: 'n', responses: [], resolved: false ###>\`y${closeTag('aaa')}`;
		const masked = maskAnnotationText(create(doc));

		expect(masked.length).toBe(doc.length);
		expect(masked.split('\n')).toHaveLength(2);
		expect(masked).toContain('y');
	});

	it('derives mask ranges from the current document', () => {
		const doc = `{"a": ${wrap('aaa', '1')}}`;
		const ranges = getAnnotationMaskRanges(create(doc));

		expect(ranges).toHaveLength(2);
		expect(doc.slice(ranges[0].from, ranges[0].to)).toBe(openTag('aaa'));
		expect(doc.slice(ranges[1].from, ranges[1].to)).toBe(closeTag('aaa'));
	});

	it('parses as if comment tags were absent', () => {
		const doc = `{"a": ${wrap('aaa', '1')}, "b": 2}`;
		const types = parseTypes(create(doc));
		expect(types).toContain('JsonText');
		expect(types).not.toContain('⚠');
	});

	it('shows the syntax error without masking', () => {
		const doc = `{"a": ${wrap('aaa', '1')}, "b": 2}`;
		const state = EditorState.create({ doc, extensions: [json()] });
		expect(parseTypes(state)).toContain('⚠');
	});

	it('leaves annotation-free documents untouched', () => {
		const doc = '{"a": 1}';
		const state = create(doc);
		expect(maskAnnotationText(state)).toBe(doc);
		expect(getAnnotationMaskRanges(state)).toEqual([]);
	});

	it('re-derives ranges after every document change', () => {
		const doc = `{"a": ${wrap('aaa', '1')}}`;
		const state = create(doc);
		const before = getAnnotationMaskRanges(state);
		const shifted = state.update({
			changes: { from: 0, insert: '\n\n' },
		}).state;
		const after = getAnnotationMaskRanges(shifted);

		expect(after.map((range) => range.from)).toEqual(
			before.map((range) => range.from + 2),
		);
		expect(shifted.doc.sliceString(after[0].from, after[0].to)).toBe(
			openTag('aaa'),
		);
	});

	it('removes mask ranges immediately when tags are removed', () => {
		const doc = `{"a": ${wrap('aaa', '1')}, "b": 2}`;
		const state = create(doc);
		const [comment] = commentService.parseComments(doc);
		const next = state.update({
			changes: [
				{ from: comment.closeTagStart!, to: comment.closeTagEnd!, insert: '' },
				{ from: comment.openTagStart!, to: comment.openTagEnd!, insert: '' },
			],
		}).state;

		expect(getAnnotationMaskRanges(next)).toEqual([]);
		expect(parseTypes(next)).not.toContain('⚠');
	});

	it('removes mask ranges immediately when tag syntax is broken', () => {
		const doc = `{"a": ${wrap('aaa', '1')}}`;
		const state = create(doc);
		const [range] = getAnnotationMaskRanges(state);
		const next = state.update({
			changes: { from: range.from + 1, to: range.from + 5, insert: '' },
		}).state;

		expect(getAnnotationMaskRanges(next)).toEqual([]);
	});

	it('keeps tag boundaries stable when typing next to a tag', () => {
		const doc = `{"a": ${wrap('aaa', '1')}}`;
		const state = create(doc);
		const [before] = getAnnotationMaskRanges(state);
		const next = state.update({
			changes: { from: before.to, insert: '0' },
		}).state;
		const [after] = getAnnotationMaskRanges(next);
		expect(after.to).toBe(before.to);
	});

	it('joins text split by hidden tags into one syntax token', () => {
		const doc = `{"a${wrap('aaa', 'b')}": 1}`;
		const state = create(doc);
		const strings: string[] = [];
		ensureSyntaxTree(state, doc.length, 5000)!.iterate({
			enter: (node) => {
				if (node.name === 'PropertyName') strings.push(doc.slice(node.from, node.to));
			},
		});
		expect(strings).toHaveLength(1);
	});

	it('maskAnnotationTags is a no-op for empty ranges', () => {
		expect(maskAnnotationTags('abc', [])).toBe('abc');
	});

	it('masks review tags through the same ranges', () => {
		const doc = `{"a": ${reviewWrap('bbb', '1')}}`;
		const masked = maskAnnotationText(create(doc));
		expect(masked.length).toBe(doc.length);
		expect(masked).toBe(
			`{"a": ${' '.repeat(reviewOpenTag('bbb').length)}1${' '.repeat(reviewCloseTag('bbb').length)}}`,
		);
	});

	it('derives comment and review mask ranges together', () => {
		const doc = `{"a": ${wrap('aaa', '1')}, "b": ${reviewWrap('bbb', '2')}}`;
		const ranges = getAnnotationMaskRanges(create(doc));
		expect(ranges).toHaveLength(4);
		expect(doc.slice(ranges[2].from, ranges[2].to)).toBe(reviewOpenTag('bbb'));
		expect(doc.slice(ranges[3].from, ranges[3].to)).toBe(reviewCloseTag('bbb'));
	});

	it('parses documents containing review tags', () => {
		const doc = `{"a": ${reviewWrap('bbb', '1')}}`;
		const state = create(doc);
		ensureSyntaxTree(state, doc.length, 5000);
		expect(syntaxTree(state).topNode.type.name).toBe('JsonText');
	});
});
