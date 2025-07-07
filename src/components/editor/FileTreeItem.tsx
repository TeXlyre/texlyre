// src/components/editor/FileTreeItem.tsx
import type React from "react";

import { pluginRegistry } from "../../plugins/PluginRegistry";
import type { FileNode } from "../../types/files";
import { isTemporaryFile } from "../../utils/fileUtils";
import DropdownPortal from "../common/DropdownPortal";
import {
	CopyIcon,
	DownloadIcon,
	EditIcon,
	FileIcon,
	FilePlusIcon,
	FileTextIcon,
	FolderIcon,
	FolderOpenIcon,
	FolderPlusIcon,
	InfoIcon,
	LinkIcon,
	MoreIcon,
	MoveIcon,
	TrashIcon,
	UnlinkIcon,
} from "../common/Icons";

interface FileTreeItemProps {
	node: FileNode;
	level: number;
	selectedFileId: string | null;
	expandedFolders: Set<string>;
	renamingFileId: string | null;
	renameValue: string;
	activeMenu: string | null;
	dragOverTarget: string | null;
	enableFileSystemDragDrop: boolean;
	enableInternalDragDrop: boolean;
	creatingNewItem: { type: "file" | "directory"; parentPath: string } | null;
	newItemName: string;
	onFileSelect: (node: FileNode) => void;
	onToggleFolder: (folderId: string) => void;
	onStartRename: (node: FileNode) => void;
	onSaveRename: (node: FileNode) => void;
	onCancelRename: () => void;
	onRenameKeyDown: (e: React.KeyboardEvent, node: FileNode) => void;
	onSetRenameValue: (value: string) => void;
	onSetActiveMenu: (id: string | null) => void;
	onLinkToDocument: (fileId: string) => void;
	onUnlinkFromDocument: (fileId: string) => void;
	onMoveFile: (node: FileNode) => void;
	onDuplicateFile: (node: FileNode) => void;
	onCopyPath: (node: FileNode) => void;
	onExportFile: (node: FileNode) => void;
	onShowProperties: (node: FileNode) => void;
	onCreateFileInFolder: (folderId: string, folderPath: string) => void;
	onCreateSubfolder: (parentPath: string) => void;
	onExpandAllSubfolders: (node: FileNode) => void;
	onCollapseAllSubfolders: (node: FileNode) => void;
	onDeleteFileOrDirectory: (fileId: string) => void;
	onDragStart: (e: React.DragEvent, node: FileNode) => void;
	onDropOnDirectory: (e: React.DragEvent, targetNode: FileNode) => void;
	onSetDragOverTarget: (target: string | null) => void;
	onSetNewItemName: (value: string) => void;
	onConfirmNewItem: () => void;
	onCancelNewItem: () => void;
	onNewItemKeyDown: (e: React.KeyboardEvent) => void;
	menuRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
}

