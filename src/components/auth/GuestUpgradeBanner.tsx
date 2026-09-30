// src/components/auth/GuestUpgradeBanner.tsx
import type React from 'react';
import { useState, useEffect } from 'react';

import { t } from '@/i18n';
import { useAuth } from '../../hooks/useAuth';
import { UpgradeAccountIcon, UserIcon, CloseIcon } from '../common/Icons';

interface GuestUpgradeBannerProps {
	onOpenUpgradeModal: () => void;
}

const GuestUpgradeBanner: React.FC<GuestUpgradeBannerProps> = ({
	onOpenUpgradeModal,
}) => {
	const { user, isGuestUser } = useAuth();
	const [isVisible, setIsVisible] = useState(true);
	const [timeRemaining, setTimeRemaining] = useState<string>('');

	useEffect(() => {
		if (!user || !isGuestUser(user)) return;

		const updateTimeRemaining = () => {
			if (user.expiresAt) {
				const now = Date.now();
				const remaining = user.expiresAt - now;

				if (remaining <= 0) {
					setTimeRemaining(t('Expired'));
					return;
				}

				const hours = Math.floor(remaining / (1000 * 60 * 60));
				const minutes = Math.floor(
					(remaining % (1000 * 60 * 60)) / (1000 * 60),
				);

				if (hours > 0) {
					setTimeRemaining(
						t('{hours}h {minutes}m remaining', { hours, minutes }),
					);
				} else {
					setTimeRemaining(t('{minutes}m remaining', { minutes }));
				}
			}
		};

		updateTimeRemaining();
		const interval = setInterval(updateTimeRemaining, 60000);

		return () => clearInterval(interval);
	}, [user, isGuestUser]);

	if (!user || !isGuestUser(user) || !isVisible) {
		return null;
	}

	return (
		<div
			className='guest-upgrade-banner ui-message'
			data-role='banner'
			data-tone='info'
		>
			<div
				className='ui-toolbar'
				data-gap='md'
				data-width='full'
				data-wrap='true'
			>
				<button
					className='button icon-only'
					data-role='banner-dismiss'
					data-variant='ghost'
					type='button'
					onClick={() => setIsVisible(false)}
					title={t('Dismiss upgrade banner')}
					aria-label={t('Dismiss upgrade banner')}
				>
					<CloseIcon />
				</button>
				<UserIcon />
				<div className='ui-list-content' data-grow='true' data-gap='xs'>
					<div className='ui-toolbar' data-gap='sm' data-wrap='true'>
						<strong>{t('Guest Session Active')}</strong>
						<span className='ui-note'>{timeRemaining}</span>
					</div>
					<div className='ui-note'>
						{t('Create an account to keep your projects permanently')}
					</div>
				</div>
				<div className='ui-actions'>
					<button
						className='button primary'
						type='button'
						onClick={onOpenUpgradeModal}
					>
						<UpgradeAccountIcon />
						{t('Upgrade Account')}
					</button>
				</div>
			</div>
		</div>
	);
};

export default GuestUpgradeBanner;
