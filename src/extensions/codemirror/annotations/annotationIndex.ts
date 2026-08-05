import {
	type ChangeSet,
	type EditorState,
	StateField,
	type Text,
	type Transaction,
} from '@codemirror/state';

import {
	ANNOTATION_KINDS,
	type AnnotationKind,
	containsAnnotationMarker,
	scanAnnotationTags,
} from '../../../utils/annotationTagUtils';
import type { TagRange } from './tagRanges';

export interface AnnotationTagRange extends TagRange {
	kind: AnnotationKind;
}

const SYNTAX_CONTEXT = 64;

const docTexts = new WeakMap<Text, string>();

const hasMarker = (text: string) =>
	ANNOTATION_KINDS.some((kind) => containsAnnotationMarker(text, kind));

export function annotationText(doc: Text): string {
	const cached = docTexts.get(doc);
	if (cached !== undefined) return cached;

	const text = doc.toString();
	docTexts.set(doc, text);
	return text;
}

function scanAnnotations(doc: Text): AnnotationTagRange[] {
	const text = annotationText(doc);

	return ANNOTATION_KINDS.flatMap((kind) =>
		scanAnnotationTags(text, kind).map((tag) => ({
			kind,
			id: tag.id,
			openStart: tag.openTagStart,
			openEnd: tag.openTagEnd,
			closeStart: tag.closeTagStart,
			closeEnd: tag.closeTagEnd,
		})),
	).sort((a, b) => a.openStart - b.openStart);
}

const intersectsSpan = (
	from: number,
	to: number,
	spanFrom: number,
	spanTo: number,
) =>
	from === to
		? from > spanFrom && from < spanTo
		: from < spanTo && to > spanFrom;

function touchesSyntax(range: TagRange, from: number, to: number): boolean {
	return (
		intersectsSpan(from, to, range.openStart, range.openEnd) ||
		intersectsSpan(from, to, range.closeStart, range.closeEnd)
	);
}

function shiftTagRange<T extends TagRange>(range: T, changes: ChangeSet): T {
	const openStart = changes.mapPos(range.openStart, 1);
	const openEnd = changes.mapPos(range.openEnd, -1);
	const closeStart = changes.mapPos(range.closeStart, 1);
	const closeEnd = changes.mapPos(range.closeEnd, -1);

	if (
		openStart === range.openStart &&
		openEnd === range.openEnd &&
		closeStart === range.closeStart &&
		closeEnd === range.closeEnd
	) {
		return range;
	}

	return { ...range, openStart, openEnd, closeStart, closeEnd };
}

function introducesTags(
	tr: Transaction,
	_syntaxRanges: readonly TagRange[],
	fromA: number,
	toA: number,
	fromB: number,
	toB: number,
): boolean {
	if (hasMarker(tr.startState.doc.sliceString(fromA, toA))) return true;

	const from = Math.max(0, fromB - SYNTAX_CONTEXT);
	const to = Math.min(tr.newDoc.length, toB + SYNTAX_CONTEXT);
	const context = tr.newDoc.sliceString(from, to);
	const marker = /<\/?###(?:\s|%)*(?:comment|review)/g;
	let match: RegExpExecArray | null;

	while ((match = marker.exec(context)) !== null) {
		const start = from + match.index;
		const end = start + match[0].length;
		if (
			fromB === toB ? start < fromB && end > fromB : start < toB && end > fromB
		) {
			return true;
		}
	}

	return false;
}

const syntaxUntouchedCache = new WeakMap<
	Transaction,
	WeakMap<readonly TagRange[], WeakMap<readonly TagRange[], boolean>>
>();

/** True when a transaction leaves all existing annotation syntax intact. */
export function tagSyntaxUntouched(
	tr: Transaction,
	ranges: readonly TagRange[],
	syntaxRanges: readonly TagRange[] = ranges,
): boolean {
	let byRanges = syntaxUntouchedCache.get(tr);
	if (!byRanges) {
		byRanges = new WeakMap();
		syntaxUntouchedCache.set(tr, byRanges);
	}
	let bySyntax = byRanges.get(ranges);
	if (!bySyntax) {
		bySyntax = new WeakMap();
		byRanges.set(ranges, bySyntax);
	}
	const cached = bySyntax.get(syntaxRanges);
	if (cached !== undefined) return cached;

	let untouched = true;
	tr.changes.iterChanges((fromA, toA, fromB, toB) => {
		if (!untouched) return;
		untouched =
			!ranges.some((range) => touchesSyntax(range, fromA, toA)) &&
			!introducesTags(tr, syntaxRanges, fromA, toA, fromB, toB);
	});

	bySyntax.set(syntaxRanges, untouched);
	return untouched;
}

/** True when no change affects the visible body of any tagged range. */
export function tagBodiesUntouched(
	tr: Transaction,
	ranges: readonly TagRange[],
): boolean {
	let untouched = true;

	tr.changes.iterChanges((fromA, toA) => {
		if (!untouched) return;

		untouched = !ranges.some((range) =>
			fromA === toA
				? fromA >= range.openEnd && fromA <= range.closeStart
				: fromA < range.closeStart && toA > range.openEnd,
		);
	});

	return untouched;
}

/**
 * Map ranges through ordinary edits. A full rescan is requested only when tag
 * syntax may have changed or new annotation syntax may have been introduced.
 */
export function reconcileTagRanges<T extends TagRange>(
	ranges: readonly T[],
	tr: Transaction,
	syntaxRanges: readonly TagRange[] = ranges,
): T[] | null {
	if (tagSyntaxUntouched(tr, ranges, syntaxRanges)) {
		return ranges.map((range) => shiftTagRange(range, tr.changes));
	}

	const rewritten = new Map<T, T>();
	let reconciled = true;

	tr.changes.iterChanges((fromA, toA, fromB, _toB, inserted) => {
		if (!reconciled) return;

		const syntaxTouched = ranges.filter((range) =>
			touchesSyntax(range, fromA, toA),
		);

		if (!syntaxTouched.length) {
			reconciled = !introducesTags(
				tr,
				syntaxRanges,
				fromA,
				toA,
				fromB,
				fromB + inserted.length,
			);
			return;
		}

		const [range] = syntaxTouched;
		const open = tr.startState.doc.sliceString(range.openStart, range.openEnd);
		const close = tr.startState.doc.sliceString(
			range.closeStart,
			range.closeEnd,
		);
		const insert = inserted.toString();

		if (
			syntaxTouched.length > 1 ||
			fromA !== range.openStart ||
			toA !== range.closeEnd ||
			insert.length < open.length + close.length ||
			!insert.startsWith(open) ||
			!insert.endsWith(close) ||
			hasMarker(insert.slice(open.length, insert.length - close.length))
		) {
			reconciled = false;
			return;
		}

		rewritten.set(range, {
			...range,
			openStart: fromB,
			openEnd: fromB + open.length,
			closeStart: fromB + insert.length - close.length,
			closeEnd: fromB + insert.length,
		});
	});

	if (!reconciled) return null;

	return ranges.map(
		(range) => rewritten.get(range) ?? shiftTagRange(range, tr.changes),
	);
}

export const annotationIndex = StateField.define<AnnotationTagRange[]>({
	create: (state) => scanAnnotations(state.doc),

	update: (value, tr) =>
		tr.docChanged
			? (reconcileTagRanges(value, tr, value) ?? scanAnnotations(tr.newDoc))
			: value,
});

export function getAnnotationRanges(state: EditorState): AnnotationTagRange[] {
	return state.field(annotationIndex, false) ?? scanAnnotations(state.doc);
}
