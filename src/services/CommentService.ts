// src/services/CommentService.ts
import { nanoid } from 'nanoid';

import type { Comment, CommentRaw, CommentResponse } from '../types/comments';
import {
	calculateLineNumber,
	formatAnnotationResponses,
	parseAnnotationResponses,
	scanAnnotationTags,
} from '../utils/annotationTagUtils';

class CommentService {
	parseComments(editorContent: string): Comment[] {
		return scanAnnotationTags(editorContent, 'comment').map((match) => {
			const userMatch = match.openTagContent.match(/user:\s*([^,]+?)(?=\s*,)/);
			const timeMatch = match.openTagContent.match(/time:\s*(\d+)/);
			const contentMatch = match.openTagContent.match(/content:\s*'([^']*)'/s);
			const resolvedMatch = match.openTagContent.match(
				/resolved:\s*(true|false)/,
			);

			return {
				id: match.id,
				user: userMatch ? userMatch[1].trim() : 'Anonymous',
				timestamp: timeMatch ? Number.parseInt(timeMatch[1]) : Date.now(),
				content: contentMatch
					? contentMatch[1].replace(/\s+/g, ' ').trim()
					: '',
				responses: parseAnnotationResponses(match.openTagContent),
				startPosition: match.openTagStart,
				endPosition: match.closeTagEnd,
				openTagStart: match.openTagStart,
				openTagEnd: match.openTagEnd,
				closeTagStart: match.closeTagStart,
				closeTagEnd: match.closeTagEnd,
				commentedText: match.innerText,
				line: calculateLineNumber(editorContent, match.openTagStart),
				resolved: resolvedMatch ? resolvedMatch[1] === 'true' : false,
			};
		});
	}

	addComment(content: string, username: string): CommentRaw {
		const id = nanoid();
		const timestamp = Date.now();

		const commentPrefix = `\`<### comment id: ${id}, user: ${username}, time: ${timestamp}, content: '${content}', responses: [], resolved: false ###>\``;
		const commentSuffix = `\`</### comment id: ${id} ###>\``;

		return {
			openTag: commentPrefix,
			closeTag: commentSuffix,
			commentId: id,
		};
	}

	updateCommentResponses(comment: Comment): CommentRaw {
		const responsesString = formatAnnotationResponses(comment.responses);

		const updatedCommentPrefix = `\`<### comment id: ${comment.id}, user: ${comment.user}, time: ${comment.timestamp}, content: '${comment.content}', responses: [${responsesString}], resolved: ${comment.resolved} ###>\``;
		const updatedCommentSuffix = `\`</### comment id: ${comment.id} ###>\``;

		return {
			openTag: updatedCommentPrefix,
			closeTag: updatedCommentSuffix,
			commentId: comment.id,
		};
	}

	resolveComment(comment: Comment): CommentRaw {
		return this.updateCommentResponses(comment);
	}

	addResponse(
		responses: CommentResponse[],
		content: string,
		username: string,
	): CommentResponse[] {
		const responseId = nanoid();
		const timestamp = Date.now();

		const newResponse: CommentResponse = {
			id: responseId,
			user: username,
			timestamp,
			content,
		};
		responses.push(newResponse);
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
