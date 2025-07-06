import QRCode from "qrcode";
// src/components/project/ShareProjectModal.tsx
import type React from "react";
import { useEffect, useState } from "react";

import { CopyIcon, ShareIcon } from "../common/Icons";
import Modal from "../common/Modal";

interface ShareProjectModalProps {
	isOpen: boolean;
	onClose: () => void;
	projectName: string;
	shareUrl: string;
}

const ShareProjectModal: React.FC<ShareProjectModalProps> = ({
	isOpen,
	onClose,
	projectName,
	shareUrl,
}) => {
	const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
	const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
		"idle",
	);

	useEffect(() => {
		if (isOpen && shareUrl) {
			QRCode.toDataURL(shareUrl, {
				width: 200,
				margin: 2,
				color: {
					dark: "#000000",
					light: "#ffffff",
				},
			})
				.then(setQrCodeUrl)
				.catch(console.error);
		}
	}, [isOpen, shareUrl]);

	const handleCopyLink = async () => {
		try {
			await navigator.clipboard.writeText(shareUrl);
			setCopyStatus("copied");
			setTimeout(() => setCopyStatus("idle"), 2000);
		} catch (error) {
			console.error("Failed to copy to clipboard:", error);
			setCopyStatus("error");
			setTimeout(() => setCopyStatus("idle"), 2000);
		}
	};

	const getCopyButtonText = () => {
		switch (copyStatus) {
			case "copied":
				return "Copied!";
			case "error":
				return "Failed to copy";
			default:
				return "";
		}
	};

	const getCopyButtonClass = () => {
		switch (copyStatus) {
			case "copied":
				return "button primary smaller";
			case "error":
				return "button danger smaller";
			default:
				return "button secondary icon-only";
		}
	};

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title="Share Project"
			icon={ShareIcon}
			size="medium"
		>
			<div className="share-project-content">
				<div className="share-info">
					<h4>Share "{projectName}"</h4>
					<p>Anyone with this link can view and collaborate on this project.</p>
				</div>

				<div className="share-url-section">
					<label htmlFor="share-url">Project Link</label>
					<div className="share-url-input-group">
						<input
							id="share-url"
							type="text"
							value={shareUrl}
							readOnly
							className="share-url-input"
						/>
						<button
							onClick={handleCopyLink}
							className={getCopyButtonClass()}
							disabled={copyStatus === "copied"}
						>
							<CopyIcon />
							{getCopyButtonText()}
						</button>
					</div>
				</div>

				{qrCodeUrl && (
					<div className="qr-code-section">
						<label>QR Code</label>
						<div className="qr-code-container">
							<img src={qrCodeUrl} alt="QR Code for project link" />
							<p>Scan to open project on mobile</p>
						</div>
					</div>
				)}

				<div className="share-tips">
					<h5>Sharing Tips</h5>
					<ul>
						<li>All collaborators can edit documents and files in real-time</li>
						<li>Changes are automatically saved and synchronized</li>
						<li>
							The project remains accessible as long as someone has the link
						</li>
					</ul>
				</div>
			</div>
		</Modal>
	);
};

export default ShareProjectModal;
