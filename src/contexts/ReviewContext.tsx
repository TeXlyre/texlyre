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
import { useProperties } from '../hooks/useProperties';
import { fileStoreService } from '../services/FileStoreService';
import { reviewService } from '../services/ReviewService';
import type { DocumentList } from '../types/documents';
import type { ReviewContextType, ReviewSnapshot } from '../types/review';

export const ReviewContext = createContext<ReviewContextType | null>(null);

interface ReviewProviderProps {
	children: ReactNode;
	documentKey: string;
	sharedKey?: string;
}

const dispatchReviewEvent = (
	name: string,
	detail: Record<string, unknown> = {},
) => {
	document.dispatchEvent(new CustomEvent(name, { detail }));
};

export const ReviewProvider: React.FC<ReviewProviderProps> = ({
	children,
	documentKey,
	sharedKey,
}) => {
	const [reviews, setReviews] = useState<ReviewSnapshot[]>([]);
	const [showReviews, setShowReviews] = useState<boolean>(false);
	const [trackChangesLocal, setTrackChangesLocal] = useState(false);
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

	const reviewsRef = useRef<ReviewSnapshot[]>([]);
	const userRef = useRef(user);
	const propertiesRegistered = useRef(false);
	reviewsRef.current = reviews;
	userRef.current = user;

	useEffect(() => {
		if (propertiesRegistered.current) return;
		propertiesRegistered.current = true;

		registerProperty({
			id: 'review-panel-visible',
			category: 'UI',
			subcategory: 'Editor',
			defaultValue: false,
		});
		registerProperty({
			id: 'review-tracking-local',
			category: 'UI',
			subcategory: 'Editor',
			defaultValue: {},
		});
	}, [registerProperty]);

	useEffect(() => {
		if (!arePropertiesReady || propertiesLoaded) return;

		const projectId = fileStoreService.getCurrentProjectId();
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
		if (!arePropertiesReady) return;

		const projectId = fileStoreService.getCurrentProjectId();
		if (!projectId) return;

		const tracked =
			(getProperty('review-tracking-local', {
				scope: 'project',
				projectId,
			}) as Record<string, boolean> | undefined) ?? {};

		setTrackChangesLocal(tracked[documentKey] === true);
	}, [arePropertiesReady, documentKey, getProperty]);

	useEffect(() => {
		if (!propertiesLoaded) return;

		const projectId = fileStoreService.getCurrentProjectId();
		if (!projectId) return;

		setProperty('review-panel-visible', showReviews, {
			scope: 'project',
			projectId,
		});
	}, [showReviews, propertiesLoaded, setProperty]);

	useEffect(() => {
		const handleReviewsChanged = (event: Event) => {
			const detail = (event as CustomEvent).detail ?? {};
			if (detail.reviewsChanged === false) return;

			const next: ReviewSnapshot[] = detail.reviews ?? [];
			const current = reviewsRef.current;

			if (
				next.length === current.length &&
				next.every((review, index) => review === current[index])
			) {
				return;
			}

			reviewsRef.current = next;
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

	const toggleReviews = useCallback(
		() => setShowReviews((visible) => !visible),
		[],
	);

	const toggleTrackChanges = useCallback(() => {
		const next = !trackChangesLocal;
		setTrackChangesLocal(next);

		const projectId = fileStoreService.getCurrentProjectId();
		if (projectId) {
			const tracked =
				(getProperty('review-tracking-local', {
					scope: 'project',
					projectId,
				}) as Record<string, boolean> | undefined) ?? {};

			setProperty(
				'review-tracking-local',
				{ ...tracked, [documentKey]: next },
				{ scope: 'project', projectId },
			);
		}

		if (next) setShowReviews(true);
	}, [documentKey, getProperty, setProperty, trackChangesLocal]);

	const toggleTrackChangesShared = useCallback(() => {
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
	}, [changeDoc, sharedKey, trackChangesShared]);

	const acceptReview = useCallback(
		(reviewId: string) => dispatchReviewEvent('review-accept', { reviewId }),
		[],
	);
	const rejectReview = useCallback(
		(reviewId: string) => dispatchReviewEvent('review-reject', { reviewId }),
		[],
	);
	const acceptAllReviews = useCallback(
		() => dispatchReviewEvent('review-accept-all'),
		[],
	);
	const rejectAllReviews = useCallback(
		() => dispatchReviewEvent('review-reject-all'),
		[],
	);

	const setReviewResolved = useCallback(
		(review: ReviewSnapshot, resolved: boolean) =>
			dispatchReviewEvent('review-update', {
				reviewId: review.id,
				rawReview: reviewService.updateReview({ ...review, resolved }),
			}),
		[],
	);

	const resolveReview = useCallback(
		(reviewId: string) => {
			const review = reviewsRef.current.find((entry) => entry.id === reviewId);
			if (!review) return;

			setReviewResolved(review, !review.resolved);
		},
		[setReviewResolved],
	);

	const resolveAllReviews = useCallback(() => {
		for (const review of reviewsRef.current) {
			if (!review.resolved) setReviewResolved(review, true);
		}
	}, [setReviewResolved]);

	const updateResponses = useCallback(
		(review: ReviewSnapshot, responses: ReviewSnapshot['responses']) => {
			dispatchReviewEvent('review-update', {
				reviewId: review.id,
				rawReview: reviewService.updateReview({ ...review, responses }),
			});
		},
		[],
	);

	const addResponse = useCallback(
		(reviewId: string, content: string) => {
			const currentUser = userRef.current;
			if (!currentUser) return;

			const review = reviewsRef.current.find((entry) => entry.id === reviewId);
			if (!review) return;

			updateResponses(
				review,
				reviewService.addResponse(
					[...review.responses],
					content,
					currentUser.username,
				),
			);
		},
		[updateResponses],
	);

	const deleteResponse = useCallback(
		(reviewId: string, responseId: string) => {
			const review = reviewsRef.current.find((entry) => entry.id === reviewId);
			if (!review) return;

			updateResponses(
				review,
				reviewService.deleteResponse(review.responses, responseId),
			);
		},
		[updateResponses],
	);

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
