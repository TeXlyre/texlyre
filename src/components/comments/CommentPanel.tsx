// src/components/comments/CommentPanel.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useState } from 'react';

import { useComments } from '../../hooks/useComments';
import CommentItem from './CommentItem';

interface CommentPanelProps {
  className?: string;
  onLineClick?: (line: number) => void;
}

const CommentPanel: React.FC<CommentPanelProps> = ({
  className = '',
  onLineClick
}) => {
  const { comments, showComments } = useComments();
  const [activeTab, setActiveTab] = useState<'list' | 'resolved'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredComments, setFilteredComments] = useState(comments);

  useEffect(() => {
    const commentsToFilter =
      activeTab === 'resolved' ?
        comments.filter((comment) => comment.resolved) :
        comments.filter((comment) => !comment.resolved);

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
                response.user.toLowerCase().includes(query)
            )
        )
      );
    }
  }, [searchQuery, comments, activeTab]);

  if (!showComments) {
    return null;
  }

  return (
    <div className={`comment-panel ${className}`}>
      <div className="comment-panel-header">
        <h3>{t('Comments')}</h3>
        <div className="view-tabs">
          <button
            className={`tab-button ${activeTab === 'list' ? 'active' : ''}`}
            onClick={() => setActiveTab('list')}>{t('Active')}


          </button>
          <button
            className={`tab-button ${activeTab === 'resolved' ? 'active' : ''}`}
            onClick={() => setActiveTab('resolved')}>{t('Resolved')}


          </button>
        </div>
      </div>

      <div className="comment-search">
        <input
          type="text"
          className={'comment-search-input'}
          placeholder={t('Search comments...')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)} />

        {searchQuery &&
          <button
            className="clear-search-button"
            onClick={() => setSearchQuery('')}>

            ×
          </button>
        }
      </div>

      <div className="comment-panel-content">
        {filteredComments.length === 0 ?
          <div className="no-comments">
            {searchQuery ?
              t('No comments found matching the search criteria') :
              activeTab === 'resolved' ?
                t('No resolved comments yet.') :
                t('No active comments.')}
          </div> :

          <div className={`comments-${activeTab}`}>
            {filteredComments.map((comment) =>
              <CommentItem
                key={comment.id}
                comment={comment}
                view="list"
                onLineClick={onLineClick} />

            )}
          </div>
        }
      </div>
    </div>);

};

export default CommentPanel;