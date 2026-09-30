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
		<div>
			<button
				type='button'
				ref={buttonRef}
				className='button user-dropdown-button'
				data-variant='ghost'
				data-tone={isGuest ? 'accent' : undefined}
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
						className='ui-menu-item ui-stack'
						onClick={() => {
							setIsOpen(false);
							onOpenProfile('data');
						}}
					>
						<div
							className='ui-toolbar ui-meta'
							data-justify='between'
							data-width='full'
						>
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
							type='button'
							className='ui-menu-item'
							onClick={() => {
								setIsOpen(false);
								onOpenProfile();
							}}
						>
							<EditIcon />
							{t('Profile Settings')}
						</button>
						<button
							type='button'
							className='ui-menu-item'
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
							type='button'
							className='ui-menu-item'
							data-tone='danger'
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
							type='button'
							className='ui-menu-item'
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
					type='button'
					className='ui-menu-item'
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
