// src/extensions/codemirror/CommentExtension.ts
import { StateEffect } from '@codemirror/state';
import { Decoration, type EditorView } from '@codemirror/view';

import { createNamedLogger } from '@/logging';
import type { Comment } from '../../types/comments';
import { commentService } from '../../services/CommentService';
import { commentBubbleExtension } from './CommentBubbleExtension';
import { commentMaskingExtension } from './comments/commentMasking';
import { contentProcessorExtension } from './comments/contentProcessor';
import {
	type DecorationEntry,
	createDerivedDecorationField,
	hiddenTagEntries,
} from './comments/tagDecorations';
import { createTagActions, createTagProtection } from './comments/tagProtection';
import {
	createAtomicTagRanges,
	createDerivedTagRangeField,
	type TagRange,
} from './comments/tagRanges';

const moduleLog = createNamedLogger('CommentExtension');

interface CommentChunk extends TagRange {
	resolved?: boolean;
}

export const clearComments = StateEffect.define<null>();

export const commentRanges = createDerivedTagRangeField<CommentChunk>(
	(doc) =>
		commentService.parseComments(doc).map((comment) => ({
			id: comment.id,
			openStart: comment.openTagStart!,
			openEnd: comment.openTagEnd!,
			closeStart: comment.closeTagStart!,
			closeEnd: comment.closeTagEnd!,
			resolved: comment.resolved,
		})),
	clearComments,
);

const commentActions = createTagActions(commentRanges, moduleLog);
export const annotationProtectionExtension = createTagProtection();

export const commentState = createDerivedDecorationField(
	commentRanges,
	(comment): DecorationEntry[] => {
		const entries = hiddenTagEntries(
			comment.id,
			{
				openTag: { start: comment.openStart, end: comment.openEnd },
				closeTag: { start: comment.closeStart, end: comment.closeEnd },
			},
			'comment-open-tag',
			'comment-close-tag',
		);

		if (!comment.resolved && comment.openEnd < comment.closeStart) {
			entries.push({
				decoration: Decoration.mark({
					class: 'cm-comment-content',
					attributes: { 'data-comment-id': comment.id },
				}),
				from: comment.openEnd,
				to: comment.closeStart,
				priority: 500 + comment.openEnd,
			});
		}

		return entries;
	},
);

function validComment(comment: Comment, docLength: number): boolean {
	const { openTagStart, openTagEnd, closeTagStart, closeTagEnd } = comment;
	return (
		openTagStart !== undefined &&
		openTagEnd !== undefined &&
		closeTagStart !== undefined &&
		closeTagEnd !== undefined &&
		openTagStart >= 0 &&
		openTagStart < openTagEnd &&
		openTagEnd <= closeTagStart &&
		closeTagStart < closeTagEnd &&
		closeTagEnd <= docLength
	);
}

/** Compatibility hook for callers that already parse comments externally. */
export function processComments(view: EditorView, comments: Comment[]): void {
	const ranges = view.state.field(commentRanges, false) ?? [];
	const valid = comments.filter((comment) => validComment(comment, view.state.doc.length));
	const same =
		valid.length === comments.length &&
		valid.length === ranges.length &&
		valid.every(
			(comment, index) =>
				comment.id === ranges[index].id &&
				comment.openTagStart === ranges[index].openStart &&
				comment.closeTagEnd === ranges[index].closeEnd &&
				comment.resolved === ranges[index].resolved,
		);

	if (!same && ranges.length) view.dispatch({ effects: clearComments.of(null) });
}

export function unwrapCommentById(view: EditorView, id: string): boolean {
	return commentActions.unwrapById(view, id);
}

export function deleteCommentById(view: EditorView, id: string): boolean {
	return commentActions.replaceById(view, id, '');
}

export const commentSystemExtension = [
	commentMaskingExtension,
	commentRanges,
	commentState,
	createAtomicTagRanges(commentRanges),
	annotationProtectionExtension,
	contentProcessorExtension,
	...commentBubbleExtension,
];
