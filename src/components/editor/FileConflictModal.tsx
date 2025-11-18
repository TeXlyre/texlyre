// src/components/editor/FileConflictModal.tsx (latest)
import { t } from '@/i18n';
import type React from 'react';
import { useEffect, useState } from 'react';

import {
	type BatchConflictResolution,
	type BatchDeleteConfirmation,
	type BatchUnlinkConfirmation,
	type ConflictResolution,
	type DeleteConfirmation,
	type LinkConfirmation,
	type LinkedFileConfirmation,
	type UnlinkConfirmation,
	fileConflictService
} from
	'../../services/FileConflictService';
import type { FileNode } from '../../types/files';
import { formatDate } from '../../utils/dateUtils';
import { isTemporaryFile, formatFileSize } from '../../utils/fileUtils';
import Modal from '../common/Modal';
import { TempFileIcon } from '../common/Icons.tsx';

const FileConflictModal: React.FC = () => {
	const [isOpen, setIsOpen] = useState(false);
	const [conflictType, setConflictType] = useState<
		'conflict' |
		'delete' |
		'link' |
		'unlink' |
		'linked-file-action' |
		'batch-conflict' |
		'batch-delete' |
		'batch-unlink'>(
			'conflict');
	const [existingFile, setExistingFile] = useState<FileNode | null>(null);
	const [newFile, setNewFile] = useState<FileNode | null>(null);
	const [files, setFiles] = useState<FileNode[] | null>(null);
	const [action, setAction] = useState<
		'rename' | 'delete' | 'overwrite' | undefined>(
			undefined);
	const [conflictCount, setConflictCount] = useState<number>(0);
	const [currentIndex, setCurrentIndex] = useState<number>(0);
	const [resolveCallback, setResolveCallback] = useState<
		((
			resolution:
				ConflictResolution |
				DeleteConfirmation |
				LinkConfirmation |
				UnlinkConfirmation |
				LinkedFileConfirmation |
				BatchConflictResolution |
				BatchDeleteConfirmation |
				BatchUnlinkConfirmation)
			=> void) |
		null>(
			null);
	const [rejectCallback, setRejectCallback] = useState<(() => void) | null>(
		null
	);

	useEffect(() => {
		const unsubscribe = fileConflictService.addListener((event) => {
			setConflictType(event.type);
			setExistingFile(event.existingFile || null);
			setNewFile(event.newFile || null);
			setFiles(event.files || null);
			setAction(event.action);
			setConflictCount(event.conflictCount || 0);
			setCurrentIndex(event.currentIndex || 0);
			setResolveCallback(() => event.resolve);
			setRejectCallback(() => event.reject);
			setIsOpen(true);
		});

		return unsubscribe;
	}, []);

	const handleClose = () => {
		if (rejectCallback) {
			rejectCallback();
		}
		setIsOpen(false);
		resetState();
	};

	const handleResolution = (
		resolution:
			ConflictResolution |
			DeleteConfirmation |
			LinkConfirmation |
			UnlinkConfirmation |
			LinkedFileConfirmation |
			BatchConflictResolution |
			BatchDeleteConfirmation |
			BatchUnlinkConfirmation) => {
		if (resolveCallback) {
			resolveCallback(resolution);
		}
		setIsOpen(false);
		resetState();
	};

	const resetState = () => {
		setExistingFile(null);
		setNewFile(null);
		setFiles(null);
		setAction(undefined);
		setConflictCount(0);
		setCurrentIndex(0);
		setResolveCallback(null);
		setRejectCallback(null);
	};

	const getOperationWarning = (): string | null => {
		if (
			conflictType === 'delete' &&
			existingFile &&
			isTemporaryFile(existingFile.path)
		) {
			return t('Deleting temporary files may break caching or cause system issues.');
		}

		if (
			conflictType === 'link' &&
			existingFile &&
			isTemporaryFile(existingFile.path)
		) {
			return t("Linking temporary files is not recommended as they won't sync with collaborators.");
		}

		if (
			conflictType === 'unlink' &&
			existingFile &&
			isTemporaryFile(existingFile.path)
		) {
			return t('Unlinking temporary files may affect system functionality.');
		}

		if (conflictType === 'batch-delete' && files) {
			const hasTemporaryFiles = files.some((file) =>
				isTemporaryFile(file.path),
			);
			if (hasTemporaryFiles) {
				return t('Some files are temporary - deleting them may break caching or cause system issues.');
			}
		}

		if (conflictType === 'batch-unlink' && files) {
			const hasTemporaryFiles = files.some((file) =>
				isTemporaryFile(file.path),
			);
			if (hasTemporaryFiles) {
				return t('Some temporary files are included - unlinking them may affect system functionality.');
			}
		}

		if (conflictType === 'batch-conflict' && (existingFile || newFile)) {
			const isExistingTemporary =
				existingFile && isTemporaryFile(existingFile.path);
			const isNewTemporary = newFile && isTemporaryFile(newFile.path);
			if (isExistingTemporary || isNewTemporary) {
				return t('Temporary files are involved - operations may affect system stability.');
			}
		}

		if (
			conflictType === 'linked-file-action' &&
			existingFile &&
			isTemporaryFile(existingFile.path)
		) {
			return t('This operation involves temporary files which may affect system functionality.');
		}

		return null;
	};

	const operationWarning = getOperationWarning();

	if (conflictType === 'batch-conflict' && existingFile && newFile) {
		return (
			<Modal
				isOpen={isOpen}
				onClose={handleClose}
				title={t('File Conflicts ({current} of {total})', { current: currentIndex, total: conflictCount })}
				size="medium"
			>
				<div className="file-conflict-content">
					<p>
						{t('Multiple files already exist at their target locations. Choose how to handle conflicts:')}
					</p>

					<div className="file-comparison">
						<div className="file-info existing">
							<h4>{t('Existing File')}</h4>
							<div className="file-details">
								<strong>{existingFile.name}</strong>
								<span>{t('Size')}: {formatFileSize(existingFile.size)}</span>
								<span>{t('Modified')}: {formatDate(existingFile.lastModified)}</span>
								{isTemporaryFile(existingFile.path) && (
									<span className="temp-file-indicator">
										<TempFileIcon /> {t('Temporary file')}
									</span>
								)}
							</div>
						</div>

						<div className="file-info new">
							<h4>{t('New File')}</h4>
							<div className="file-details">
								<strong>{newFile.name}</strong>
								<span>{t('Size')}: {formatFileSize(newFile.size)}</span>
								<span>{t('Modified')}: {formatDate(newFile.lastModified)}</span>
								{isTemporaryFile(newFile.path) && (
									<span className="temp-file-indicator">
										<TempFileIcon /> {t('Temporary file')}
									</span>
								)}
							</div>
						</div>
					</div>

					{operationWarning && (
						<div className="warning-message">{operationWarning}</div>
					)}

					<div className="modal-actions">
						<div className="single-actions">
							<button
								type="button"
								className="button secondary"
								onClick={handleClose}
							>
								{t('Cancel')}
							</button>
							<button
								type="button"
								className="button secondary"
								onClick={() => handleResolution('keep-both')}
							>
								{t('Keep Both')}
							</button>
							<button
								type="button"
								className="button primary"
								onClick={() => handleResolution('overwrite')}
							>
								{t('Replace This')}
							</button>
						</div>
					</div>
					<div className="batch-conflict-info">
						<p>
							<strong>{t('Current conflict')}:</strong> {existingFile.name}
						</p>
						<p>
							<strong>{t('Remaining conflicts')}:</strong>{' '}
							{conflictCount - currentIndex}
						</p>
					</div>

					<div className="modal-actions">
						<p> {t('Apply to all {count} conflicts', { count: conflictCount })}: </p>
						<div className="batch-actions">
							<div style={{ display: 'flex', gap: '0.5rem' }}>
								<button
									type="button"
									className="button secondary small"
									onClick={() => handleResolution('cancel-all')}
								>
									{t('Cancel All')}
								</button>
								<button
									type="button"
									className="button secondary small"
									onClick={() => handleResolution('keep-both-all')}
								>
									{t('Keep Both (All)')}
								</button>
								<button
									type="button"
									className="button primary small"
									onClick={() => handleResolution('overwrite-all')}
								>
									{t('Replace All')}
								</button>
							</div>
						</div>
					</div>
				</div>
			</Modal>
		);
	}

	if (conflictType === 'batch-delete' && files) {
		return (
			<Modal
				isOpen={isOpen}
				onClose={handleClose}
				title={t('Confirm Deletion')}
				size="medium"
			>
				<div className="file-conflict-content">
					<p>
						{t('Are you sure you want to delete {count} file?', { count: files.length })}
					</p>

					<div className="batch-files-list">
						{files.slice(0, 10).map((file) => (
							<div key={file.id} className="batch-file-item">
								<strong>{file.name}</strong>
								<div className="batch-file-meta">
									{file.path} • {formatFileSize(file.size)}
									{isTemporaryFile(file.path) && (
										<span className="temp-file-indicator">
											{' '}
											• <TempFileIcon /> {t('Temporary')}
										</span>
									)}
								</div>
							</div>
						))}
						{files.length > 10 && (
							<div className="batch-files-overflow">
								{t('... and {count} more files', { count: files.length - 10 })}
							</div>
						)}
					</div>

					{operationWarning && (
						<div className="warning-message">{operationWarning}</div>
					)}

					<div className="warning-message">
						{t('This action cannot be undone.')}
					</div>

					<div className="modal-actions">
						<button
							type="button"
							className="button secondary"
							onClick={handleClose}
						>
							{t('Cancel')}
						</button>
						<button
							type="button"
							className="button danger"
							onClick={() => handleResolution('confirm')}
						>
							{t('Delete {count} File', { count: files.length })}
						</button>
					</div>
				</div>
			</Modal>
		);
	}

	if (conflictType === 'batch-unlink' && files) {
		const linkedFiles = files.filter((f) => f.documentId);

		return (
			<Modal
				isOpen={isOpen}
				onClose={handleClose}
				title={t('Confirm Batch Unlink')}
				size="medium"
			>
				<div className="file-conflict-content">
					<p>
						{t('Are you sure you want to unlink {count} files from their documents?', { count: linkedFiles.length })}
					</p>

					<div className="batch-files-list">
						{linkedFiles.slice(0, 10).map((file) => (
							<div key={file.id} className="batch-file-item">
								<strong>{file.name}</strong>
								<div className="batch-file-meta">
									{file.path} • {t('Linked to')}: {file.documentId}
									{isTemporaryFile(file.path) && (
										<span className="temp-file-indicator">
											{' '}
											• <TempFileIcon /> {t('Temporary')}
										</span>
									)}
								</div>
							</div>
						))}
						{linkedFiles.length > 10 && (
							<div className="batch-files-overflow">
								{t('... and {count} more files', { count: linkedFiles.length - 10 })}
							</div>
						)}
					</div>

					{operationWarning && (
						<div className="warning-message">{operationWarning}</div>
					)}

					<div className="warning-message">
						{t('Note: The page will refresh after unlinking and any unsaved changes may be lost.')}
					</div>

					<div className="modal-actions">
						<button
							type="button"
							className="button secondary"
							onClick={handleClose}
						>
							{t('Cancel')}
						</button>
						<button
							type="button"
							className="button primary"
							onClick={() => handleResolution('confirm')}
						>
							{t('Unlink {count} Files', { count: linkedFiles.length })}
						</button>
					</div>
				</div>
			</Modal>
		);
	}

	if (conflictType === 'delete' && existingFile) {
		return (
			<Modal
				isOpen={isOpen}
				onClose={handleClose}
				title={t('Delete File')}
				size="medium"
			>
				<div className="file-conflict-content">
					<p>
						{t('Are you sure you want to delete "{name}"?', { name: existingFile.name })}
					</p>

					<div className="file-info">
						<div className="file-details">
							<strong>{existingFile.name}</strong>
							<div className="file-meta">
								<span>{t('Path')}: {existingFile.path}</span>
								<span>{t('Size')}: {formatFileSize(existingFile.size)}</span>
								<span>{t('Modified')}: {formatDate(existingFile.lastModified)}</span>
								{isTemporaryFile(existingFile.path) && (
									<span className="temp-file-indicator">
										<TempFileIcon /> {t('Temporary file')}
									</span>
								)}
							</div>
						</div>
					</div>

					{operationWarning && (
						<div className="warning-message">{operationWarning}</div>
					)}

					<div className="warning-message">
						{t('This action cannot be undone.')}
					</div>

					<div className="modal-actions">
						<button
							type="button"
							className="button secondary"
							onClick={handleClose}
						>
							{t('Cancel')}
						</button>
						<button
							type="button"
							className="button danger"
							onClick={() => handleResolution('confirm')}
						>
							{t('Delete File')}
						</button>
					</div>
				</div>
			</Modal>
		);
	}

	if (conflictType === 'link' && existingFile) {
		return (
			<Modal
				isOpen={isOpen}
				onClose={handleClose}
				title={t('Link File to Document')}
				size="medium"
			>
				<div className="file-conflict-content">
					<p>
						{t('Linking "{name}" will create a collaborative document that syncs with this file.', { name: existingFile.name })}
					</p>

					<div className="file-info">
						<div className="file-details">
							<strong>{existingFile.name}</strong>
							<div className="file-meta">
								<span>{t('Path')}: {existingFile.path}</span>
								<span>{t('Size')}: {formatFileSize(existingFile.size)}</span>
								<span>{t('Modified')}: {formatDate(existingFile.lastModified)}</span>
								{isTemporaryFile(existingFile.path) && (
									<span className="temp-file-indicator">
										<TempFileIcon /> {t('Temporary file')}
									</span>
								)}
							</div>
						</div>
					</div>

					{operationWarning && (
						<div className="warning-message">{operationWarning}</div>
					)}

					<div className="warning-message">
						{t('Note: The page will refresh after linking and any unsaved changes may be lost.')}
						<p className="footnote">
							{t('* Selecting "Link Only" will discard any existing content in the document.')}
						</p>
					</div>

					<div className="modal-actions">
						<button
							type="button"
							className="button secondary"
							onClick={handleClose}
						>
							{t('Cancel')}
						</button>
						<button
							type="button"
							className="button secondary"
							onClick={() => handleResolution('link-without-copy')}
						>
							{t('Link Only')}
						</button>
						<button
							type="button"
							className="button primary"
							onClick={() => handleResolution('link-with-copy')}
						>
							{t('Link & Copy Content')}
						</button>
					</div>
				</div>
			</Modal>
		);
	}

	if (conflictType === 'unlink' && existingFile) {
		return (
			<Modal
				isOpen={isOpen}
				onClose={handleClose}
				title={t('Unlink File from Document')}
				size="medium"
			>
				<div className="file-conflict-content">
					<p>
						{t('Unlinking "{name}" will remove the connection between this file and its collaborative document.', { name: existingFile.name })}
					</p>

					<div className="file-info">
						<div className="file-details">
							<strong>{existingFile.name}</strong>
							<div className="file-meta">
								<span>{t('Path')}: {existingFile.path}</span>
								<span>{t('Size')}: {formatFileSize(existingFile.size)}</span>
								<span>{t('Modified')}: {formatDate(existingFile.lastModified)}</span>
								{isTemporaryFile(existingFile.path) && (
									<span className="temp-file-indicator">
										<TempFileIcon /> {t('Temporary file')}
									</span>
								)}
							</div>
						</div>
					</div>

					{operationWarning && (
						<div className="warning-message">{operationWarning}</div>
					)}

					<div className="warning-message">
						{t('Note: The page will refresh after unlinking and any unsaved changes may be lost.')}
					</div>

					<div className="modal-actions">
						<button
							type="button"
							className="button secondary"
							onClick={handleClose}
						>
							{t('Cancel')}
						</button>
						<button
							type="button"
							className="button primary"
							onClick={() => handleResolution('confirm')}
						>
							{t('Unlink File')}
						</button>
					</div>
				</div>
			</Modal>
		);
	}

	if (conflictType === 'linked-file-action' && existingFile && action) {
		const actionText =
			action === 'rename'
				? 'rename'
				: action === 'delete'
					? 'delete'
					: 'overwrite';
		const actionCapitalized =
			actionText.charAt(0).toUpperCase() + actionText.slice(1);
		const actionVerb =
			actionText === 'delete'
				? 'delete'
				: actionText === 'overwrite'
					? 'overwrite'
					: 'rename';
		const actionMessage =
			actionText === 'delete'
				? t('Cannot delete')
				: actionText === 'overwrite'
					? t('Cannot overwrite')
					: t('Cannot rename');

		return (
			<Modal
				isOpen={isOpen}
				onClose={handleClose}
				title={t('{action} Linked File', { action: actionCapitalized })}
				size="medium"
			>
				<div className="file-conflict-content">
					<p>
						{actionMessage} "{existingFile.name}" {t('because it is linked to a collaborative document.')}
					</p>

					<div className="file-info">
						<div className="file-details">
							<strong>{existingFile.name}</strong>
							<div className="file-meta">
								<span>{t('Path')}: {existingFile.path}</span>
								<span>{t('Size')}: {formatFileSize(existingFile.size)}</span>
								<span>{t('Modified')}: {formatDate(existingFile.lastModified)}</span>
								<span>{t('Linked to document')}: {t('Yes')}</span>
								{isTemporaryFile(existingFile.path) && (
									<span className="temp-file-indicator">
										<TempFileIcon /> {t('Temporary file')}
									</span>
								)}
							</div>
						</div>
					</div>

					{operationWarning && (
						<div className="warning-message">{operationWarning}</div>
					)}

					<div className="warning-message">
						{t('To {action} this file, you must first unlink it from its document. After unlinking, you can try the {action} operation again.', { action: actionVerb })}
					</div>

					<div className="modal-actions">
						<button
							type="button"
							className="button secondary"
							onClick={handleClose}
						>
							{t('Cancel')}
						</button>
						<button
							type="button"
							className="button primary"
							onClick={() => handleResolution('show-unlink-dialog')}
						>
							{t('Unlink File')}
						</button>
					</div>
				</div>
			</Modal>
		);
	}

	if (conflictType === 'conflict' && existingFile && newFile) {
		return (
			<Modal
				isOpen={isOpen}
				onClose={handleClose}
				title={t('File Already Exists')}
				size="medium"
			>
				<div className="file-conflict-content">
					<p>
						{t('A file with the name "{name}" already exists at this location.', { name: existingFile.name })}
					</p>

					<div className="file-comparison">
						<div className="file-info existing">
							<h4>{t('Existing File')}</h4>
							<div className="file-details">
								<span>{t('Size')}: {formatFileSize(existingFile.size)}</span>
								<span>{t('Modified')}: {formatDate(existingFile.lastModified)}</span>
								{isTemporaryFile(existingFile.path) && (
									<span className="temp-file-indicator">
										<TempFileIcon /> {t('Temporary file')}
									</span>
								)}
							</div>
						</div>

						<div className="file-info new">
							<h4>{t('New File')}</h4>
							<div className="file-details">
								<span>{t('Size')}: {formatFileSize(newFile.size)}</span>
								<span>{t('Modified')}: {formatDate(newFile.lastModified)}</span>
								{isTemporaryFile(newFile.path) && (
									<span className="temp-file-indicator">
										<TempFileIcon /> {t('Temporary file')}
									</span>
								)}
							</div>
						</div>
					</div>

					{operationWarning && (
						<div className="warning-message">{operationWarning}</div>
					)}

					<div className="modal-actions">
						<button
							type="button"
							className="button secondary"
							onClick={handleClose}
						>
							{t('Cancel')}
						</button>
						<button
							type="button"
							className="button secondary"
							onClick={() => handleResolution('keep-both')}
						>
							{t('Keep Both')}
						</button>
						<button
							type="button"
							className="button primary"
							onClick={() => handleResolution('overwrite')}
						>
							{t('Replace')}
						</button>
					</div>
				</div>
			</Modal>
		);
	}

	return null;
};

export default FileConflictModal;