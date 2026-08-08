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
import { useCollab } from '../hooks/useCollab';
import { usePersistentState } from '../hooks/usePersistentState';
import { useProperties } from '../hooks/useProperties';
import { fileStorageService } from '../services/FileStorageService';
import { reviewService } from '../services/ReviewService';
import type { DocumentList } from '../types/documents';
import type { ReviewContextType, ReviewSnapshot } from '../types/review';

export const ReviewContext = createContext<ReviewContextType | null>(null);

interface ReviewProviderProps {
	children: ReactNode;
	documentKey: string;
	sharedKey?: string;
}

export const ReviewProvider: React.FC<ReviewProviderProps> = ({
	children,
	documentKey,
	sharedKey,
}) => {
	const [reviews, setReviews] = useState<ReviewSnapshot[]>([]);
	const [showReviews, setShowReviews] = useState<boolean>(false);
	const [trackChangesLocal, setTrackChangesLocal] = usePersistentState<boolean>(
		`review-tracking:${documentKey}`,
		false,
	);
	const [propertiesLoaded, setPropertiesLoaded] = useState(false);
	const { user } = useAuth();
	const { data: doc, changeData: changeDoc } = useCollab<DocumentList>();
	const {
		isReady: arePropertiesReady,
		getProperty,
		setProperty,
		registerProperty,
	} = useProperties();

	const trackChangesShared =
		!!sharedKey && !!doc?.projectMetadata?.trackedFiles?.includes(sharedKey);
	const canShareTracking = !!changeDoc && !!sharedKey;
	const trackChanges = trackChangesLocal || trackChangesShared;

	const signatureRef = useRef('');
	const propertiesRegistered = useRef(false);

	useEffect(() => {
		if (propertiesRegistered.current) return;
		propertiesRegistered.current = true;

		registerProperty({
			id: 'review-panel-visible',
			category: 'UI',
			subcategory: 'Editor',
			defaultValue: false,
		});
	}, [registerProperty]);

	useEffect(() => {
		if (!arePropertiesReady || propertiesLoaded) return;

		const projectId = fileStorageService.getCurrentProjectId();
		if (projectId) {
			setShowReviews(
				getProperty('review-panel-visible', {
					scope: 'project',
					projectId,
				}) === true,
			);
		}

		setPropertiesLoaded(true);
	}, [arePropertiesReady, propertiesLoaded, getProperty]);

	useEffect(() => {
		if (!propertiesLoaded) return;

		const projectId = fileStorageService.getCurrentProjectId();
		if (!projectId) return;

		setProperty('review-panel-visible', showReviews, {
			scope: 'project',
			projectId,
		});
	}, [showReviews, propertiesLoaded, setProperty]);

	useEffect(() => {
		const handleReviewsChanged = (event: Event) => {
			const next: ReviewSnapshot[] =
				(event as CustomEvent).detail.reviews ?? [];

			const signature = next
				.map(
					(review) =>
						`${review.id}:${review.docTop}:${review.originalText.length}:${review.currentText}:${review.responses.length}:${review.resolved}`,
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
		setTrackChangesLocal(!trackChangesLocal);
		if (!trackChangesLocal) setShowReviews(true);
	};

	const toggleTrackChangesShared = () => {
		if (!changeDoc || !sharedKey) return;

		changeDoc((d) => {
			if (!d.projectMetadata) {
				d.projectMetadata = { name: '', description: '' };
			}

			const tracked = d.projectMetadata.trackedFiles ?? [];
			d.projectMetadata.trackedFiles = tracked.includes(sharedKey)
				? tracked.filter((entry: string) => entry !== sharedKey)
				: [...tracked, sharedKey];
		});

		if (!trackChangesShared) setShowReviews(true);
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

	const setReviewResolved = (review: ReviewSnapshot, resolved: boolean) =>
		dispatchReviewEvent('review-update', {
			reviewId: review.id,
			rawReview: reviewService.updateReview({ ...review, resolved }),
		});

	const resolveReview = (reviewId: string) => {
		const review = reviews.find((entry) => entry.id === reviewId);
		if (!review) return;

		setReviewResolved(review, !review.resolved);
	};

	const resolveAllReviews = () => {
		for (const review of reviews) {
			if (!review.resolved) setReviewResolved(review, true);
		}
	};

	const updateResponses = (
		review: ReviewSnapshot,
		responses: ReviewSnapshot['responses'],
	) => {
		dispatchReviewEvent('review-update', {
			reviewId: review.id,
			rawReview: reviewService.updateReview({ ...review, responses }),
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
				trackChangesLocal,
				trackChangesShared,
				canShareTracking,
				toggleTrackChanges,
				toggleTrackChangesShared,
				acceptReview,
				rejectReview,
				resolveReview,
				acceptAllReviews,
				rejectAllReviews,
				resolveAllReviews,
				addResponse,
				deleteResponse,
			}}
		>
			{children}
		</ReviewContext.Provider>
	);
};
