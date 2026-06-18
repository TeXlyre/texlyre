// src/components/profile/UserDropdown.tsx
import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { t } from '@/i18n';
import { useStorageQuota } from '../../hooks/useStorageQuota';
import { formatFileSize } from '../../utils/fileUtils';
import type { ProfileSettingsTab } from './ProfileSettingsModal';
import {
	UserIcon,
	UpgradeAccountIcon,
	TrashIcon,
	ExportIcon,
	EditIcon,
	LogoutIcon,
} from '../common/Icons';

interface UserDropdownProps {
	username: string;
	onLogout: () => void;
	onOpenProfile: (tab?: ProfileSettingsTab) => void;
	onOpenExport: () => void;
	onOpenDeleteAccount: () => void;
	onOpenUpgrade?: () => void;
	isGuest?: boolean;
}

const UserDropdown: React.FC<UserDropdownProps> = ({
	username,
	onLogout,
	onOpenProfile,
	onOpenExport,
	onOpenDeleteAccount,
	onOpenUpgrade,
	isGuest = false,
}) => {
	const [isOpen, setIsOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const { isSupported, isLow, usageBytes, quotaBytes, usedRatio } =
		useStorageQuota();
	const showStorageSummary = !isGuest && isSupported && quotaBytes > 0;

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(event.target as Node)
			) {
				setIsOpen(false);
			}
		};

		document.addEventListener('mousedown', handleClickOutside);
		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
		};
	}, []);

	const displayUsername = isGuest ? t('Guest User') : username;

	return (
		<div className='user-dropdown-container' ref={dropdownRef}>
			<button
				className={`user-dropdown-button ${isGuest ? 'guest' : ''}`}
				onClick={() => setIsOpen(!isOpen)}
				aria-expanded={isOpen}
				aria-haspopup='true'
			>
				<UserIcon />
				<span>{displayUsername}</span>
			</button>

			{isOpen && (
				<div className='user-dropdown-menu'>
					{showStorageSummary && (
						<button
							type='button'
							className='dropdown-item storage-summary'
							onClick={() => {
								setIsOpen(false);
								onOpenProfile('data');
							}}
						>
							<div className='storage-summary-labels'>
								<span>{t('Storage')}</span>
								<span>
									{t('{used} of {total}', {
										used: formatFileSize(usageBytes),
										total: formatFileSize(quotaBytes),
									})}
								</span>
							</div>
							<div className={`storage-meter ${isLow ? 'low' : ''}`}>
								<div
									className='storage-meter-segment indexedDB'
									style={{ width: `${usedRatio * 100}%` }}
								/>
							</div>
						</button>
					)}
					{!isGuest && (
						<>
							<button
								className='dropdown-item'
								onClick={() => {
									setIsOpen(false);
									onOpenProfile();
								}}
							>
								<EditIcon />
								{t('Profile Settings')}
							</button>
							<button
								className='dropdown-item'
								onClick={() => {
									setIsOpen(false);
									onOpenExport();
								}}
							>
								<ExportIcon />
								{t('Export Account')}
							</button>
							<div className='dropdown-separator' />
							<button
								className='dropdown-item danger'
								onClick={() => {
									setIsOpen(false);
									onOpenDeleteAccount();
								}}
							>
								<TrashIcon />
								{t('Delete Account')}
							</button>
						</>
					)}
					{isGuest && onOpenUpgrade && (
						<>
							<button
								className='dropdown-item'
								onClick={() => {
									setIsOpen(false);
									onOpenUpgrade();
								}}
							>
								<UpgradeAccountIcon />
								{t('Upgrade Account')}
							</button>
							<div className='dropdown-separator' />
						</>
					)}
					<button
						className='dropdown-item'
						onClick={() => {
							setIsOpen(false);
							onLogout();
						}}
					>
						{isGuest ? (
							<>
								<TrashIcon />
								<span>{t('End Session')}</span>
							</>
						) : (
							<>
								<LogoutIcon />
								<span>{t('Log out')}</span>
							</>
						)}
					</button>
				</div>
			)}
		</div>
	);
};

export default UserDropdown;
