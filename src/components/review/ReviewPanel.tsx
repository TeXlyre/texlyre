// src/components/review/ReviewPanel.tsx
import type React from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

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
	const [activeTab, setActiveTab] = useState<'list' | 'resolved'>('list');
	const contentRef = useRef<HTMLDivElement>(null);
	const trackRef = useRef<HTMLDivElement>(null);
	const itemRefs = useRef(new Map<string, HTMLDivElement>());
	const [layout, setLayout] = useState<{
		tops: Record<string, number>;
		height: number;
	}>({ tops: {}, height: 0 });
	const [documentHeight, setDocumentHeight] = useState(0);

	const visibleReviews = useMemo(
		() =>
			reviews.filter(
				(review) => review.resolved === (activeTab === 'resolved'),
			),
		[reviews, activeTab],
	);

	useLayoutEffect(() => {
		const tops: Record<string, number> = {};
		let previousBottom = Number.NEGATIVE_INFINITY;

		for (const review of [...visibleReviews].sort(
			(a, b) => a.docTop - b.docTop,
		)) {
			const height = itemRefs.current.get(review.id)?.offsetHeight ?? 0;
			const top = Math.max(review.docTop, previousBottom + CARD_GAP);

			tops[review.id] = top;
			previousBottom = top + height;
		}

		const height =
			previousBottom === Number.NEGATIVE_INFINITY
				? 0
				: previousBottom + CARD_GAP;

		setLayout((current) => {
			const ids = Object.keys(tops);

			return current.height === height &&
				ids.length === Object.keys(current.tops).length &&
				ids.every((id) => current.tops[id] === tops[id])
				? current
				: { tops, height };
		});
	}, [visibleReviews]);

	useEffect(() => {
		const followEditor = (event: Event) => {
			const track = trackRef.current;
			const content = contentRef.current;
			if (!track || !content) return;

			const { documentTop, documentHeight: editorHeight } = (
				event as CustomEvent
			).detail;
			const delta = content.getBoundingClientRect().top - documentTop;

			track.style.marginTop = `${Math.max(0, -delta)}px`;
			content.scrollTop = Math.max(0, delta);
			setDocumentHeight(editorHeight ?? 0);
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
				<div className='view-tabs'>
					<button
						type='button'
						className={`tab-button ${activeTab === 'list' ? 'active' : ''}`}
						onClick={() => setActiveTab('list')}
					>
						{t('Active')}
					</button>
					<button
						type='button'
						className={`tab-button ${activeTab === 'resolved' ? 'active' : ''}`}
						onClick={() => setActiveTab('resolved')}
					>
						{t('Resolved')}
					</button>
				</div>
			</div>

			{activeTab === 'list' && (
				<div className='review-panel-actions'>
					<button
						type='button'
						onClick={acceptAllReviews}
						disabled={!visibleReviews.length}
					>
						{t('Accept all')}
					</button>
					<button
						type='button'
						onClick={rejectAllReviews}
						disabled={!visibleReviews.length}
					>
						{t('Reject all')}
					</button>
				</div>
			)}

			<div className='review-panel-content' ref={contentRef}>
				{visibleReviews.length === 0 ? (
					<div className='no-reviews'>
						{activeTab === 'resolved'
							? t('No resolved changes yet.')
							: t('No tracked changes.')}
					</div>
				) : (
					<div
						className='review-panel-track'
						ref={trackRef}
						style={{ height: `${Math.max(layout.height, documentHeight)}px` }}
					>
						{visibleReviews.map((review) => (
							<ReviewItem
								key={review.id}
								review={review}
								top={layout.tops[review.id] ?? review.docTop}
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
