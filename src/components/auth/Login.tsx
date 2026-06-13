// src/components/auth/Login.tsx
import type React from 'react';
import { useState } from 'react';

import { t } from '@/i18n';
import { useAuth } from '../../hooks/useAuth';
import { useChelys } from '../../hooks/useChelys';
import { ChelysAccountNotFoundError } from '../../utils/chelysWebauthn';
import GuestConsentModal from './GuestConsentModal';
import PrivacyModal from '../common/PrivacyModal';
import { PasskeyIcon } from '../common/Icons';

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
	const { chelysLogin, confirmChelysRegister, logoutChelys } = useChelys();

	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [showGuestModal, setShowGuestModal] = useState(false);
	const [showPrivacy, setShowPrivacy] = useState(false);
	const [confirmCreate, setConfirmCreate] = useState(false);

	const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
		e.preventDefault();

		if (!username || !password) {
			setError(t('Please enter both username and password'));
			return;
		}

		setError(null);
		setIsLoading(true);

		try {
			await login(username, password);
			logoutChelys();
			onLoginSuccess();
			window.location.reload();
		} catch (error) {
			setError(
				error instanceof Error
					? error.message
					: t('An error occurred during {action}', { action: t('log in') }),
			);
		} finally {
			setIsLoading(false);
		}
	};

	const handleChelysSubmit = async () => {
		if (!username || !password) {
			setError(t('Please enter both username and password'));
			return;
		}

		setError(null);
		setIsLoading(true);

		try {
			await chelysLogin(username, password);
			onLoginSuccess();
			window.location.reload();
		} catch (error) {
			if (error instanceof ChelysAccountNotFoundError) {
				setConfirmCreate(true);
			} else {
				setError(
					error instanceof Error
						? error.message
						: t('An error occurred during {action}', { action: t('log in') }),
				);
			}
		} finally {
			setIsLoading(false);
		}
	};

	const handleConfirmCreate = async () => {
		setError(null);
		setIsLoading(true);

		try {
			await confirmChelysRegister(username, password);
			onLoginSuccess();
			window.location.reload();
		} catch (error) {
			setError(
				error instanceof Error
					? error.message
					: t('An error occurred during {action}', { action: t('log in') }),
			);
		} finally {
			setIsLoading(false);
			setConfirmCreate(false);
		}
	};

	const handleShowPrivacy = () => {
		setShowPrivacy(true);
	};

	const handleClosePrivacy = () => {
		setShowPrivacy(false);
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
		} catch (error) {
			console.error('[Login] Guest session creation failed:', error);
			setError(
				error instanceof Error
					? error.message
					: t('Failed to create guest session'),
			);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<>
			<div className='auth-form-container'>
				<h2>{t('Log in')}</h2>

				{error && <div className='auth-error'>{error}</div>}

				<form onSubmit={handleSubmit} className='auth-form'>
					<div className='form-group'>
						<label htmlFor='username'>{t('Username')}</label>
						<input
							type='text'
							id='username'
							value={username}
							onChange={(e) => {
								setUsername(e.target.value);
								setConfirmCreate(false);
							}}
							disabled={isLoading}
							autoComplete='username'
						/>
					</div>

					<div className='form-group'>
						<label htmlFor='password'>{t('Password')}</label>
						<input
							type='password'
							id='password'
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							disabled={isLoading}
							autoComplete='current-password'
						/>
					</div>

					<button
						type='submit'
						className={`auth-button ${isLoading ? 'loading' : ''}`}
						disabled={isLoading}
					>
						{isLoading ? t('Logging in...') : t('Log in')}
					</button>

					{!confirmCreate ? (
						<button
							type='button'
							className={`auth-button chelys-button ${isLoading ? 'loading' : ''}`}
							onClick={handleChelysSubmit}
							disabled={isLoading}
						>
							<span>{t('Log in to Chelys')}</span>
							<span className='passkey-badge'>
								<PasskeyIcon size={24} />
								{t('Passkey')}
							</span>
						</button>
					) : (
						<div className='chelys-confirm'>
							<p>
								{t(
									'No "{username}" account in this browser yet. Check the spelling, or create it here.',
									{ username },
								)}
							</p>
							<div className='modal-actions'>
								<button
									type='button'
									className='button secondary'
									onClick={() => setConfirmCreate(false)}
									disabled={isLoading}
								>
									{t('Back')}
								</button>
								<button
									type='button'
									className='button primary'
									onClick={handleConfirmCreate}
									disabled={isLoading}
								>
									{t('Create account')}
								</button>
							</div>
						</div>
					)}
				</form>

				<div className='guest-section'>
					<div className='guest-divider'>
						<span>{t('or')}</span>
					</div>
					<button
						type='button'
						className='auth-button guest-button'
						onClick={() => setShowGuestModal(true)}
						disabled={isLoading}
					>
						{t('Try as Guest')}
					</button>
				</div>

				<div className='auth-alt-action'>
					<span>{t("Don't have an account?")}</span>
					<button
						className='text-button'
						onClick={onSwitchToRegister}
						disabled={isLoading}
					>
						{t('Sign up')}
					</button>
					<span className='auth-separator'>{t('or')}</span>
					<button
						className='text-button'
						onClick={onSwitchToImport}
						disabled={isLoading}
					>
						{t('Import Account')}
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

			<PrivacyModal isOpen={showPrivacy} onClose={handleClosePrivacy} />
		</>
	);
};

export default Login;
