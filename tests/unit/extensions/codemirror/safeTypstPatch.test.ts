import { ensureSyntaxTree } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { typstLezerDiagnostics } from 'codemirror-lang-typst/lezer';

import {
	annotationMaskingExtension,
	getAnnotationMaskRanges,
	withAnnotationMasking,
} from '@src/extensions/codemirror/annotations/annotationMasking';
import { safeTypst } from '@src/extensions/codemirror/languages/safeTypstPatch';

const openTag = (id: string) =>
	`\`<### comment id: ${id}, user: t, time: 1, content: 'n', responses: [], resolved: false ###>\``;

const closeTag = (id: string) => `\`</### comment id: ${id} ###>\``;

const wrap = (id: string, text: string) =>
	`${openTag(id)}${text}${closeTag(id)}`;

const reviewOpenTag = (id: string) =>
	`\`<### review id: ${id}, user: t, time: 1, original: 'b2xk', responses: [] ###>\``;

const reviewCloseTag = (id: string) => `\`</### review id: ${id} ###>\``;

const reviewWrap = (id: string, text: string) =>
	`${reviewOpenTag(id)}${text}${reviewCloseTag(id)}`;

const create = (doc: string) =>
	EditorState.create({
		doc,
		extensions: [
			annotationMaskingExtension,
			withAnnotationMasking(safeTypst()),
		],
	});

interface ParsedNode {
	name: string;
	from: number;
	to: number;
	text: string;
}

const parseNodes = (state: EditorState): ParsedNode[] => {
	const nodes: ParsedNode[] = [];

	ensureSyntaxTree(state, state.doc.length, 5000)!.iterate({
		enter(node) {
			nodes.push({
				name: node.name,
				from: node.from,
				to: node.to,
				text: state.doc.sliceString(node.from, node.to),
			});
		},
	});

	return nodes;
};

const findNode = (
	state: EditorState,
	name: string,
	text: string,
): ParsedNode | undefined =>
	parseNodes(state).find(
		(node) => node.name === name && node.text === text,
	);

