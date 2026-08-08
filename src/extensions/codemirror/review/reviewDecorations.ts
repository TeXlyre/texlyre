import type { StateField, Text } from '@codemirror/state';
import {
	Decoration,
	EditorView,
	ViewPlugin,
	WidgetType,
} from '@codemirror/view';

import type { CommentResponse } from '../../../types/comments';
import type { ReviewSegment, ReviewSnapshot } from '../../../types/review';
import { stripAnnotationTagTokens } from '../../../utils/annotationTagUtils';
import {
	type DecorationEntry,
	hiddenTagEntries,
} from '../annotations/tagDecorations';
import type { TagRange } from '../annotations/tagRanges';
import { computeReviewSegments, readReviewBody } from './reviewSegments';

export interface ReviewChunk extends TagRange {
	user: string;
	timestamp: number;
	originalText: string;
	responses: CommentResponse[];
}

const SEGMENT_CACHE_LIMIT = 200;
const segmentCache = new Map<string, ReviewSegment[]>();

function cachedSegments(
	originalText: string,
	currentText: string,
): ReviewSegment[] {
	const key = `${originalText}\u0000${currentText}`;
	const cached = segmentCache.get(key);

	if (cached) return cached;

	const segments = computeReviewSegments(originalText, currentText);

	if (segmentCache.size >= SEGMENT_CACHE_LIMIT) {
		segmentCache.clear();
	}

	segmentCache.set(key, segments);
	return segments;
}

class DeletedTextWidget extends WidgetType {
	constructor(
		readonly text: string,
		readonly id: string,
	) {
		super();
	}

	eq(other: DeletedTextWidget): boolean {
		return this.text === other.text && this.id === other.id;
	}

	toDOM(): HTMLElement {
		const span = document.createElement('span');
		span.className = 'cm-review-deleted';
		span.dataset.reviewId = this.id;
		span.textContent = this.text;
		return span;
	}

	ignoreEvent() {
		return false;
	}
}

export function buildReviewDecorations(
	chunk: ReviewChunk,
	doc: Text,
): DecorationEntry[] {
	const positions = {
		openTag: { start: chunk.openStart, end: chunk.openEnd },
		content: { start: chunk.openEnd, end: chunk.closeStart },
		closeTag: { start: chunk.closeStart, end: chunk.closeEnd },
	};

	const entries = hiddenTagEntries(
		chunk.id,
		positions,
		'review-open-tag',
		'review-close-tag',
	);

	const body = readReviewBody(doc.sliceString(chunk.openEnd, chunk.closeStart));

	for (const segment of cachedSegments(chunk.originalText, body.text)) {
		if (segment.type === 'equal') continue;

		if (segment.type === 'delete') {
			entries.push({
				decoration: Decoration.widget({
					widget: new DeletedTextWidget(segment.text, chunk.id),
					side: -1,
				}),
				from: chunk.openEnd + body.docOffset(segment.from),
				to: chunk.openEnd + body.docOffset(segment.from),
				priority: 400 + segment.from,
			});
			continue;
		}

		entries.push({
			decoration: Decoration.mark({
				class: 'cm-review-inserted',
				attributes: { 'data-review-id': chunk.id },
			}),
			from: chunk.openEnd + body.docOffset(segment.from),
			to: chunk.openEnd + body.docOffset(segment.to),
			priority: 500 + segment.from,
		});
	}

	return entries;
}

export function reviewSnapshots(
	chunks: readonly ReviewChunk[],
	doc: Text,
	blockTopAt: (pos: number) => number,
): ReviewSnapshot[] {
	return chunks.map((chunk) => ({
		id: chunk.id,
		user: chunk.user,
		timestamp: chunk.timestamp,
		originalText: chunk.originalText,
		currentText: stripAnnotationTagTokens(
			readReviewBody(doc.sliceString(chunk.openEnd, chunk.closeStart)).text,
			['comment'],
		),
		responses: chunk.responses,
		line: doc.lineAt(chunk.openStart).number,
		docTop: blockTopAt(chunk.openStart),
	}));
}

export function createReviewReporter(field: StateField<ReviewChunk[]>) {
	return ViewPlugin.define((view) => {
		let frame: number | null = null;

		const report = () => {
			frame = null;

			const chunks = view.state.field(field, false);
			if (!chunks) return;

			document.dispatchEvent(
				new CustomEvent('reviews-changed', {
					detail: {
						reviews: reviewSnapshots(
							chunks,
							view.state.doc,
							(pos) => view.lineBlockAt(pos).top,
						),
						documentTop: view.documentTop,
						view,
					},
				}),
			);
		};

		const schedule = () => {
			if (frame !== null) return;
			frame = requestAnimationFrame(report);
		};

		view.scrollDOM.addEventListener('scroll', schedule);
		window.addEventListener('resize', schedule);
		document.addEventListener('request-reviews', schedule);
		schedule();

		return {
			update: schedule,
			destroy: () => {
				view.scrollDOM.removeEventListener('scroll', schedule);
				window.removeEventListener('resize', schedule);
				document.removeEventListener('request-reviews', schedule);
				if (frame !== null) cancelAnimationFrame(frame);
			},
		};
	});
}

export const reviewClickHandler = EditorView.domEventHandlers({
	click(event) {
		const target = (event.target as HTMLElement)?.closest(
			'.cm-review-inserted, .cm-review-deleted',
		) as HTMLElement | null;

		const reviewId = target?.dataset.reviewId;
		if (!reviewId) return false;

		document.dispatchEvent(
			new CustomEvent('scroll-to-review', { detail: { reviewId } }),
		);

		return false;
	},
});
