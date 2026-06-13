// src/components/profile/ProfileSettingsModal.tsx
import type React from 'react';
import { useEffect, useState } from 'react';

import { t } from '@/i18n';
import { generateRandomColor } from '../../utils/colorUtils';
import { useAuth } from '../../hooks/useAuth';
import { useChelys } from '../../hooks/useChelys';
import type { User } from '../../types/auth';
import Modal from '../common/Modal';
import { UserIcon } from '../common/Icons';
import ChelysConnectionSection from './ProfileChelysConnectionSection';
import LocalStorageDataSection from './ProfileLocalStorageDataSection';

interface ProfileSettingsModalProps {
	isOpen: boolean;
	onClose: () => void;
}

const ProfileSettingsModal: React.FC<ProfileSettingsModalProps> = ({
	isOpen,
	onClose,
}) => {
	const { user, updateUser, verifyPassword, updatePassword } = useAuth();
	const { isEnrolled, reauthenticate, renameEnrollment } = useChelys();

	const [username, setUsername] = useState('');
	const [email, setEmail] = useState('');
	const [color, setColor] = useState('');
	const [colorLight, setColorLight] = useState('');
	const [currentPassword, setCurrentPassword] = useState('');
	const [newPassword, setNewPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);

	const identityChanged =
		!!user && (username !== user.username || newPassword.length > 0);
	const requiresPasswordForChelys = isEnrolled && identityChanged;

	/* biome-ignore lint/correctness/useExhaustiveDependencies: isOpen is an intentional trigger to reseed form fields when the modal reopens. */
	useEffect(() => {
		if (user) {
			setUsername(user.username);
			setEmail(user.email || '');
			setColor(user.color || generateRandomColor(false));
			setColorLight(user.colorLight || generateRandomColor(true));
		}
	}, [user, isOpen]);

	const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
		e.preventDefault();

		if (!user) return;

		setIsSubmitting(true);
		setError(null);
		setSuccessMessage(null);

		try {
			if (newPassword) {
				if (newPassword.length < 6) {
					throw new Error(t('New password must be at least 6 characters long'));
				}

				if (newPassword !== confirmPassword) {
					throw new Error(t('New passwords do not match'));
				}

				if (!currentPassword) {
					throw new Error(
						t('Current password is required to set a new password'),
					);
				}

				const isCurrentPasswordValid = await verifyPassword(
					user.id,
					currentPassword,
				);
				if (!isCurrentPasswordValid) {
					throw new Error(t('Current password is incorrect'));
				}

				await updatePassword(user.id, newPassword);
			}

			if (requiresPasswordForChelys && !newPassword) {
				if (!currentPassword) {
					throw new Error(
						t('Current password is required to update your Chelys connection'),
					);
				}
				const isCurrentPasswordValid = await verifyPassword(
					user.id,
					currentPassword,
				);
				if (!isCurrentPasswordValid) {
					throw new Error(t('Current password is incorrect'));
				}
			}

			if (email && !/\S+@\S+\.\S+/.test(email)) {
				throw new Error(t('Please enter a valid email address'));
			}

			const updatedUser: User = {
				...user,
				username,
				email: email || undefined,
				color,
				colorLight,
			};

			if (!newPassword) {
				await updateUser(updatedUser);
			}

			if (isEnrolled && identityChanged) {
				if (username !== user.username) {
					await renameEnrollment(username);
				}
				await reauthenticate(newPassword || currentPassword, username);
			}

			setSuccessMessage(t('Profile updated successfully'));
			setCurrentPassword('');
			setNewPassword('');
			setConfirmPassword('');
		} catch (error) {
			setError(error instanceof Error ? error.message : t('An error occurred'));
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title={t('Profile Settings')}
			size='medium'
			icon={UserIcon}
		>
			<form onSubmit={handleSubmit} className='profile-form'>
				{error && <div className='error-message'>{error}</div>}

				{successMessage && (
					<div className='success-message'>{successMessage}</div>
				)}

				<div className='form-group'>
					<label htmlFor='username'>{t('Username')}</label>
					<input
						type='text'
						id='username'
						value={username}
						onChange={(e) => setUsername(e.target.value)}
						disabled={isSubmitting}
					/>
				</div>

				<div className='form-group'>
					<label htmlFor='email'>{t('Email')}</label>
					<input
						type='email'
						id='email'
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						disabled={isSubmitting}
					/>
				</div>

				<div className='color-picker-group'>
					<label>{t('Cursor Colors')}</label>
					<div className='color-picker-row'>
						<div className='form-group color-picker-item'>
							<label htmlFor='color'>{t('Dark Theme')}</label>
							<div className='color-picker-wrapper'>
								<input
									type='color'
									id='color'
									value={color}
									onChange={(e) => setColor(e.target.value)}
									disabled={isSubmitting}
								/>
								<span className='color-picker-overlay dark'>{username}</span>
							</div>
						</div>
						<div className='form-group color-picker-item'>
							<label htmlFor='colorLight'>{t('Light Theme')}</label>
							<div className='color-picker-wrapper'>
								<input
									type='color'
									id='colorLight'
									value={colorLight}
									onChange={(e) => setColorLight(e.target.value)}
									disabled={isSubmitting}
								/>
								<span className='color-picker-overlay light'>{username}</span>
							</div>
						</div>
					</div>
				</div>

				<h3>{t('Change Password')}</h3>

				<div className='form-group'>
					<label htmlFor='currentPassword'>{t('Current Password')}</label>
					<input
						type='password'
						id='currentPassword'
						value={currentPassword}
						onChange={(e) => setCurrentPassword(e.target.value)}
						disabled={isSubmitting}
					/>
				</div>

				<div className='form-group'>
					<label htmlFor='newPassword'>{t('New Password')}</label>
					<input
						type='password'
						id='newPassword'
						value={newPassword}
						onChange={(e) => setNewPassword(e.target.value)}
						disabled={isSubmitting}
					/>
				</div>

				<div className='form-group'>
					<label htmlFor='confirmPassword'>{t('Confirm New Password')}</label>
					<input
						type='password'
						id='confirmPassword'
						value={confirmPassword}
						onChange={(e) => setConfirmPassword(e.target.value)}
						disabled={isSubmitting}
					/>
				</div>

				{requiresPasswordForChelys && (
					<div className='warning-message'>
						<p>
							{t(
								'Changing your username or password will move your Chelys room. After saving, update the matching username and password in your Chelys app so it re-derives the new room. Enter your current password to confirm.',
							)}
						</p>
					</div>
				)}

				<div className='modal-actions'>
					<button
						type='button'
						className='button secondary'
						onClick={onClose}
						disabled={isSubmitting}
					>
						{t('Cancel')}
					</button>
					<button
						type='submit'
						className='button primary'
						disabled={
							isSubmitting || (requiresPasswordForChelys && !currentPassword)
						}
					>
						{isSubmitting ? t('Saving...') : t('Save Changes')}
					</button>
				</div>

				<ChelysConnectionSection isSubmitting={isSubmitting} />

				{user && (
					<LocalStorageDataSection
						user={user}
						isSubmitting={isSubmitting}
						setIsSubmitting={setIsSubmitting}
						onError={setError}
						onSuccess={setSuccessMessage}
					/>
				)}
			</form>
		</Modal>
	);
};

export default ProfileSettingsModal;
