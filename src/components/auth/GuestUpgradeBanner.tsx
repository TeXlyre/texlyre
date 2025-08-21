// src/components/auth/GuestUpgradeBanner.tsx
import type React from "react";
import { useState, useEffect } from "react";

import { useAuth } from "../../hooks/useAuth";
import { ChevronUpIcon, UserIcon, CloseIcon } from "../common/Icons";
import Modal from "../common/Modal";
import PrivacyModal from "../common/PrivacyModal";
import Register from "./Register";

const GuestUpgradeBanner: React.FC = () => {
	const { user, isGuestUser, upgradeGuestAccount } = useAuth();
	const [isVisible, setIsVisible] = useState(true);
	const [showUpgradeModal, setShowUpgradeModal] = useState(false);
	const [showPrivacy, setShowPrivacy] = useState(false);
	const [timeRemaining, setTimeRemaining] = useState<string>("");

	useEffect(() => {
		if (!user || !isGuestUser(user)) return;

		const updateTimeRemaining = () => {
			if (user.expiresAt) {
				const now = Date.now();
				const remaining = user.expiresAt - now;

				if (remaining <= 0) {
					setTimeRemaining("Expired");
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

	const handleUpgradeSuccess = () => {
		setShowUpgradeModal(false);
		setIsVisible(false);
	};

	const handleShowPrivacy = () => {
		setShowPrivacy(true);
	};

	const handleClosePrivacy = () => {
		setShowPrivacy(false);
		// Don't close the upgrade modal when privacy modal closes
	};

	const handleUpgradeModalClose = () => {
		if (!showPrivacy) {
			setShowUpgradeModal(false);
		}
		// If privacy is open, do nothing (don't close the modal)
	};

	if (!user || !isGuestUser(user) || !isVisible) {
		return null;
	}

	return (
		<>
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
							onClick={() => setShowUpgradeModal(true)}
						>
							<ChevronUpIcon />
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

			<Modal
				isOpen={showUpgradeModal}
				onClose={handleUpgradeModalClose}
				title="Upgrade Guest Account"
				icon={UserIcon}
				size="medium"
			>
				<div className="upgrade-modal-content">
					<div className="upgrade-info">
						<h3>Keep Your Projects in This Browser</h3>
						<p>
							Create a full account to save all your current projects in this
							browser and unlock additional features:
						</p>
						<ul>
							<li>Persistent project storage (until browser data is cleared)</li>
							<li>File system backup and sync capabilities</li>
							<li>Profile customization and settings</li>
							<li>Account security features</li>
							<li>Persistent collaboration identity</li>
						</ul>
						<p>
							<strong>All your current projects will be preserved in this browser session!</strong>
						</p>
						<div className="storage-notice">
							<p>
								<strong>Important:</strong> TeXlyre stores all data locally in your browser.
								Your projects will persist until you clear browser data, uninstall the browser,
								or use a different device. For long-term storage, regularly export your projects.
							</p>
						</div>
					</div>

					<Register
						onRegisterSuccess={handleUpgradeSuccess}
						onSwitchToLogin={() => setShowUpgradeModal(false)}
						onShowPrivacy={handleShowPrivacy}
						isUpgrade={true}
						upgradeFunction={upgradeGuestAccount}
					/>
				</div>
			</Modal>

			<PrivacyModal
				isOpen={showPrivacy}
				onClose={handleClosePrivacy}
			/>
		</>
	);
};

export default GuestUpgradeBanner;