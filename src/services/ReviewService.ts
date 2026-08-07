// src/services/ReviewService.ts
import { nanoid } from 'nanoid';

import type { CommentResponse } from '../types/comments';
import type { Review, ReviewRaw } from '../types/review';
import {
	calculateLineNumber,
	decodeAnnotationText,
	encodeAnnotationText,
	formatAnnotationResponses,
	parseAnnotationResponses,
	scanAnnotationTags,
} from '../utils/annotationTagUtils';

interface ReviewTagFields {
	id: string;
	user: string;
	timestamp: number;
	originalText: string;
	responses: readonly CommentResponse[];
}

function formatTags(fields: ReviewTagFields): ReviewRaw {
	const responsesString = formatAnnotationResponses(fields.responses);
	const original = encodeAnnotationText(fields.originalText);

	return {
		openTag: `\`<### review id: ${fields.id}, user: ${fields.user}, time: ${fields.timestamp}, original: '${original}', responses: [${responsesString}] ###>\``,
		closeTag: `\`</### review id: ${fields.id} ###>\``,
		reviewId: fields.id,
	};
}

class ReviewService {
	parseReviews(editorContent: string): Review[] {
		return scanAnnotationTags(editorContent, 'review').map((match) => {
			const userMatch = match.openTagContent.match(/user:\s*([^,]+?)(?=\s*,)/);
			const timeMatch = match.openTagContent.match(/time:\s*(\d+)/);
			const originalMatch = match.openTagContent.match(/original:\s*'([^']*)'/);

			return {
				id: match.id,
				user: userMatch ? userMatch[1].trim() : 'Anonymous',
				timestamp: timeMatch ? Number.parseInt(timeMatch[1]) : Date.now(),
				originalText: originalMatch
					? decodeAnnotationText(originalMatch[1])
					: '',
				currentText: match.innerText,
				responses: parseAnnotationResponses(match.openTagContent),
				startPosition: match.openTagStart,
				endPosition: match.closeTagEnd,
				openTagStart: match.openTagStart,
				openTagEnd: match.openTagEnd,
				closeTagStart: match.closeTagStart,
				closeTagEnd: match.closeTagEnd,
				line: calculateLineNumber(editorContent, match.openTagStart),
			};
		});
	}

	createReview(
		originalText: string,
		username: string,
		existing?: Pick<Review, 'id' | 'user' | 'timestamp' | 'responses'>,
	): ReviewRaw {
		return formatTags({
			id: existing?.id ?? nanoid(),
			user: existing?.user ?? username,
			timestamp: existing?.timestamp ?? Date.now(),
			originalText,
			responses: existing?.responses ?? [],
		});
	}

	updateReview(
		review: Pick<
			Review,
			'id' | 'user' | 'timestamp' | 'originalText' | 'responses'
		>,
	): ReviewRaw {
		return formatTags({
			id: review.id,
			user: review.user,
			timestamp: review.timestamp,
			originalText: review.originalText,
			responses: review.responses,
		});
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

export const reviewService = new ReviewService();
