// src/extensions/codemirror/CommentExtension.ts
import type { StateEffect } from '@codemirror/state';
import { Decoration, type EditorView } from '@codemirror/view';

import { createNamedLogger } from '@/logging';
import type { Comment } from '../../types/comments';
import { commentBubbleExtension } from './CommentBubbleExtension';
import { commentMaskingExtension } from './comments/commentMasking';
import { contentProcessorExtension } from './comments/contentProcessor';
import {
	type DecorationEntry,
	createTagDecorationField,
	hiddenTagEntries,
} from './comments/tagDecorations';
import {
	annotationPasteSanitizer,
	createTagProtection,
} from './comments/tagProtection';
import {
	type TagPayload,
	createAtomicTagRanges,
	createTagEffects,
	createTagRangeField,
} from './comments/tagRanges';

const moduleLog = createNamedLogger('CommentExtension');

interface CommentPayload extends TagPayload {
	resolved?: boolean;
}

const commentEffects = createTagEffects<CommentPayload>();

export const addComment = commentEffects.add;
export const clearComments = commentEffects.clear;

export const commentRanges = createTagRangeField(commentEffects, (id) =>
	moduleLog.warn(`Invalid comment range for comment ${id}, skipping`),
);

const commentProtection = createTagProtection(
	commentRanges,
	commentEffects,
	moduleLog,
);

export const commentState = createTagDecorationField(
	commentEffects,
	({ id, positions, resolved }): DecorationEntry[] => {
		const entries = hiddenTagEntries(
			id,
			positions,
			'comment-open-tag',
			'comment-close-tag',
		);

		if (!resolved && positions.content.start < positions.content.end) {
			entries.push({
				decoration: Decoration.mark({
					class: 'cm-comment-content',
					attributes: { 'data-comment-id': id },
				}),
				from: positions.content.start,
				to: positions.content.end,
				priority: 500 + positions.content.start,
			});
		}

		return entries;
	},
);

export function processComments(view: EditorView, comments: Comment[]): void {
	if (!view || !Array.isArray(comments)) return;

	if (comments.length === 0) {
		const decorations = view.state.field(commentState, false);
		const ranges = view.state.field(commentRanges, false);

		if (decorations?.size || ranges?.length) {
			view.dispatch({ effects: [clearComments.of(null)] });
		}

		return;
	}

	try {
		const effects: StateEffect<unknown>[] = [clearComments.of(null)];
		const docLength = view.state.doc.length;

		const sortedComments = Array.from(
			new Map(comments.map((comment) => [comment.id, comment])).values(),
		).sort((a, b) => a.openTagStart - b.openTagStart);

		for (const comment of sortedComments) {
			if (
				comment.openTagStart === undefined ||
				comment.openTagEnd === undefined ||
				comment.closeTagStart === undefined ||
				comment.closeTagEnd === undefined
			) {
				continue;
			}

			if (
				comment.openTagStart < 0 ||
				comment.closeTagEnd > docLength ||
				comment.openTagStart >= comment.openTagEnd ||
				comment.closeTagStart >= comment.closeTagEnd ||
				comment.openTagEnd > comment.closeTagStart
			) {
				moduleLog.warn(
					`Invalid comment positions for comment ${comment.id}, skipping`,
				);
				continue;
			}

			effects.push(
				addComment.of({
					id: comment.id,
					positions: {
						openTag: {
							start: comment.openTagStart,
							end: comment.openTagEnd,
						},
						content: {
							start: comment.openTagEnd,
							end: comment.closeTagStart,
						},
						closeTag: {
							start: comment.closeTagStart,
							end: comment.closeTagEnd,
						},
					},
					resolved: comment.resolved,
				}),
			);
		}

		const hasState =
			view.state.field(commentState, false)?.size ||
			view.state.field(commentRanges, false)?.length;

		if (effects.length > 1 || hasState) {
			view.dispatch({ effects });
		}
	} catch (error) {
		moduleLog.error('Error dispatching comment effects:', error);
	}
}

export function unwrapCommentById(view: EditorView, id: string): boolean {
	return commentProtection.unwrapById(view, id);
}

export function deleteCommentById(view: EditorView, id: string): boolean {
	return commentProtection.replaceById(view, id, '');
}

export const commentSystemExtension = [
	commentMaskingExtension,
	commentRanges,
	commentState,
	createAtomicTagRanges(commentRanges),
	commentProtection.extension,
	annotationPasteSanitizer,
	contentProcessorExtension,
	...commentBubbleExtension,
];
