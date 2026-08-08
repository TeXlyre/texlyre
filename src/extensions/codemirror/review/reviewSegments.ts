// src/extensions/codemirror/review/reviewSegments.ts
import { presentableDiff } from '@codemirror/merge';

import type { ReviewSegment } from '../../../types/review';
import {
	collectAnnotationTagRanges,
	scanAnnotationTags,
} from '../../../utils/annotationTagUtils';

export interface ReviewBody {
	text: string;
	docOffset: (position: number) => number;
}

export function readReviewBody(raw: string): ReviewBody {
	const ranges = collectAnnotationTagRanges(raw, ['comment']);

	if (!ranges.length) {
		return { text: raw, docOffset: (position) => position };
	}

	const spans: Array<{ from: number; shift: number }> = [];
	let text = '';
	let pos = 0;

	const push = (from: number, to: number) => {
		spans.push({ from: text.length, shift: from - text.length });
		text += raw.slice(from, to);
	};

	for (const range of ranges) {
		if (range.from > pos) push(pos, range.from);
		pos = Math.max(pos, range.to);
	}

	if (pos < raw.length) push(pos, raw.length);

	return {
		text,
		docOffset: (position) => {
			let shift = 0;

			for (const span of spans) {
				if (span.from > position) break;
				shift = span.shift;
			}

			return position + shift;
		},
	};
}

export function restoreReviewBody(
	raw: string,
	originalText: string,
): string {
	const matches = scanAnnotationTags(raw, 'comment');

	if (!matches.length) return originalText;

	const openTags = matches
		.map((match) => raw.slice(match.openTagStart, match.openTagEnd))
		.join('');
	const closeTags = matches
		.map((match) => raw.slice(match.closeTagStart, match.closeTagEnd))
		.reverse()
		.join('');

	return `${openTags}${originalText}${closeTags}`;
}

export function computeReviewSegments(
	originalText: string,
	currentText: string,
): ReviewSegment[] {
	if (originalText === currentText) {
		return currentText
			? [{ type: 'equal', text: currentText, from: 0, to: currentText.length }]
			: [];
	}

	const segments: ReviewSegment[] = [];
	let posB = 0;

	for (const change of presentableDiff(originalText, currentText)) {
		if (change.fromB > posB) {
			segments.push({
				type: 'equal',
				text: currentText.slice(posB, change.fromB),
				from: posB,
				to: change.fromB,
			});
		}

		if (change.toA > change.fromA) {
			segments.push({
				type: 'delete',
				text: originalText.slice(change.fromA, change.toA),
				from: change.fromB,
				to: change.fromB,
			});
		}

		if (change.toB > change.fromB) {
			segments.push({
				type: 'insert',
				text: currentText.slice(change.fromB, change.toB),
				from: change.fromB,
				to: change.toB,
			});
		}

		posB = change.toB;
	}

	if (posB < currentText.length) {
		segments.push({
			type: 'equal',
			text: currentText.slice(posB),
			from: posB,
			to: currentText.length,
		});
	}

	return segments;
}

export function countReviewChanges(segments: readonly ReviewSegment[]): {
	inserted: number;
	deleted: number;
} {
	let inserted = 0;
	let deleted = 0;

	for (const segment of segments) {
		if (segment.type === 'insert') inserted += segment.text.length;
		if (segment.type === 'delete') deleted += segment.text.length;
	}

	return { inserted, deleted };
}
