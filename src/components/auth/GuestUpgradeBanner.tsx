// src/components/auth/GuestUpgradeBanner.tsx
import type React from 'react';
import { useState, useEffect } from 'react';

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
					setTimeRemaining('Expired');
					return;
				}

				const hours = Math.floor(remaining / (1000 * 60 * 60));
				const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

				if (hours > 0) {
					setTimeRemaining(`${hours}h ${minutes}m remaining`);
				} else {
					setTimeRemaining(`${minutes}m remaining`);
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
		<div className="guest-upgrade-banner">
			<div className="banner-content">
				<div className="banner-icon">
					<UserIcon />
				</div>
				<div className="banner-text">
					<div className="banner-main">
						<strong>Guest Session Active</strong>
						<span className="time-remaining">{timeRemaining}</span>
					</div>
					<div className="banner-sub">
						Create an account to keep your projects permanently
					</div>
				</div>
				<div className="banner-actions">
					<button
						className="button primary small"
						onClick={onOpenUpgradeModal}
					>
						<UpgradeAccountIcon />
						Upgrade Account
					</button>
					<button
						className="button icon-only small"
						onClick={() => setIsVisible(false)}
						title="Dismiss"
					>
						<CloseIcon />
					</button>
				</div>
			</div>
		</div>
	);
};

export default GuestUpgradeBanner;