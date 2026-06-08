// src/components/project/ShareProjectModal.tsx
import QRCode from 'qrcode';
import type React from 'react';
import { useEffect, useState } from 'react';

import { t } from '@/i18n';
import { ShareIcon } from '../common/Icons';
import CopyField from '../common/CopyField';
import Modal from '../common/Modal';

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
	const [qrCodeUrl, setQrCodeUrl] = useState<string>('');

	useEffect(() => {
		if (isOpen && shareUrl) {
			QRCode.toDataURL(shareUrl, {
				width: 200,
				margin: 2,
				color: {
					dark: '#000000',
					light: '#ffffff',
				},
			})
				.then(setQrCodeUrl)
				.catch(console.error);
		}
	}, [isOpen, shareUrl]);

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title={t('Share Project')}
			icon={ShareIcon}
			size='medium'
		>
			<div className='share-project-content'>
				<div className='share-info'>
					<h4>
						{t('Share "')}
						{projectName}"
					</h4>
					<p>
						{t(
							'Anyone with this link can view and collaborate on this project.',
						)}
					</p>
				</div>

				<div className='share-url-section'>
					<CopyField
						id='share-url'
						label={t('Project Link')}
						value={shareUrl}
					/>
				</div>

				{qrCodeUrl && (
					<div className='qr-code-section'>
						<label>{t('QR Code')}</label>
						<div className='qr-code-container'>
							<img src={qrCodeUrl} alt={t('QR Code for project link')} />
							<p>{t('Scan to open project on mobile')}</p>
						</div>
					</div>
				)}

				<div className='info-message'>
					<h5>{t('Sharing Tips')}</h5>
					<ul>
						<li>
							{t('All collaborators can edit documents and files in real-time')}
						</li>
						<li>{t('Changes are automatically saved and synchronized')}</li>
						<li>
							{t(
								'The project remains accessible as long as someone has the link',
							)}
						</li>
					</ul>
				</div>
			</div>
		</Modal>
	);
};

export default ShareProjectModal;
