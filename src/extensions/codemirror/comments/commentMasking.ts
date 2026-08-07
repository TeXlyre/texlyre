// src/extensions/codemirror/comments/commentMasking.ts
import { ParseContext, type LanguageSupport } from '@codemirror/language';
import {
	StateField,
	type EditorState,
	type Extension,
	type Transaction,
} from '@codemirror/state';
import type { Input, PartialParse, TreeFragment } from '@lezer/common';

import {
	collectAnnotationTagRanges,
	hasAnnotationTags,
} from '../../../utils/annotationTagUtils';

export interface MaskRange {
	from: number;
	to: number;
}

function collectTagRanges(text: string): MaskRange[] {
	if (!hasAnnotationTags(text)) return [];

	return collectAnnotationTagRanges(text);
}

function touchesTagSyntax(tr: Transaction): boolean {
	let touches = false;

	tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
		if (touches) return;

		touches =
			inserted.toString().includes('#') ||
			(toA > fromA && tr.startState.doc.sliceString(fromA, toA).includes('#'));
	});

	return touches;
}

export const commentMaskRanges = StateField.define<MaskRange[]>({
	create(state) {
		return collectTagRanges(state.doc.toString());
	},

	update(ranges, tr) {
		if (!tr.docChanged) return ranges;

		if (!touchesTagSyntax(tr)) {
			return ranges.length
				? ranges.map((range) => ({
						from: tr.changes.mapPos(range.from, 1),
						to: tr.changes.mapPos(range.to, -1),
					}))
				: ranges;
		}

		return collectTagRanges(tr.state.doc.toString());
	},
});

export function getCommentMaskRanges(state: EditorState): MaskRange[] {
	return state.field(commentMaskRanges, false) ?? [];
}

export function isInsideCommentTag(
	state: EditorState,
	from: number,
	to: number,
): boolean {
	return getCommentMaskRanges(state).some(
		(range) => from < range.to && to > range.from,
	);
}

export function maskCommentTags(
	text: string,
	ranges: readonly MaskRange[],
): string {
	if (!ranges.length) return text;

	let masked = '';
	let pos = 0;

	for (const range of ranges) {
		const from = Math.max(pos, range.from);
		const to = Math.min(text.length, range.to);

		if (to <= from) continue;

		masked += text.slice(pos, from);
		masked += text.slice(from, to).replace(/[^\n]/g, ' ');
		pos = to;
	}

	return masked + text.slice(pos);
}

export function maskCommentText(state: EditorState): string {
	return maskCommentTags(state.doc.toString(), getCommentMaskRanges(state));
}

function subtractMask(
	ranges: readonly MaskRange[],
	mask: readonly MaskRange[],
): MaskRange[] {
	const result: MaskRange[] = [];

	for (const range of ranges) {
		let pos = range.from;

		for (const masked of mask) {
			const from = Math.max(masked.from, range.from + 1);
			const to = Math.min(masked.to, range.to - 1);

			if (to <= from || to <= pos) continue;

			if (from > pos) result.push({ from: pos, to: from });
			pos = Math.max(pos, to);
		}

		if (pos < range.to) result.push({ from: pos, to: range.to });
	}

	return result.length ? result : ranges.slice();
}

type RangedParser = {
	createParse: (
		input: Input,
		fragments: readonly TreeFragment[],
		ranges: readonly MaskRange[],
	) => PartialParse;
};

const MASKED = Symbol.for('texlyre.commentMaskedParser');

export function withCommentMasking(support: LanguageSupport): LanguageSupport {
	const parser = support.language.parser as unknown as RangedParser &
		Record<symbol, boolean>;

	if (typeof parser?.createParse !== 'function' || parser[MASKED]) {
		return support;
	}

	const createParse = parser.createParse.bind(parser);

	parser.createParse = (input, fragments, ranges) => {
		const state = ParseContext.get()?.state;
		const mask = state ? getCommentMaskRanges(state) : [];

		return createParse(
			input,
			fragments,
			mask.length ? subtractMask(ranges, mask) : ranges,
		);
	};
	parser[MASKED] = true;

	return support;
}

export const commentMaskingExtension: Extension = [commentMaskRanges];
