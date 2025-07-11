// src/components/editor/FileExplorer.tsx
import type React from "react";
import { type DragEvent, useEffect, useRef, useState } from "react";

import { useFileTree } from "../../hooks/useFileTree";
import type { FileNode } from "../../types/files";
import { buildUrlWithFragments, parseUrlFragments } from "../../types/yjs";
import { fileCommentProcessor } from "../../utils/fileCommentProcessor.ts";
import { createZipFromFolder, downloadZipFile } from "../../utils/zipUtils";
import {
	ExportIcon,
	FilePlusIcon,
	FolderPlusIcon,
	ImportIcon,
	UploadIcon,
} from "../common/Icons.tsx";
import FileOperationsModal from "./FileOperationsModal";
import FileTreeItem from "./FileTreeItem";
import ZipHandlingModal from "./ZipHandlingModal";

interface FileExplorerProps {
	onFileSelect: (
		fileId: string,
		content: string | ArrayBuffer,
		isBinary?: boolean,
	) => void;
	onCreateDocument: (name: string) => string;
	documents: Array<{ id: number; name: string }>;
	initialSelectedFile?: string;
	initialExpandedPaths?: string[];
	currentProjectId?: string | null;
	onExportCurrentProject?: (projectId: string) => void;
}

interface FilePropertiesInfo {
	name: string;
	path: string;
	type: string;
	size?: number;
	mimeType?: string;
	isBinary: boolean;
	documentId?: string;
}

