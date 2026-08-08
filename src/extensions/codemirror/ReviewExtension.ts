// src/extensions/codemirror/ReviewExtension.ts
import { type EditorState, StateEffect, StateField } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { createNamedLogger } from '@/logging';
import { reviewService } from '../../services/ReviewService';
import { createDerivedDecorationField } from './annotations/tagDecorations';
import { createTagActions } from './annotations/tagProtection';
import {
	createAtomicTagRanges,
	createDerivedTagRangeField,
} from './annotations/tagRanges';
import {
	type ReviewChunk,
	buildReviewDecorations,
	createReviewReporter,
	reviewClickHandler,
} from './review/reviewDecorations';
import { restoreReviewBody } from './review/reviewSegments';
import {
	type ReviewConfig,
	createTrackChangesFilter,
} from './review/trackChanges';

const moduleLog = createNamedLogger('ReviewExtension');

export const setReviewConfig = StateEffect.define<Partial<ReviewConfig>>();

export const reviewConfig = StateField.define<ReviewConfig>({
	create() {
		return { tracking: false, author: '' };
	},

	update(value, tr) {
		let next = value;
		for (const effect of tr.effects) {
			if (effect.is(setReviewConfig)) next = { ...next, ...effect.value };
		}
		return next;
	},
});

export const reviewChunks = createDerivedTagRangeField<ReviewChunk>((doc) =>
	reviewService.parseReviews(doc).map((review) => ({
		id: review.id,
		openStart: review.openTagStart,
		openEnd: review.openTagEnd,
		closeStart: review.closeTagStart,
		closeEnd: review.closeTagEnd,
		user: review.user,
		timestamp: review.timestamp,
		originalText: review.originalText,
		responses: review.responses,
	})),
);

const reviewActions = createTagActions(reviewChunks, moduleLog);

export const reviewState = createDerivedDecorationField(
	reviewChunks,
	buildReviewDecorations,
);

export function getReviewChunks(state: EditorState): readonly ReviewChunk[] {
	return state.field(reviewChunks, false) ?? [];
}

export function acceptReviewById(view: EditorView, id: string): boolean {
	return reviewActions.unwrapById(view, id);
}

export function rejectReviewById(view: EditorView, id: string): boolean {
	const chunk = getReviewChunks(view.state).find((entry) => entry.id === id);
	if (!chunk) return false;

	return reviewActions.replaceById(
		view,
		id,
		restoreReviewBody(
			view.state.doc.sliceString(chunk.openEnd, chunk.closeStart),
			chunk.originalText,
		),
	);
}

export function resolveAllReviews(view: EditorView, accept: boolean): boolean {
	const chunks = getReviewChunks(view.state);
	if (!chunks.length) return false;

	try {
		view.dispatch({
			changes: chunks.map((chunk) => ({
				from: chunk.openStart,
				to: chunk.closeEnd,
				insert: accept
					? view.state.doc.sliceString(chunk.openEnd, chunk.closeStart)
					: restoreReviewBody(
							view.state.doc.sliceString(chunk.openEnd, chunk.closeStart),
							chunk.originalText,
						),
			})),
		});
		return true;
	} catch (error) {
		moduleLog.error('Error resolving reviews:', error);
		return false;
	}
}

export function replaceReviewTags(
	view: EditorView,
	id: string,
	tags: { openTag: string; closeTag: string },
): boolean {
	const chunk = getReviewChunks(view.state).find((entry) => entry.id === id);
	if (!chunk) return false;

	try {
		view.dispatch({
			changes: [
				{ from: chunk.openStart, to: chunk.openEnd, insert: tags.openTag },
				{ from: chunk.closeStart, to: chunk.closeEnd, insert: tags.closeTag },
			],
		});
		return true;
	} catch (error) {
		moduleLog.error('Error updating review tags:', error);
		return false;
	}
}

export function setTrackChanges(
	view: EditorView,
	config: Partial<ReviewConfig>,
): void {
	view.dispatch({ effects: setReviewConfig.of(config) });
}

export const reviewSystemExtension = [
	reviewChunks,
	reviewConfig,
	reviewState,
	createAtomicTagRanges(reviewChunks),
	createReviewReporter(reviewChunks),
	reviewClickHandler,
	createTrackChangesFilter({
		reviewChunks,
		config: reviewConfig,
	}),
];
