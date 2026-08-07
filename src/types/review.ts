// src/types/review.ts
import type { CommentResponse } from './comments';

export interface Review {
	id: string;
	user: string;
	timestamp: number;
	originalText: string;
	currentText: string;
	responses: CommentResponse[];
	startPosition: number;
	endPosition: number;
	openTagStart: number;
	openTagEnd: number;
	closeTagStart: number;
	closeTagEnd: number;
	line: number;
}

export interface ReviewRaw {
	openTag: string;
	closeTag: string;
	reviewId: string;
}

export type ReviewSegmentType = 'equal' | 'insert' | 'delete';

export interface ReviewSegment {
	type: ReviewSegmentType;
	text: string;
	from: number;
	to: number;
}

export interface ReviewSnapshot {
	id: string;
	user: string;
	timestamp: number;
	originalText: string;
	currentText: string;
	responses: CommentResponse[];
	line: number;
	docTop: number;
}

export interface ReviewContextType {
	reviews: ReviewSnapshot[];
	showReviews: boolean;
	toggleReviews: () => void;
	trackChanges: boolean;
	toggleTrackChanges: () => void;
	acceptReview: (reviewId: string) => void;
	rejectReview: (reviewId: string) => void;
	acceptAllReviews: () => void;
	rejectAllReviews: () => void;
	addResponse: (reviewId: string, content: string) => void;
	deleteResponse: (reviewId: string, responseId: string) => void;
}
