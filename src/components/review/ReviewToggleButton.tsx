// src/components/review/ReviewToggleButton.tsx
import type React from 'react';
import { useRef, useState } from 'react';

import { t } from '@/i18n';
import { useReview } from '../../hooks/useReview';
import PositionedDropdown from '../common/PositionedDropdown';
import {
	ChevronDownIcon,
	ReviewPanelIcon,
	TrackChangesIcon,
} from '../common/Icons';

interface ReviewButtonProps {
	className?: string;
}

export const TrackChangesButton: React.FC<ReviewButtonProps> = ({
	className = '',
}) => {
	const {
		trackChanges,
		trackChangesLocal,
		trackChangesShared,
		canShareTracking,
		toggleTrackChanges,
		toggleTrackChangesShared,
	} = useReview();
	const [isDropdownOpen, setIsDropdownOpen] = useState(false);
	const groupRef = useRef<HTMLDivElement>(null);

	return (
		<div className={`tracking-button-container ${className}`}>
			<div className='tracking-button-group' ref={groupRef}>
				<button
					className={`control-button tracking-button ${trackChanges ? 'active' : ''}`}
					onClick={toggleTrackChanges}
					title={
						trackChangesShared
							? t('Tracking changes for all collaborators')
							: t('{action} tracking changes', {
									action: trackChangesLocal ? t('Stop') : t('Start'),
								})
					}
				>
					<TrackChangesIcon />
				</button>

				<button
					className='control-button dropdown-toggle'
					onClick={() => setIsDropdownOpen(!isDropdownOpen)}
					title={t('Tracking Options')}
				>
					<ChevronDownIcon />
				</button>
			</div>

			<PositionedDropdown
				isOpen={isDropdownOpen}
				triggerElement={groupRef.current}
				className='tracking-dropdown'
				onClose={() => setIsDropdownOpen(false)}
			>
				<div className='dropdown-section'>
					<div className='dropdown-title'>{t('Track Changes:')}</div>

					<label className='dropdown-checkbox'>
						<input
							type='checkbox'
							checked={trackChangesLocal}
							onChange={toggleTrackChanges}
						/>
						{t('Track my changes in this file')}
					</label>

					<label className='dropdown-checkbox'>
						<input
							type='checkbox'
							checked={trackChangesShared}
							onChange={toggleTrackChangesShared}
							disabled={!canShareTracking}
						/>
						{t('Track changes for all collaborators')}
					</label>
				</div>
			</PositionedDropdown>
		</div>
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
				<ReviewPanelIcon />
				{reviews.length > 0 && (
					<span className='review-count-badge'>{reviews.length}</span>
				)}
			</div>
		</button>
	);
};

export default ReviewToggleButton;
