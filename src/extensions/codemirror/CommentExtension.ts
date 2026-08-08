// src/extensions/codemirror/CommentExtension.ts
import { Decoration, type EditorView } from '@codemirror/view';

import { createNamedLogger } from '@/logging';
import { commentService } from '../../services/CommentService';
import { commentBubbleExtension } from './CommentBubbleExtension';
import {
	type DecorationEntry,
	createDerivedDecorationField,
	hiddenTagEntries,
} from './annotations/tagDecorations';
import { createTagActions } from './annotations/tagProtection';
import {
	createAtomicTagRanges,
	createDerivedTagRangeField,
	type TagRange,
} from './annotations/tagRanges';

const moduleLog = createNamedLogger('CommentExtension');

interface CommentChunk extends TagRange {
	resolved: boolean;
}

export const commentRanges = createDerivedTagRangeField<CommentChunk>((doc) =>
	commentService.parseComments(doc).map((comment) => ({
		id: comment.id,
		openStart: comment.openTagStart!,
		openEnd: comment.openTagEnd!,
		closeStart: comment.closeTagStart!,
		closeEnd: comment.closeTagEnd!,
		resolved: comment.resolved,
	})),
);

const commentActions = createTagActions(commentRanges, moduleLog);

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

export function unwrapCommentById(view: EditorView, id: string): boolean {
	return commentActions.unwrapById(view, id);
}

export function deleteCommentById(view: EditorView, id: string): boolean {
	return commentActions.replaceById(view, id, '');
}

export const commentSystemExtension = [
	commentRanges,
	commentState,
	createAtomicTagRanges(commentRanges),
	...commentBubbleExtension,
];
