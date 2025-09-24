// src/components/profile/ProfileSettingsModal.tsx
import type React from "react";
import { useEffect, useState } from "react";

import { useAuth } from "../../hooks/useAuth";
import type { User } from "../../types/auth";
import Modal from "../common/Modal";
import { UserIcon } from "../common/Icons";

interface ProfileSettingsModalProps {
	isOpen: boolean;
	onClose: () => void;
}

const ProfileSettingsModal: React.FC<ProfileSettingsModalProps> = ({
	isOpen,
	onClose,
}) => {
	const { user, updateUser, verifyPassword, updatePassword } = useAuth();

	const [username, setUsername] = useState("");
	const [email, setEmail] = useState("");
	const [color, setColor] = useState("");
	const [colorLight, setColorLight] = useState("");
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
			setEmail(user.email || "");
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
					throw new Error("New password must be at least 6 characters long");
				}

				if (newPassword !== confirmPassword) {
					throw new Error("New passwords do not match");
				}

				if (!currentPassword) {
					throw new Error("Current password is required to set a new password");
				}

				const isCurrentPasswordValid = await verifyPassword(
					user.id,
					currentPassword,
				);
				if (!isCurrentPasswordValid) {
					throw new Error("Current password is incorrect");
				}

				await updatePassword(user.id, newPassword);
			}

			if (email && !/\S+@\S+\.\S+/.test(email)) {
				throw new Error("Please enter a valid email address");
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

			setSuccessMessage("Profile updated successfully");
			setCurrentPassword("");
			setNewPassword("");
			setConfirmPassword("");
		} catch (err) {
			setError(err instanceof Error ? err.message : "An error occurred");
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
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
						{isSubmitting ? "Saving..." : "Save Changes"}
					</button>
				</div>
			</form>
		</Modal>
	);
};

export default ProfileSettingsModal;
