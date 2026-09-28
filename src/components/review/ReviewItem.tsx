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
				className='review-item ui-card'
				data-role='thread-item'
				data-state={review.resolved ? 'resolved' : undefined}
				data-review-id={review.id}
				ref={ref}
				style={top === undefined ? undefined : { top: `${top}px` }}
			>
				<div className='ui-item-header'>
					<div className='ui-item-author-group'>
						<div className='ui-item-author' title={review.user}>
							{truncateUsername(review.user)}
						</div>
						<div className='ui-item-time'>{formatDate(review.timestamp)}</div>
					</div>
					<div className='ui-actions'>
						<button
							type='button'
							className='ui-icon-button'
							data-variant='ghost'
							data-tone='success'
							data-size='sm'
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
							type='button'
							className='ui-icon-button'
							data-variant='ghost'
							data-tone='success'
							data-size='sm'
							onClick={() => acceptReview(review.id)}
							title={t('Accept change')}
						>
							<CheckIcon />
						</button>
						<button
							type='button'
							className='ui-icon-button'
							data-variant='ghost'
							data-tone='danger'
							data-size='sm'
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
					<div className='ui-thread'>
						{review.responses.map((response) => (
							<div key={response.id} className='ui-thread-item'>
								<div className='ui-item-header'>
									<div className='ui-item-author-group'>
										<div className='ui-item-author' title={response.user}>
											{truncateUsername(response.user)}
										</div>
										<div className='ui-item-time'>
											{formatDate(response.timestamp)}
										</div>
									</div>
									<button
										type='button'
										className='ui-icon-button'
										data-variant='ghost'
										data-tone='danger'
										data-size='xs'
										onClick={() => deleteResponse(review.id, response.id)}
										title={t('Delete response')}
									>
										<TrashIcon />
									</button>
								</div>
								<div className='ui-item-content'>{response.content}</div>
							</div>
						))}
					</div>
				)}

				{!review.resolved &&
					(isAddingResponse ? (
						<div className='ui-stack' data-gap='sm'>
							<textarea
								value={newResponse}
								onChange={(event) => setNewResponse(event.target.value)}
								onKeyDown={handleKeyDown}
								placeholder={t('Type your response...')}
								rows={2}
							/>

							<div
								className='ui-actions'
								data-variant='form'
								data-align='end'
								data-cross='stretch'
							>
								<button
									type='button'
									className='button secondary'
									onClick={() => {
										setIsAddingResponse(false);
										setNewResponse('');
									}}
								>
									{t('Cancel')}
								</button>
								<button
									type='button'
									className='button primary'
									onClick={handleAddResponse}
									disabled={!newResponse.trim()}
								>
									{t('Submit')}
								</button>
							</div>
						</div>
					) : (
						<button
							type='button'
							className='button secondary'
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
