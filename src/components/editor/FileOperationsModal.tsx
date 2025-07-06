// src/components/editor/FileOperationsModal.tsx
import type React from "react";

import type { FileNode } from "../../types/files";
import { FolderIcon } from "../common/Icons";
import Modal from "../common/Modal";

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
}) => {
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
							<strong>Binary:</strong> {propertiesInfo.isBinary ? "Yes" : "No"}
						</div>
						{propertiesInfo.documentId && (
							<div className="property-item">
								<strong>Linked Document:</strong> Yes (ID:{" "}
								{propertiesInfo.documentId})
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
								className={`directory-option ${selectedTargetPath === "/" ? "selected" : ""}`}
								onClick={() => onSetSelectedTargetPath("/")}
							>
								<FolderIcon />
								<span>/</span>
							</div>

							{getDirectoryOptions(fileToMove).map((dir) => (
								<div
									key={dir.path}
									className={`directory-option ${selectedTargetPath === dir.path ? "selected" : ""}`}
									onClick={() => onSetSelectedTargetPath(dir.path)}
								>
									<FolderIcon />
									<span>{dir.path}</span>
								</div>
							))}
						</div>

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
									(fileToMove.type === "directory" &&
										selectedTargetPath.startsWith(fileToMove.path + "/"))
								}
							>
								Move Here
							</button>
						</div>
					</div>
				</Modal>
			)}
		</>
	);
};

export default FileOperationsModal;
