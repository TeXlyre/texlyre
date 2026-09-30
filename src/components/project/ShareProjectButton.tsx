// src/components/project/ShareProjectButton.tsx
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { t } from '@/i18n';
import PositionedDropdown from '../common/PositionedDropdown';
import { ChevronDownIcon, ShareIcon } from '../common/Icons';

interface ShareProjectButtonProps {
	className?: string;
	onOpenShareModal: () => void;
}

const ShareProjectButton: React.FC<ShareProjectButtonProps> = ({
	className = '',
	onOpenShareModal,
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
	}, []);

	const handleShareClick = () => {
		onOpenShareModal();
		setIsDropdownOpen(false);
	};

	const toggleDropdown = (e: React.MouseEvent) => {
		e.stopPropagation();
		setIsDropdownOpen(!isDropdownOpen);
	};

	return (
		<div className={`ui-control-cluster ${className}`} ref={dropdownRef}>
			<div
				className='ui-button-group ui-split-button'
				data-variant='joined'
				data-size='control'
				data-trigger-group='true'
			>
				<button
					type='button'
					className='button ui-split-main'
					onClick={handleShareClick}
					title={t('Share Project')}
				>
					<ShareIcon />
				</button>
				<button
					type='button'
					className='button ui-split-toggle'
					onClick={toggleDropdown}
					title={t('Share Options')}
				>
					<ChevronDownIcon />
				</button>
			</div>
			<PositionedDropdown
				isOpen={isDropdownOpen}
				triggerElement={
					dropdownRef.current?.querySelector(
						'[data-trigger-group]',
					) as HTMLElement
				}
				className='share-dropdown'
			>
				<div
					className='ui-menu-item'
					data-density='compact'
					onClick={handleShareClick}
				>
					<ShareIcon />
					<span>{t('Share with Link')}</span>
				</div>
				<div className='ui-menu-item disabled' data-density='compact'>
					<span>{t('Publish to Journal')}</span>
					<span className='ui-menu-meta'>{t('(Coming Soon)')}</span>
				</div>
				<div className='ui-menu-item disabled' data-density='compact'>
					<span>{t('Share Template')}</span>
					<span className='ui-menu-meta'>{t('(Coming Soon)')}</span>
				</div>
			</PositionedDropdown>
		</div>
	);
};

export default ShareProjectButton;
