// src/services/CommentService.ts
import { nanoid } from 'nanoid';

import type { Comment, CommentRaw, CommentResponse } from '../types/comments';
import {
	createLineCounter,
	encodeAnnotationText,
	formatAnnotationResponses,
	parseAnnotationTextField,
	parseAnnotationResponses,
	scanAnnotationTags,
} from '../utils/annotationTagUtils';

interface CommentTagFields {
	id: string;
	user: string;
	timestamp: number;
	content: string;
	responses: readonly CommentResponse[];
	resolved: boolean;
}

function formatCommentTags(fields: CommentTagFields): CommentRaw {
	return {
		openTag: `\`<### comment id: ${fields.id}, user: ${fields.user}, time: ${fields.timestamp}, content64: '${encodeAnnotationText(fields.content)}', responses: [${formatAnnotationResponses(fields.responses)}], resolved: ${fields.resolved} ###>\``,
		closeTag: `\`</### comment id: ${fields.id} ###>\``,
		commentId: fields.id,
	};
}

class CommentService {
	parseComments(editorContent: string): Comment[] {
		const matches = scanAnnotationTags(editorContent, 'comment');
		if (!matches.length) return [];

		const lineAt = createLineCounter(editorContent);
		return matches.map((match) => {
			const userMatch = match.openTagContent.match(/user:\s*([^,]+?)(?=\s*,)/);
			const timeMatch = match.openTagContent.match(/time:\s*(\d+)/);
			const resolvedMatch = match.openTagContent.match(
				/resolved:\s*(true|false)/,
			);

			return {
				id: match.id,
				user: userMatch ? userMatch[1].trim() : 'Anonymous',
				timestamp: timeMatch ? Number.parseInt(timeMatch[1]) : Date.now(),
				content: parseAnnotationTextField(match.openTagContent, 'content'),
				responses: parseAnnotationResponses(match.openTagContent),
				startPosition: match.openTagStart,
				endPosition: match.closeTagEnd,
				openTagStart: match.openTagStart,
				openTagEnd: match.openTagEnd,
				closeTagStart: match.closeTagStart,
				closeTagEnd: match.closeTagEnd,
				commentedText: match.innerText,
				line: lineAt(match.openTagStart),
				resolved: resolvedMatch?.[1] === 'true',
			};
		});
	}

	addComment(content: string, username: string): CommentRaw {
		return formatCommentTags({
			id: nanoid(),
			user: username,
			timestamp: Date.now(),
			content,
			responses: [],
			resolved: false,
		});
	}

	updateCommentResponses(comment: Comment): CommentRaw {
		return formatCommentTags({
			id: comment.id,
			user: comment.user,
			timestamp: comment.timestamp,
			content: comment.content,
			responses: comment.responses,
			resolved: comment.resolved,
		});
	}

	resolveComment(comment: Comment): CommentRaw {
		return this.updateCommentResponses(comment);
	}

	addResponse(
		responses: CommentResponse[],
		content: string,
		username: string,
	): CommentResponse[] {
		responses.push({
			id: nanoid(),
			user: username,
			timestamp: Date.now(),
			content,
		});
		return responses;
	}

	deleteResponse(
		responses: CommentResponse[],
		responseId: string,
	): CommentResponse[] {
		return responses.filter((response) => response.id !== responseId);
	}
}

export const commentService = new CommentService();
