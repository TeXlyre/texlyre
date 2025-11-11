// src/components/comments/CommentButton.tsx
import { t } from '@/i18n';
import type React from 'react';

import { useComments } from '../../hooks/useComments';

interface CommentButtonProps {
  position: { x: number; y: number; };
  selection: { start: number; end: number; };
  onCommentAdded: () => void;
}

const CommentButton: React.FC<CommentButtonProps> = ({
  position,
  selection,
  onCommentAdded
}) => {
  const { addComment } = useComments();

  const handleClick = () => {
    document.dispatchEvent(
      new CustomEvent('show-comment-modal', {
        detail: { selection }
      })
    );
    onCommentAdded();
  };

  return (
    <div
      className="comment-button"
      style={{
        position: 'absolute',
        left: `${position.x}px`,
        top: `${position.y}px`
      }}
      onClick={handleClick}>{t('Add Comment')}


    </div>);

};

export default CommentButton;