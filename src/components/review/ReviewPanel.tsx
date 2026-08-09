// src/components/review/ReviewPanel.tsx
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { t } from '@/i18n';
import { useReview } from '../../hooks/useReview';
import { RefreshIcon } from '../common/Icons';
import ReviewItem from './ReviewItem';

interface ReviewPanelProps {
	className?: string;
}

const CARD_GAP = 8;

const ReviewPanel: React.FC<ReviewPanelProps> = ({ className = '' }) => {
	const {
		reviews,
		showReviews,
		acceptReview,
		rejectReview,
		resolveReview,
		addResponse,
		deleteResponse,
		acceptAllReviews,
		rejectAllReviews,
		resolveAllReviews,
	} = useReview();
	const [activeTab, setActiveTab] = useState<'list' | 'resolved'>('list');
	const contentRef = useRef<HTMLDivElement>(null);
	const trackRef = useRef<HTMLDivElement>(null);
	const itemRefs = useRef(new Map<string, HTMLDivElement>());
	const itemRefCallbacks = useRef(
		new Map<string, (element: HTMLDivElement | null) => void>(),
	);
	const heightsRef = useRef(new Map<string, number>());
	const observerRef = useRef<ResizeObserver | null>(null);
	const heightFrameRef = useRef<number | null>(null);
	const [heightVersion, setHeightVersion] = useState(0);
	const [documentHeight, setDocumentHeight] = useState(0);
	const syncedScrollRef = useRef(-1);
	const editorScrollRef = useRef(0);
	const manualScrollOffsetRef = useRef(0);
	const resetScrollSync = useCallback(() => {
		manualScrollOffsetRef.current = 0;
		document.dispatchEvent(new CustomEvent('request-reviews'));
	}, []);

	const invalidateHeights = useCallback(() => {
		if (heightFrameRef.current !== null) return;
		heightFrameRef.current = requestAnimationFrame(() => {
			heightFrameRef.current = null;
			setHeightVersion((version) => version + 1);
		});
	}, []);

	const getItemRef = useCallback(
		(id: string) => {
			const cached = itemRefCallbacks.current.get(id);
			if (cached) return cached;

			const callback = (element: HTMLDivElement | null) => {
				const previous = itemRefs.current.get(id);
				if (previous && previous !== element)
					observerRef.current?.unobserve(previous);

				if (!element) {
					itemRefs.current.delete(id);
					heightsRef.current.delete(id);
					itemRefCallbacks.current.delete(id);
					return;
				}

				itemRefs.current.set(id, element);
				if (!heightsRef.current.has(id)) {
					heightsRef.current.set(id, element.offsetHeight);
					invalidateHeights();
				}
				observerRef.current?.observe(element);
			};
			itemRefCallbacks.current.set(id, callback);
			return callback;
		},
		[invalidateHeights],
	);

	useEffect(() => {
		if (typeof ResizeObserver === 'undefined') return;

		const observer = new ResizeObserver((entries) => {
			let changed = false;
			for (const entry of entries) {
				const id = (entry.target as HTMLElement).dataset.reviewId;
				if (!id) continue;
				const borderSize = Array.isArray(entry.borderBoxSize)
					? entry.borderBoxSize[0]?.blockSize
					: undefined;
				const height = Math.ceil(borderSize ?? entry.contentRect.height);
				if (heightsRef.current.get(id) === height) continue;
				heightsRef.current.set(id, height);
				changed = true;
			}
			if (changed) invalidateHeights();
		});
		observerRef.current = observer;
		for (const element of itemRefs.current.values()) observer.observe(element);

		return () => {
			observer.disconnect();
			observerRef.current = null;
		};
	}, [invalidateHeights]);

	useEffect(
		() => () => {
			if (heightFrameRef.current !== null) {
				cancelAnimationFrame(heightFrameRef.current);
			}
		},
		[],
	);

	const visibleReviews = useMemo(
		() =>
			reviews.filter(
				(review) => review.resolved === (activeTab === 'resolved'),
			),
		[reviews, activeTab],
	);

	const layout = useMemo(() => {
		void heightVersion;

		const tops: Record<string, number> = {};
		let previousBottom = Number.NEGATIVE_INFINITY;

		for (const review of visibleReviews) {
			const height = heightsRef.current.get(review.id) ?? 0;
			const top = Math.max(review.docTop, previousBottom + CARD_GAP);
			tops[review.id] = top;
			previousBottom = top + height;
		}

		return {
			tops,
			height:
				previousBottom === Number.NEGATIVE_INFINITY
					? 0
					: previousBottom + CARD_GAP,
		};
	}, [visibleReviews, heightVersion]);

	useEffect(() => {
		const followEditor = (event: Event) => {
			const track = trackRef.current;
			const content = contentRef.current;
			if (!track || !content) return;

			const {
				documentTop,
				documentHeight: editorHeight,
				layoutChanged,
			} = (event as CustomEvent).detail;
			if (layoutChanged === false) return;

			const delta = content.getBoundingClientRect().top - documentTop;
			const target = Math.max(0, delta);

			track.style.marginTop = `${Math.max(0, -delta)}px`;
			setDocumentHeight(editorHeight ?? 0);

			editorScrollRef.current = target;
			content.scrollTop = Math.max(0, target + manualScrollOffsetRef.current);
			syncedScrollRef.current = content.scrollTop;
		};

		document.addEventListener('reviews-changed', followEditor);

		return () => document.removeEventListener('reviews-changed', followEditor);
	}, []);

	useEffect(() => {
		document.dispatchEvent(
			new CustomEvent('set-review-reporting', {
				detail: { active: showReviews },
			}),
		);
		if (showReviews) document.dispatchEvent(new CustomEvent('request-reviews'));

		return () => {
			if (showReviews) {
				document.dispatchEvent(
					new CustomEvent('set-review-reporting', {
						detail: { active: false },
					}),
				);
			}
		};
	}, [showReviews]);

	if (!showReviews) {
		return null;
	}

	return (
		<div className={`review-panel ${className}`}>
			<div className='review-panel-header'>
				<div className='review-panel-title'>
					<h3>{t('Changes')}</h3>
					<button
						type='button'
						className='review-sync-button'
						onClick={resetScrollSync}
						title={t('Reset review panel position')}
						aria-label={t('Reset review panel position')}
					>
						<RefreshIcon />
					</button>
				</div>

				<div className='view-tabs'>
					<button
						className={`tab-button ${activeTab === 'list' ? 'active' : ''}`}
						onClick={() => setActiveTab('list')}
					>
						{t('Active')}
					</button>
					<button
						className={`tab-button ${activeTab === 'resolved' ? 'active' : ''}`}
						onClick={() => setActiveTab('resolved')}
					>
						{t('Resolved')}
					</button>
				</div>
			</div>

			{activeTab === 'list' && (
				<div className='review-panel-actions'>
					<button onClick={resolveAllReviews} disabled={!visibleReviews.length}>
						{t('Resolve all')}
					</button>
					<button onClick={acceptAllReviews} disabled={!visibleReviews.length}>
						{t('Accept all')}
					</button>
					<button onClick={rejectAllReviews} disabled={!visibleReviews.length}>
						{t('Reject all')}
					</button>
				</div>
			)}

			<div
				className='review-panel-content'
				ref={contentRef}
				onScroll={() => {
					const content = contentRef.current;
					if (!content) return;

					if (Math.abs(content.scrollTop - syncedScrollRef.current) > 1) {
						manualScrollOffsetRef.current =
							content.scrollTop - editorScrollRef.current;
						syncedScrollRef.current = content.scrollTop;
					}
				}}
			>
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
								ref={getItemRef(review.id)}
								acceptReview={acceptReview}
								rejectReview={rejectReview}
								resolveReview={resolveReview}
								addResponse={addResponse}
								deleteResponse={deleteResponse}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
};

export default ReviewPanel;
