// src/components/editor/FileExplorer.tsx
import type React from 'react';
import { type DragEvent, useEffect, useMemo, useRef, useState } from 'react';

import { t } from '@/i18n';
import { useFileTree } from '../../hooks/useFileTree';
import { useProperties } from '../../hooks/useProperties';
import { useWheelScroll } from '../../hooks/useWheelScroll';
import type { FileNode, FilePropertiesInfo } from '../../types/files';
import type { ProjectType } from '../../types/projects';
import {
	type FileSortDirection,
	type FileSortField,
	arrayBufferToString,
	filterTemporaryFiles,
	sortFileTree,
	summarizeDirectory,
	validateFileName,
} from '../../utils/fileUtils';
import {
	buildUrlWithFragments,
	parseUrlFragments,
	pushHash,
} from '../../utils/urlUtils';
import { cleanContent } from '../../utils/fileCommentUtils';
import { createZipFromFolder, downloadZipFile } from '../../utils/zipUtils';
import {
	CheckIcon,
	CloseIcon,
	ExportIcon,
	FilePlusIcon,
	FolderPlusIcon,
	MoveIcon,
	OptionsIcon,
	RefreshIcon,
	TrashIcon,
	UploadIcon,
} from '../common/Icons';
import FileCreationMenu from './FileCreationMenu';
import FileExplorerOptionsMenu from './FileExplorerOptionsMenu';
import FileOperationsModal from './FileOperationsModal';
import FileTreeItem from './FileTreeItem';
import ZipHandlingModal from './ZipHandlingModal';
import { createNamedLogger } from '@/logging';

const moduleLog = createNamedLogger('FileExplorer');

const TEXT_METRICS_SIZE_LIMIT = 2 * 1024 * 1024;

interface FileExplorerProps {
	onFileSelect: (
		fileId: string,
		content: string | ArrayBuffer,
		isBinary?: boolean,
	) => void;
	initialSelectedFile?: string;
	initialExpandedPaths?: string[];
	currentProjectId?: string | null;
	onExportCurrentProject?: (projectId: string) => void;
	projectType?: ProjectType;
	collabProjectId?: string;
	docsWithPeers?: Set<string>;
}

