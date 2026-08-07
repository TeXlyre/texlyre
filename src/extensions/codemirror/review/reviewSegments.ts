// src/extensions/codemirror/review/reviewSegments.ts
import { presentableDiff } from '@codemirror/merge';

import type { ReviewSegment } from '../../../types/review';

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