describe('safeTypst', () => {
	it('preserves normal Typst document positions without annotations', () => {
		const doc = '#let target = 2';
		const state = create(doc);
		const tree = ensureSyntaxTree(state, state.doc.length, 5000)!;
		const target = findNode(state, 'Ident', 'target');

		expect(tree.length).toBe(doc.length);
		expect(target).toEqual({
			name: 'Ident',
			from: doc.indexOf('target'),
			to: doc.indexOf('target') + 'target'.length,
			text: 'target',
		});
	});

	it('restores positions after a comment annotation', () => {
		const doc = `#let first = ${wrap('aaa', '1')}\n#let target = 2`;
		const state = create(doc);
		const tree = ensureSyntaxTree(state, state.doc.length, 5000)!;
		const target = findNode(state, 'Ident', 'target');
		const from = doc.indexOf('target');

		expect(getAnnotationMaskRanges(state)).toHaveLength(2);
		expect(tree.length).toBe(doc.length);
		expect(target).toEqual({
			name: 'Ident',
			from,
			to: from + 'target'.length,
			text: 'target',
		});
	});

	it('restores positions after a review annotation', () => {
		const doc = `#let first = ${reviewWrap('bbb', '1')}\n#let target = 2`;
		const state = create(doc);
		const tree = ensureSyntaxTree(state, state.doc.length, 5000)!;
		const target = findNode(state, 'Ident', 'target');
		const from = doc.indexOf('target');

		expect(getAnnotationMaskRanges(state)).toHaveLength(2);
		expect(tree.length).toBe(doc.length);
		expect(target).toEqual({
			name: 'Ident',
			from,
			to: from + 'target'.length,
			text: 'target',
		});
	});

	it('restores positions after both comment and review annotations', () => {
		const doc =
			`#let one = ${wrap('aaa', '1')}\n` +
			`#let two = ${reviewWrap('bbb', '2')}\n` +
			'#let target = 3';

		const state = create(doc);
		const tree = ensureSyntaxTree(state, state.doc.length, 5000)!;
		const target = findNode(state, 'Ident', 'target');
		const from = doc.indexOf('target');

		expect(getAnnotationMaskRanges(state)).toHaveLength(4);
		expect(tree.length).toBe(doc.length);
		expect(target).toEqual({
			name: 'Ident',
			from,
			to: from + 'target'.length,
			text: 'target',
		});
	});

	it('keeps a Typst identifier intact when a comment splits it', () => {
		const doc = `#let varia${wrap('aaa', 'bl')}e = 1`;
		const state = create(doc);
		const nodes = parseNodes(state);
		const from = doc.indexOf('varia');
		const to = doc.indexOf('e = 1') + 1;

		const identifier = nodes.find(
			(node) =>
				node.name === 'Ident' &&
				node.from === from &&
				node.to === to,
		);

		expect(identifier).toBeDefined();
		expect(identifier!.text).toBe(
			`varia${wrap('aaa', 'bl')}e`,
		);
		expect(nodes.some((node) => node.name === 'Error')).toBe(false);
	});

	it('keeps a Typst identifier intact across nested comment and review tags', () => {
		const nested = reviewWrap(
			'bbb',
			`ri${wrap('aaa', 'ab')}l`,
		);
		const doc = `#let va${nested}e = 1`;
		const state = create(doc);
		const nodes = parseNodes(state);
		const from = doc.indexOf('va');
		const to = doc.indexOf('e = 1') + 1;

		const identifier = nodes.find(
			(node) =>
				node.name === 'Ident' &&
				node.from === from &&
				node.to === to,
		);

		expect(getAnnotationMaskRanges(state)).toHaveLength(4);
		expect(identifier).toBeDefined();
		expect(identifier!.text).toBe(`va${nested}e`);
		expect(nodes.some((node) => node.name === 'Error')).toBe(false);
	});

	it('keeps positions correct after an edit before annotated content', () => {
		const doc =
			`#let first = ${wrap('aaa', '1')}\n` +
			'#let target = 2';

		const state = create(doc);

		ensureSyntaxTree(state, state.doc.length, 5000);

		const insert = '#let prefix = 0\n';
		const next = state.update({
			changes: {
				from: 0,
				insert,
			},
		}).state;

		const nextDoc = next.doc.toString();
		const tree = ensureSyntaxTree(next, next.doc.length, 5000)!;
		const target = findNode(next, 'Ident', 'target');
		const from = nextDoc.indexOf('target');

		expect(tree.length).toBe(nextDoc.length);
		expect(target).toEqual({
			name: 'Ident',
			from,
			to: from + 'target'.length,
			text: 'target',
		});
	});

	it('keeps positions correct after editing annotated content', () => {
		const doc =
			`#let first = ${reviewWrap('bbb', '1')}\n` +
			'#let target = 2';

		const state = create(doc);
		ensureSyntaxTree(state, state.doc.length, 5000);

		const from = state.doc.toString().indexOf('target');
		const next = state.update({
			changes: {
				from,
				to: from + 'target'.length,
				insert: 'updated',
			},
		}).state;

		const nextDoc = next.doc.toString();
		const tree = ensureSyntaxTree(next, next.doc.length, 5000)!;
		const updated = findNode(next, 'Ident', 'updated');
		const updatedFrom = nextDoc.indexOf('updated');

		expect(tree.length).toBe(nextDoc.length);
		expect(updated).toEqual({
			name: 'Ident',
			from: updatedFrom,
			to: updatedFrom + 'updated'.length,
			text: 'updated',
		});
	});

	it('does not introduce lint errors when an annotation splits valid syntax', () => {
		const doc = `#let varia${wrap('aaa', 'bl')}e = 1`;
		const state = create(doc);

		ensureSyntaxTree(state, state.doc.length, 5000);

		expect(typstLezerDiagnostics(state)).toEqual([]);
	});

	it('reports lint diagnostics at real document positions after annotations', () => {
		const doc =
			`#let first = ${wrap('aaa', '1')}\n` +
			`#let second = ${reviewWrap('bbb', '2')}\n` +
			'#let broken =';

		const state = create(doc);

		ensureSyntaxTree(state, state.doc.length, 5000);

		const diagnostics = typstLezerDiagnostics(state);
		const brokenFrom = doc.indexOf('#let broken');

		expect(diagnostics.length).toBeGreaterThan(0);
		expect(
			diagnostics.every(
				(diagnostic) => diagnostic.from >= brokenFrom,
			),
		).toBe(true);
		expect(
			diagnostics.every(
				(diagnostic) =>
					diagnostic.from <= doc.length &&
					diagnostic.to <= doc.length,
			),
		).toBe(true);
	});
});