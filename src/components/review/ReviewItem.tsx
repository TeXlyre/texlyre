// src/components/review/ReviewItem.tsx
import type React from 'react';
import { forwardRef, useMemo, useState } from 'react';

import { t } from '@/i18n';
import { computeReviewSegments } from '../../extensions/codemirror/review/reviewSegments';
import { useReview } from '../../hooks/useReview';
import type { ReviewSnapshot } from '../../types/review';
import { formatDate } from '../../utils/dateUtils';
import { gotoEditor } from '../../utils/editorNavigator';
import { CheckIcon, CloseIcon, TrashIcon } from '../common/Icons';

interface ReviewItemProps {
	review: ReviewSnapshot;
	top?: number;
}

const truncateUsername = (username: string, maxLength = 15) =>
	username.length > maxLength
		? `${username.substring(0, maxLength)}...`
		: username;

const ReviewItem = forwardRef<HTMLDivElement, ReviewItemProps>(
	({ review, top }, ref) => {
		const [newResponse, setNewResponse] = useState('');
		const [isAddingResponse, setIsAddingResponse] = useState(false);
		const { acceptReview, rejectReview, addResponse, deleteResponse } =
			useReview();

		const segments = useMemo(
			() => computeReviewSegments(review.originalText, review.currentText),
			[review.originalText, review.currentText],
		);

		const handleAddResponse = () => {
			if (!newResponse.trim()) return;

			addResponse(review.id, newResponse);
			setNewResponse('');
			setIsAddingResponse(false);
		};

		const handleKeyDown = (event: React.KeyboardEvent) => {
			if (event.key === 'Enter' && !event.shiftKey) {
				event.preventDefault();
				handleAddResponse();
			}
		};

		return (
			<div
				className='review-item'
				data-review-id={review.id}
				ref={ref}
				style={top === undefined ? undefined : { top: `${top}px` }}
			>
				<div className='review-header'>
					<div className='review-author-container'>
						<div className='review-author' title={review.user}>
							{truncateUsername(review.user)}
						</div>
						<div className='review-time'>{formatDate(review.timestamp)}</div>
					</div>
					<div className='review-header-actions'>
						<button
							type='button'
							className='accept-button'
							onClick={() => acceptReview(review.id)}
							title={t('Accept change')}
						>
							<CheckIcon />
						</button>
						<button
							type='button'
							className='reject-button'
							onClick={() => rejectReview(review.id)}
							title={t('Reject change')}
						>
							<CloseIcon />
						</button>
					</div>
				</div>

				<button
					type='button'
					className='review-diff'
					onClick={() => gotoEditor(null, { line: review.line })}
					title={t('Go to change')}
				>
					{segments.map((segment) => (
						<span
							key={`${segment.type}-${segment.from}-${segment.text}`}
							className={`review-segment review-segment-${segment.type}`}
						>
							{segment.text}
						</span>
					))}
				</button>

				{review.responses.length > 0 && (
					<div className='review-responses'>
						{review.responses.map((response) => (
							<div key={response.id} className='review-response'>
								<div className='review-response-header'>
									<span className='review-author' title={response.user}>
										{truncateUsername(response.user)}
									</span>
									<span className='review-time'>
										{formatDate(response.timestamp)}
									</span>
									<button
										type='button'
										className='delete-button'
										onClick={() => deleteResponse(review.id, response.id)}
										title={t('Delete response')}
									>
										<TrashIcon />
									</button>
								</div>
								<div className='review-response-content'>
									{response.content}
								</div>
							</div>
						))}
					</div>
				)}

				{isAddingResponse ? (
					<div className='review-response-form'>
						<textarea
							value={newResponse}
							onChange={(event) => setNewResponse(event.target.value)}
							onKeyDown={handleKeyDown}
							placeholder={t('Write a reply...')}
						/>
						<div className='review-response-actions'>
							<button type='button' onClick={() => setIsAddingResponse(false)}>
								{t('Cancel')}
							</button>
							<button type='button' onClick={handleAddResponse}>
								{t('Reply')}
							</button>
						</div>
					</div>
				) : (
					<button
						type='button'
						className='review-reply-button'
						onClick={() => setIsAddingResponse(true)}
					>
						{t('Reply')}
					</button>
				)}
			</div>
		);
	},
);

ReviewItem.displayName = 'ReviewItem';

export default ReviewItem;
