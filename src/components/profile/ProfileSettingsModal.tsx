// src/components/profile/ProfileSettingsModal.tsx
import type React from 'react';
import { useState } from 'react';

import { t } from '@/i18n';
import { useAuth } from '../../hooks/useAuth';
import Modal from '../common/Modal';
import { UserIcon } from '../common/Icons';
import ProfileAccountIdentitySection from './ProfileAccountIdentitySection';
import LocalStorageDataSection from './ProfileLocalStorageDataSection';

interface ProfileSettingsModalProps {
	isOpen: boolean;
	onClose: () => void;
}

const ProfileSettingsModal: React.FC<ProfileSettingsModalProps> = ({
	isOpen,
	onClose,
}) => {
	const { user } = useAuth();
	const [tab, setTab] = useState<'account' | 'data'>('account');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title={t('Profile Settings')}
			size='medium'
			icon={UserIcon}
		>
			<div className='view-tabs'>
				<button
					type='button'
					className={`tab-button ${tab === 'account' ? 'active' : ''}`}
					onClick={() => setTab('account')}
				>
					{t('Account')}
				</button>
				<button
					type='button'
					className={`tab-button ${tab === 'data' ? 'active' : ''}`}
					onClick={() => setTab('data')}
				>
					{t('Data')}
				</button>
			</div>

			<br />

			{error && <div className='error-message'>{error}</div>}
			{successMessage && (
				<div className='success-message'>{successMessage}</div>
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
					<LocalStorageDataSection
						user={user}
						isSubmitting={isSubmitting}
						setIsSubmitting={setIsSubmitting}
						onError={setError}
						onSuccess={setSuccessMessage}
					/>
				)
			)}
		</Modal>
	);
};

export default ProfileSettingsModal;
