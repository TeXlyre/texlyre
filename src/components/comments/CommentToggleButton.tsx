// src/components/comments/CommentToggleButton.tsx
import { t } from '@/i18n';
import type React from 'react';

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
			className={`control-button ${className} ${showComments ? 'active' : ''}`}
			onClick={toggleComments}
			title={t('{action} comments{numComments}', {
				action: showComments ? t('Hide') : t('Show'),
				numComments: comments.length > 0 ? ` (${comments.length})` : ''
			})}
		>
			<div className="comment-button-container">
				<CommentIcon />
				{comments.length > 0 && (
					<span className="comment-count-badge">{comments.length}</span>
				)}
			</div>
		</button>
	);
};

export default CommentToggleButton;
