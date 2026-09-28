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
			title={t('Archive File Detected')}
			size='medium'
		>
			<div className='zip-handling-content ui-stack' data-gap='md'>
				<p>
					{t(
						'You are adding "{fileName}" to {targetPath}. How would you like to handle this archive?',
						{
							fileName: zipFile.name,
							targetPath: getTargetDisplayPath(),
						},
					)}
				</p>

				<div
					className='ui-card ui-stack'
					data-gap='sm'
					data-padding='md'
					data-surface='secondary'
				>
					<div className='ui-meta ui-stack' data-gap='xs'>
						<strong>{zipFile.name}</strong>
						<span>
							{t('Target')}: {getTargetDisplayPath()}
						</span>
					</div>
				</div>

				<div className='ui-list' data-gap='sm'>
					<label
						className='ui-list-item'
						data-align='center'
						data-gap='sm'
						data-padding='md'
						data-surface='secondary'
						data-interactive='true'
						data-selected={selectedAction === 'extract' ? 'true' : undefined}
					>
						<input
							type='radio'
							name='zipAction'
							value='extract'
							checked={selectedAction === 'extract'}
							onChange={() => setSelectedAction('extract')}
						/>

						<div className='ui-list-content' data-grow='true' data-gap='xs'>
							<div className='ui-actions'>
								<FolderIcon />
								<strong>{t('Extract contents')}</strong>
							</div>

							<p className='ui-note'>
								{t('Extract all files from the archive into {targetPath}', {
									targetPath: getTargetDisplayPath(),
								})}
							</p>
						</div>
					</label>

					<label
						className='ui-list-item'
						data-align='center'
						data-gap='sm'
						data-padding='md'
						data-surface='secondary'
						data-interactive='true'
						data-selected={selectedAction === 'keep' ? 'true' : undefined}
					>
						<input
							type='radio'
							name='zipAction'
							value='keep'
							checked={selectedAction === 'keep'}
							onChange={() => setSelectedAction('keep')}
						/>

						<div className='ui-list-content' data-grow='true' data-gap='xs'>
							<div className='ui-actions'>
								<FileIcon />
								<strong>{t('Keep as archive file')}</strong>
							</div>

							<p className='ui-note'>
								{t('Add the archive file as-is to {targetPath}', {
									targetPath: getTargetDisplayPath(),
								})}
							</p>
						</div>
					</label>
				</div>

				<div
					className='ui-actions'
					data-variant='modal'
					data-align='end'
					data-cross='stretch'
				>
					<button type='button' className='button secondary' onClick={onClose}>
						{t('Cancel')}
					</button>
					<button
						type='button'
						className='button primary'
						onClick={handleConfirm}
					>
						{selectedAction === 'extract'
							? t('Extract Archive')
							: t('Keep Archive')}
					</button>
				</div>
			</div>
		</Modal>
	);
};

export default ZipHandlingModal;
