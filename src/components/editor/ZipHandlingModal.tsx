// src/components/editor/ZipHandlingModal.tsx
import type React from 'react';
import { useState } from 'react';

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
		return targetPath === '/' ? 'root folder' : targetPath;
	};

	if (!zipFile) return null;

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title="ZIP File Detected"
			size="medium"
		>
			<div className="zip-handling-modal">
				<p>
					You're adding "{zipFile.name}" to {getTargetDisplayPath()}. How would
					you like to handle this ZIP file?
				</p>

				<div className="zip-handling-options" style={{ margin: '1.5rem 0' }}>
					<div
						className={`zip-option ${selectedAction === 'extract' ? 'selected' : ''}`}
						onClick={() => setSelectedAction('extract')}
						style={{
							border: '1px solid var(--border-color)',
							borderRadius: '8px',
							padding: '1rem',
							marginBottom: '0.75rem',
							cursor: 'pointer',
							backgroundColor:
								selectedAction === 'extract'
									? 'rgba(var(--accent-color-rgb), 0.1)'
									: 'transparent',
							borderColor:
								selectedAction === 'extract'
									? 'var(--accent-color)'
									: 'var(--border-color)',
						}}
					>
						<label
							style={{
								display: 'flex',
								alignItems: 'flex-start',
								gap: '0.75rem',
								cursor: 'pointer',
							}}
						>
							<input
								type="radio"
								name="zipAction"
								value="extract"
								checked={selectedAction === 'extract'}
								onChange={() => setSelectedAction('extract')}
								style={{ marginTop: '0.125rem' }}
							/>
							<div className="option-content">
								<div
									className="option-header"
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: '0.5rem',
										marginBottom: '0.5rem',
									}}
								>
									<FolderIcon />
									<strong>Extract contents</strong>
								</div>
								<p style={{ margin: '0', color: 'var(--text-secondary)' }}>
									Extract all files from the ZIP archive into{' '}
									{getTargetDisplayPath()}
								</p>
							</div>
						</label>
					</div>

					<div
						className={`zip-option ${selectedAction === 'keep' ? 'selected' : ''}`}
						onClick={() => setSelectedAction('keep')}
						style={{
							border: '1px solid var(--border-color)',
							borderRadius: '8px',
							padding: '1rem',
							cursor: 'pointer',
							backgroundColor:
								selectedAction === 'keep'
									? 'rgba(var(--accent-color-rgb), 0.1)'
									: 'transparent',
							borderColor:
								selectedAction === 'keep'
									? 'var(--accent-color)'
									: 'var(--border-color)',
						}}
					>
						<label
							style={{
								display: 'flex',
								alignItems: 'flex-start',
								gap: '0.75rem',
								cursor: 'pointer',
							}}
						>
							<input
								type="radio"
								name="zipAction"
								value="keep"
								checked={selectedAction === 'keep'}
								onChange={() => setSelectedAction('keep')}
								style={{ marginTop: '0.125rem' }}
							/>
							<div className="option-content">
								<div
									className="option-header"
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: '0.5rem',
										marginBottom: '0.5rem',
									}}
								>
									<FileIcon />
									<strong>Keep as ZIP file</strong>
								</div>
								<p style={{ margin: '0', color: 'var(--text-secondary)' }}>
									Add the ZIP file as-is to {getTargetDisplayPath()}
								</p>
							</div>
						</label>
					</div>
				</div>

				<div className="modal-actions">
					<button type="button" className="button secondary" onClick={onClose}>
						Cancel
					</button>
					<button
						type="button"
						className="button primary"
						onClick={handleConfirm}
					>
						{selectedAction === 'extract' ? 'Extract ZIP' : 'Keep as ZIP'}
					</button>
				</div>
			</div>
		</Modal>
	);
};

export default ZipHandlingModal;
