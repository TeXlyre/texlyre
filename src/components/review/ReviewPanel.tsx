// src/components/review/ReviewPanel.tsx
import type React from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { t } from '@/i18n';
import { useReview } from '../../hooks/useReview';
import ReviewItem from './ReviewItem';

interface ReviewPanelProps {
	className?: string;
}

const CARD_GAP = 8;

const ReviewPanel: React.FC<ReviewPanelProps> = ({ className = '' }) => {
	const { reviews, showReviews, acceptAllReviews, rejectAllReviews } =
		useReview();
	const contentRef = useRef<HTMLDivElement>(null);
	const trackRef = useRef<HTMLDivElement>(null);
	const itemRefs = useRef(new Map<string, HTMLDivElement>());
	const [tops, setTops] = useState<Record<string, number>>({});

	useLayoutEffect(() => {
		const next: Record<string, number> = {};
		let previousBottom = Number.NEGATIVE_INFINITY;

		for (const review of [...reviews].sort((a, b) => a.docTop - b.docTop)) {
			const height = itemRefs.current.get(review.id)?.offsetHeight ?? 0;
			const top = Math.max(review.docTop, previousBottom + CARD_GAP);

			next[review.id] = top;
			previousBottom = top + height;
		}

		setTops((current) => {
			const ids = Object.keys(next);

			return ids.length === Object.keys(current).length &&
				ids.every((id) => current[id] === next[id])
				? current
				: next;
		});
	}, [reviews]);

	useEffect(() => {
		const followEditor = (event: Event) => {
			const track = trackRef.current;
			const content = contentRef.current;
			if (!track || !content) return;

			const { documentTop } = (event as CustomEvent).detail;
			const offset = documentTop - content.getBoundingClientRect().top;

			track.style.transform = `translateY(${offset}px)`;
		};

		document.addEventListener('reviews-changed', followEditor);

		return () => document.removeEventListener('reviews-changed', followEditor);
	}, []);

	useEffect(() => {
		if (showReviews) {
			document.dispatchEvent(new CustomEvent('request-reviews'));
		}
	}, [showReviews]);

	if (!showReviews) {
		return null;
	}

	return (
		<div className={`review-panel ${className}`}>
			<div className='review-panel-header'>
				<h3>{t('Changes')}</h3>
				<div className='review-panel-actions'>
					<button
						type='button'
						onClick={acceptAllReviews}
						disabled={!reviews.length}
					>
						{t('Accept all')}
					</button>
					<button
						type='button'
						onClick={rejectAllReviews}
						disabled={!reviews.length}
					>
						{t('Reject all')}
					</button>
				</div>
			</div>

			<div className='review-panel-content' ref={contentRef}>
				{reviews.length === 0 ? (
					<div className='no-reviews'>{t('No tracked changes.')}</div>
				) : (
					<div className='review-panel-track' ref={trackRef}>
						{reviews.map((review) => (
							<ReviewItem
								key={review.id}
								review={review}
								top={tops[review.id] ?? review.docTop}
								ref={(element: HTMLDivElement | null) => {
									if (element) itemRefs.current.set(review.id, element);
									else itemRefs.current.delete(review.id);
								}}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
};

export default ReviewPanel;
