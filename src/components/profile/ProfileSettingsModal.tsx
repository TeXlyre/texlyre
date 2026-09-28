// src/components/profile/ProfileSettingsModal.tsx
import type React from 'react';
import { useEffect, useState } from 'react';

import { t } from '@/i18n';
import { useAuth } from '../../hooks/useAuth';
import Modal from '../common/Modal';
import { UserIcon } from '../common/Icons';
import ProfileAccountIdentitySection from './ProfileAccountIdentitySection';
import BrowserStorageSection from './ProfileBrowserStorageSection';
import LocalStorageDataSection from './ProfileLocalStorageDataSection';

export type ProfileSettingsTab = 'account' | 'data';

interface ProfileSettingsModalProps {
	isOpen: boolean;
	onClose: () => void;
	initialTab?: ProfileSettingsTab;
}

const ProfileSettingsModal: React.FC<ProfileSettingsModalProps> = ({
	isOpen,
	onClose,
	initialTab = 'account',
}) => {
	const { user } = useAuth();
	const [tab, setTab] = useState<ProfileSettingsTab>(initialTab);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);

	useEffect(() => {
		if (isOpen) setTab(initialTab);
	}, [isOpen, initialTab]);

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title={t('Profile Settings')}
			size='medium'
			icon={UserIcon}
		>
			<div className='ui-tab-list' data-role='panel' data-variant='switcher'>
				<button
					type='button'
					className={`ui-tab ${tab === 'account' ? 'active' : ''}`}
					onClick={() => setTab('account')}
				>
					{t('Account')}
				</button>
				<button
					type='button'
					className={`ui-tab ${tab === 'data' ? 'active' : ''}`}
					onClick={() => setTab('data')}
				>
					{t('Data')}
				</button>
			</div>

			<br />

			{error && (
				<div className='ui-message' data-tone='error'>
					{error}
				</div>
			)}
			{successMessage && (
				<div className='ui-message' data-tone='success'>
					{successMessage}
				</div>
			)}

			{tab === 'account' ? (
				<ProfileAccountIdentitySection
					isOpen={isOpen}
					isSubmitting={isSubmitting}
					setIsSubmitting={setIsSubmitting}
					onClose={onClose}
					onError={setError}
					onSuccess={setSuccessMessage}
				/>
			) : (
				user && (
					<>
						<BrowserStorageSection
							isSubmitting={isSubmitting}
							setIsSubmitting={setIsSubmitting}
							onError={setError}
							onSuccess={setSuccessMessage}
						/>
						<LocalStorageDataSection
							user={user}
							isSubmitting={isSubmitting}
							setIsSubmitting={setIsSubmitting}
							onError={setError}
							onSuccess={setSuccessMessage}
						/>
					</>
				)
			)}
		</Modal>
	);
};

export default ProfileSettingsModal;
