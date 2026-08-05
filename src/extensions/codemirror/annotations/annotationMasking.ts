// src/extensions/codemirror/annotations/annotationMasking.ts
import { ParseContext, type LanguageSupport } from '@codemirror/language';
import {
	StateField,
	type EditorState,
	type Extension,
	type Text,
} from '@codemirror/state';
import type { Input, PartialParse, TreeFragment } from '@lezer/common';

import {
	annotationIndex,
	type AnnotationTagRange,
	annotationText,
	getAnnotationRanges,
	tagSyntaxUntouched,
} from './annotationIndex';

export interface MaskRange {
	from: number;
	to: number;
}

const maskedTexts = new WeakMap<Text, string>();

function mergeSpans(ranges: readonly AnnotationTagRange[]): MaskRange[] {
	const spans = ranges
		.flatMap((range) => [
			{ from: range.openStart, to: range.openEnd },
			{ from: range.closeStart, to: range.closeEnd },
		])
		.filter((span) => span.from < span.to)
		.sort((a, b) => a.from - b.from);

	const merged: MaskRange[] = [];
	for (const span of spans) {
		const last = merged[merged.length - 1];
		if (last && span.from < last.to) last.to = Math.max(last.to, span.to);
		else merged.push({ ...span });
	}
	return merged;
}

export const annotationMaskRanges = StateField.define<MaskRange[]>({
	create(state) {
		return mergeSpans(getAnnotationRanges(state));
	},

	update(ranges, tr) {
		if (!tr.docChanged) return ranges;

		const before = getAnnotationRanges(tr.startState);
		if (!tagSyntaxUntouched(tr, before, before)) {
			return mergeSpans(getAnnotationRanges(tr.state));
		}

		return ranges.map((range) => {
			const from = tr.changes.mapPos(range.from, 1);
			const to = tr.changes.mapPos(range.to, -1);
			return from === range.from && to === range.to ? range : { from, to };
		});
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
	const ranges = getAnnotationMaskRanges(state);
	if (!ranges.length) return false;

	// Mask ranges are sorted and non-overlapping. Find the first range whose
	// end is after the change start instead of scanning every annotation.
	let low = 0;
	let high = ranges.length;
	while (low < high) {
		const mid = (low + high) >> 1;
		if (ranges[mid].to <= from) low = mid + 1;
		else high = mid;
	}

	const range = ranges[low];
	if (!range) return false;
	return from === to
		? from > range.from && from < range.to
		: from < range.to && to > range.from;
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
	const cached = maskedTexts.get(state.doc);
	if (cached !== undefined) return cached;

	const masked = maskAnnotationTags(
		annotationText(state.doc),
		getAnnotationMaskRanges(state),
	);
	maskedTexts.set(state.doc, masked);
	return masked;
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

export const annotationMaskingExtension: Extension = [
	annotationIndex,
	annotationMaskRanges,
];
