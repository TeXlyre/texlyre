// src/services/CommentService.ts
import { nanoid } from 'nanoid';

import type { Comment, CommentRaw, CommentResponse } from '../types/comments';

const calculateLineNumber = (content: string, position: number): number => {
	const beforePosition = content.substring(0, position);
	return beforePosition.split('\n').length;
};

class CommentService {
	parseComments(editorContent: string): Comment[] {
		const parsedComments: Comment[] = [];
		let searchStart = 0;

		while (searchStart < editorContent.length) {
			const openTagStart = editorContent.indexOf(
				'<### comment id:',
				searchStart,
			);
			if (openTagStart === -1) break;

			const backtickBefore = openTagStart > 0 &&
				editorContent[openTagStart - 1] === '`';

			const openTagEnd = editorContent.indexOf('###>', openTagStart);
			if (openTagEnd === -1) break;

			const backtickAfter = openTagEnd + 4 < editorContent.length &&
				editorContent[openTagEnd + 4] === '`';

			const openTagContent = editorContent.substring(
				openTagStart,
				openTagEnd + 4,
			);

			const idMatch = openTagContent.match(/id:\s*([\w-]+)/);
			if (!idMatch) {
				searchStart = openTagEnd + 4;
				continue;
			}

			const id = idMatch[1];
			const closeTagPattern = `</### comment id: ${id}`;
			const closeTagStart = editorContent.indexOf(
				closeTagPattern,
				openTagEnd + 4,
			);

			if (closeTagStart === -1) {
				searchStart = openTagEnd + 4;
				continue;
			}

			const closeTagEnd = editorContent.indexOf('###>', closeTagStart) + 4;
			if (closeTagEnd < closeTagStart) {
				searchStart = openTagEnd + 4;
				continue;
			}

			const userMatch = openTagContent.match(/user:\s*([^,]+)/);
			const timeMatch = openTagContent.match(/time:\s*(\d+)/);
			const contentMatch = openTagContent.match(/content:\s*'([^']*)'/);
			const responsesMatch = openTagContent.match(/responses:\s*\[(.*?)\]/);
			const resolvedMatch = openTagContent.match(/resolved:\s*(true|false)/);

			const user = userMatch ? userMatch[1].trim() : 'Anonymous';
			const timestamp = timeMatch ? Number.parseInt(timeMatch[1]) : Date.now();
			const commentContent = contentMatch ? contentMatch[1] : '';
			const responsesString = responsesMatch ? responsesMatch[1] : '';
			const resolved = resolvedMatch ? resolvedMatch[1] === 'true' : false;

			const commentedTextStart = openTagEnd + 4 + (backtickAfter ? 1 : 0);
			const commentedTextEnd = closeTagStart - (backtickBefore &&
				editorContent[closeTagStart - 1] === '`' ? 1 : 0);
			const commentedText = editorContent.substring(
				commentedTextStart,
				commentedTextEnd,
			);

			const responses: CommentResponse[] = [];
			if (responsesString?.trim()) {
				const responseRegex =
					/<#### response id: '([\w-]+)', user: ([^,]+), time: (\d+), content: '([^']*)' ####\/>/g;
				let responseMatch;
				while ((responseMatch = responseRegex.exec(responsesString)) !== null) {
					const [
						_,
						responseId,
						responseUser,
						responseTimestamp,
						responseContent,
					] = responseMatch;
					responses.push({
						id: responseId,
						user: responseUser.trim(),
						timestamp: Number.parseInt(responseTimestamp),
						content: responseContent,
					});
				}
			}

			const actualOpenTagStart = backtickBefore ? openTagStart - 1 : openTagStart;
			const actualOpenTagEnd = backtickAfter ? openTagEnd + 5 : openTagEnd + 4;
			const actualCloseTagStart = (backtickBefore && editorContent[closeTagStart - 1] === '`')
				? closeTagStart - 1
				: closeTagStart;
			const actualCloseTagEnd = (backtickAfter && closeTagEnd < editorContent.length &&
				editorContent[closeTagEnd] === '`') ? closeTagEnd + 1 : closeTagEnd;

			parsedComments.push({
				id,
				user,
				timestamp,
				content: commentContent,
				responses,
				startPosition: actualOpenTagStart,
				endPosition: actualCloseTagEnd,
				openTagStart: actualOpenTagStart,
				openTagEnd: actualOpenTagEnd,
				closeTagStart: actualCloseTagStart,
				closeTagEnd: actualCloseTagEnd,
				commentedText,
				line: calculateLineNumber(editorContent, actualOpenTagStart),
				resolved,
			});

			searchStart = openTagEnd + 4;
		}

		return parsedComments;
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
		const responsesString = comment.responses
			.map((response) => {
				return `<#### response id: '${response.id}', user: ${response.user}, time: ${response.timestamp}, content: '${response.content}' ####/>`;
			})
			.join(', ');

		const updatedCommentPrefix = `\`<### comment id: ${comment.id}, user: ${comment.user}, time: ${comment.timestamp}, content: '${comment.content}', responses: [${responsesString}], resolved: ${comment.resolved} ###>\``;
		const updatedCommentSuffix = `\`</### comment id: ${comment.id} ###>\``;

		return {
			openTag: updatedCommentPrefix,
			closeTag: updatedCommentSuffix,
			commentId: comment.id,
		};
	}

	resolveComment(comment: Comment): CommentRaw {
		const responsesString = comment.responses
			.map((response) => {
				return `<#### response id: '${response.id}', user: ${response.user}, time: ${response.timestamp}, content: '${response.content}' ####/>`;
			})
			.join(', ');

		const updatedCommentPrefix = `\`<### comment id: ${comment.id}, user: ${comment.user}, time: ${comment.timestamp}, content: '${comment.content}', responses: [${responsesString}], resolved: ${comment.resolved} ###>\``;
		const updatedCommentSuffix = `\`</### comment id: ${comment.id} ###>\``;

		return {
			openTag: updatedCommentPrefix,
			closeTag: updatedCommentSuffix,
			commentId: comment.id,
		};
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
