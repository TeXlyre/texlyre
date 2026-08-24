// src/components/profile/UserDropdown.tsx
import type React from 'react';
import { useRef, useState } from 'react';

import { t } from '@/i18n';
import { useStorageQuota } from '../../hooks/useStorageQuota';
import { formatFileSize } from '../../utils/fileUtils';
import PositionedDropdown from '../common/PositionedDropdown';
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
	const buttonRef = useRef<HTMLButtonElement>(null);
	const { isSupported, isLow, usageBytes, quotaBytes, usedRatio } =
		useStorageQuota();
	const showStorageSummary = !isGuest && isSupported && quotaBytes > 0;

	const displayUsername = isGuest ? t('Guest User') : username;

	return (
		<div className='user-dropdown-container'>
			<button
				ref={buttonRef}
				className={`user-dropdown-button ${isGuest ? 'guest' : ''}`}
				onClick={() => setIsOpen(!isOpen)}
				aria-expanded={isOpen}
				aria-haspopup='true'
			>
				<UserIcon />
				<span>{displayUsername}</span>
			</button>

			<PositionedDropdown
				isOpen={isOpen}
				triggerElement={buttonRef.current}
				className='user-dropdown-menu'
				onClose={() => setIsOpen(false)}
			>
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
			</PositionedDropdown>
		</div>
	);
};

export default UserDropdown;