const FileExplorer: React.FC<FileExplorerProps> = ({
	onFileSelect,
	initialSelectedFile,
	initialExpandedPaths,
	currentProjectId,
	onExportCurrentProject,
	projectType,
	collabProjectId,
	docsWithPeers,
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
		batchDeleteFiles,
		batchMoveFiles,
	} = useFileTree();

	const { getProperty, setProperty, registerProperty } = useProperties();
	const propertiesRegistered = useRef(false);
	const [propertiesLoaded, setPropertiesLoaded] = useState(false);
	const [sortField, setSortField] = useState<FileSortField>('name');
	const [sortDirection, setSortDirection] = useState<FileSortDirection>('asc');
	const [showTemporaryFiles, setShowTemporaryFiles] = useState(true);
	const [showOptionsMenu, setShowOptionsMenu] = useState(false);
	const optionsButtonRef = useRef<HTMLDivElement>(null);
	const [selectionMode, setSelectionMode] = useState(false);
	const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(
		new Set(),
	);

	const [currentPath, _setCurrentPath] = useState('/');
	const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
		new Set(['/']),
	);
	const dropRef = useRef<HTMLDivElement>(null);
	const headerActionsRef = useWheelScroll<HTMLDivElement>();
	const [isDragging, setIsDragging] = useState(false);
	const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
	const [showDragDropDialog, setShowDragDropDialog] = useState(false);
	const [dragDropFile, setDragDropFile] = useState<FileNode | null>(null);
	const [dragDropTargetPath, setDragDropTargetPath] = useState<string>('');
	const [pendingDragDropOperation, setPendingDragDropOperation] = useState<
		(() => Promise<void>) | null
	>(null);

	const [activeMenu, setActiveMenu] = useState<string | null>(null);
	const menuRefs = useRef<Map<string, HTMLDivElement>>(new Map());

	const [showFileCreationMenu, setShowFileCreationMenu] = useState(false);
	const [fileCreationTrigger, setFileCreationTrigger] =
		useState<HTMLElement | null>(null);
	const [fileCreationParentPath, setFileCreationParentPath] =
		useState<string>('/');
	const fileCreationButtonRef = useRef<HTMLButtonElement>(null);

	const [nameError, setNameError] = useState<string | null>(null);
	const [renamingFileId, setRenamingFileId] = useState<string | null>(null);
	const [renameValue, setRenameValue] = useState('');
	const [showPropertiesModal, setShowPropertiesModal] = useState(false);
	const [propertiesInfo, setPropertiesInfo] =
		useState<FilePropertiesInfo | null>(null);

	const [showMoveDialog, setShowMoveDialog] = useState(false);
	const [fileToMove, setFileToMove] = useState<FileNode | null>(null);
	const [selectedTargetPath, setSelectedTargetPath] = useState<string>('/');

	const [showZipModal, setShowZipModal] = useState(false);
	const [pendingZipFile, setPendingZipFile] = useState<File | null>(null);
	const [zipTargetPath, setZipTargetPath] = useState<string>('/');

	const [hasProcessedInitialFile, setHasProcessedInitialFile] = useState(false);

	const [creatingNewItem, setCreatingNewItem] = useState<{
		type: 'file' | 'directory';
		parentPath: string;
	} | null>(null);
	const [newItemName, setNewItemName] = useState('');
	const isEditingFileName = !!creatingNewItem || !!renamingFileId;

	useEffect(() => {
		if (propertiesRegistered.current) return;
		propertiesRegistered.current = true;

		registerProperty({
			id: 'file-explorer-sort-field',
			category: 'UI',
			subcategory: 'File Explorer',
			defaultValue: 'name',
		});

		registerProperty({
			id: 'file-explorer-sort-direction',
			category: 'UI',
			subcategory: 'File Explorer',
			defaultValue: 'asc',
		});

		registerProperty({
			id: 'file-explorer-show-temporary',
			category: 'UI',
			subcategory: 'File Explorer',
			defaultValue: true,
		});
	}, [registerProperty]);

	useEffect(() => {
		if (propertiesLoaded) return;

		const storedSortField = getProperty('file-explorer-sort-field');
		const storedSortDirection = getProperty('file-explorer-sort-direction');

		if (storedSortField !== undefined) {
			setSortField(storedSortField as FileSortField);
		}

		if (storedSortDirection !== undefined) {
			setSortDirection(storedSortDirection as FileSortDirection);
		}

		const storedShowTemporary = getProperty('file-explorer-show-temporary');

		if (storedShowTemporary !== undefined) {
			setShowTemporaryFiles(Boolean(storedShowTemporary));
		}

		setPropertiesLoaded(true);
	}, [getProperty, propertiesLoaded]);

	const sortedFileTree = useMemo(() => {
		const visible = showTemporaryFiles
			? fileTree
			: filterTemporaryFiles(fileTree);
		return sortFileTree(visible, sortField, sortDirection);
	}, [fileTree, showTemporaryFiles, sortField, sortDirection]);

	const selectedNodes = useMemo(() => {
		const collect = (nodes: FileNode[]): FileNode[] =>
			nodes.flatMap((node) => [
				...(selectedNodeIds.has(node.id) ? [node] : []),
				...(node.children ? collect(node.children) : []),
			]);
		return collect(sortedFileTree);
	}, [sortedFileTree, selectedNodeIds]);

	useEffect(() => {
		const handleRefreshEvent = () => {
			refreshFileTree();
		};

		document.addEventListener('refresh-file-tree', handleRefreshEvent);

		return () => {
			document.removeEventListener('refresh-file-tree', handleRefreshEvent);
		};
	}, [refreshFileTree]);

	useEffect(() => {
		if (
			initialSelectedFile &&
			initialExpandedPaths &&
			!hasProcessedInitialFile
		) {
			setExpandedFolders((prev) => {
				const next = new Set(prev);
				initialExpandedPaths.forEach((path) => {
					next.add(path);
				});
				return next;
			});

			selectFile(initialSelectedFile);
			setHasProcessedInitialFile(true);
		}
	}, [
		initialSelectedFile,
		initialExpandedPaths,
		hasProcessedInitialFile,
		selectFile,
	]);

	const processFiles = async (files: File[], targetPath: string) => {
		const zipFiles = files.filter((file) =>
			file.name.toLowerCase().endsWith('.zip'),
		);
		const regularFiles = files.filter(
			(file) => !file.name.toLowerCase().endsWith('.zip'),
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
				moduleLog.error('Error extracting ZIP:', error);
			}
		}
		handleZipModalClose();
	};

	const handleKeepZip = async () => {
		if (pendingZipFile) {
			try {
				await storeZipFile(pendingZipFile, zipTargetPath);
			} catch (error) {
				moduleLog.error('Error storing ZIP:', error);
			}
		}
		handleZipModalClose();
	};

	const handleZipModalClose = () => {
		setShowZipModal(false);
		setPendingZipFile(null);

		if ((window as any).tempZipModalResolve) {
			(window as any).tempZipModalResolve();
			(window as any).tempZipModalResolve = undefined;
		}
	};

	const handleFileUpload = async (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const files = event.target.files;
		if (files && files.length > 0) {
			await processFiles(Array.from(files), currentPath);
			event.target.value = '';
		}
	};

	const handleExportCurrentProject = () => {
		if (onExportCurrentProject && currentProjectId) {
			onExportCurrentProject(currentProjectId);
		}
	};

	const handleStartCreateDirectory = (parentPath = '/') => {
		setCreatingNewItem({ type: 'directory', parentPath });
		setNewItemName('new_folder');
		setActiveMenu(null);
	};

	const handleStartCreateFile = (
		parentPath = '/',
		triggerElement?: HTMLElement,
	) => {
		setFileCreationParentPath(parentPath);
		setFileCreationTrigger(triggerElement || fileCreationButtonRef.current);
		setShowFileCreationMenu(true);
		setActiveMenu(null);
	};

	const handleCreateFileWithTemplate = (
		fileName: string,
		extension: string,
	) => {
		setCreatingNewItem({ type: 'file', parentPath: fileCreationParentPath });
		setNewItemName(fileName);
		setShowFileCreationMenu(false);
	};

	const expandAllParentDirectories = (dirPath: string) => {
		const newExpandedFolders = new Set(expandedFolders);

		const pathSegments = dirPath.split('/').filter((segment) => segment);
		let currentPath = '';

		for (const segment of pathSegments) {
			currentPath =
				currentPath === '' ? `/${segment}` : `${currentPath}/${segment}`;
			newExpandedFolders.add(currentPath);
		}

		newExpandedFolders.add('/');

		setExpandedFolders(newExpandedFolders);
	};

	const handleConfirmNewItem = async () => {
		if (!creatingNewItem || !newItemName.trim()) return;

		const result = validateFileName(newItemName);
		if (!result.valid) {
			setNameError(result.error!);
			return;
		}
		setNameError(null);

		try {
			if (creatingNewItem.type === 'directory') {
				await createDirectory(newItemName.trim(), creatingNewItem.parentPath);

				// Expand all parent directories including the newly created one
				const newDirPath =
					creatingNewItem.parentPath === '/'
						? `/${newItemName.trim()}`
						: `${creatingNewItem.parentPath}/${newItemName.trim()}`;

				expandAllParentDirectories(newDirPath);
			} else {
				const file = new File([''], newItemName.trim(), { type: 'text/plain' });
				await uploadFiles([file], creatingNewItem.parentPath);

				expandAllParentDirectories(creatingNewItem.parentPath);

				const newFilePath =
					creatingNewItem.parentPath === '/'
						? `/${newItemName.trim()}`
						: `${creatingNewItem.parentPath}/${newItemName.trim()}`;

				const updatedFileTree = await refreshFileTree();

				const findFileByPath = (
					nodes: FileNode[],
					path: string,
				): FileNode | null => {
					for (const node of nodes) {
						if (node.path === path && node.type === 'file') {
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
						pushHash(newUrl);
					}
				} else {
					moduleLog.warn('Could not find newly created file:', newFilePath);
				}
			}
		} catch (error) {
			moduleLog.error(`Error creating ${creatingNewItem.type}:`, error);
		}

		setCreatingNewItem(null);
		setNewItemName('');
	};

	const handleCancelNewItem = () => {
		setCreatingNewItem(null);
		setNewItemName('');
		setNameError(null);
	};

	const handleNewItemKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter') {
			handleConfirmNewItem();
		} else if (e.key === 'Escape') {
			handleCancelNewItem();
		}
	};

	const handleFileSelect = async (node: FileNode) => {
		if (node.type !== 'file') return;

		selectFile(node.id);
		const content = await getFileContent(node.id);
		if (content) {
			onFileSelect(node.id, content, node.isBinary);
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
		if (!renamingFileId) return;

		const result = validateFileName(renameValue);
		if (!result.valid) {
			setNameError(result.error!);
			return;
		}
		setNameError(null);
		try {
			const parentPath = node.path.substring(0, node.path.lastIndexOf('/'));
			const newFullPath =
				parentPath === ''
					? `/${renameValue.trim()}`
					: `${parentPath}/${renameValue.trim()}`;

			if (node.path === newFullPath) {
				setRenamingFileId(null);
				setRenameValue('');
				return;
			}

			await renameFile(node.id, newFullPath);
		} catch (error) {
			if (error instanceof Error) {
				if (error.message === 'File operation cancelled by user') {
				} else if (
					error.message === 'File unlinked. Please try rename again.'
				) {
					return;
				} else {
					moduleLog.error('Error renaming file:', error);
				}
			}
		}
		setRenamingFileId(null);
		setRenameValue('');
	};

	const handleCancelRename = () => {
		setRenamingFileId(null);
		setRenameValue('');
		setNameError(null);
	};

	const handleRenameKeyDown = (e: React.KeyboardEvent, node: FileNode) => {
		if (e.key === 'Enter') {
			handleSaveRename(node);
		} else if (e.key === 'Escape') {
			handleCancelRename();
		}
	};

	const handleMoveFile = (node: FileNode) => {
		setFileToMove(node);
		setSelectedTargetPath('/');
		setShowMoveDialog(true);
		setActiveMenu(null);
	};

	const handleToggleSelectionMode = () => {
		setSelectionMode((previous) => !previous);
		setSelectedNodeIds(new Set());
	};

	const handleToggleSelection = (node: FileNode) => {
		setSelectedNodeIds((previous) => {
			const next = new Set(previous);
			if (next.has(node.id)) {
				next.delete(node.id);
			} else {
				next.add(node.id);
			}
			return next;
		});
	};

	const handleSortFieldChange = (field: FileSortField) => {
		setSortField(field);
		setProperty('file-explorer-sort-field', field);
	};

	const handleSortDirectionChange = (direction: FileSortDirection) => {
		setSortDirection(direction);
		setProperty('file-explorer-sort-direction', direction);
	};

	const handleShowTemporaryFilesChange = (show: boolean) => {
		setShowTemporaryFiles(show);
		setProperty('file-explorer-show-temporary', show);
	};

	const handleMoveSelected = () => {
		setFileToMove(null);
		setSelectedTargetPath('/');
		setShowMoveDialog(true);
	};

	const handleDeleteSelected = async () => {
		await batchDeleteFiles(selectedNodes.map((node) => node.id));
		setSelectedNodeIds(new Set());
	};

	const handleConfirmMove = async () => {
		if (!fileToMove) {
			if (selectedNodes.length === 0) return;

			const nodesToMove = selectedNodes.filter(
				(node) =>
					!selectedNodes.some(
						(other) =>
							other.type === 'directory' &&
							node.path.startsWith(`${other.path}/`),
					),
			);

			try {
				await batchMoveFiles(
					nodesToMove.map((node) => ({
						fileId: node.id,
						targetPath: selectedTargetPath,
						newName: node.name,
					})),
				);
				setShowMoveDialog(false);
				setSelectedNodeIds(new Set());
			} catch (error) {
				moduleLog.error('Error moving files:', error);
			}
			return;
		}

		const newFullPath =
			selectedTargetPath === '/'
				? `/${fileToMove.name}`
				: `${selectedTargetPath}/${fileToMove.name}`;

		if (fileToMove.path === newFullPath) {
			setShowMoveDialog(false);
			setFileToMove(null);
			return;
		}

		try {
			await renameFile(fileToMove.id, newFullPath);
			setShowMoveDialog(false);
			setFileToMove(null);
		} catch (error) {
			moduleLog.error('Error moving file:', error);
		}
	};

	const handleDuplicateFile = async (node: FileNode) => {
		if (node.type === 'file') {
			const content = await getFileContent(node.id);
			if (content) {
				const nameWithoutExt = node.name.replace(/\.[^/.]+$/, '');
				const extension = node.name.includes('.')
					? `.${node.name.split('.').pop()}`
					: '';
				const duplicateName = `${nameWithoutExt}_copy${extension}`;

				const parentPath = node.path.substring(0, node.path.lastIndexOf('/'));

				const file = new File([content], duplicateName, {
					type: node.mimeType || 'text/plain',
				});
				await uploadFiles([file], parentPath || '/');
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
		if (node.type === 'file') {
			const content = await getFileContent(node.id);
			if (content) {
				const cleanedContent = cleanContent(content);
				const blob = new Blob([cleanedContent], {
					type: node.mimeType || 'text/plain',
				});
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
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
		if (node.type === 'directory') {
			try {
				const zipBlob = await createZipFromFolder(
					node,
					getFileContent,
					getFile,
				);
				downloadZipFile(zipBlob, node.name);
			} catch (error) {
				moduleLog.error('Error exporting folder:', error);
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
			createdAt: node.createdAt ?? node.lastModified,
			lastModified: node.lastModified,
		};

		if (node.type === 'directory') {
			info.directorySummary = summarizeDirectory(node);
		} else {
			const file = await getFile(node.id);
			if (file) {
				info.size = file.size;
				info.mimeType = file.mimeType;
				info.createdAt = file.createdAt ?? file.lastModified;
				info.lastModified = file.lastModified;

				if (
					!file.isBinary &&
					file.content !== undefined &&
					(file.size ?? 0) <= TEXT_METRICS_SIZE_LIMIT
				) {
					const text =
						typeof file.content === 'string'
							? file.content
							: arrayBufferToString(file.content);
					info.characterCount = text.length;
					info.lineCount = text.split('\n').length;
				}
			}
		}

		setPropertiesInfo(info);
		setShowPropertiesModal(true);
		setActiveMenu(null);
	};

	const handleUploadToFolder = (folderPath: string) => {
		const input = document.createElement('input');
		input.type = 'file';
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
		expandAllParentDirectories(folderPath);
	};

	const handleCreateSubfolder = (parentPath: string) => {
		handleStartCreateDirectory(parentPath);
		expandAllParentDirectories(parentPath);
	};

	const expandAllSubfolders = (node: FileNode) => {
		const newExpandedFolders = new Set(expandedFolders);

		const addAllChildren = (currentNode: FileNode) => {
			if (currentNode.type === 'directory') {
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
			if (currentNode.type === 'directory') {
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

		setDragOverTarget(null);
		setIsDragging(false);

		e.stopPropagation();
		e.dataTransfer.setData(
			'text/plain',
			JSON.stringify({
				nodeId: node.id,
				nodePath: node.path,
				nodeType: node.type,
			}),
		);
		e.dataTransfer.effectAllowed = 'move';
	};

	const handleDropOnDirectory = async (
		e: React.DragEvent,
		targetNode: FileNode,
	) => {
		e.preventDefault();
		e.stopPropagation();

		if (targetNode.type !== 'directory') return;

		const rawDragData = e.dataTransfer.getData('text/plain');
		const isFileDrop = Array.from(e.dataTransfer.items).some(
			(item) => item.kind === 'file',
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

		if (!rawDragData || rawDragData.trim() === '') {
			moduleLog.warn(
				'handleDropOnDirectory: No drag data available for internal move',
			);
			setDragOverTarget(null);
			return;
		}

		try {
			const dragData = JSON.parse(rawDragData);
			const { nodeId, nodePath, nodeType } = dragData;

			if (
				nodeType === 'directory' &&
				targetNode.path.startsWith(`${nodePath}/`)
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
				moduleLog.warn(
					'handleDropOnDirectory: Dragged file/directory not found:',
					nodeId,
				);
				setDragOverTarget(null);
				return;
			}

			const newFullPath =
				targetNode.path === '/'
					? `/${sourceFile.name}`
					: `${targetNode.path}/${sourceFile.name}`;

			if (sourceFile.path === newFullPath) {
				setDragOverTarget(null);
				return;
			}

			setDragDropFile(sourceFile);
			setDragDropTargetPath(targetNode.path);
			setShowDragDropDialog(true);
			setPendingDragDropOperation(() => async () => {
				await renameFile(nodeId, newFullPath);
			});
		} catch (error) {
			moduleLog.error('Error during internal drag-drop operation:', error);
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
		if (isEditingFileName) return;

		const isFileDrop = Array.from(event.dataTransfer.items).some(
			(item) => item.kind === 'file',
		);
		const isInternalDrop = event.dataTransfer.getData('text/plain');

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
			setDragOverTarget('root');
		}

		event.dataTransfer.dropEffect = isFileDrop ? 'copy' : 'move';
	};

	const handleDropOnRoot = async (e: React.DragEvent) => {
		if (isEditingFileName) return;

		e.preventDefault();
		e.stopPropagation();

		const rawDragData = e.dataTransfer.getData('text/plain');
		const isFileDrop = Array.from(e.dataTransfer.items).some(
			(item) => item.kind === 'file',
		);

		if (isFileDrop && enableFileSystemDragDrop) {
			const files = Array.from(e.dataTransfer.files);
			if (files.length > 0) {
				await processFiles(files, '/');
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

		if (!rawDragData || rawDragData.trim() === '') {
			setDragOverTarget(null);
			setIsDragging(false);
			return;
		}

		try {
			const dragData = JSON.parse(rawDragData);
			const { nodeId, nodePath } = dragData;

			if (nodePath === '/') {
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

			const newFullPath = `/${sourceFile.name}`;

			if (sourceFile.path === newFullPath) {
				setDragOverTarget(null);
				setIsDragging(false);
				return;
			}

			setDragDropFile(sourceFile);
			setDragDropTargetPath('/');
			setShowDragDropDialog(true);
			setPendingDragDropOperation(() => async () => {
				await renameFile(nodeId, newFullPath);
			});
		} catch (error) {
			moduleLog.error('Error during root drop operation:', error);
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
				moduleLog.error('Error executing drag drop operation:', error);
			}
		}
		setShowDragDropDialog(false);
		setDragDropFile(null);
		setDragDropTargetPath('');
		setPendingDragDropOperation(null);
	};

	const handleCloseDragDropDialog = () => {
		setShowDragDropDialog(false);
		setDragDropFile(null);
		setDragDropTargetPath('');
		setPendingDragDropOperation(null);
	};

	const getDirectoryOptions = (
		currentNode: FileNode | null = null,
	): FileNode[] => {
		const collectDirectories = (nodes: FileNode[]): FileNode[] => {
			let directories: FileNode[] = [];

			for (const node of nodes) {
				if (
					node.type === 'directory' &&
					node.path !== currentNode?.path &&
					!node.path.startsWith(`${currentNode?.path}/`)
				) {
					directories.push(node);
					if (node.children) {
						directories = directories.concat(collectDirectories(node.children));
					}
				}
			}

			return directories;
		};

		return collectDirectories(sortedFileTree);
	};

	if (isLoading) {
		return <div className='file-explorer loading'>{t('Loading files...')}</div>;
	}

	return (
		<>
			<div
				className={`file-explorer ${!isEditingFileName && isDragging ? 'dragging' : ''} ${!isEditingFileName && dragOverTarget === 'root' ? 'root-drag-over' : ''}`}
				ref={dropRef}
				onDragEnter={handleDragEnter}
				onDragOver={(e) => handleDragOver(e)}
				onDragLeave={handleDragLeave}
				onDragEnd={() => {
					setDragOverTarget(null);
					setIsDragging(false);
				}}
				onDrop={(e) => handleDropOnRoot(e)}
			>
				<div className='file-explorer-header'>
					<h3>{t('Files')}</h3>
					<div
						className='file-explorer-actions scroll-x'
						ref={headerActionsRef}
					>
						<button
							className='action-btn'
							title={t('Refresh File Tree')}
							onClick={() => refreshFileTree()}
						>
							<RefreshIcon />
						</button>

						<div ref={optionsButtonRef}>
							<button
								className={`action-btn ${showOptionsMenu ? 'active' : ''}`}
								title={t('Options')}
								onClick={() => setShowOptionsMenu(!showOptionsMenu)}
							>
								<OptionsIcon />
							</button>
						</div>

						<button
							className={`action-btn ${selectionMode ? 'active' : ''}`}
							title={t('Multi-select')}
							onClick={handleToggleSelectionMode}
						>
							<CheckIcon />
						</button>

						<div className='action-separator'></div>

						<button
							className='action-btn'
							title={t('Export Current Project')}
							onClick={handleExportCurrentProject}
							disabled={!currentProjectId}
						>
							<ExportIcon />
						</button>

						<button
							className='action-btn'
							title={t('Upload Files')}
							onClick={() => document.getElementById('file-input').click()}
						>
							<UploadIcon />
						</button>

						<input
							id='file-input'
							type='file'
							multiple
							onChange={handleFileUpload}
							style={{ display: 'none' }}
						/>

						<button
							ref={fileCreationButtonRef}
							className='action-btn'
							title={t('New File')}
							onClick={(e) => handleStartCreateFile('/', e.currentTarget)}
						>
							<FilePlusIcon />
						</button>

						<button
							className='action-btn'
							title={t('New Folder')}
							onClick={() => handleStartCreateDirectory('/')}
						>
							<FolderPlusIcon />
						</button>
					</div>

					<FileExplorerOptionsMenu
						isOpen={showOptionsMenu}
						onClose={() => setShowOptionsMenu(false)}
						triggerElement={optionsButtonRef.current}
						sortField={sortField}
						sortDirection={sortDirection}
						onSortFieldChange={handleSortFieldChange}
						onSortDirectionChange={handleSortDirectionChange}
						showTemporaryFiles={showTemporaryFiles}
						onShowTemporaryFilesChange={handleShowTemporaryFilesChange}
					/>

					<FileCreationMenu
						isOpen={showFileCreationMenu}
						onClose={() => setShowFileCreationMenu(false)}
						onCreate={handleCreateFileWithTemplate}
						triggerElement={fileCreationTrigger}
						projectType={projectType}
						parentPath={fileCreationParentPath}
						mode='dropdown'
					/>
				</div>

				{selectionMode && (
					<div className='file-selection-bar'>
						<span>
							{t('{count} selected', { count: selectedNodeIds.size })}
						</span>
						<div className='file-selection-actions'>
							<button
								className='action-btn'
								title={t('Move Selected')}
								disabled={selectedNodeIds.size === 0}
								onClick={handleMoveSelected}
							>
								<MoveIcon />
							</button>
							<button
								className='action-btn'
								title={t('Delete Selected')}
								disabled={selectedNodeIds.size === 0}
								onClick={handleDeleteSelected}
							>
								<TrashIcon />
							</button>
							<button
								className='action-btn'
								title={t('Exit selection mode')}
								onClick={handleToggleSelectionMode}
							>
								<CloseIcon />
							</button>
						</div>
					</div>
				)}

				<div className='file-tree'>
					{creatingNewItem && creatingNewItem.parentPath === '/' && (
						<div className='file-node creating-new-item' draggable={false}>
							<span className='file-icon'>
								{creatingNewItem.type === 'directory' ? (
									<FolderPlusIcon />
								) : (
									<FilePlusIcon />
								)}
							</span>
							<div className='file-name-input-container'>
								<div className='file-name-input-row'>
									<input
										type='text'
										value={newItemName}
										onChange={(e) => {
											setNewItemName(e.target.value);
											if (nameError) setNameError(null);
										}}
										onBlur={handleConfirmNewItem}
										onKeyDown={handleNewItemKeyDown}
										className={`file-name-input ${nameError ? 'invalid' : ''}`}
									/>
									<button
										aria-label={t('Cancel new item')}
										className='cancel-input-button'
										onMouseDown={(e) => {
											e.preventDefault();
											e.stopPropagation();
											handleCancelNewItem();
										}}
										title={t('Cancel new item')}
									>
										<span aria-hidden='true'>×</span>
									</button>
								</div>
								{nameError && (
									<span className='file-name-error'>{nameError}</span>
								)}
							</div>
						</div>
					)}

					{sortedFileTree.length > 0 ? (
						<div className='file-tree-content'>
							{sortedFileTree.map((node) => (
								<FileTreeItem
									key={node.path}
									node={node}
									level={0}
									selectedFileId={selectedFileId}
									expandedFolders={expandedFolders}
									renamingFileId={renamingFileId}
									renameValue={renameValue}
									nameError={nameError}
									activeMenu={activeMenu}
									dragOverTarget={dragOverTarget}
									enableFileSystemDragDrop={
										enableFileSystemDragDrop && !isEditingFileName
									}
									enableInternalDragDrop={
										enableInternalDragDrop && !isEditingFileName
									}
									creatingNewItem={creatingNewItem}
									newItemName={newItemName}
									onFileSelect={handleFileSelect}
									onToggleFolder={toggleFolder}
									onStartRename={handleStartRename}
									onSaveRename={handleSaveRename}
									onCancelRename={handleCancelRename}
									onRenameKeyDown={handleRenameKeyDown}
									onSetRenameValue={setRenameValue}
									onSetNameError={setNameError}
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
									collabProjectId={collabProjectId}
									docsWithPeers={docsWithPeers}
									selectionMode={selectionMode}
									selectedNodeIds={selectedNodeIds}
									onToggleSelection={handleToggleSelection}
								/>
							))}

							{dragOverTarget === 'root' && (
								<div className='root-drop-indicator-note'>
									{t('Drop here to move to root directory')}
								</div>
							)}
						</div>
					) : (
						<div className='empty-state'>
							{t(
								'No files. Upload or create files to get started. Drag any files here to upload them.',
							)}
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
				moveSelection={selectedNodes}
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
