// src/components/comments/CommentModal.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useState } from 'react';

import { CommentIcon } from '../common/Icons';
import Modal from '../common/Modal';

interface CommentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCommentSubmit: (content: string) => void;
  title?: string;
}

const CommentModal: React.FC<CommentModalProps> = ({
  isOpen,
  onClose,
  onCommentSubmit,
  title = t('Add Comment')
}) => {
  const [content, setContent] = useState('');

  useEffect(() => {
    if (isOpen) {
      setContent('');
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim()) {
      return;
    }

    onCommentSubmit(content.trim());
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      icon={CommentIcon}
      size="small">

      <div className="comment-modal">
        <form onSubmit={handleSubmit} className="comment-form">
          <div className="form-group">
            <label htmlFor="comment-content">{t('Comment')}</label>
            <textarea
              id="comment-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('Enter your comment...')}
              rows={4}
              autoFocus />

          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}>{t('Cancel')}


            </button>
            <button
              type="submit"
              className="button primary"
              disabled={!content.trim()}>{t('Add Comment')}


            </button>
          </div>
        </form>
      </div>
    </Modal>);

};

export default CommentModal;