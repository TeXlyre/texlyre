// src/components/editor/FileOperationsModal.tsx
import type React from 'react';

import type { FileNode } from '../../types/files';
import { isTemporaryFile } from '../../utils/fileUtils';
import { FolderIcon, TempFileIcon } from '../common/Icons';
import Modal from '../common/Modal';

interface FilePropertiesInfo {
	name: string;
	path: string;
	type: string;
	size?: number;
	mimeType?: string;
	isBinary: boolean;
	documentId?: string;
}

interface FileOperationsModalProps {
	showPropertiesModal: boolean;
	onClosePropertiesModal: () => void;
	propertiesInfo: FilePropertiesInfo | null;
	showMoveDialog: boolean;
	onCloseMoveDialog: () => void;
	fileToMove: FileNode | null;
	selectedTargetPath: string;
	onSetSelectedTargetPath: (path: string) => void;
	onConfirmMove: () => void;
	getDirectoryOptions: (currentNode: FileNode | null) => FileNode[];
	showDragDropDialog: boolean;
	onCloseDragDropDialog: () => void;
	dragDropFile: FileNode | null;
	dragDropTargetPath: string;
	onConfirmDragDrop: () => void;
}

const FileOperationsModal: React.FC<FileOperationsModalProps> = ({
	showPropertiesModal,
	onClosePropertiesModal,
	propertiesInfo,
	showMoveDialog,
	onCloseMoveDialog,
	fileToMove,
	selectedTargetPath,
	onSetSelectedTargetPath,
	onConfirmMove,
	getDirectoryOptions,
	showDragDropDialog,
	onCloseDragDropDialog,
	dragDropFile,
	dragDropTargetPath,
	onConfirmDragDrop,
}) => {
	const getTemporaryFileWarning = (
		operation: string,
		targetPath?: string,
	): string | null => {
		if (!fileToMove) return null;

		const isSourceTemporary = isTemporaryFile(fileToMove.path);
		const isTargetTemporary = targetPath ? isTemporaryFile(targetPath) : false;

		if (operation === 'move') {
			if (isSourceTemporary && isTargetTemporary) {
				return 'Moving between temporary locations may cause system instability.';
			}
			if (isSourceTemporary) {
				return 'Moving temporary files may break caching or cause system issues.';
			}
			if (isTargetTemporary) {
				return "Moving files to temporary locations means they won't be synced with collaborators. Additionally, temporary locations may be cleared automatically.";
			}
		}

		return null;
	};

	const getDragDropWarning = (): string | null => {
		if (!dragDropFile) return null;

		const isSourceTemporary = isTemporaryFile(dragDropFile.path);
		const isTargetTemporary = isTemporaryFile(dragDropTargetPath);

		if (isSourceTemporary && isTargetTemporary) {
			return 'Moving between temporary locations may cause system instability.';
		}
		if (isSourceTemporary) {
			return 'Moving temporary files may break caching or cause system issues.';
		}
		if (isTargetTemporary) {
			return "Moving files to temporary locations means they won't be synced with collaborators. Additionally, temporary locations may be cleared automatically.";
		}

		return null;
	};

	const moveWarning = getTemporaryFileWarning('move', selectedTargetPath);
	const dragDropWarning = getDragDropWarning();

	return (
		<>
			{showPropertiesModal && propertiesInfo && (
				<Modal
					isOpen={showPropertiesModal}
					onClose={onClosePropertiesModal}
					title="Properties"
					size="medium"
				>
					<div className="file-properties">
						<div className="property-item">
							<strong>Name:</strong> {propertiesInfo.name}
						</div>
						<div className="property-item">
							<strong>Path:</strong> {propertiesInfo.path}
						</div>
						<div className="property-item">
							<strong>Type:</strong> {propertiesInfo.type}
						</div>
						{propertiesInfo.size !== undefined && (
							<div className="property-item">
								<strong>Size:</strong> {propertiesInfo.size} bytes
							</div>
						)}
						{propertiesInfo.mimeType && (
							<div className="property-item">
								<strong>MIME Type:</strong> {propertiesInfo.mimeType}
							</div>
						)}
						<div className="property-item">
							<strong>Binary:</strong> {propertiesInfo.isBinary ? 'Yes' : 'No'}
						</div>
						{propertiesInfo.documentId && (
							<div className="property-item">
								<strong>Linked Document:</strong> Yes (ID:{' '}
								{propertiesInfo.documentId})
							</div>
						)}
						{isTemporaryFile(propertiesInfo.path) && (
							<div className="property-item">
								<strong>Temporary:</strong> Yes (System/Cache file)
							</div>
						)}
					</div>
				</Modal>
			)}

			{showMoveDialog && fileToMove && (
				<Modal
					isOpen={showMoveDialog}
					onClose={onCloseMoveDialog}
					title={`Move ${fileToMove.name}`}
					size="medium"
				>
					<div className="move-dialog-content">
						<p>Select destination folder:</p>

						<div className="directory-tree">
							<div
								className={`directory-option ${selectedTargetPath === '/' ? 'selected' : ''}`}
								onClick={() => onSetSelectedTargetPath('/')}
							>
								<FolderIcon />
								<span>/</span>
							</div>

							{getDirectoryOptions(fileToMove).map((dir) => (
								<div
									key={dir.path}
									className={`directory-option ${selectedTargetPath === dir.path ? 'selected' : ''}`}
									onClick={() => onSetSelectedTargetPath(dir.path)}
								>
									<FolderIcon />
									<span>{dir.path}</span>
									{isTemporaryFile(dir.path) && (
										<span className="temp-indicator" title="Temporary folder">
											<TempFileIcon />
										</span>
									)}
								</div>
							))}
						</div>

						{moveWarning && (
							<div className="warning-message" style={{ marginTop: '1rem' }}>
								{moveWarning}
							</div>
						)}

						<div className="modal-actions">
							<button
								type="button"
								className="button secondary"
								onClick={onCloseMoveDialog}
							>
								Cancel
							</button>
							<button
								type="button"
								className="button primary"
								onClick={onConfirmMove}
								disabled={
									selectedTargetPath === fileToMove.path ||
									(fileToMove.type === 'directory' &&
										selectedTargetPath.startsWith(`${fileToMove.path}/`))
								}
							>
								Move Here
							</button>
						</div>
					</div>
				</Modal>
			)}

			{showDragDropDialog && dragDropFile && (
				<Modal
					isOpen={showDragDropDialog}
					onClose={onCloseDragDropDialog}
					title="Confirm Move"
					size="medium"
				>
					<div className="drag-drop-confirm-content">
						<p>
							Move "{dragDropFile.name}" to{' '}
							{dragDropTargetPath === '/' ? 'root folder' : dragDropTargetPath}?
						</p>

						<div className="move-info">
							<div className="move-source">
								<strong>From:</strong> {dragDropFile.path}
								{isTemporaryFile(dragDropFile.path) && (
									<span className="temp-file-indicator">
										{' '}
										<TempFileIcon /> Temporary
									</span>
								)}
							</div>
							<div className="move-target">
								<strong>To:</strong>{' '}
								{dragDropTargetPath === '/' ? '/' : dragDropTargetPath}
								{isTemporaryFile(dragDropTargetPath) && (
									<span className="temp-file-indicator">
										{' '}
										<TempFileIcon /> Temporary
									</span>
								)}
							</div>
						</div>

						{dragDropWarning && (
							<div className="warning-message">{dragDropWarning}</div>
						)}

						<div className="modal-actions">
							<button
								type="button"
								className="button secondary"
								onClick={onCloseDragDropDialog}
							>
								Cancel
							</button>
							<button
								type="button"
								className="button primary"
								onClick={onConfirmDragDrop}
							>
								Move
							</button>
						</div>
					</div>
				</Modal>
			)}
		</>
	);
};

export default FileOperationsModal;
