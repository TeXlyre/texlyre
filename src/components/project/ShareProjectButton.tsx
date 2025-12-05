// src/components/project/ShareProjectButton.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import PositionedDropdown from '../common/PositionedDropdown';
import { ChevronDownIcon, ShareIcon } from '../common/Icons';

interface ShareProjectButtonProps {
  className?: string;
  projectName: string;
  shareUrl: string;
  onOpenShareModal: () => void;
}

const ShareProjectButton: React.FC<ShareProjectButtonProps> = ({
  className = '',
  projectName,
  shareUrl,
  onOpenShareModal
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (dropdownRef.current && !dropdownRef.current.contains(target)) {
        const portaledDropdown = document.querySelector('.share-dropdown');
        if (portaledDropdown && portaledDropdown.contains(target)) {
          return;
        }
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const handleShareClick = () => {
    onOpenShareModal();
    setIsDropdownOpen(false);
  };

  const toggleDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDropdownOpen(!isDropdownOpen);
  };

  return (
    <div className={`share-project-buttons ${className}`} ref={dropdownRef}>
      <div className="share-button-group">
        <button
          className="share-button main-button"
          onClick={handleShareClick}
          title={t('Share Project')}>

          <ShareIcon />
        </button>
        <button
          className="share-button dropdown-toggle"
          onClick={toggleDropdown}
          title={t('Share Options')}>

          <ChevronDownIcon />
        </button>
      </div>
      <PositionedDropdown
        isOpen={isDropdownOpen}
        triggerElement={dropdownRef.current?.querySelector('.share-button-group') as HTMLElement}
        className="share-dropdown">
        <div className="share-dropdown-item" onClick={handleShareClick}>
          <ShareIcon />
          <span>{t('Share with Link')}</span>
        </div>
        <div className="share-dropdown-item disabled">
          <span>{t('Publish to Journal')}</span>
          <span className="coming-soon">{t('(Coming Soon)')}</span>
        </div>
        <div className="share-dropdown-item disabled">
          <span>{t('Share Template')}</span>
          <span className="coming-soon">{t('(Coming Soon)')}</span>
        </div>
      </PositionedDropdown>
    </div>);

};

export default ShareProjectButton;