const FileExplorer: React.FC<FileExplorerProps> = ({
	onFileSelect,
	onCreateDocument,
	documents,
	initialSelectedFile,
	initialExpandedPaths,
	currentProjectId,
	onExportCurrentProject,
}) => {
	const {
		fileTree,
		selectedFileId,
		isLoading,
		selectFile,
		uploadFiles,
		createDirectory,
		deleteFileOrDirectory,
		linkFileToDocument,
		unlinkFileFromDocument,
		getFileContent,
		getFile,
		renameFile,
		extractZipFile,
		storeZipFile,
		enableFileSystemDragDrop,
		enableInternalDragDrop,
		refreshFileTree,
	} = useFileTree();

	const [currentPath, _setCurrentPath] = useState("/");
	const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
		new Set(["/"]),
	);
	const dropRef = useRef<HTMLDivElement>(null);
	const [isDragging, setIsDragging] = useState(false);
	const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
	const [showDragDropDialog, setShowDragDropDialog] = useState(false);
	const [dragDropFile, setDragDropFile] = useState<FileNode | null>(null);
	const [dragDropTargetPath, setDragDropTargetPath] = useState<string>("");
	const [pendingDragDropOperation, setPendingDragDropOperation] = useState<
		(() => Promise<void>) | null
	>(null);

	const [activeMenu, setActiveMenu] = useState<string | null>(null);
	const menuRefs = useRef<Map<string, HTMLDivElement>>(new Map());

	const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
	const [renameValue, setRenameValue] = useState("");
	const [showPropertiesModal, setShowPropertiesModal] = useState(false);
	const [propertiesInfo, setPropertiesInfo] =
		useState<FilePropertiesInfo | null>(null);

	const [showMoveDialog, setShowMoveDialog] = useState(false);
	const [fileToMove, setFileToMove] = useState<FileNode | null>(null);
	const [selectedTargetPath, setSelectedTargetPath] = useState<string>("/");

	const [showZipModal, setShowZipModal] = useState(false);
	const [pendingZipFile, setPendingZipFile] = useState<File | null>(null);
	const [zipTargetPath, setZipTargetPath] = useState<string>("/");

	const [hasProcessedInitialFile, setHasProcessedInitialFile] = useState(false);

	const [creatingNewItem, setCreatingNewItem] = useState<{
		type: "file" | "directory";
		parentPath: string;
	} | null>(null);
	const [newItemName, setNewItemName] = useState("");

	useEffect(() => {
		if (
			initialSelectedFile &&
			initialExpandedPaths &&
			!hasProcessedInitialFile
		) {
			const newExpandedFolders = new Set(expandedFolders);
			initialExpandedPaths.forEach((path) => newExpandedFolders.add(path));
			setExpandedFolders(newExpandedFolders);

			selectFile(initialSelectedFile);
			setHasProcessedInitialFile(true);
		}
	}, [initialSelectedFile, initialExpandedPaths, hasProcessedInitialFile]);

	const processFiles = async (files: File[], targetPath: string) => {
		const zipFiles = files.filter((file) =>
			file.name.toLowerCase().endsWith(".zip"),
		);
		const regularFiles = files.filter(
			(file) => !file.name.toLowerCase().endsWith(".zip"),
		);

		if (regularFiles.length > 0) {
			await uploadFiles(regularFiles, targetPath);
		}

		for (const zipFile of zipFiles) {
			await handleZipFile(zipFile, targetPath);
		}
	};

	const handleZipFile = async (
		zipFile: File,
		targetPath: string,
	): Promise<void> => {
		return new Promise<void>((resolve) => {
			setPendingZipFile(zipFile);
			setZipTargetPath(targetPath);
			setShowZipModal(true);

			(window as any).tempZipModalResolve = resolve;
		});
	};

	const handleExtractZip = async () => {
		if (pendingZipFile) {
			try {
				await extractZipFile(pendingZipFile, zipTargetPath);
			} catch (error) {
				console.error("Error extracting ZIP:", error);
			}
		}
		handleZipModalClose();
	};

	const handleKeepZip = async () => {
		if (pendingZipFile) {
			try {
				await storeZipFile(pendingZipFile, zipTargetPath);
			} catch (error) {
				console.error("Error storing ZIP:", error);
			}
		}
		handleZipModalClose();
	};

	const handleZipModalClose = () => {
		setShowZipModal(false);
		setPendingZipFile(null);

		if ((window as any).tempZipModalResolve) {
			(window as any).tempZipModalResolve();
			delete (window as any).tempZipModalResolve;
		}
	};

	const handleFileUpload = async (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const files = event.target.files;
		if (files && files.length > 0) {
			await processFiles(Array.from(files), currentPath);
			event.target.value = "";
		}
	};

	const handleExportCurrentProject = () => {
		if (onExportCurrentProject && currentProjectId) {
			onExportCurrentProject(currentProjectId);
		}
	};

	const handleStartCreateDirectory = (parentPath = "/") => {
		setCreatingNewItem({ type: "directory", parentPath });
		setNewItemName("new_folder");
		setActiveMenu(null);
	};

	const handleStartCreateFile = (parentPath = "/") => {
		setCreatingNewItem({ type: "file", parentPath });
		setNewItemName("new_file.tex");
		setActiveMenu(null);
	};

	const expandAllParentDirectories = (dirPath: string) => {
		const newExpandedFolders = new Set(expandedFolders);

		// Split the path and build all parent paths
		const pathSegments = dirPath.split("/").filter((segment) => segment);
		let currentPath = "";

		for (const segment of pathSegments) {
			currentPath =
				currentPath === "" ? `/${segment}` : `${currentPath}/${segment}`;
			newExpandedFolders.add(currentPath);
		}

		// Always ensure root is expanded
		newExpandedFolders.add("/");

		setExpandedFolders(newExpandedFolders);
	};

	const handleConfirmNewItem = async () => {
		if (!creatingNewItem || !newItemName.trim()) return;

		try {
			if (creatingNewItem.type === "directory") {
				await createDirectory(newItemName.trim(), creatingNewItem.parentPath);

				// Expand all parent directories including the newly created one
				const newDirPath =
					creatingNewItem.parentPath === "/"
						? `/${newItemName.trim()}`
						: `${creatingNewItem.parentPath}/${newItemName.trim()}`;

				expandAllParentDirectories(newDirPath);
			} else {
				const file = new File([""], newItemName.trim(), { type: "text/plain" });
				await uploadFiles([file], creatingNewItem.parentPath);

				// Expand all parent directories first
				expandAllParentDirectories(creatingNewItem.parentPath);

				const newFilePath =
					creatingNewItem.parentPath === "/"
						? `/${newItemName.trim()}`
						: `${creatingNewItem.parentPath}/${newItemName.trim()}`;

				// Use refreshFileTree to ensure we have the latest state
				const updatedFileTree = await refreshFileTree();

				// Find the file in the refreshed file tree
				const findFileByPath = (
					nodes: FileNode[],
					path: string,
				): FileNode | null => {
					for (const node of nodes) {
						if (node.path === path && node.type === "file") {
							return node;
						}
						if (node.children) {
							const found = findFileByPath(node.children, path);
							if (found) return found;
						}
					}
					return null;
				};

				const newFile = findFileByPath(updatedFileTree, newFilePath);

				if (newFile) {
					selectFile(newFile.id);
					const content = await getFileContent(newFile.id);
					if (content) {
						onFileSelect(newFile.id, content, newFile.isBinary || false);

						// Update URL hash
						const currentFragment = parseUrlFragments(
							window.location.hash.substring(1),
						);
						const newUrl = buildUrlWithFragments(
							currentFragment.yjsUrl,
							undefined,
							newFile.path,
						);
						window.location.hash = newUrl;
					}
				} else {
					console.warn("Could not find newly created file:", newFilePath);
				}
			}
		} catch (error) {
			console.error(`Error creating ${creatingNewItem.type}:`, error);
		}

		setCreatingNewItem(null);
		setNewItemName("");
	};

	const handleCancelNewItem = () => {
		setCreatingNewItem(null);
		setNewItemName("");
	};

	const handleNewItemKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			handleConfirmNewItem();
		} else if (e.key === "Escape") {
			handleCancelNewItem();
		}
	};

	const handleFileSelect = async (node: FileNode) => {
		if (node.type === "file") {
			selectFile(node.id);
			const content = await getFileContent(node.id);
			if (content) {
				onFileSelect(node.id, content, node.isBinary);

				const currentFragment = parseUrlFragments(
					window.location.hash.substring(1),
				);
				const newUrl = buildUrlWithFragments(
					currentFragment.yjsUrl,
					undefined,
					node.path,
				);
				window.location.hash = newUrl;
			}
		}
	};

	const toggleFolder = (folderId: string) => {
		const newExpandedFolders = new Set(expandedFolders);
		if (newExpandedFolders.has(folderId)) {
			newExpandedFolders.delete(folderId);
		} else {
			newExpandedFolders.add(folderId);
		}
		setExpandedFolders(newExpandedFolders);
	};

	const handleStartRename = (node: FileNode) => {
		setRenamingFileId(node.id);
		setRenameValue(node.name);
		setActiveMenu(null);
	};

	const handleSaveRename = async (node: FileNode) => {
		if (renamingFileId) {
			try {
				const parentPath = node.path.substring(0, node.path.lastIndexOf("/"));
				const newFullPath =
					parentPath === ""
						? `/${renameValue.trim()}`
						: `${parentPath}/${renameValue.trim()}`;

				if (node.path === newFullPath) {
					setRenamingFileId(null);
					setRenameValue("");
					return;
				}

				await renameFile(node.id, newFullPath);
			} catch (error) {
				if (error instanceof Error) {
					if (error.message === "File operation cancelled by user") {
					} else if (
						error.message === "File unlinked. Please try rename again."
					) {
						return;
					} else {
						console.error("Error renaming file:", error);
					}
				}
			}
		}
		setRenamingFileId(null);
		setRenameValue("");
	};

	const handleCancelRename = () => {
		setRenamingFileId(null);
		setRenameValue("");
	};

	const handleRenameKeyDown = (e: React.KeyboardEvent, node: FileNode) => {
		if (e.key === "Enter") {
			handleSaveRename(node);
		} else if (e.key === "Escape") {
			handleCancelRename();
		}
	};

	const handleMoveFile = (node: FileNode) => {
		setFileToMove(node);
		setSelectedTargetPath("/");
		setShowMoveDialog(true);
		setActiveMenu(null);
	};

	const handleConfirmMove = async () => {
		if (fileToMove && selectedTargetPath !== fileToMove.path) {
			try {
				const newFullPath =
					selectedTargetPath === "/"
						? `/${fileToMove.name}`
						: `${selectedTargetPath}/${fileToMove.name}`;

				if (fileToMove.path === newFullPath) {
					setShowMoveDialog(false);
					setFileToMove(null);
					return;
				}

				await renameFile(fileToMove.id, newFullPath);
				setShowMoveDialog(false);
				setFileToMove(null);
			} catch (error) {
				console.error("Error moving file:", error);
			}
		}
	};

	const handleDuplicateFile = async (node: FileNode) => {
		if (node.type === "file") {
			const content = await getFileContent(node.id);
			if (content) {
				const nameWithoutExt = node.name.replace(/\.[^/.]+$/, "");
				const extension = node.name.includes(".")
					? `.${node.name.split(".").pop()}`
					: "";
				const duplicateName = `${nameWithoutExt}_copy${extension}`;

				const parentPath = node.path.substring(0, node.path.lastIndexOf("/"));

				const file = new File([content], duplicateName, {
					type: node.mimeType || "text/plain",
				});
				await uploadFiles([file], parentPath || "/");
			}
		}
		setActiveMenu(null);
	};

	const handleCopyPath = (node: FileNode) => {
		const currentFragment = parseUrlFragments(
			window.location.hash.substring(1),
		);
		const newUrl = buildUrlWithFragments(
			currentFragment.yjsUrl,
			undefined,
			node.path,
		);
		const fullUrl = `${window.location.origin}${window.location.pathname}#${newUrl}`;
		navigator.clipboard.writeText(fullUrl);
		setActiveMenu(null);
	};

	const handleExportFile = async (node: FileNode) => {
		if (node.type === "file") {
			const content = await getFileContent(node.id);
			if (content) {
				const cleanContent = fileCommentProcessor.cleanContent(content);
				const blob = new Blob([cleanContent], {
					type: node.mimeType || "text/plain",
				});
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = node.name;
				document.body.appendChild(a);
				a.click();
				document.body.removeChild(a);
				URL.revokeObjectURL(url);
			}
		}
		setActiveMenu(null);
	};

	const handleExportFolder = async (node: FileNode) => {
		if (node.type === "directory") {
			try {
				const zipBlob = await createZipFromFolder(
					node,
					getFileContent,
					getFile,
				);
				downloadZipFile(zipBlob, node.name);
			} catch (error) {
				console.error("Error exporting folder:", error);
			}
		}
		setActiveMenu(null);
	};

	const handleShowProperties = async (node: FileNode) => {
		const info: FilePropertiesInfo = {
			name: node.name,
			path: node.path,
			type: node.type,
			isBinary: node.isBinary,
			documentId: node.documentId,
		};

		if (node.type === "file") {
			const file = await getFile(node.id);
			if (file) {
				info.size = file.size;
				info.mimeType = file.mimeType;
			}
		}

		setPropertiesInfo(info);
		setShowPropertiesModal(true);
		setActiveMenu(null);
	};

	const handleUploadToFolder = (folderPath: string) => {
		const input = document.createElement("input");
		input.type = "file";
		input.multiple = true;
		input.onchange = async (e) => {
			const files = (e.target as HTMLInputElement).files;
			if (files && files.length > 0) {
				await processFiles(Array.from(files), folderPath);
			}
		};
		input.click();
		setActiveMenu(null);
	};

	const handleCreateFileInFolder = (_folderId: string, folderPath: string) => {
		handleStartCreateFile(folderPath);
		// Expand all parent directories
		expandAllParentDirectories(folderPath);
	};

	const handleCreateSubfolder = (parentPath: string) => {
		handleStartCreateDirectory(parentPath);
		// Expand all parent directories
		expandAllParentDirectories(parentPath);
	};

	const expandAllSubfolders = (node: FileNode) => {
		const newExpandedFolders = new Set(expandedFolders);

		const addAllChildren = (currentNode: FileNode) => {
			if (currentNode.type === "directory") {
				newExpandedFolders.add(currentNode.path);
				if (currentNode.children) {
					currentNode.children.forEach(addAllChildren);
				}
			}
		};

		addAllChildren(node);
		setExpandedFolders(newExpandedFolders);
		setActiveMenu(null);
	};

	const collapseAllSubfolders = (node: FileNode) => {
		const newExpandedFolders = new Set(expandedFolders);

		const removeAllChildren = (currentNode: FileNode) => {
			if (currentNode.type === "directory") {
				newExpandedFolders.delete(currentNode.path);
				if (currentNode.children) {
					currentNode.children.forEach(removeAllChildren);
				}
			}
		};

		if (node.children) {
			node.children.forEach(removeAllChildren);
		}
		setExpandedFolders(newExpandedFolders);
		setActiveMenu(null);
	};

	const handleDragStart = (e: React.DragEvent, node: FileNode) => {
		if (!enableInternalDragDrop) {
			e.preventDefault();
			return;
		}

		e.stopPropagation();
		e.dataTransfer.setData(
			"text/plain",
			JSON.stringify({
				nodeId: node.id,
				nodePath: node.path,
				nodeType: node.type,
			}),
		);
		e.dataTransfer.effectAllowed = "move";
	};

	const handleDropOnDirectory = async (
		e: React.DragEvent,
		targetNode: FileNode,
	) => {
		e.preventDefault();
		e.stopPropagation();

		if (targetNode.type !== "directory") return;

		const rawDragData = e.dataTransfer.getData("text/plain");
		const isFileDrop = Array.from(e.dataTransfer.items).some(
			(item) => item.kind === "file",
		);

		if (isFileDrop && enableFileSystemDragDrop) {
			const files = Array.from(e.dataTransfer.files);
			if (files.length > 0) {
				await processFiles(files, targetNode.path);
			}
			setDragOverTarget(null);
			return;
		}

		if (!enableInternalDragDrop) {
			setDragOverTarget(null);
			return;
		}

		if (!rawDragData || rawDragData.trim() === "") {
			console.warn(
				"handleDropOnDirectory: No drag data available for internal move",
			);
			setDragOverTarget(null);
			return;
		}

		try {
			const dragData = JSON.parse(rawDragData);
			const { nodeId, nodePath, nodeType } = dragData;

			if (
				nodeType === "directory" &&
				targetNode.path.startsWith(nodePath + "/")
			) {
				setDragOverTarget(null);
				return;
			}
			if (nodePath === targetNode.path) {
				setDragOverTarget(null);
				return;
			}

			const sourceFile = await getFile(nodeId);
			if (!sourceFile) {
				console.warn(
					"handleDropOnDirectory: Dragged file/directory not found:",
					nodeId,
				);
				setDragOverTarget(null);
				return;
			}

			setDragDropFile(sourceFile);
			setDragDropTargetPath(targetNode.path);
			setShowDragDropDialog(true);
			setPendingDragDropOperation(() => async () => {
				const newFullPath =
					targetNode.path === "/"
						? `/${sourceFile.name}`
						: `${targetNode.path}/${sourceFile.name}`;
				await renameFile(nodeId, newFullPath);
			});
		} catch (error) {
			console.error("Error during internal drag-drop operation:", error);
		} finally {
			setDragOverTarget(null);
			setIsDragging(false);
		}
	};

	const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
		if (!enableFileSystemDragDrop) return;

		event.preventDefault();
		event.stopPropagation();
		setIsDragging(true);
	};

	const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
		if (!enableFileSystemDragDrop) return;

		event.preventDefault();
		event.stopPropagation();

		if (
			dropRef.current &&
			!dropRef.current.contains(event.relatedTarget as Node)
		) {
			setIsDragging(false);
			setDragOverTarget(null);
		}
	};

	const handleDragOver = (
		event: DragEvent<HTMLDivElement>,
		nodeId?: string,
	) => {
		const isFileDrop = Array.from(event.dataTransfer.items).some(
			(item) => item.kind === "file",
		);
		const isInternalDrop = event.dataTransfer.getData("text/plain");

		if (
			(isFileDrop && !enableFileSystemDragDrop) ||
			(isInternalDrop && !enableInternalDragDrop)
		) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		if (nodeId) {
			setDragOverTarget(nodeId);
		} else {
			setDragOverTarget("root");
		}

		event.dataTransfer.dropEffect = isFileDrop ? "copy" : "move";
	};

	const handleDropOnRoot = async (e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();

		const rawDragData = e.dataTransfer.getData("text/plain");
		const isFileDrop = Array.from(e.dataTransfer.items).some(
			(item) => item.kind === "file",
		);

		if (isFileDrop && enableFileSystemDragDrop) {
			const files = Array.from(e.dataTransfer.files);
			if (files.length > 0) {
				await processFiles(files, "/");
			}
			setDragOverTarget(null);
			setIsDragging(false);
			return;
		}

		if (!enableInternalDragDrop) {
			setDragOverTarget(null);
			setIsDragging(false);
			return;
		}

		if (!rawDragData || rawDragData.trim() === "") {
			setDragOverTarget(null);
			setIsDragging(false);
			return;
		}

		try {
			const dragData = JSON.parse(rawDragData);
			const { nodeId, nodePath } = dragData;

			if (nodePath === "/") {
				setDragOverTarget(null);
				setIsDragging(false);
				return;
			}

			const sourceFile = await getFile(nodeId);
			if (!sourceFile) {
				setDragOverTarget(null);
				setIsDragging(false);
				return;
			}

			// Show confirmation dialog
			setDragDropFile(sourceFile);
			setDragDropTargetPath("/");
			setShowDragDropDialog(true);
			setPendingDragDropOperation(() => async () => {
				const newFullPath = `/${sourceFile.name}`;
				await renameFile(nodeId, newFullPath);
			});
		} catch (error) {
			console.error("Error during root drop operation:", error);
		} finally {
			setDragOverTarget(null);
			setIsDragging(false);
		}
	};

	const handleConfirmDragDrop = async () => {
		if (pendingDragDropOperation) {
			try {
				await pendingDragDropOperation();
			} catch (error) {
				console.error("Error executing drag drop operation:", error);
			}
		}
		setShowDragDropDialog(false);
		setDragDropFile(null);
		setDragDropTargetPath("");
		setPendingDragDropOperation(null);
	};

	const handleCloseDragDropDialog = () => {
		setShowDragDropDialog(false);
		setDragDropFile(null);
		setDragDropTargetPath("");
		setPendingDragDropOperation(null);
	};

	const getDirectoryOptions = (
		currentNode: FileNode | null = null,
	): FileNode[] => {
		const collectDirectories = (nodes: FileNode[]): FileNode[] => {
			let directories: FileNode[] = [];

			for (const node of nodes) {
				if (
					node.type === "directory" &&
					node.path !== currentNode?.path &&
					!node.path.startsWith(currentNode?.path + "/")
				) {
					directories.push(node);
					if (node.children) {
						directories = directories.concat(collectDirectories(node.children));
					}
				}
			}

			return directories;
		};

		return collectDirectories(fileTree);
	};

	if (isLoading) {
		return <div className="file-explorer loading">Loading files...</div>;
	}

	return (
		<>
			<div
				className={`file-explorer ${isDragging ? "dragging" : ""} ${dragOverTarget === "root" ? "root-drag-over" : ""}`}
				ref={dropRef}
				onDragEnter={handleDragEnter}
				onDragOver={(e) => handleDragOver(e)}
				onDragLeave={handleDragLeave}
				onDrop={(e) => handleDropOnRoot(e)}
			>
				<div className="file-explorer-header">
					<h3>Files</h3>
					<div className="file-explorer-actions">
						<button
							className="action-btn"
							title="Export Current Project"
							onClick={handleExportCurrentProject}
							disabled={!currentProjectId}
						>
							<ExportIcon />
						</button>

						<button
							className="action-btn"
							title="Upload Files"
							onClick={() => document.getElementById("file-input").click()}
						>
							<UploadIcon />
						</button>

						<input
							id="file-input"
							type="file"
							multiple
							onChange={handleFileUpload}
							style={{ display: "none" }}
						/>

						<button
							className="action-btn"
							title="New File"
							onClick={() => handleStartCreateFile("/")}
						>
							<FilePlusIcon />
						</button>

						<button
							className="action-btn"
							title="New Folder"
							onClick={() => handleStartCreateDirectory("/")}
						>
							<FolderPlusIcon />
						</button>
					</div>
				</div>

				<div className="file-tree">
					{creatingNewItem && creatingNewItem.parentPath === "/" && (
						<div className="file-node creating-new-item">
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
									onChange={(e) => setNewItemName(e.target.value)}
									onBlur={handleConfirmNewItem}
									onKeyDown={handleNewItemKeyDown}
									className="file-name-input"
									autoFocus
								/>
								<button
									className="cancel-input-button"
									onClick={handleCancelNewItem}
									title="Cancel"
								>
									×
								</button>
							</div>
						</div>
					)}

					{fileTree.length > 0 ? (
						<div className="file-tree-content">
							{fileTree.map((node) => (
								<FileTreeItem
									key={node.path}
									node={node}
									level={0}
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
									onFileSelect={handleFileSelect}
									onToggleFolder={toggleFolder}
									onStartRename={handleStartRename}
									onSaveRename={handleSaveRename}
									onCancelRename={handleCancelRename}
									onRenameKeyDown={handleRenameKeyDown}
									onSetRenameValue={setRenameValue}
									onSetActiveMenu={setActiveMenu}
									onLinkToDocument={linkFileToDocument}
									onUnlinkFromDocument={unlinkFileFromDocument}
									onMoveFile={handleMoveFile}
									onDuplicateFile={handleDuplicateFile}
									onCopyPath={handleCopyPath}
									onExportFile={handleExportFile}
									onShowProperties={handleShowProperties}
									onExportFolder={handleExportFolder}
									onCreateFileInFolder={handleCreateFileInFolder}
									onCreateSubfolder={handleCreateSubfolder}
									onUploadToFolder={handleUploadToFolder}
									onExpandAllSubfolders={expandAllSubfolders}
									onCollapseAllSubfolders={collapseAllSubfolders}
									onDeleteFileOrDirectory={deleteFileOrDirectory}
									onDragStart={handleDragStart}
									onDropOnDirectory={handleDropOnDirectory}
									onSetDragOverTarget={setDragOverTarget}
									onSetNewItemName={setNewItemName}
									onConfirmNewItem={handleConfirmNewItem}
									onCancelNewItem={handleCancelNewItem}
									onNewItemKeyDown={handleNewItemKeyDown}
									menuRefs={menuRefs}
								/>
							))}

							{dragOverTarget === "root" && (
								<div className="root-drop-indicator">
									Drop here to move to root directory
								</div>
							)}
						</div>
					) : (
						<div className="empty-state">
							No files. Upload or create files to get started. Drag any files
							here to upload them.
						</div>
					)}
				</div>
			</div>

			<FileOperationsModal
				showPropertiesModal={showPropertiesModal}
				onClosePropertiesModal={() => setShowPropertiesModal(false)}
				propertiesInfo={propertiesInfo}
				showMoveDialog={showMoveDialog}
				onCloseMoveDialog={() => setShowMoveDialog(false)}
				fileToMove={fileToMove}
				selectedTargetPath={selectedTargetPath}
				onSetSelectedTargetPath={setSelectedTargetPath}
				onConfirmMove={handleConfirmMove}
				getDirectoryOptions={getDirectoryOptions}
				showDragDropDialog={showDragDropDialog}
				onCloseDragDropDialog={handleCloseDragDropDialog}
				dragDropFile={dragDropFile}
				dragDropTargetPath={dragDropTargetPath}
				onConfirmDragDrop={handleConfirmDragDrop}
			/>

			<ZipHandlingModal
				isOpen={showZipModal}
				onClose={handleZipModalClose}
				zipFile={pendingZipFile!}
				targetPath={zipTargetPath}
				onExtract={handleExtractZip}
				onKeepAsZip={handleKeepZip}
			/>
		</>
	);
};

export default FileExplorer;
