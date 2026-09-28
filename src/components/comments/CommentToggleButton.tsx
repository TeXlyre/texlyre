// src/components/comments/CommentToggleButton.tsx
import type React from 'react';

import { t } from '@/i18n';
import { useComments } from '../../hooks/useComments';
import { CommentIcon } from '../common/Icons';

interface CommentToggleButtonProps {
	className?: string;
}

const CommentToggleButton: React.FC<CommentToggleButtonProps> = ({
	className = '',
}) => {
	const { toggleComments, showComments, comments } = useComments();

	return (
		<button
			type='button'
			className={`button ui-count-control ${className} ${showComments ? 'active' : ''}`}
			onClick={toggleComments}
			title={t('{action} Comments{numComments}', {
				action: showComments ? t('Hide') : t('Show'),
				numComments: comments.length > 0 ? ` (${comments.length})` : '',
			})}
		>
			<div className='comment-button-container ui-count-inline'>
				<CommentIcon />
				{comments.length > 0 && (
					<span className='ui-badge' data-variant='count'>
						{comments.length}
					</span>
				)}
			</div>
		</button>
	);
};

export default CommentToggleButton;
