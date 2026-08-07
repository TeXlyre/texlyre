// src/components/review/ReviewToggleButton.tsx
import type React from 'react';

import { t } from '@/i18n';
import { useReview } from '../../hooks/useReview';
import { EditingViewIcon, ToolbarStrikeIcon } from '../common/Icons';

interface ReviewButtonProps {
	className?: string;
}

export const TrackChangesButton: React.FC<ReviewButtonProps> = ({
	className = '',
}) => {
	const { trackChanges, toggleTrackChanges } = useReview();

	return (
		<button
			className={`control-button ${className} ${trackChanges ? 'active' : ''}`}
			onClick={toggleTrackChanges}
			title={t('{action} tracking changes', {
				action: trackChanges ? t('Stop') : t('Start'),
			})}
		>
			<EditingViewIcon />
		</button>
	);
};

const ReviewToggleButton: React.FC<ReviewButtonProps> = ({
	className = '',
}) => {
	const { toggleReviews, showReviews, reviews } = useReview();

	return (
		<button
			className={`control-button ${className} ${showReviews ? 'active' : ''}`}
			onClick={toggleReviews}
			title={t('{action} Changes{numReviews}', {
				action: showReviews ? t('Hide') : t('Show'),
				numReviews: reviews.length > 0 ? ` (${reviews.length})` : '',
			})}
		>
			<div className='review-button-container'>
				<ToolbarStrikeIcon />
				{reviews.length > 0 && (
					<span className='review-count-badge'>{reviews.length}</span>
				)}
			</div>
		</button>
	);
};

export default ReviewToggleButton;
