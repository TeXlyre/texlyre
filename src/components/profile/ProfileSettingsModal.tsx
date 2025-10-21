// src/components/profile/ProfileSettingsModal.tsx
import type React from 'react';
import { useEffect, useState } from 'react';

import { userDataService, type UserDataType } from '../../services/UserDataService';
import { useAuth } from '../../hooks/useAuth';
import type { User } from '../../types/auth';
import Modal from '../common/Modal';
import { UserIcon, TrashIcon, DownloadIcon, ImportIcon } from '../common/Icons';

interface ProfileSettingsModalProps {
	isOpen: boolean;
	onClose: () => void;
}

type ClearType = 'settings' | 'properties' | 'secrets' | 'all';

const ProfileSettingsModal: React.FC<ProfileSettingsModalProps> = ({
	isOpen,
	onClose,
}) => {
	const { user, updateUser, verifyPassword, updatePassword } = useAuth();

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
	const [showDeleteModal, setShowDeleteModal] = useState(false);
	const [deleteType, setDeleteType] = useState<ClearType | null>(null);
	const [fileInputRef, setFileInputRef] = useState<HTMLInputElement | null>(null);

	const generateRandomColor = (isLight: boolean): string => {
		const hue = Math.floor(Math.random() * 360);
		const saturation = isLight
			? 60 + Math.floor(Math.random() * 20)
			: 70 + Math.floor(Math.random() * 30);
		const lightness = isLight
			? 65 + Math.floor(Math.random() * 20)
			: 45 + Math.floor(Math.random() * 25);

		const hslToHex = (h: number, s: number, l: number): string => {
			const sNorm = s / 100;
			const lNorm = l / 100;
			const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
			const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
			const m = lNorm - c / 2;

			let r = 0;
			let g = 0;
			let b = 0;
			if (0 <= h && h < 60) {
				r = c;
				g = x;
				b = 0;
			} else if (60 <= h && h < 120) {
				r = x;
				g = c;
				b = 0;
			} else if (120 <= h && h < 180) {
				r = 0;
				g = c;
				b = x;
			} else if (180 <= h && h < 240) {
				r = 0;
				g = x;
				b = c;
			} else if (240 <= h && h < 300) {
				r = x;
				g = 0;
				b = c;
			} else if (300 <= h && h < 360) {
				r = c;
				g = 0;
				b = x;
			}

			const toHex = (n: number) => {
				const hex = Math.round((n + m) * 255).toString(16);
				return hex.length === 1 ? `0${hex}` : hex;
			};

			return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
		};

		return hslToHex(hue, saturation, lightness);
	};

	useEffect(() => {
		if (user) {
			setUsername(user.username);
			setEmail(user.email || '');
			setColor(user.color || generateRandomColor(false));
			setColorLight(user.colorLight || generateRandomColor(true));
		}
	}, [user, isOpen]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!user) return;

		setIsSubmitting(true);
		setError(null);
		setSuccessMessage(null);

		try {
			if (newPassword) {
				if (newPassword.length < 6) {
					throw new Error('New password must be at least 6 characters long');
				}

				if (newPassword !== confirmPassword) {
					throw new Error('New passwords do not match');
				}

				if (!currentPassword) {
					throw new Error('Current password is required to set a new password');
				}

				const isCurrentPasswordValid = await verifyPassword(
					user.id,
					currentPassword,
				);
				if (!isCurrentPasswordValid) {
					throw new Error('Current password is incorrect');
				}

				await updatePassword(user.id, newPassword);
			}

			if (email && !/\S+@\S+\.\S+/.test(email)) {
				throw new Error('Please enter a valid email address');
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

			setSuccessMessage('Profile updated successfully');
			setCurrentPassword('');
			setNewPassword('');
			setConfirmPassword('');
		} catch (err) {
			setError(err instanceof Error ? err.message : 'An error occurred');
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleDownloadData = async (type: UserDataType) => {
		if (!user) return;

		try {
			await userDataService.downloadUserData(user.id, type);
			setSuccessMessage(`Downloaded ${type === 'all' ? 'all data' : type}`);
			setTimeout(() => setSuccessMessage(null), 2000);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to download data');
		}
	};

	const handleOpenDeleteModal = (type: ClearType) => {
		setDeleteType(type);
		setShowDeleteModal(true);
	};

	const handleCloseDeleteModal = () => {
		setShowDeleteModal(false);
		setDeleteType(null);
	};

	const handleConfirmDelete = async () => {
		if (!user || !deleteType) return;

		try {
			setIsSubmitting(true);
			setError(null);

			await userDataService.clearUserData(user.id, deleteType);

			setSuccessMessage(`Successfully cleared ${deleteType === 'all' ? 'all data' : deleteType}`);
			handleCloseDeleteModal();

			setTimeout(() => {
				window.location.reload();
			}, 1500);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to clear data');
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleImportData = async (e: React.ChangeEvent<HTMLInputElement>) => {
		if (!user || !e.target.files?.[0]) return;

		const file = e.target.files[0];
		if (!file.name.endsWith('.json')) {
			setError('Please select a valid JSON file');
			return;
		}

		try {
			setIsSubmitting(true);
			setError(null);

			await userDataService.importFromFile(user.id, file);

			setSuccessMessage('Successfully imported user data');
			setTimeout(() => {
				window.location.reload();
			}, 1500);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to import data');
		} finally {
			setIsSubmitting(false);
			e.target.value = '';
		}
	};

	const getDeleteModalContent = () => {
		if (!deleteType) return { title: '', message: '', items: [] };

		const content = {
			settings: {
				title: 'Clear Settings',
				message: 'Are you sure you want to clear all your settings? This will reset all preferences to defaults.',
				items: [
					'All application preferences',
					'Editor configurations (font, saving interval, etc.)',
					'UI customizations and theme preferences (layout, variant, etc.)',
					'endpoints and server settings (links, connection configuration, etc.)'
				]
			},
			properties: {
				title: 'Clear Properties',
				message: 'Are you sure you want to clear all your properties? This will remove all stored property values.',
				items: [
					'All stored property values',
					'Application state data (last opened file, current line in editor, etc.)',
					'User-specific configurations (panel width, collapse, etc.)'
				]
			},
			secrets: {
				title: 'Clear Encrypted Secrets',
				message: 'Are you sure you want to clear all your encrypted secrets? This will permanently delete all saved API keys and credentials.',
				items: [
					'All API keys',
					'Encrypted credentials',
					'Authentication tokens (GitHub API key)'
				]
			},
			all: {
				title: 'Clear All Local Storage',
				message: 'Are you sure you want to clear ALL local storage data? This will remove settings, properties, and secrets permanently.',
				items: [
					'All application settings',
					'All stored properties',
					'All encrypted secrets',
					'All cached data'
				]
			}
		};

		return content[deleteType];
	};

	const modalContent = getDeleteModalContent();

	return (
		<>
			<Modal
				isOpen={isOpen}
				onClose={onClose}
				title="Profile Settings"
				size="medium"
				icon={UserIcon}
			>
				<form onSubmit={handleSubmit} className="profile-form">
					{error && <div className="error-message">{error}</div>}

					{successMessage && (
						<div className="success-message">{successMessage}</div>
					)}

					<div className="form-group">
						<label htmlFor="username">Username</label>
						<input
							type="text"
							id="username"
							value={username}
							onChange={(e) => setUsername(e.target.value)}
							disabled={isSubmitting}
						/>
					</div>

					<div className="form-group">
						<label htmlFor="email">Email</label>
						<input
							type="email"
							id="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							disabled={isSubmitting}
						/>
					</div>

					<div className="color-picker-group">
						<label>Cursor Colors</label>
						<div className="color-picker-row">
							<div className="form-group color-picker-item">
								<label htmlFor="color">Dark Theme</label>
								<input
									type="color"
									id="color"
									value={color}
									onChange={(e) => setColor(e.target.value)}
									disabled={isSubmitting}
								/>
							</div>
							<div className="form-group color-picker-item">
								<label htmlFor="colorLight">Light Theme</label>
								<input
									type="color"
									id="colorLight"
									value={colorLight}
									onChange={(e) => setColorLight(e.target.value)}
									disabled={isSubmitting}
								/>
							</div>
						</div>
					</div>

					<h3>Change Password</h3>

					<div className="form-group">
						<label htmlFor="currentPassword">Current Password</label>
						<input
							type="password"
							id="currentPassword"
							value={currentPassword}
							onChange={(e) => setCurrentPassword(e.target.value)}
							disabled={isSubmitting}
						/>
					</div>

					<div className="form-group">
						<label htmlFor="newPassword">New Password</label>
						<input
							type="password"
							id="newPassword"
							value={newPassword}
							onChange={(e) => setNewPassword(e.target.value)}
							disabled={isSubmitting}
						/>
					</div>

					<div className="form-group">
						<label htmlFor="confirmPassword">Confirm New Password</label>
						<input
							type="password"
							id="confirmPassword"
							value={confirmPassword}
							onChange={(e) => setConfirmPassword(e.target.value)}
							disabled={isSubmitting}
						/>
					</div>

					<h3>Local Storage Data</h3>

					<div className="warning-message">
						<h3>⚠️ Warning: This action cannot be undone</h3>
						<p>
							Clearing or uploading local storage data is permanent and cannot be undone.
							Make sure to export your data before clearing if you want to keep it.
							This does <b>NOT</b> delete your projects, files, and account data.
						</p>
					</div>

					<div className="local-storage-actions">
						<div className="storage-action-group">
							<div className="storage-action-info">
								<strong>Settings</strong>
								<p>All your application settings and preferences</p>
							</div>
							<div className="storage-action-buttons">
								<button
									type="button"
									className="button primary smaller icon-only"
									onClick={() => fileInputRef?.click()}
									disabled={isSubmitting}
									title="Import settings data"
								>
									<ImportIcon />
								</button>
								<input
									ref={setFileInputRef}
									type="file"
									accept=".json"
									onChange={handleImportData}
									style={{ display: 'none' }}
									disabled={isSubmitting}
								/>
								<button
									type="button"
									className="button secondary smaller icon-only"
									onClick={() => handleDownloadData('settings')}
									disabled={isSubmitting}
									title="Download settings data"
								>
									<DownloadIcon />
								</button>
								<button
									type="button"
									className="button danger smaller icon-only"
									onClick={() => handleOpenDeleteModal('settings')}
									disabled={isSubmitting}
									title="Clear settings"
								>
									<TrashIcon />
								</button>
							</div>
						</div>

						<div className="storage-action-group">
							<div className="storage-action-info">
								<strong>Properties</strong>
								<p>All stored property values</p>
							</div>
							<div className="storage-action-buttons">
								<button
									type="button"
									className="button primary smaller icon-only"
									onClick={() => fileInputRef?.click()}
									disabled={isSubmitting}
									title="Import properties data"
								>
									<ImportIcon />
								</button>
								<input
									ref={setFileInputRef}
									type="file"
									accept=".json"
									onChange={handleImportData}
									style={{ display: 'none' }}
									disabled={isSubmitting}
								/>
								<button
									type="button"
									className="button secondary smaller icon-only"
									onClick={() => handleDownloadData('properties')}
									disabled={isSubmitting}
									title="Download properties data"
								>
									<DownloadIcon />
								</button>
								<button
									type="button"
									className="button danger smaller icon-only"
									onClick={() => handleOpenDeleteModal('properties')}
									disabled={isSubmitting}
									title="Clear properties"
								>
									<TrashIcon />
								</button>
							</div>
						</div>

						<div className="storage-action-group">
							<div className="storage-action-info">
								<strong>Encrypted Secrets</strong>
								<p>All saved API keys and encrypted credentials</p>
							</div>
							<div className="storage-action-buttons">
								<button
									type="button"
									className="button primary smaller icon-only"
									onClick={() => fileInputRef?.click()}
									disabled={isSubmitting}
									title="Import secrets data"
								>
									<ImportIcon />
								</button>
								<input
									ref={setFileInputRef}
									type="file"
									accept=".json"
									onChange={handleImportData}
									style={{ display: 'none' }}
									disabled={isSubmitting}
								/>
								<button
									type="button"
									className="button secondary smaller icon-only"
									onClick={() => handleDownloadData('secrets')}
									disabled={isSubmitting}
									title="Download secrets data"
								>
									<DownloadIcon />
								</button>
								<button
									type="button"
									className="button danger smaller icon-only"
									onClick={() => handleOpenDeleteModal('secrets')}
									disabled={isSubmitting}
									title="Clear secrets"
								>
									<TrashIcon />
								</button>
							</div>
						</div>

						<div className="storage-action-group danger-zone">
							<div className="storage-action-info">
								<strong>All Local Storage Data</strong>
								<p>All settings, properties, and secrets at once</p>
							</div>
							<div className="storage-action-buttons">
								<button
									type="button"
									className="button primary smaller icon-only"
									onClick={() => fileInputRef?.click()}
									disabled={isSubmitting}
									title="Import all data"
								>
									<ImportIcon />
								</button>
								<input
									ref={setFileInputRef}
									type="file"
									accept=".json"
									onChange={handleImportData}
									style={{ display: 'none' }}
									disabled={isSubmitting}
								/>
								<button
									type="button"
									className="button secondary smaller icon-only"
									onClick={() => handleDownloadData('all')}
									disabled={isSubmitting}
									title="Download all data"
								>
									<DownloadIcon />
								</button>
								<button
									type="button"
									className="button danger icon-only"
									onClick={() => handleOpenDeleteModal('all')}
									disabled={isSubmitting}
									title="Clear all data"
								>
									<TrashIcon />
								</button>
							</div>
						</div>
					</div>

					<div className="modal-actions">
						<button
							type="button"
							className="button secondary"
							onClick={onClose}
							disabled={isSubmitting}
						>
							Cancel
						</button>
						<button
							type="submit"
							className="button primary"
							disabled={isSubmitting}
						>
							{isSubmitting ? 'Saving...' : 'Save Changes'}
						</button>
					</div>
				</form>
			</Modal>

			<Modal
				isOpen={showDeleteModal}
				onClose={handleCloseDeleteModal}
				title={modalContent.title}
				icon={TrashIcon}
				size="medium"
			>
				<div className="clear-storage-modal">

					<div className="items-to-clear">
						<h4>The following will be permanently removed:</h4>
						<ul>
							{modalContent.items.map((item, index) => (
								<li key={index}>{item}</li>
							))}
						</ul>
					</div>
					<div className="warning-message">
						<p>This action cannot be undone.</p>
						<p>{modalContent.message}</p>
					</div>

					<div className="modal-actions">
						<button
							type="button"
							className="button secondary"
							onClick={handleCloseDeleteModal}
							disabled={isSubmitting}
						>
							Cancel
						</button>
						<button
							type="button"
							className="button danger"
							onClick={handleConfirmDelete}
							disabled={isSubmitting}
						>
							{isSubmitting ? 'Clearing...' : `Clear ${deleteType === 'all' ? 'All Data' : deleteType}`}
						</button>
					</div>
				</div>
			</Modal>
		</>
	);
};

export default ProfileSettingsModal;