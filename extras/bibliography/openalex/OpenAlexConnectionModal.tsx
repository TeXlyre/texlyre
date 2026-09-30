// extras/bibliography/openalex/OpenAlexConnectionModal.tsx
import { t } from '@/i18n';
import type React from 'react';
import { useState, useEffect } from 'react';

import Modal from '@/components/common/Modal';
import { OpenAlexIcon } from './Icon';

interface OpenAlexConnectionModalProps {
	isOpen: boolean;
	onClose: () => void;
	onConnect: (apiKey?: string, email?: string) => Promise<void>;
	existingEmail?: string;
	hasExistingApiKey?: boolean;
}

const OpenAlexConnectionModal: React.FC<OpenAlexConnectionModalProps> = ({
	isOpen,
	onClose,
	onConnect,
	existingEmail,
	hasExistingApiKey,
}) => {
	const [apiKey, setApiKey] = useState('');
	const [email, setEmail] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (isOpen) {
			setApiKey('');
			setEmail(existingEmail || '');
			setError(null);
		}
	}, [isOpen, existingEmail]);

	const handleSubmit = async () => {
		setIsLoading(true);
		setError(null);
		try {
			await onConnect(apiKey.trim() || undefined, email.trim() || undefined);
			onClose();
		} catch {
			setError(t('Failed to save credentials.'));
		} finally {
			setIsLoading(false);
		}
	};

	const handleConnectAnonymously = async () => {
		setIsLoading(true);
		setError(null);
		try {
			await onConnect(undefined, undefined);
			onClose();
		} catch {
			setError(t('Connection failed'));
		} finally {
			setIsLoading(false);
		}
	};

	const busy = isLoading;

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title={t('Connect to OpenAlex')}
			icon={OpenAlexIcon}
			size='medium'
		>
			<div className='ui-stack' data-gap='lg'>
				<p className='ui-note'>
					{t(
						'OpenAlex is free and works without an API key. Providing an email enables the polite pool (higher rate limits). An API key is required for premium access.',
					)}
				</p>

				<div className='ui-field' data-spacing='section'>
					<label>{t('Email (recommended):')}</label>
					<input
						type='email'
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						placeholder={t('your@email.com')}
						disabled={busy}
					/>
					<span className='ui-note ui-field-hint'>
						{t('Used as mailto parameter for polite pool access')}
					</span>
				</div>

				<div className='ui-field' data-spacing='section'>
					<label>
						{t('API Key')}
						<span className='ui-badge' data-variant='label'>
							{t('optional')}
						</span>
						{hasExistingApiKey && (
							<span
								className='ui-status'
								data-variant='label'
								data-tone='success'
							>
								{t('stored')}
							</span>
						)}
					</label>
					<input
						type='password'
						value={apiKey}
						onChange={(e) => setApiKey(e.target.value)}
						placeholder={
							hasExistingApiKey
								? t('Leave blank to keep existing key')
								: t('Enter API key for premium access')
						}
						disabled={busy}
					/>
				</div>

				{error && (
					<div className='ui-message' data-tone='error'>
						{error}
					</div>
				)}

				<div
					className='ui-actions'
					data-variant='modal'
					data-gap='sd'
					data-wrap='true'
					data-cross='stretch'
				>
					<button
						type='button'
						className='button primary'
						onClick={handleSubmit}
						disabled={busy}
					>
						{busy ? t('Connecting...') : t('Connect')}
					</button>
					{!hasExistingApiKey && (
						<button
							type='button'
							className='button secondary'
							onClick={handleConnectAnonymously}
							disabled={busy}
						>
							{t('Use Anonymously')}
						</button>
					)}
					<button
						type='button'
						className='button secondary'
						onClick={onClose}
						disabled={busy}
					>
						{t('Cancel')}
					</button>
				</div>
				<br />
				<a
					href='https://docs.openalex.org/how-to-use-the-api/rate-limits-and-authentication'
					target='_blank'
					rel='noopener noreferrer'
				>
					{t('Learn more about OpenAlex API access')}
				</a>
			</div>
		</Modal>
	);
};

export default OpenAlexConnectionModal;
