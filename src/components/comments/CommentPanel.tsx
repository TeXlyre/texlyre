// src/components/comments/CommentPanel.tsx
import type React from 'react';
import { useEffect, useState } from 'react';

import { t } from '@/i18n';
import { useComments } from '../../hooks/useComments';
import CommentItem from './CommentItem';

interface CommentPanelProps {
	className?: string;
	onLineClick?: (line: number) => void;
}

const CommentPanel: React.FC<CommentPanelProps> = ({
	className = '',
	onLineClick,
}) => {
	const { comments, showComments } = useComments();
	const [activeTab, setActiveTab] = useState<'list' | 'resolved'>('list');
	const [searchQuery, setSearchQuery] = useState('');
	const [filteredComments, setFilteredComments] = useState(comments);

	useEffect(() => {
		const commentsToFilter =
			activeTab === 'resolved'
				? comments.filter((comment) => comment.resolved)
				: comments.filter((comment) => !comment.resolved);

		if (searchQuery.trim() === '') {
			setFilteredComments(commentsToFilter);
		} else {
			const query = searchQuery.toLowerCase();
			setFilteredComments(
				commentsToFilter.filter(
					(comment) =>
						comment.content.toLowerCase().includes(query) ||
						comment.user.toLowerCase().includes(query) ||
						comment.responses.some(
							(response) =>
								response.content.toLowerCase().includes(query) ||
								response.user.toLowerCase().includes(query),
						),
				),
			);
		}
	}, [searchQuery, comments, activeTab]);

	if (!showComments) {
		return null;
	}

	return (
		<div className={`comment-panel ui-panel ${className}`} data-role='thread'>
			<div className='ui-panel-header' data-role='thread' data-shrink='true'>
				<h3 className='ui-panel-title' data-spacing='end-xs'>
					{t('Comments')}
				</h3>
				<div className='ui-tab-list' data-role='panel' data-variant='switcher'>
					<button
						type='button'
						className={`ui-tab ${activeTab === 'list' ? 'active' : ''}`}
						onClick={() => setActiveTab('list')}
					>
						{t('Active')}
					</button>
					<button
						type='button'
						className={`ui-tab ${activeTab === 'resolved' ? 'active' : ''}`}
						onClick={() => setActiveTab('resolved')}
					>
						{t('Resolved')}
					</button>
				</div>
			</div>

			<div className='ui-panel-controls'>
				<div className='ui-search-field'>
					<input
						type='text'
						className={'ui-field-control ui-search-control'}
						placeholder={t('Search comments...')}
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
					/>

					{searchQuery && (
						<button
							type='button'
							aria-label={t('Clear search')}
							className='clear-search-button ui-search-clear'
							onClick={() => setSearchQuery('')}
						>
							<span aria-hidden='true'>×</span>
						</button>
					)}
				</div>
			</div>

			<div
				className='ui-panel-content'
				data-overflow='y'
				data-padding={filteredComments.length === 0 ? undefined : 'sm'}
			>
				{filteredComments.length === 0 ? (
					<div className='no-comments ui-empty-state'>
						{searchQuery
							? t('No comments found matching the search criteria')
							: activeTab === 'resolved'
								? t('No resolved comments yet.')
								: t('No active comments.')}
					</div>
				) : (
					<div className={`comments-${activeTab}`}>
						{filteredComments.map((comment) => (
							<CommentItem
								key={comment.id}
								comment={comment}
								view='list'
								onLineClick={onLineClick}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
};

export default CommentPanel;
