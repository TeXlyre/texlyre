// src/components/auth/GuestConsentModal.tsx
import type React from 'react';
import { useState } from 'react';

import { UserIcon } from '../common/Icons';
import Modal from '../common/Modal';

interface GuestConsentModalProps {
	isOpen: boolean;
	onClose: () => void;
	onStartGuestSession: () => void;
	onSwitchToRegister: () => void;
	onShowPrivacy: () => void;
	isPrivacyOpen?: boolean; // Add this prop
}

const GuestConsentModal: React.FC<GuestConsentModalProps> = ({
	isOpen,
	onClose,
	onStartGuestSession,
	onSwitchToRegister,
	onShowPrivacy,
	isPrivacyOpen = false, // Add this prop
}) => {
	const [ageConfirmed, setAgeConfirmed] = useState(false);
	const [understandsSessionAndPrivacy, setUnderstandsSessionAndPrivacy] = useState(false);

	const handleStartSession = () => {
		if (ageConfirmed && understandsSessionAndPrivacy) {
			onStartGuestSession();
		}
	};

	const handleClose = () => {
		setAgeConfirmed(false);
		setUnderstandsSessionAndPrivacy(false);
		onClose();
	};

	const handleModalClose = () => {
		if (!isPrivacyOpen) {
			handleClose();
		}
	};

	return (
		<Modal
			isOpen={isOpen}
			onClose={handleModalClose}
			title="Try TeXlyre as Guest"
			icon={UserIcon}
			size="medium"
		>
			<div className="guest-consent-modal">
				<div className="guest-info-section">
					<h3>Guest Session Information</h3>
					<p>
						Guest sessions allow you to try TeXlyre's full LaTeX editing
						capabilities without creating an account. Here's what you need to
						know:
					</p>

					<div className="guest-features">
						<h4>What you can do:</h4>
						<ul>
							<li>Create and edit LaTeX projects</li>
							<li>Compile documents to PDF</li>
							<li>Upload and manage files</li>
							<li>Collaborate in real-time</li>
							<li>Export your work at any time</li>
							<li>Customize themes and settings</li>
						</ul>

						<h4>⚠️ Session limitations:</h4>
						<ul>
							<li>
								<strong>Temporary:</strong> Your session expires when you close
								the browser or after 24 hours
							</li>
							<li>
								<strong>No backup sync:</strong> File system backup features are
								disabled
							</li>
							<li>
								<strong>Anonymous collaboration:</strong> You appear as "Guest
								User" to others
							</li>
							<li>
								<strong>No account features:</strong> Profile settings and
								password management unavailable
							</li>
						</ul>
					</div>

					<div className="guest-upgrade-info">
						<h4>Upgrade anytime:</h4>
						<p>
							You can convert your guest session to a full account at any time
							to keep all your projects and unlock additional features.
						</p>
					</div>
				</div>

				<div className="consent-checkboxes">
					<div className="form-group">
						<label className="checkbox-control">
							<input
								type="checkbox"
								checked={ageConfirmed}
								onChange={(e) => setAgeConfirmed(e.target.checked)}
								required
							/>
							<span>I confirm I am at least 16 years old</span>
						</label>
					</div>

					<div className="form-group">
						<label className="checkbox-control">
							<input
								type="checkbox"
								checked={understandsSessionAndPrivacy}
								onChange={(e) => setUnderstandsSessionAndPrivacy(e.target.checked)}
								required
							/>
							<span>
								I understand this is a temporary session and how my data is handled as described in the{' '}
								<a href="#" onClick={(e) => { e.preventDefault(); onShowPrivacy(); }}>
									privacy information
								</a>
							</span>
						</label>
					</div>
				</div>

				<div className="privacy-notice">
					<p>
						<strong>Privacy:</strong> Guest sessions collect no personal data.
						Your projects are stored locally in your browser only. No tracking
						occurs across sessions.
					</p>
				</div>

				<div className="modal-actions">
					<button
						type="button"
						className="button secondary"
						onClick={handleClose}
					>
						Cancel
					</button>
					<button
						type="button"
						className="button"
						onClick={onSwitchToRegister}
					>
						Create Full Account
					</button>
					<button
						type="button"
						className="button primary"
						onClick={handleStartSession}
						disabled={!ageConfirmed || !understandsSessionAndPrivacy}
					>
						Start Guest Session
					</button>
				</div>
			</div>
		</Modal>
	);
};

export default GuestConsentModal;