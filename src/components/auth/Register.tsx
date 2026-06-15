// src/components/auth/Register.tsx
import type React from 'react';
import { useState } from 'react';

import { t } from '@/i18n';
import PasswordInfo from './PasswordInfo';
import { useAuth } from '../../hooks/useAuth';
import { useChelys } from '../../hooks/useChelys';
import {
	validateEmail,
	validatePassword,
	validateUsername,
} from '../../utils/authUtils';
import CopyField from '../common/CopyField';
import { PasskeyIcon } from '../common/Icons';

interface RegisterProps {
	onRegisterSuccess: () => void;
	onSwitchToLogin: () => void;
	onShowPrivacy: () => void;
	isUpgrade?: boolean;
	upgradeFunction?: (
		username: string,
		password: string,
		email?: string,
	) => Promise<any>;
}

const Register: React.FC<RegisterProps> = ({
	onRegisterSuccess,
	onSwitchToLogin,
	onShowPrivacy,
	isUpgrade = false,
	upgradeFunction,
}) => {
	const { register } = useAuth();
	const { chelysRegister } = useChelys();

	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [ageConfirmed, setAgeConfirmed] = useState(false);
	const [privacyAccepted, setPrivacyAccepted] = useState(false);
	const [email, setEmail] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [chelysPrfHex, setChelysPrfHex] = useState<string | null>(null);

	const validate = (): boolean => {
		const fieldError =
			validateUsername(username) ||
			validatePassword(password) ||
			validateEmail(email);
		if (fieldError) {
			setError(fieldError);
			return false;
		}
		if (password !== confirmPassword) {
			setError(t('Passwords do not match'));
			return false;
		}
		return true;
	};

	const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
		e.preventDefault();
		if (!validate()) return;

		setError(null);
		setIsLoading(true);

		try {
			if (isUpgrade && upgradeFunction) {
				await upgradeFunction(username, password, email || undefined);
			} else {
				await register(username, password, email || undefined);
			}
			onRegisterSuccess();
		} catch (error) {
			setError(
				error instanceof Error
					? error.message
					: t('An error occurred during {action}', {
							action: isUpgrade ? t('upgrade') : t('registration'),
						}),
			);
		} finally {
			setIsLoading(false);
		}
	};

	const handleChelysSubmit = async () => {
		if (!validate()) return;

		setError(null);
		setIsLoading(true);

		try {
			const prfHex = await chelysRegister(username, password);
			setChelysPrfHex(prfHex);
		} catch (error) {
			setError(
				error instanceof Error
					? error.message
					: t('An error occurred during {action}', {
							action: t('registration'),
						}),
			);
		} finally {
			setIsLoading(false);
		}
	};

	if (chelysPrfHex) {
		return (
			<div className='auth-form-container'>
				<h2>{t('Chelys Account Created')}</h2>
				<p>
					{t(
						'Copy this key into your Chelys app and log in there with the same username and password.',
					)}
				</p>
				<div className='form-group'>
					<CopyField label={t('Chelys key')} value={chelysPrfHex} mono />
				</div>
				<button
					type='button'
					className='auth-button'
					onClick={() => {
						onRegisterSuccess();
						window.location.reload();
					}}
				>
					{t('Continue')}
				</button>
			</div>
		);
	}

	return (
		<div className='auth-form-container'>
			<h2>
				{isUpgrade ? t('Upgrade to Full Account') : t('Create an Account')}
			</h2>

			{error && <div className='auth-error'>{error}</div>}

			<form onSubmit={handleSubmit} className='auth-form'>
				<div className='form-group'>
					<label htmlFor='username'>
						{t('Username')}
						<span className='required'>*</span>
					</label>
					<input
						type='text'
						id='username'
						value={username}
						onChange={(e) => setUsername(e.target.value)}
						disabled={isLoading}
						autoComplete='username'
						required
					/>
				</div>

				<div className='form-group'>
					<label htmlFor='email'>{t('Email')}</label>
					<input
						type='email'
						id='email'
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						disabled={isLoading}
						autoComplete='email'
					/>
				</div>

				<div className='form-group'>
					<PasswordInfo />
					<label htmlFor='password'>
						{t('Password')}
						<span className='required'>*</span>
					</label>
					<input
						type='password'
						id='password'
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						disabled={isLoading}
						autoComplete='new-password'
						required
					/>
				</div>

				<div className='form-group'>
					<label htmlFor='confirmPassword'>
						{t('Confirm Password')}
						<span className='required'>*</span>
					</label>
					<input
						type='password'
						id='confirmPassword'
						value={confirmPassword}
						onChange={(e) => setConfirmPassword(e.target.value)}
						disabled={isLoading}
						autoComplete='new-password'
						required
					/>
				</div>

				<button
					type='submit'
					className={`auth-button ${isLoading ? 'loading' : ''}`}
					disabled={!ageConfirmed || !privacyAccepted || isLoading}
				>
					{isLoading
						? isUpgrade
							? t('Upgrading...')
							: t('Creating Account...')
						: isUpgrade
							? t('Upgrade Account')
							: t('Sign up')}
				</button>

				{!isUpgrade && (
					<button
						type='button'
						className={`auth-button chelys-button ${isLoading ? 'loading' : ''}`}
						onClick={handleChelysSubmit}
						disabled={!ageConfirmed || !privacyAccepted || isLoading}
					>
						<span>
							{isLoading ? t('Creating Account...') : t('Sign up with Chelys')}
						</span>
						<span className='passkey-badge'>
							<PasskeyIcon size={24} />
							{t('Passkey')}
						</span>
					</button>
				)}
			</form>

			<div className='form-group'>
				<label className='checkbox-control'>
					<input
						type='checkbox'
						checked={ageConfirmed}
						onChange={(e) => setAgeConfirmed(e.target.checked)}
						required
					/>

					<span>{t('I confirm I am at least 16 years old')}</span>
				</label>
			</div>

			<div className='form-group'>
				<label className='checkbox-control'>
					<input
						type='checkbox'
						checked={privacyAccepted}
						onChange={(e) => setPrivacyAccepted(e.target.checked)}
						required
					/>

					<span>
						{t('I understand how my data is handled as described in the')}{' '}
						<button
							type='button'
							className='inline-link-button'
							onClick={onShowPrivacy}
						>
							{t('privacy information')}
						</button>
					</span>
				</label>
			</div>

			{!isUpgrade && (
				<div className='auth-alt-action'>
					<span>{t('Already have an account?')}</span>
					<button
						className='text-button'
						onClick={onSwitchToLogin}
						disabled={isLoading}
					>
						{t('Log in')}
					</button>
				</div>
			)}
		</div>
	);
};

export default Register;
