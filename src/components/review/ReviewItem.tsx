// src/components/review/ReviewItem.tsx
import type React from 'react';
import { forwardRef, memo, useMemo, useState } from 'react';

import { t } from '@/i18n';
import { computeReviewSegments } from '../../extensions/codemirror/review/reviewSegments';
import type { ReviewSnapshot } from '../../types/review';
import { formatDate } from '../../utils/dateUtils';
import { gotoEditor } from '../../utils/editorNavigator';
import { CheckIcon, CloseIcon, ResolveIcon, TrashIcon } from '../common/Icons';

interface ReviewItemProps {
	review: ReviewSnapshot;
	top?: number;
	acceptReview: (reviewId: string) => void;
	rejectReview: (reviewId: string) => void;
	resolveReview: (reviewId: string) => void;
	addResponse: (reviewId: string, content: string) => void;
	deleteResponse: (reviewId: string, responseId: string) => void;
}

const truncateUsername = (username: string, maxLength = 15) =>
	username.length > maxLength
		? `${username.substring(0, maxLength)}...`
		: username;

const ReviewItemBase = forwardRef<HTMLDivElement, ReviewItemProps>(
	(
		{
			review,
			top,
			acceptReview,
			rejectReview,
			resolveReview,
			addResponse,
			deleteResponse,
		},
		ref,
	) => {
		const [newResponse, setNewResponse] = useState('');
		const [isAddingResponse, setIsAddingResponse] = useState(false);

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
				className={`review-item ${review.resolved ? 'resolved' : ''}`}
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
							className='resolve-button'
							onClick={() => resolveReview(review.id)}
							title={
								review.resolved
									? t('Mark as unresolved')
									: t('Mark as resolved')
							}
						>
							<ResolveIcon />
						</button>
						<button
							className='accept-button'
							onClick={() => acceptReview(review.id)}
							title={t('Accept change')}
						>
							<CheckIcon />
						</button>
						<button
							className='reject-button'
							onClick={() => rejectReview(review.id)}
							title={t('Reject change')}
						>
							<CloseIcon />
						</button>
					</div>
				</div>

				<button
					className='review-diff'
					onClick={() => gotoEditor(null, { line: review.line })}
					title={t('Go to line {line}', { line: review.line })}
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
							<div key={response.id} className='response-item'>
								<div className='response-header'>
									<div className='response-author-container'>
										<div className='response-author' title={response.user}>
											{truncateUsername(response.user)}
										</div>
										<div className='response-time'>
											{formatDate(response.timestamp)}
										</div>
									</div>
									<button
										className='delete-button small'
										onClick={() => deleteResponse(review.id, response.id)}
										title={t('Delete response')}
									>
										<TrashIcon />
									</button>
								</div>
								<div className='response-content'>{response.content}</div>
							</div>
						))}
					</div>
				)}

				{!review.resolved &&
					(isAddingResponse ? (
						<div className='add-response-form'>
							<textarea
								value={newResponse}
								onChange={(event) => setNewResponse(event.target.value)}
								onKeyDown={handleKeyDown}
								placeholder={t('Type your response...')}
								rows={2}
							/>

							<div className='form-actions'>
								<button
									className='cancel-response-button'
									onClick={() => {
										setIsAddingResponse(false);
										setNewResponse('');
									}}
								>
									{t('Cancel')}
								</button>
								<button
									className='submit-response-button'
									onClick={handleAddResponse}
									disabled={!newResponse.trim()}
								>
									{t('Submit')}
								</button>
							</div>
						</div>
					) : (
						<button
							className='add-response-button'
							onClick={() => setIsAddingResponse(true)}
						>
							{t('Add response')}
						</button>
					))}
			</div>
		);
	},
);

ReviewItemBase.displayName = 'ReviewItem';

const ReviewItem = memo(
	ReviewItemBase,
	(previous, next) =>
		previous.review === next.review &&
		previous.top === next.top &&
		previous.acceptReview === next.acceptReview &&
		previous.rejectReview === next.rejectReview &&
		previous.resolveReview === next.resolveReview &&
		previous.addResponse === next.addResponse &&
		previous.deleteResponse === next.deleteResponse,
);

export default ReviewItem;