const FileTreeItem: React.FC<FileTreeItemProps> = ({
	node,
	level,
	selectedFileId,
	expandedFolders,
	renamingFileId,
	renameValue,
	activeMenu,
	dragOverTarget,
	enableFileSystemDragDrop,
	enableInternalDragDrop,
	creatingNewItem,
	newItemName,
	onFileSelect,
	onToggleFolder,
	onStartRename,
	onSaveRename,
	onCancelRename,
	onRenameKeyDown,
	onSetRenameValue,
	onSetActiveMenu,
	onLinkToDocument,
	onUnlinkFromDocument,
	onMoveFile,
	onDuplicateFile,
	onCopyPath,
	onExportFile,
	onShowProperties,
	onCreateFileInFolder,
	onCreateSubfolder,
	onExpandAllSubfolders,
	onCollapseAllSubfolders,
	onDeleteFileOrDirectory,
	onDragStart,
	onDropOnDirectory,
	onSetDragOverTarget,
	onSetNewItemName,
	onConfirmNewItem,
	onCancelNewItem,
	onNewItemKeyDown,
	menuRefs,
}) => {
	const isExpanded = expandedFolders.has(node.path);
	const hasDocument = !!node.documentId;
	const isDragOver = dragOverTarget === node.id;
	const isRenaming = renamingFileId === node.id;

	const hasCompatibleViewer = (node: FileNode): boolean => {
		if (node.type !== "file" || !node.isBinary) return false;
		return !!pluginRegistry.getViewerForFile(node.name, node.mimeType);
	};

	const hasViewer = hasCompatibleViewer(node);

	const shouldShowLinkButton =
		node.type === "file" &&
		!node.isBinary &&
		!isTemporaryFile(node.name);

	return (
		<div
			key={node.path}
			style={{ marginLeft: `1rem` }}
			draggable={!isRenaming && enableInternalDragDrop}
			onDragStart={(e) => {
				e.stopPropagation();
				onDragStart(e, node);
			}}
		>
			<div
				className={`file-node ${selectedFileId === node.id ? "selected" : ""}
                    ${isDragOver && node.type === "directory" ? "drag-over" : ""}
                    ${hasViewer ? "has-viewer" : ""}`}
				onClick={() =>
					!isRenaming &&
					(node.type === "directory"
						? onToggleFolder(node.path)
						: onFileSelect(node))
				}
				onDragOver={(e) => {
					if (node.type === "directory") {
						const isFileDrop = Array.from(e.dataTransfer.items).some(
							(item) => item.kind === "file",
						);
						const isInternalDrop = e.dataTransfer.getData("text/plain");

						if (
							(isFileDrop && !enableFileSystemDragDrop) ||
							(isInternalDrop && !enableInternalDragDrop)
						) {
							return;
						}

						e.preventDefault();
						e.stopPropagation();
						e.dataTransfer.dropEffect = isFileDrop ? "copy" : "move";
						onSetDragOverTarget(node.id);
					}
				}}
				onDragLeave={(e) => {
					e.stopPropagation();
					onSetDragOverTarget(null);
				}}
				onDrop={(e) => {
					if (node.type === "directory") {
						e.stopPropagation();
						onDropOnDirectory(e, node);
						onSetDragOverTarget(null);
					}
				}}
			>
				<span className="file-icon">
					{node.type === "directory" ? (
						<FolderIcon isOpen={isExpanded} />
					) : node.isBinary ? (
						<FileIcon />
					) : hasDocument ? (
						<FileTextIcon />
					) : (
						<FileIcon />
					)}
				</span>

				{isRenaming ? (
					<div className="file-name-input-container">
						<input
							type="text"
							value={renameValue}
							onChange={(e) => onSetRenameValue(e.target.value)}
							onBlur={() => onSaveRename(node)}
							onKeyDown={(e) => onRenameKeyDown(e, node)}
							onClick={(e) => e.stopPropagation()}
							className="file-name-input"
							autoFocus
						/>
						<button
							className="cancel-input-button"
							onClick={(e) => {
								e.stopPropagation();
								onCancelRename();
							}}
							title="Cancel"
						>
							×
						</button>
					</div>
				) : (
					<span className="file-name">
						{node.name}
						{node.isBinary && <span className="file-binary-indicator">•</span>}
						{hasViewer && (
							<span className="file-viewer-indicator" title="Has viewer plugin">
								👁️
							</span>
						)}
					</span>
				)}

				<div className="file-actions">
					{shouldShowLinkButton &&
						(!hasDocument ? (
							<button
								className="action-btn"
								title="Link Document"
								onClick={(e) => {
									e.stopPropagation();
									onLinkToDocument(node.id);
								}}
							>
								<LinkIcon />
							</button>
						) : (
							<button
								className="action-btn"
								title="Unlink Document"
								onClick={(e) => {
									e.stopPropagation();
									onUnlinkFromDocument(node.id);
								}}
							>
								<UnlinkIcon />
							</button>
						))}

					<div
						className="action-menu"
						ref={(el) => {
							if (el) {
								menuRefs.current.set(node.id, el);
							} else {
								menuRefs.current.delete(node.id);
							}
						}}
					>
						<button
							className="action-btn menu-trigger"
							title="Options"
							onClick={(e) => {
								e.stopPropagation();
								onSetActiveMenu(activeMenu === node.id ? null : node.id);
							}}
						>
							<MoreIcon />
						</button>
						<DropdownPortal
							targetRef={
								menuRefs.current.get(node.id)
									? { current: menuRefs.current.get(node.id)! }
									: { current: null }
							}
							isOpen={activeMenu === node.id}
							onClose={() => onSetActiveMenu(null)}
						>
							<button
								className="dropdown-item"
								onClick={() => onStartRename(node)}
							>
								<EditIcon />
								<span>Rename</span>
							</button>

							{enableInternalDragDrop && (
								<button
									className="dropdown-item"
									onClick={() => onMoveFile(node)}
								>
									<MoveIcon />
									<span>Move</span>
								</button>
							)}

							{node.type === "file" && (
								<button
									className="dropdown-item"
									onClick={() => onDuplicateFile(node)}
								>
									<CopyIcon />
									<span>Duplicate</span>
								</button>
							)}

							{node.type === "directory" && (
								<>
									<button
										className="dropdown-item"
										onClick={() => onCreateFileInFolder(node.id, node.path)}
									>
										<FilePlusIcon />
										<span>New File</span>
									</button>

									<button
										className="dropdown-item"
										onClick={() => onCreateSubfolder(node.path)}
									>
										<FolderPlusIcon />
										<span>New Folder</span>
									</button>

									<button
										className="dropdown-item"
										onClick={() => onExpandAllSubfolders(node)}
									>
										<FolderOpenIcon />
										<span>Expand All</span>
									</button>

									<button
										className="dropdown-item"
										onClick={() => onCollapseAllSubfolders(node)}
									>
										<FolderIcon />
										<span>Collapse All</span>
									</button>
								</>
							)}

							<button
								className="dropdown-item"
								onClick={() => onCopyPath(node)}
							>
								<CopyIcon />
								<span>Copy Path</span>
							</button>

							{node.type === "file" && (
								<button
									className="dropdown-item"
									onClick={() => onExportFile(node)}
								>
									<DownloadIcon />
									<span>Download</span>
								</button>
							)}

							<button
								className="dropdown-item"
								onClick={() => onShowProperties(node)}
							>
								<InfoIcon />
								<span>Properties</span>
							</button>

							<button
								className="dropdown-item"
								onClick={() => onDeleteFileOrDirectory(node.id)}
							>
								<TrashIcon />
								<span>Delete</span>
							</button>
						</DropdownPortal>
					</div>
				</div>
			</div>

			{node.type === "directory" && isExpanded && (
				<div className="directory-children">
					{creatingNewItem && creatingNewItem.parentPath === node.path && (
						<div
							className="file-node creating-new-item"
							style={{ marginLeft: "1rem" }}
						>
							<span className="file-icon">
								{creatingNewItem.type === "directory" ? (
									<FolderPlusIcon />
								) : (
									<FilePlusIcon />
								)}
							</span>
							<div className="file-name-input-container">
								<input
									type="text"
									value={newItemName}
									onChange={(e) => onSetNewItemName(e.target.value)}
									onBlur={onConfirmNewItem}
									onKeyDown={onNewItemKeyDown}
									className="file-name-input"
									autoFocus
								/>
								<button
									className="cancel-input-button"
									onClick={onCancelNewItem}
									title="Cancel"
								>
									×
								</button>
							</div>
						</div>
					)}

					{node.children &&
						node.children.map((child) => (
							<FileTreeItem
								key={child.path}
								node={child}
								level={level + 1}
								selectedFileId={selectedFileId}
								expandedFolders={expandedFolders}
								renamingFileId={renamingFileId}
								renameValue={renameValue}
								activeMenu={activeMenu}
								dragOverTarget={dragOverTarget}
								enableFileSystemDragDrop={enableFileSystemDragDrop}
								enableInternalDragDrop={enableInternalDragDrop}
								creatingNewItem={creatingNewItem}
								newItemName={newItemName}
								onFileSelect={onFileSelect}
								onToggleFolder={onToggleFolder}
								onStartRename={onStartRename}
								onSaveRename={onSaveRename}
								onCancelRename={onCancelRename}
								onRenameKeyDown={onRenameKeyDown}
								onSetRenameValue={onSetRenameValue}
								onSetActiveMenu={onSetActiveMenu}
								onLinkToDocument={onLinkToDocument}
								onUnlinkFromDocument={onUnlinkFromDocument}
								onMoveFile={onMoveFile}
								onDuplicateFile={onDuplicateFile}
								onCopyPath={onCopyPath}
								onExportFile={onExportFile}
								onShowProperties={onShowProperties}
								onCreateFileInFolder={onCreateFileInFolder}
								onCreateSubfolder={onCreateSubfolder}
								onExpandAllSubfolders={onExpandAllSubfolders}
								onCollapseAllSubfolders={onCollapseAllSubfolders}
								onDeleteFileOrDirectory={onDeleteFileOrDirectory}
								onDragStart={onDragStart}
								onDropOnDirectory={onDropOnDirectory}
								onSetDragOverTarget={onSetDragOverTarget}
								onSetNewItemName={onSetNewItemName}
								onConfirmNewItem={onConfirmNewItem}
								onCancelNewItem={onCancelNewItem}
								onNewItemKeyDown={onNewItemKeyDown}
								menuRefs={menuRefs}
							/>
						))}
				</div>
			)}
		</div>
	);
};

export default FileTreeItem;