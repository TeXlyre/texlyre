// src/components/comments/CommentItem.tsx
import type React from 'react';
import { useState } from 'react';

import { t } from '@/i18n';
import { useComments } from '../../hooks/useComments';
import type { Comment } from '../../types/comments';
import { formatDate } from '../../utils/dateUtils';
import { gotoEditor } from '../../utils/editorNavigator';
import { ResolveIcon, TrashIcon } from '../common/Icons';

interface CommentItemProps {
	comment: Comment;
	view: 'list' | 'resolved';
	onLineClick?: (line: number) => void;
}

const CommentItem: React.FC<CommentItemProps> = ({
	comment,
	view,
	onLineClick,
}) => {
	const [newResponse, setNewResponse] = useState('');
	const [isAddingResponse, setIsAddingResponse] = useState(false);
	const { addResponse, deleteComment, deleteResponse, resolveComment } =
		useComments();

	const handleAddResponse = () => {
		if (newResponse.trim()) {
			addResponse(comment.id, newResponse);
			setNewResponse('');
			setIsAddingResponse(false);
		}
	};

	const handleDeleteResponse = (responseId: string) => {
		deleteResponse(comment.id, responseId);
	};

	const handleResolveComment = () => {
		resolveComment(comment.id);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			handleAddResponse();
		}
	};

	const handleLineClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (!comment.line) return;
		gotoEditor(null, { line: comment.line });
	};

	const truncateUsername = (username: string, maxLength = 15) => {
		return username.length > maxLength
			? `${username.substring(0, maxLength)}...`
			: username;
	};

	return (
		<div
			className='comment-item ui-card'
			data-role='thread-item'
			data-state={comment.resolved ? 'resolved' : undefined}
			data-comment-id={comment.id}
		>
			<div className='ui-item-header'>
				<div className='ui-item-author-group'>
					<div className='ui-item-author' title={comment.user}>
						{truncateUsername(comment.user)}
					</div>
					<div className='ui-item-time'>{formatDate(comment.timestamp)}</div>
				</div>
				<div className='ui-actions'>
					<button
						type='button'
						className='ui-icon-button'
						data-variant='ghost'
						data-tone='success'
						data-size='sm'
						onClick={handleResolveComment}
						title={
							comment.resolved ? t('Mark as unresolved') : t('Mark as resolved')
						}
					>
						<ResolveIcon />
					</button>
					<button
						type='button'
						className='ui-icon-button'
						data-variant='ghost'
						data-tone='danger'
						data-size='sm'
						onClick={() => deleteComment(comment.id)}
						title={t('Delete comment')}
					>
						<TrashIcon />
					</button>
				</div>
			</div>

			{comment.line && (
				<div className='comment-line-section'>
					<button
						type='button'
						className='button secondary'
						onClick={handleLineClick}
						title={t('Go to line {line}', { line: comment.line })}
					>
						{t('Line {line}', { line: comment.line })}
					</button>
				</div>
			)}

			<div className='ui-item-content'>{comment.content}</div>

			{comment.responses.length > 0 && (
				<div className='ui-thread'>
					{comment.responses.map((response) => (
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
									onClick={() => handleDeleteResponse(response.id)}
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

			{!comment.resolved &&
				(isAddingResponse ? (
					<div className='ui-stack' data-gap='sm'>
						<textarea
							value={newResponse}
							onChange={(e) => setNewResponse(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder={t('Type your response...')}
							rows={2}
							className='ui-field-control'
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
};

export default CommentItem;
