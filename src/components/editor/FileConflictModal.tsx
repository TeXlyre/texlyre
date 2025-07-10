// src/components/editor/FileConflictModal.tsx
import type React from "react";
import { useEffect, useState } from "react";

import {
	type BatchConflictResolution,
	type BatchDeleteConfirmation,
	type BatchUnlinkConfirmation,
	type ConflictResolution,
	type DeleteConfirmation,
	type LinkConfirmation,
	type LinkedFileConfirmation,
	type UnlinkConfirmation,
	fileConflictService,
} from "../../services/FileConflictService";
import type { FileNode } from "../../types/files";
import { formatDate } from "../../utils/dateUtils";
import { isTemporaryFile } from "../../utils/fileUtils";
import Modal from "../common/Modal";
import {TempFileIcon} from "../common/Icons.tsx";

const FileConflictModal: React.FC = () => {
	const [isOpen, setIsOpen] = useState(false);
	const [conflictType, setConflictType] = useState<
		| "conflict"
		| "delete"
		| "link"
		| "unlink"
		| "linked-file-action"
		| "batch-conflict"
		| "batch-delete"
		| "batch-unlink"
	>("conflict");
	const [existingFile, setExistingFile] = useState<FileNode | null>(null);
	const [newFile, setNewFile] = useState<FileNode | null>(null);
	const [files, setFiles] = useState<FileNode[] | null>(null);
	const [action, setAction] = useState<
		"rename" | "delete" | "overwrite" | undefined
	>(undefined);
	const [conflictCount, setConflictCount] = useState<number>(0);
	const [currentIndex, setCurrentIndex] = useState<number>(0);
	const [resolveCallback, setResolveCallback] = useState<
		| ((
				resolution:
					| ConflictResolution
					| DeleteConfirmation
					| LinkConfirmation
					| UnlinkConfirmation
					| LinkedFileConfirmation
					| BatchConflictResolution
					| BatchDeleteConfirmation
					| BatchUnlinkConfirmation,
		  ) => void)
		| null
	>(null);
	const [rejectCallback, setRejectCallback] = useState<(() => void) | null>(
		null,
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
			| ConflictResolution
			| DeleteConfirmation
			| LinkConfirmation
			| UnlinkConfirmation
			| LinkedFileConfirmation
			| BatchConflictResolution
			| BatchDeleteConfirmation
			| BatchUnlinkConfirmation,
	) => {
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
		if (conflictType === "delete" && existingFile && isTemporaryFile(existingFile.path)) {
			return "Deleting temporary files may break caching or cause system issues.";
		}

		if (conflictType === "link" && existingFile && isTemporaryFile(existingFile.path)) {
			return "Linking temporary files is not recommended as they won't sync with collaborators.";
		}

		if (conflictType === "unlink" && existingFile && isTemporaryFile(existingFile.path)) {
			return "Unlinking temporary files may affect system functionality.";
		}

		if (conflictType === "batch-delete" && files) {
			const hasTemporaryFiles = files.some(file => isTemporaryFile(file.path));
			if (hasTemporaryFiles) {
				return "Some files are temporary - deleting them may break caching or cause system issues.";
			}
		}

		if (conflictType === "batch-unlink" && files) {
			const hasTemporaryFiles = files.some(file => isTemporaryFile(file.path));
			if (hasTemporaryFiles) {
				return "Some temporary files are included - unlinking them may affect system functionality.";
			}
		}

		if (conflictType === "batch-conflict" && (existingFile || newFile)) {
			const isExistingTemporary = existingFile && isTemporaryFile(existingFile.path);
			const isNewTemporary = newFile && isTemporaryFile(newFile.path);
			if (isExistingTemporary || isNewTemporary) {
				return "Temporary files are involved - operations may affect system stability.";
			}
		}

		if (conflictType === "linked-file-action" && existingFile && isTemporaryFile(existingFile.path)) {
			return "This operation involves temporary files which may affect system functionality.";
		}

		return null;
	};

	const formatFileSize = (size?: number): string => {
		if (!size) return "Unknown size";
		if (size < 1024) return `${size} bytes`;
		if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
		return `${(size / (1024 * 1024)).toFixed(1)} MB`;
	};

	const operationWarning = getOperationWarning();

	if (conflictType === "batch-conflict" && existingFile && newFile) {
		return (
			<Modal
				isOpen={isOpen}
				onClose={handleClose}
				title={`File Conflicts (${currentIndex} of ${conflictCount})`}
				size="medium"
			>
				<div className="file-conflict-content">
					<p>
						Multiple files already exist at their target locations. Choose how
						to handle conflicts:
					</p>

					<div className="file-comparison">
						<div className="file-info existing">
							<h4>Existing File</h4>
							<div className="file-details">
								<strong>{existingFile.name}</strong>
								<span>Size: {formatFileSize(existingFile.size)}</span>
								<span>Modified: {formatDate(existingFile.lastModified)}</span>
								{isTemporaryFile(existingFile.path) && (
									<span className="temp-file-indicator"><TempFileIcon/> Temporary file</span>
								)}
							</div>
						</div>

						<div className="file-info new">
							<h4>New File</h4>
							<div className="file-details">
								<strong>{newFile.name}</strong>
								<span>Size: {formatFileSize(newFile.size)}</span>
								<span>Modified: {formatDate(newFile.lastModified)}</span>
								{isTemporaryFile(newFile.path) && (
									<span className="temp-file-indicator"><TempFileIcon/> Temporary file</span>
								)}
							</div>
						</div>
					</div>

					{operationWarning && (
						<div className="warning-message">
							{operationWarning}
						</div>
					)}

					<div className="modal-actions">
						<div className="single-actions">
							<button
								type="button"
								className="button secondary"
								onClick={handleClose}
							>
								Cancel
							</button>
							<button
								type="button"
								className="button secondary"
								onClick={() => handleResolution("keep-both")}
							>
								Keep Both
							</button>
							<button
								type="button"
								className="button primary"
								onClick={() => handleResolution("overwrite")}
							>
								Replace This
							</button>
						</div>
					</div>
					<div className="batch-conflict-info">
						<p>
							<strong>Current conflict:</strong> {existingFile.name}
						</p>
						<p>
							<strong>Remaining conflicts:</strong>{" "}
							{conflictCount - currentIndex}
						</p>
					</div>

					<div className="modal-actions">
						<p> Apply to all {conflictCount} conflicts: </p>
						<div className="batch-actions">
							<div style={{ display: "flex", gap: "0.5rem" }}>
								<button
									type="button"
									className="button secondary small"
									onClick={() => handleResolution("cancel-all")}
								>
									Cancel All
								</button>
								<button
									type="button"
									className="button secondary small"
									onClick={() => handleResolution("keep-both-all")}
								>
									Keep Both (All)
								</button>
								<button
									type="button"
									className="button primary small"
									onClick={() => handleResolution("overwrite-all")}
								>
									Replace All
								</button>
							</div>
						</div>
					</div>
				</div>
			</Modal>
		);
	}

	if (conflictType === "batch-delete" && files) {
		return (
			<Modal
				isOpen={isOpen}
				onClose={handleClose}
				title="Confirm Deletion"
				size="medium"
			>
				<div className="file-conflict-content">
					<p>
						Are you sure you want to delete {files.length} file
						{files.length > 1 ? "s" : ""}?
					</p>

					<div className="batch-files-list">
						{files.slice(0, 10).map((file) => (
							<div key={file.id} className="batch-file-item">
								<strong>{file.name}</strong>
								<div className="batch-file-meta">
									{file.path} • {formatFileSize(file.size)}
									{isTemporaryFile(file.path) && (
										<span className="temp-file-indicator"> • <TempFileIcon/> Temporary</span>
									)}
								</div>
							</div>
						))}
						{files.length > 10 && (
							<div className="batch-files-overflow">
								... and {files.length - 10} more files
							</div>
						)}
					</div>

					{operationWarning && (
						<div className="warning-message">
							{operationWarning}
						</div>
					)}

					<div className="warning-message">This action cannot be undone.</div>

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
							className="button danger"
							onClick={() => handleResolution("confirm")}
						>
							Delete {files.length} Files
						</button>
					</div>
				</div>
			</Modal>
		);
	}

	if (conflictType === "batch-unlink" && files) {
		const linkedFiles = files.filter((f) => f.documentId);

		return (
			<Modal
				isOpen={isOpen}
				onClose={handleClose}
				title="Confirm Batch Unlink"
				size="medium"
			>
				<div className="file-conflict-content">
					<p>
						Are you sure you want to unlink {linkedFiles.length} files from
						their documents?
					</p>

					<div className="batch-files-list">
						{linkedFiles.slice(0, 10).map((file) => (
							<div key={file.id} className="batch-file-item">
								<strong>{file.name}</strong>
								<div className="batch-file-meta">
									{file.path} • Linked to: {file.documentId}
									{isTemporaryFile(file.path) && (
										<span className="temp-file-indicator"> • <TempFileIcon/> Temporary</span>
									)}
								</div>
							</div>
						))}
						{linkedFiles.length > 10 && (
							<div className="batch-files-overflow">
								... and {linkedFiles.length - 10} more files
							</div>
						)}
					</div>

					{operationWarning && (
						<div className="warning-message">
							{operationWarning}
						</div>
					)}

					<div className="warning-message">
						Note: The page will refresh after unlinking and any unsaved changes
						may be lost.
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
							className="button primary"
							onClick={() => handleResolution("confirm")}
						>
							Unlink {linkedFiles.length} Files
						</button>
					</div>
				</div>
			</Modal>
		);
	}

	if (conflictType === "delete" && existingFile) {
		return (
			<Modal
				isOpen={isOpen}
				onClose={handleClose}
				title="Confirm File Deletion"
				size="small"
			>
				<div className="file-conflict-content">
					<p>Are you sure you want to delete this file?</p>

					<div className="file-info">
						<div className="file-details">
							<strong>{existingFile.name}</strong>
							<div className="file-meta">
								<span>Path: {existingFile.path}</span>
								<span>Size: {formatFileSize(existingFile.size)}</span>
								<span>Modified: {formatDate(existingFile.lastModified)}</span>
								{isTemporaryFile(existingFile.path) && (
									<span className="temp-file-indicator"><TempFileIcon/> Temporary file</span>
								)}
							</div>
						</div>
					</div>

					{operationWarning && (
						<div className="warning-message">
							{operationWarning}
						</div>
					)}

					<div className="warning-message">This action cannot be undone.</div>

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
							className="button danger"
							onClick={() => handleResolution("confirm")}
						>
							Delete File
						</button>
					</div>
				</div>
			</Modal>
		);
	}

	if (conflictType === "link" && existingFile) {
		return (
			<Modal
				isOpen={isOpen}
				onClose={handleClose}
				title="Link File to Document"
				size="medium"
			>
				<div className="file-conflict-content">
					<p>
						Linking "{existingFile.name}" will create a collaborative document
						that syncs with this file.
					</p>

					<div className="file-info">
						<div className="file-details">
							<strong>{existingFile.name}</strong>
							<div className="file-meta">
								<span>Path: {existingFile.path}</span>
								<span>Size: {formatFileSize(existingFile.size)}</span>
								<span>Modified: {formatDate(existingFile.lastModified)}</span>
								{isTemporaryFile(existingFile.path) && (
									<span className="temp-file-indicator"><TempFileIcon/> Temporary file</span>
								)}
							</div>
						</div>
					</div>

					{operationWarning && (
						<div className="warning-message">
							{operationWarning}
						</div>
					)}

					<div className="warning-message">
						Note: The page will refresh after linking and any unsaved changes
						may be lost.
						<p className="footnote">
							* Selecting "Link Only" will discard any existing content in the
							document.
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
							className="button secondary"
							onClick={() => handleResolution("link-without-copy")}
						>
							Link Only
						</button>
						<button
							type="button"
							className="button primary"
							onClick={() => handleResolution("link-with-copy")}
						>
							Link & Copy Content
						</button>
					</div>
				</div>
			</Modal>
		);
	}

	if (conflictType === "unlink" && existingFile) {
		return (
			<Modal
				isOpen={isOpen}
				onClose={handleClose}
				title="Unlink File from Document"
				size="medium"
			>
				<div className="file-conflict-content">
					<p>
						Unlinking "{existingFile.name}" will remove the connection between
						this file and its collaborative document.
					</p>

					<div className="file-info">
						<div className="file-details">
							<strong>{existingFile.name}</strong>
							<div className="file-meta">
								<span>Path: {existingFile.path}</span>
								<span>Size: {formatFileSize(existingFile.size)}</span>
								<span>Modified: {formatDate(existingFile.lastModified)}</span>
								{isTemporaryFile(existingFile.path) && (
									<span className="temp-file-indicator"><TempFileIcon/> Temporary file</span>
								)}
							</div>
						</div>
					</div>

					{operationWarning && (
						<div className="warning-message">
							{operationWarning}
						</div>
					)}

					<div className="warning-message">
						Note: The page will refresh after unlinking and any unsaved changes
						may be lost.
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
							className="button primary"
							onClick={() => handleResolution("confirm")}
						>
							Unlink File
						</button>
					</div>
				</div>
			</Modal>
		);
	}

	if (conflictType === "linked-file-action" && existingFile && action) {
		const actionText =
			action === "rename"
				? "rename"
				: action === "delete"
					? "delete"
					: "overwrite";
		const actionCapitalized =
			actionText.charAt(0).toUpperCase() + actionText.slice(1);
		const actionVerb =
			actionText === "delete"
				? "delete"
				: actionText === "overwrite"
					? "overwrite"
					: "rename";
		const actionMessage =
			actionText === "delete"
				? "Cannot delete"
				: actionText === "overwrite"
					? "Cannot overwrite"
					: "Cannot rename";

		return (
			<Modal
				isOpen={isOpen}
				onClose={handleClose}
				title={`${actionCapitalized} Linked File`}
				size="medium"
			>
				<div className="file-conflict-content">
					<p>
						{actionMessage} "{existingFile.name}" because it is linked to a
						collaborative document.
					</p>

					<div className="file-info">
						<div className="file-details">
							<strong>{existingFile.name}</strong>
							<div className="file-meta">
								<span>Path: {existingFile.path}</span>
								<span>Size: {formatFileSize(existingFile.size)}</span>
								<span>Modified: {formatDate(existingFile.lastModified)}</span>
								<span>Linked to document: Yes</span>
								{isTemporaryFile(existingFile.path) && (
									<span className="temp-file-indicator"><TempFileIcon/> Temporary file</span>
								)}
							</div>
						</div>
					</div>

					{operationWarning && (
						<div className="warning-message">
							{operationWarning}
						</div>
					)}

					<div className="warning-message">
						To {actionVerb} this file, you must first unlink it from its
						document. After unlinking, you can try the {actionVerb} operation
						again.
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
							className="button primary"
							onClick={() => handleResolution("show-unlink-dialog")}
						>
							Unlink File
						</button>
					</div>
				</div>
			</Modal>
		);
	}

	if (conflictType === "conflict" && existingFile && newFile) {
		return (
			<Modal
				isOpen={isOpen}
				onClose={handleClose}
				title="File Already Exists"
				size="medium"
			>
				<div className="file-conflict-content">
					<p>
						A file with the name "{existingFile.name}" already exists at this
						location.
					</p>

					<div className="file-comparison">
						<div className="file-info existing">
							<h4>Existing File</h4>
							<div className="file-details">
								<span>Size: {formatFileSize(existingFile.size)}</span>
								<span>Modified: {formatDate(existingFile.lastModified)}</span>
								{isTemporaryFile(existingFile.path) && (
									<span className="temp-file-indicator"><TempFileIcon/> Temporary file</span>
								)}
							</div>
						</div>

						<div className="file-info new">
							<h4>New File</h4>
							<div className="file-details">
								<span>Size: {formatFileSize(newFile.size)}</span>
								<span>Modified: {formatDate(newFile.lastModified)}</span>
								{isTemporaryFile(newFile.path) && (
									<span className="temp-file-indicator"><TempFileIcon/> Temporary file</span>
								)}
							</div>
						</div>
					</div>

					{operationWarning && (
						<div className="warning-message">
							{operationWarning}
						</div>
					)}

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
							className="button secondary"
							onClick={() => handleResolution("keep-both")}
						>
							Keep Both
						</button>
						<button
							type="button"
							className="button primary"
							onClick={() => handleResolution("overwrite")}
						>
							Replace
						</button>
					</div>
				</div>
			</Modal>
		);
	}

	return null;
};

export default FileConflictModal;