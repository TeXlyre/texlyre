// src/extensions/codemirror/annotations/annotationMasking.ts
import { ParseContext, type LanguageSupport } from '@codemirror/language';
import {
	StateField,
	type EditorState,
	type Extension,
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
	return hasAnnotationTags(text) ? collectAnnotationTagRanges(text) : [];
}

export const annotationMaskRanges = StateField.define<MaskRange[]>({
	create(state) {
		return collectTagRanges(state.doc.toString());
	},

	update(ranges, tr) {
		return tr.docChanged ? collectTagRanges(tr.newDoc.toString()) : ranges;
	},
});

export function getAnnotationMaskRanges(state: EditorState): MaskRange[] {
	return state.field(annotationMaskRanges, false) ?? [];
}

export function isInsideAnnotationTag(
	state: EditorState,
	from: number,
	to: number,
): boolean {
	return getAnnotationMaskRanges(state).some(
		(range) => from < range.to && to > range.from,
	);
}

export function maskAnnotationTags(
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

export function maskAnnotationText(state: EditorState): string {
	return maskAnnotationTags(
		state.doc.toString(),
		getAnnotationMaskRanges(state),
	);
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

const MASKED = Symbol.for('texlyre.annotationMaskedParser');

export function withAnnotationMasking(
	support: LanguageSupport,
): LanguageSupport {
	const parser = support.language.parser as unknown as RangedParser &
		Record<symbol, boolean>;

	if (typeof parser?.createParse !== 'function' || parser[MASKED])
		return support;

	const createParse = parser.createParse.bind(parser);
	parser.createParse = (input, fragments, ranges) => {
		const state = ParseContext.get()?.state;
		const mask = state ? getAnnotationMaskRanges(state) : [];
		return createParse(
			input,
			fragments,
			mask.length ? subtractMask(ranges, mask) : ranges,
		);
	};
	parser[MASKED] = true;
	return support;
}

export const annotationMaskingExtension: Extension = [annotationMaskRanges];
