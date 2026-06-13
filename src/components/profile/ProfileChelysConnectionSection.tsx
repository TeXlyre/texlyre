// src/components/profile/ChelysConnectionSection.tsx
import type React from 'react';
import { useState } from 'react';

import { t } from '@/i18n';
import { useAuth } from '../../hooks/useAuth';
import { useChelys } from '../../hooks/useChelys';
import { ChelysCredentialExistsError } from '../../utils/chelysWebauthn';
import CopyField from '../common/CopyField';

interface ChelysConnectionSectionProps {
	isSubmitting: boolean;
}

const ChelysConnectionSection: React.FC<ChelysConnectionSectionProps> = ({
	isSubmitting,
}) => {
	const { user, verifyPassword, updateUser } = useAuth();
	const {
		isEnrolled,
		isLoggedIn,
		enrollCurrent,
		reauthenticate,
		getPrfHex,
		disconnect: chelysDisconnect,
	} = useChelys();

	const [prfHex, setPrfHex] = useState<string | null>(null);
	const [chelysError, setChelysError] = useState<string | null>(null);
	const [password, setPassword] = useState('');
	const [passwordRevealed, setPasswordRevealed] = useState(false);

	const handleRegister = async () => {
		if (!user) return;
		if (!passwordRevealed) {
			setPasswordRevealed(true);
			return;
		}
		if (!password) return;

		if (!(await verifyPassword(user.id, password))) {
			setChelysError(t('Current password is incorrect'));
			return;
		}

		setChelysError(null);
		try {
			setPrfHex(await enrollCurrent(password));
			if (!user.isChelysEnrolled) {
				await updateUser({ ...user, isChelysEnrolled: true });
			}
			setPasswordRevealed(false);
			setPassword('');
		} catch (error) {
			if (error instanceof ChelysCredentialExistsError) {
				setChelysError(
					t(
						'A passkey labelled "{label}" already exists. Use "Log in to Chelys" instead.',
						{ label: error.label },
					),
				);
				return;
			}
			setChelysError(
				error instanceof Error ? error.message : t('An error occurred'),
			);
		}
	};

	const handleLogin = async () => {
		if (!passwordRevealed) {
			setPasswordRevealed(true);
			return;
		}
		if (!password) return;

		if (user && !(await verifyPassword(user.id, password))) {
			setChelysError(t('Current password is incorrect'));
			return;
		}

		setChelysError(null);
		try {
			await reauthenticate(password);
			if (user && !user.isChelysEnrolled) {
				await updateUser({ ...user, isChelysEnrolled: true });
			}
			setPasswordRevealed(false);
			setPassword('');
		} catch (error) {
			setChelysError(
				error instanceof Error ? error.message : t('An error occurred'),
			);
		}
	};

	const handleGetPrfHex = async () => {
		setChelysError(null);
		try {
			setPrfHex(await getPrfHex());
		} catch (error) {
			setChelysError(
				error instanceof Error ? error.message : t('An error occurred'),
			);
		}
	};

	const handleDisconnect = async () => {
		await chelysDisconnect();
		if (user) {
			await updateUser({ ...user, isChelysEnrolled: false });
		}
	};

	const passwordField = (
		<div className='form-group'>
			<label htmlFor='chelys-password'>{t('Current Password')}</label>
			<input
				type='password'
				id='chelys-password'
				value={password}
				onChange={(e) => setPassword(e.target.value)}
				disabled={isSubmitting}
				autoComplete='current-password'
			/>
		</div>
	);

	return (
		<>
			<h3 style={{ paddingTop: '1rem' }}>{t('Chelys Connection')}</h3>

			{chelysError && <div className='error-message'>{chelysError}</div>}

			{!isEnrolled && (
				<div className='form-group'>
					<p>{t('Set up Chelys to connect with your local Chelys app.')}</p>
					{passwordRevealed && (
						<>
							{passwordField}
							<div className='warning-message'>
								<p>
									{t(
										'Registering creates a new passkey for this username and may overwrite an existing passkey with the same label. If you already have a passkey, use "Log in to Chelys" instead.',
									)}
								</p>
							</div>
						</>
					)}
					<div className='storage-action-buttons'>
						<button
							type='button'
							className='button warn smaller'
							onClick={handleRegister}
							disabled={isSubmitting || (passwordRevealed && !password)}
						>
							{t('Sign up with Chelys')}
						</button>
						<button
							type='button'
							className='button primary smaller'
							onClick={handleLogin}
							disabled={isSubmitting || (passwordRevealed && !password)}
						>
							{t('Log in to Chelys')}
						</button>
					</div>
				</div>
			)}

			{isEnrolled && (
				<div className='form-group'>
					<p>
						{isLoggedIn
							? t('Chelys is connected and logged in for this session.')
							: t('Chelys is connected but not logged in for this session.')}
					</p>
					{!isLoggedIn && passwordRevealed && passwordField}
					<div className='storage-action-buttons'>
						{!isLoggedIn && (
							<button
								type='button'
								className='button primary smaller'
								onClick={handleLogin}
								disabled={isSubmitting || (passwordRevealed && !password)}
							>
								{t('Log in to Chelys')}
							</button>
						)}
						<button
							type='button'
							className='button secondary smaller'
							onClick={handleGetPrfHex}
							disabled={isSubmitting}
						>
							{t('Get Chelys key')}
						</button>
						<button
							type='button'
							className='button danger smaller'
							onClick={handleDisconnect}
							disabled={isSubmitting}
						>
							{t('Disconnect Chelys')}
						</button>
					</div>
				</div>
			)}

			{prfHex && (
				<CopyField
					label={t('Chelys key (copy to your Chelys app)')}
					value={prfHex}
					mono
				/>
			)}
		</>
	);
};

export default ChelysConnectionSection;
