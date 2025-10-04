// src/components/auth/Login.tsx
import type React from 'react';
import { useState } from 'react';

import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';
import GuestConsentModal from './GuestConsentModal';
import PrivacyModal from '../common/PrivacyModal';

interface LoginProps {
	onLoginSuccess: () => void;
	onSwitchToRegister: () => void;
	onSwitchToImport: () => void;
}

const Login: React.FC<LoginProps> = ({
	onLoginSuccess,
	onSwitchToRegister,
	onSwitchToImport,
}) => {
	const { login, createGuestAccount } = useAuth();
	const { currentThemePlugin } = useTheme();

	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [showGuestModal, setShowGuestModal] = useState(false);
	const [showPrivacy, setShowPrivacy] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!username || !password) {
			setError('Please enter both username and password');
			return;
		}

		setError(null);
		setIsLoading(true);

		try {
			await login(username, password);
			onLoginSuccess();
			window.location.reload();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : 'An error occurred during login',
			);
		} finally {
			setIsLoading(false);
		}
	};

	const handleShowPrivacy = () => {
		setShowPrivacy(true);
	};

	const handleClosePrivacy = () => {
		setShowPrivacy(false);
		// Don't close the guest modal when privacy modal closes
	};

	const handleGuestSession = async () => {
		setError(null);
		setIsLoading(true);

		try {
			console.log('[Login] Starting guest session creation...');
			const guestUser = await createGuestAccount();
			console.log('[Login] Guest session created successfully:', guestUser.id);
			setShowGuestModal(false);
			onLoginSuccess();
		} catch (err) {
			console.error('[Login] Guest session creation failed:', err);
			setError(
				err instanceof Error ? err.message : 'Failed to create guest session',
			);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<>
			<div className="auth-form-container">
				<h2>Login</h2>

				{error && <div className="auth-error">{error}</div>}

				<form onSubmit={handleSubmit} className="auth-form">
					<div className="form-group">
						<label htmlFor="username">Username</label>
						<input
							type="text"
							id="username"
							value={username}
							onChange={(e) => setUsername(e.target.value)}
							disabled={isLoading}
							autoComplete="username"
						/>
					</div>

					<div className="form-group">
						<label htmlFor="password">Password</label>
						<input
							type="password"
							id="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							disabled={isLoading}
							autoComplete="current-password"
						/>
					</div>

					<button
						type="submit"
						className={`auth-button ${isLoading ? 'loading' : ''}`}
						disabled={isLoading}
					>
						{isLoading ? 'Logging in...' : 'Login'}
					</button>
				</form>

				<div className="guest-section">
					<div className="guest-divider">
						<span>or</span>
					</div>
					<button
						type="button"
						className="auth-button guest-button"
						onClick={() => setShowGuestModal(true)}
						disabled={isLoading}
					>
						Try as Guest
					</button>
				</div>

				<div className="auth-alt-action">
					<span>Don't have an account?</span>
					<button
						className="text-button"
						onClick={onSwitchToRegister}
						disabled={isLoading}
					>
						Sign up
					</button>
					<span className="auth-separator">or</span>
					<button
						className="text-button"
						onClick={onSwitchToImport}
						disabled={isLoading}
					>
						Import Account
					</button>
				</div>
			</div>

			<GuestConsentModal
				isOpen={showGuestModal}
				onClose={() => setShowGuestModal(false)}
				onStartGuestSession={handleGuestSession}
				onSwitchToRegister={() => {
					setShowGuestModal(false);
					onSwitchToRegister();
				}}
				onShowPrivacy={handleShowPrivacy}
				isPrivacyOpen={showPrivacy}
			/>

			<PrivacyModal
				isOpen={showPrivacy}
				onClose={handleClosePrivacy}
			/>
		</>
	);
};

export default Login;