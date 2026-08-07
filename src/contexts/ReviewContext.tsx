// src/contexts/ReviewContext.tsx
import type React from 'react';
import {
	type ReactNode,
	createContext,
	useCallback,
	useEffect,
	useRef,
	useState,
} from 'react';

import { useAuth } from '../hooks/useAuth';
import { usePersistentState } from '../hooks/usePersistentState';
import { reviewService } from '../services/ReviewService';
import type { ReviewContextType, ReviewSnapshot } from '../types/review';

export const ReviewContext = createContext<ReviewContextType | null>(null);

interface ReviewProviderProps {
	children: ReactNode;
	documentKey: string;
}

export const ReviewProvider: React.FC<ReviewProviderProps> = ({
	children,
	documentKey,
}) => {
	const [reviews, setReviews] = useState<ReviewSnapshot[]>([]);
	const [showReviews, setShowReviews] = useState<boolean>(false);
	const [trackChanges, setTrackChanges] = usePersistentState<boolean>(
		`review-tracking:${documentKey}`,
		false,
	);
	const { user } = useAuth();

	const signatureRef = useRef('');

	useEffect(() => {
		const handleReviewsChanged = (event: Event) => {
			const next: ReviewSnapshot[] =
				(event as CustomEvent).detail.reviews ?? [];

			const signature = next
				.map(
					(review) =>
						`${review.id}:${review.docTop}:${review.originalText.length}:${review.currentText}:${review.responses.length}`,
				)
				.join('|');

			if (signature === signatureRef.current) return;

			signatureRef.current = signature;
			setReviews(next);
		};

		document.addEventListener('reviews-changed', handleReviewsChanged);

		return () =>
			document.removeEventListener('reviews-changed', handleReviewsChanged);
	}, []);

	const publishTrackChanges = useCallback(() => {
		document.dispatchEvent(
			new CustomEvent('set-track-changes', {
				detail: { tracking: trackChanges, author: user?.username ?? '' },
			}),
		);
	}, [trackChanges, user?.username]);

	useEffect(() => {
		publishTrackChanges();

		document.addEventListener('request-track-changes', publishTrackChanges);

		return () =>
			document.removeEventListener(
				'request-track-changes',
				publishTrackChanges,
			);
	}, [publishTrackChanges]);

	const toggleReviews = () => setShowReviews((visible) => !visible);

	const toggleTrackChanges = () => {
		setTrackChanges(!trackChanges);
		if (!trackChanges) setShowReviews(true);
	};

	const dispatchReviewEvent = (
		name: string,
		detail: Record<string, unknown> = {},
	) => {
		document.dispatchEvent(new CustomEvent(name, { detail }));
	};

	const acceptReview = (reviewId: string) =>
		dispatchReviewEvent('review-accept', { reviewId });

	const rejectReview = (reviewId: string) =>
		dispatchReviewEvent('review-reject', { reviewId });

	const acceptAllReviews = () => dispatchReviewEvent('review-accept-all');

	const rejectAllReviews = () => dispatchReviewEvent('review-reject-all');

	const updateResponses = (
		review: ReviewSnapshot,
		responses: ReviewSnapshot['responses'],
	) => {
		dispatchReviewEvent('review-update', {
			reviewId: review.id,
			rawReview: reviewService.updateReview({
				id: review.id,
				user: review.user,
				timestamp: review.timestamp,
				originalText: review.originalText,
				responses,
			}),
		});
	};

	const addResponse = (reviewId: string, content: string) => {
		if (!user) return;

		const review = reviews.find((entry) => entry.id === reviewId);
		if (!review) return;

		updateResponses(
			review,
			reviewService.addResponse([...review.responses], content, user.username),
		);
	};

	const deleteResponse = (reviewId: string, responseId: string) => {
		const review = reviews.find((entry) => entry.id === reviewId);
		if (!review) return;

		updateResponses(
			review,
			reviewService.deleteResponse(review.responses, responseId),
		);
	};

	return (
		<ReviewContext.Provider
			value={{
				reviews,
				showReviews,
				toggleReviews,
				trackChanges,
				toggleTrackChanges,
				acceptReview,
				rejectReview,
				acceptAllReviews,
				rejectAllReviews,
				addResponse,
				deleteResponse,
			}}
		>
			{children}
		</ReviewContext.Provider>
	);
};
