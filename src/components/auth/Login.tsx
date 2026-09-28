// src/components/auth/Login.tsx
import type React from 'react';
import { useState } from 'react';

import { t } from '@/i18n';
import { createNamedLogger } from '@/logging';
import { useAuth } from '../../hooks/useAuth';
import { useChelys } from '../../hooks/useChelys';
import {
	ChelysAccountNotFoundError,
	getTempPrf,
	clearTempPrf,
} from '../../utils/chelysWebauthn';
import GuestConsentModal from './GuestConsentModal';
import PrivacyModal from '../common/PrivacyModal';
import { PasskeyIcon } from '../common/Icons';

const moduleLog = createNamedLogger('Login');

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
	const {
		chelysLogin,
		confirmChelysRegister,
		chelysLoginWithPrf,
		confirmChelysRegisterWithPrf,
		logoutChelys,
	} = useChelys();

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
			const tempPrf = getTempPrf();
			if (tempPrf) {
				await chelysLoginWithPrf(username, password, tempPrf);
			} else {
				await chelysLogin(username, password);
			}
			clearTempPrf();
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
			const tempPrf = getTempPrf();
			if (tempPrf) {
				await confirmChelysRegisterWithPrf(username, password, tempPrf);
			} else {
				await confirmChelysRegister(username, password);
			}
			clearTempPrf();
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
			moduleLog.info('Starting guest session creation...');
			const guestUser = await createGuestAccount();
			moduleLog.info('Guest session created successfully:', guestUser.id);
			setShowGuestModal(false);
			onLoginSuccess();
		} catch (error) {
			moduleLog.error('Guest session creation failed:', error);
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

				{error && (
					<div className='ui-message' data-tone='error'>
						{error}
					</div>
				)}

				<form onSubmit={handleSubmit} className='ui-stack'>
					<div className='ui-field' data-spacing='section'>
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

					<div className='ui-field' data-spacing='section'>
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
						className='button primary'
						data-state={isLoading ? 'loading' : undefined}
						disabled={isLoading}
						hidden={getTempPrf() !== null}
					>
						{isLoading ? t('Logging in...') : t('Log in')}
					</button>

					{!confirmCreate ? (
						<button
							type='button'
							className='button'
							data-tone='accent'
							data-state={isLoading ? 'loading' : undefined}
							onClick={handleChelysSubmit}
							disabled={isLoading}
						>
							<span>{t('Log in to Chelys')}</span>
							<span
								className='ui-badge'
								data-variant='label'
								data-tone='accent'
							>
								{getTempPrf() ? (
									<>{t('Temporary')} </>
								) : (
									<>
										<PasskeyIcon size={24} />
										{t('Passkey')}
									</>
								)}
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
							<div
								className='ui-actions'
								data-variant='modal'
								data-align='end'
								data-cross='stretch'
							>
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
				{!getTempPrf() && (
					<>
						<div className='guest-section'>
							<div className='guest-divider'>
								<span>{t('or')}</span>
							</div>
							<button
								type='button'
								className='button'
								data-width='full'
								onClick={() => setShowGuestModal(true)}
								disabled={isLoading}
							>
								{t('Try as Guest')}
							</button>
						</div>

						<div className='ui-actions' data-align='center' data-wrap='true'>
							<span>{t("Don't have an account?")}</span>
							<button
								type='button'
								className='button'
								data-variant='text'
								onClick={onSwitchToRegister}
								disabled={isLoading}
							>
								{t('Sign up')}
							</button>
							<span className='auth-separator'>{t('or')}</span>
							<button
								type='button'
								className='button'
								data-variant='text'
								data-role='auth-import-account'
								onClick={onSwitchToImport}
								disabled={isLoading}
							>
								{t('Import Account')}
							</button>
						</div>
					</>
				)}
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
