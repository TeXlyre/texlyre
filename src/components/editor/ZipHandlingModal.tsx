// src/components/editor/ZipHandlingModal.tsx
import type React from 'react';
import { useState } from 'react';

import { t } from '@/i18n';
import { FileIcon, FolderIcon } from '../common/Icons';
import Modal from '../common/Modal';

interface ZipHandlingModalProps {
	isOpen: boolean;
	onClose: () => void;
	zipFile: File;
	targetPath: string;
	onExtract: () => void;
	onKeepAsZip: () => void;
}

const ZipHandlingModal: React.FC<ZipHandlingModalProps> = ({
	isOpen,
	onClose,
	zipFile,
	targetPath,
	onExtract,
	onKeepAsZip,
}) => {
	const [selectedAction, setSelectedAction] = useState<'extract' | 'keep'>(
		'extract',
	);

	const handleConfirm = () => {
		if (selectedAction === 'extract') {
			onExtract();
		} else {
			onKeepAsZip();
		}
	};

	const getTargetDisplayPath = () => {
		return targetPath === '/' ? t('root folder') : targetPath;
	};

	if (!zipFile) return null;

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title={t('ZIP File Detected')}
			size='medium'
		>
			<div className='file-conflict-content zip-handling-content'>
				<p>
					{t(
						'You are adding "{fileName}" to {targetPath}. How would you like to handle this ZIP file?',
						{
							fileName: zipFile.name,
							targetPath: getTargetDisplayPath(),
						},
					)}
				</p>

				<div className='file-info zip-file-info'>
					<div className='file-details'>
						<strong>{zipFile.name}</strong>
						<span>
							{t('Target')}: {getTargetDisplayPath()}
						</span>
					</div>
				</div>

				<div className='zip-handling-options'>
					<label
						className={`zip-option ${selectedAction === 'extract' ? 'selected' : ''}`}
					>
						<input
							type='radio'
							name='zipAction'
							value='extract'
							checked={selectedAction === 'extract'}
							onChange={() => setSelectedAction('extract')}
						/>

						<div className='zip-option-content'>
							<div className='zip-option-header'>
								<FolderIcon />
								<strong>{t('Extract contents')}</strong>
							</div>

							<p>
								{t('Extract all files from the ZIP archive into {targetPath}', {
									targetPath: getTargetDisplayPath(),
								})}
							</p>
						</div>
					</label>

					<label
						className={`zip-option ${selectedAction === 'keep' ? 'selected' : ''}`}
					>
						<input
							type='radio'
							name='zipAction'
							value='keep'
							checked={selectedAction === 'keep'}
							onChange={() => setSelectedAction('keep')}
						/>

						<div className='zip-option-content'>
							<div className='zip-option-header'>
								<FileIcon />
								<strong>{t('Keep as ZIP file')}</strong>
							</div>

							<p>
								{t('Add the ZIP file as-is to {targetPath}', {
									targetPath: getTargetDisplayPath(),
								})}
							</p>
						</div>
					</label>
				</div>

				<div className='modal-actions'>
					<button type='button' className='button secondary' onClick={onClose}>
						{t('Cancel')}
					</button>
					<button
						type='button'
						className='button primary'
						onClick={handleConfirm}
					>
						{selectedAction === 'extract' ? t('Extract ZIP') : t('Keep as ZIP')}
					</button>
				</div>
			</div>
		</Modal>
	);
};

export default ZipHandlingModal;
