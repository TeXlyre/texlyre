// src/contexts/FileTreeContext.tsx
import { nanoid } from "nanoid";
import type React from "react";
import {
	type ReactNode,
	createContext,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

import { useCollab } from "../hooks/useCollab";
import { useSettings } from "../hooks/useSettings";
import { collabService } from "../services/CollabService";
import { fileConflictService } from "../services/FileConflictService";
import { fileOperationNotificationService } from "../services/FileOperationNotificationService";
import { fileStorageService } from "../services/FileStorageService";
import type { DocumentList } from "../types/documents";
import type { FileNode, FileTreeContextType } from "../types/files";
import type { YjsDocUrl } from "../types/yjs";
import {
	getMimeType,
	isBinaryFile,
	stringToArrayBuffer,
} from "../utils/fileUtils";
import { batchExtractZip } from "../utils/zipUtils";
import { duplicateKeyDetector } from '../utils/duplicateKeyDetector';

export const FileTreeContext = createContext<FileTreeContextType | null>(null);

interface FileTreeProviderProps {
	children: ReactNode;
	docUrl: YjsDocUrl;
}

export const FileTreeProvider: React.FC<FileTreeProviderProps> = ({
	children,
	docUrl,
}) => {
	const { data: doc, changeData: changeDoc } = useCollab<DocumentList>();
	const { registerSetting, getSetting } = useSettings();
	const [fileTree, setFileTree] = useState<FileNode[]>([]);
	const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [enableFileSystemDragDrop, setEnableFileSystemDragDrop] =
		useState(true);
	const [enableInternalDragDrop, setEnableInternalDragDrop] = useState(true);
	const storageInitialized = useRef(false);
	const settingsRegistered = useRef(false);

	useEffect(() => {
		// Start duplicate detection when file tree is loaded
		if (!isLoading && fileTree.length > 0) {
			duplicateKeyDetector.start();
		}

		return () => {
			duplicateKeyDetector.stop();
		};
	}, [isLoading, fileTree]);

	useEffect(() => {
		if (settingsRegistered.current) return;
		settingsRegistered.current = true;

		const initialFileSystemDragDrop =
			(getSetting("file-tree-filesystem-drag-drop")?.value as boolean) ?? true;
		const initialInternalDragDrop =
			(getSetting("file-tree-internal-drag-drop")?.value as boolean) ?? true;

		setEnableFileSystemDragDrop(initialFileSystemDragDrop);
		setEnableInternalDragDrop(initialInternalDragDrop);

		registerSetting({
			id: "file-tree-filesystem-drag-drop",
			category: "Viewers",
			subcategory: "File Explorer",
			type: "checkbox",
			label: "Enable file system drag and drop",
			description:
				"Allow dragging files from your file system into the file explorer",
			defaultValue: true,
			onChange: (value) => {
				setEnableFileSystemDragDrop(value as boolean);
			},
		});

		registerSetting({
			id: "file-tree-internal-drag-drop",
			category: "Viewers",
			subcategory: "File Explorer",
			type: "checkbox",
			label: "Enable internal (local) drag and drop",
			description:
				"Allow dragging files and folders within the TeXlyre file explorer to move them",
			defaultValue: true,
			onChange: (value) => {
				setEnableInternalDragDrop(value as boolean);
			},
		});
	}, [registerSetting, getSetting]);

	useEffect(() => {
		if (!storageInitialized.current && docUrl) {
			const initFileStorage = async () => {
				try {
					await fileStorageService.initialize(docUrl);
					storageInitialized.current = true;
					const tree = await fileStorageService.buildFileTree();
					setFileTree(tree);
					setIsLoading(false);
				} catch (error) {
					console.error("Failed to initialize file storage:", error);
					setIsLoading(false);
				}
			};
			initFileStorage();
		}
	}, [docUrl]);

	const refreshFileTree = useCallback(async () => {
		try {
			const tree = await fileStorageService.buildFileTree();
			setFileTree(tree);
			return tree;
		} catch (error) {
			console.error("Error refreshing file tree:", error);
			return [];
		}
	}, []);

	const selectFile = useCallback((fileId: string | null) => {
		setSelectedFileId(fileId);
	}, []);

	const uploadFiles = useCallback(
		async (
			files: FileList | File[],
			currentPath: string,
			targetDirectoryId?: string,
		) => {
			setIsLoading(true);
			let targetPath = currentPath;
			try {
				if (targetDirectoryId) {
					const targetDir = await fileStorageService.getFile(targetDirectoryId);
					if (targetDir && targetDir.type === "directory") {
						targetPath = targetDir.path;
					}
				}

				const filesToProcess: FileNode[] = [];

				for (let i = 0; i < files.length; i++) {
					const file = files[i];
					const filePath =
						targetPath === "/" ? `/${file.name}` : `${targetPath}/${file.name}`;
					const fileContent = await file.arrayBuffer();
					const mimeType = getMimeType(file.name);
					const binary = isBinaryFile(file.name);
					const rawFile: FileNode = {
						id: nanoid(),
						name: file.name,
						path: filePath,
						type: "file",
						content: fileContent,
						lastModified: file.lastModified,
						size: file.size,
						mimeType,
						isBinary: binary,
					};
					filesToProcess.push(rawFile);
				}

				try {
					await fileStorageService.batchStoreFiles(filesToProcess);
				} catch (error) {
					if (
						error instanceof Error &&
						error.message === "File operation cancelled by user"
					) {
						return;
					}
					throw error;
				}

				await refreshFileTree();
			} catch (error) {
				console.error("Error uploading files:", error);
			} finally {
				setIsLoading(false);
			}
		},
		[refreshFileTree],
	);

	const extractZipFile = useCallback(
		async (zipFile: File, targetPath: string) => {
			const operationId = `extract-${Date.now()}`;

			try {
				fileOperationNotificationService.showLoading(
					operationId,
					`Extracting ${zipFile.name}...`,
				);

				const { files: extractedFiles, directories } = await batchExtractZip(
					zipFile,
					targetPath,
				);

				fileOperationNotificationService.updateProgress(
					operationId,
					`Processing ${extractedFiles.length} files...`,
				);

				const allFiles = [...directories, ...extractedFiles];
				await fileStorageService.batchStoreFiles(allFiles);

				fileOperationNotificationService.showSuccess(
					operationId,
					`Successfully extracted ${extractedFiles.length} files`,
				);

				await refreshFileTree();
			} catch (error) {
				fileOperationNotificationService.showError(
					operationId,
					`Failed to extract ZIP: ${error.message}`,
				);
				throw error;
			}
		},
		[refreshFileTree],
	);

	const storeZipFile = useCallback(
		async (zipFile: File, targetPath: string) => {
			try {
				const filePath =
					targetPath === "/"
						? `/${zipFile.name}`
						: `${targetPath}/${zipFile.name}`;
				const fileContent = await zipFile.arrayBuffer();
				const mimeType = "application/zip";

				const rawFile: FileNode = {
					id: nanoid(),
					name: zipFile.name,
					path: filePath,
					type: "file",
					content: fileContent,
					lastModified: zipFile.lastModified,
					size: zipFile.size,
					mimeType,
					isBinary: true,
				};

				await fileStorageService.storeFile(rawFile);
				await refreshFileTree();
			} catch (error) {
				if (
					error instanceof Error &&
					error.message !== "File operation cancelled by user"
				) {
					console.error("Failed to store ZIP file:", error);
					throw error;
				}
			}
		},
		[refreshFileTree],
	);

	const setupFileSyncListener = useCallback(
		(documentId: string, fileId: string) => {
			const mapping = { documentId, fileId };
			const mappingKey = `file-sync-${documentId}`;
			sessionStorage.setItem(mappingKey, JSON.stringify(mapping));
		},
		[],
	);

	const linkFileToDocument = useCallback(
		async (fileId: string, documentId?: string) => {
			try {
				if (!fileStorageService.db) await fileStorageService.initialize();
				const file = await fileStorageService.getFile(fileId);
				if (file && changeDoc && doc) {
					const linkConfirmation = await fileConflictService.confirmLink(file);

					if (linkConfirmation === "cancel") {
						return;
					}

					const shouldCopyContent = linkConfirmation === "link-with-copy";
					let textContent = "";

					if (shouldCopyContent) {
						const fileContent = await fileStorageService.getFile(fileId);
						if (fileContent?.content instanceof ArrayBuffer) {
							textContent = new TextDecoder().decode(fileContent.content);
						} else if (typeof fileContent?.content === "string") {
							textContent = fileContent.content;
						}
					}

					let createdDocId: string | null = null;

					changeDoc((d) => {
						const docIndex =
							d.documents?.findIndex((doc) => doc.name === file.path) ?? -1;
						if (docIndex >= 0) {
							d.currentDocId = d.documents[docIndex].id;
							createdDocId = d.documents[docIndex].id;
						} else {
							if (!d.documents) d.documents = [];
							const newDocId = Math.random().toString(36).substring(2, 15);
							d.documents.push({
								id: newDocId,
								name: file.path,
								content: "",
							});
							d.currentDocId = newDocId;
							createdDocId = newDocId;
						}
					});

					file.documentId = documentId || createdDocId;
					await fileStorageService.storeFile(file, {
						showConflictDialog: false,
					});

					if (createdDocId && shouldCopyContent && textContent) {
						const projectId = docUrl.startsWith("yjs:")
							? docUrl.slice(4)
							: docUrl;
						const collectionName = `yjs_${createdDocId}`;

						const { doc: newYDoc } = collabService.connect(
							projectId,
							collectionName,
						);

						await new Promise((resolve) => setTimeout(resolve, 100));

						newYDoc.transact(() => {
							const ytext = newYDoc.getText("codemirror");
							if (ytext.length === 0) {
								ytext.insert(0, textContent);
							}
						});
						collabService.disconnect(projectId, collectionName);

						setupFileSyncListener(createdDocId, fileId);
					}

					await refreshFileTree();
					if (createdDocId) {
						const event = new CustomEvent("document-linked", {
							detail: { documentId: createdDocId },
						});
						document.dispatchEvent(event);
					}
				}
			} catch (error) {
				if (
					error instanceof Error &&
					error.message === "Link operation cancelled by user"
				) {
					return;
				}
				console.error("Error linking file to document:", error);
			}
		},
		[changeDoc, doc, refreshFileTree, docUrl, setupFileSyncListener],
	);

	const unlinkFileFromDocument = useCallback(
		async (fileId: string) => {
			try {
				if (!fileStorageService.db) await fileStorageService.initialize();
				const file = await fileStorageService.getFile(fileId);
				if (file?.documentId && changeDoc && doc) {
					const unlinkConfirmation =
						await fileConflictService.confirmUnlink(file);

					if (unlinkConfirmation === "cancel") {
						return;
					}

					file.documentId = undefined;
					await fileStorageService.storeFile(file, {
						showConflictDialog: false,
					});
					changeDoc((d) => {
						if (!d.documents) return;
						const docIndex = d.documents.findIndex(
							(doc) => doc.name === file.path,
						);
						if (docIndex >= 0) {
							d.documents.splice(docIndex, 1);
						}
					});
				}
				await refreshFileTree();
				window.location.reload();
			} catch (error) {
				if (
					error instanceof Error &&
					error.message === "Unlink operation cancelled by user"
				) {
					return;
				}
				console.error("Error unlinking file from document:", error);
			}
		},
		[changeDoc, doc, refreshFileTree],
	);

	const createDirectory = useCallback(
		async (name: string, path: string) => {
			if (!name) return;
			try {
				const dirPath = path === "/" ? `/${name}` : `${path}/${name}`;
				const directory: FileNode = {
					id: nanoid(),
					name,
					path: dirPath,
					type: "directory",
					lastModified: Date.now(),
				};
				await fileStorageService.storeFile(directory);
				await refreshFileTree();
			} catch (error) {
				if (
					error instanceof Error &&
					error.message !== "File operation cancelled by user"
				) {
					console.error("Error creating directory:", error);
				}
			}
		},
		[refreshFileTree],
	);

	const batchDeleteFiles = useCallback(
		async (fileIds: string[]) => {
			try {
				const allFiles = await fileStorageService.getAllFiles();
				const filesToDelete = fileIds
					.map((id) => allFiles.find((f) => f.id === id))
					.filter(Boolean) as FileNode[];

				// Check for directories and collect all children
				const allFilesToDelete: string[] = [];

				for (const file of filesToDelete) {
					if (file.type === "directory") {
						const linkedFilesInDirectory = allFiles.filter(
							(f) =>
								f.path.startsWith(file.path) &&
								f.path !== file.path &&
								f.documentId,
						);

						if (linkedFilesInDirectory.length > 0) {
							throw new Error(
								"Cannot delete directory containing linked files. Please unlink files first.",
							);
						}

						const childrenToDelete = allFiles.filter(
							(f) => f.path.startsWith(file.path) && f.path !== file.path,
						);
						allFilesToDelete.push(...childrenToDelete.map((c) => c.id));
					}
					allFilesToDelete.push(file.id);
				}

				await fileStorageService.batchDeleteFiles(allFilesToDelete);

				// Update selected file if any deleted files were selected
				if (selectedFileId && allFilesToDelete.includes(selectedFileId)) {
					setSelectedFileId(null);
				}

				await refreshFileTree();
			} catch (error) {
				console.error("Error in batch delete:", error);
				if (error instanceof Error) {
					alert(error.message);
				}
			}
		},
		[refreshFileTree, selectedFileId],
	);

	const batchMoveFiles = useCallback(
		async (moveOperations: Array<{ fileId: string; targetPath: string }>) => {
			try {
				const operationId = `batch-move-${Date.now()}`;

				fileOperationNotificationService.showLoading(
					operationId,
					`Moving ${moveOperations.length} files...`,
				);

				const movedIds =
					await fileStorageService.batchMoveFiles(moveOperations);

				fileOperationNotificationService.showSuccess(
					operationId,
					`Successfully moved ${movedIds.length} files`,
				);

				await refreshFileTree();
				return movedIds;
			} catch (error) {
				const operationId = `batch-move-${Date.now()}`;
				fileOperationNotificationService.showError(
					operationId,
					`Failed to move files: ${error.message}`,
				);

				if (
					error instanceof Error &&
					error.message !== "File operation cancelled by user"
				) {
					console.error("Error in batch move:", error);
				}
				throw error;
			}
		},
		[refreshFileTree],
	);

	const batchUnlinkFiles = useCallback(
		async (fileIds: string[]) => {
			try {
				const operationId = `batch-unlink-${Date.now()}`;

				fileOperationNotificationService.showLoading(
					operationId,
					`Unlinking ${fileIds.length} files...`,
				);

				await fileStorageService.batchUnlinkFiles(fileIds);

				if (changeDoc && doc) {
					const files = await Promise.all(
						fileIds.map((fileId) => fileStorageService.getFile(fileId)),
					);

					changeDoc((d) => {
						if (!d.documents) return;

						files.forEach((file) => {
							if (file) {
								const docIndex = d.documents!.findIndex(
									(doc) => doc.name === file.path,
								);
								if (docIndex >= 0) {
									d.documents!.splice(docIndex, 1);
								}
							}
						});
					});
				}

				fileOperationNotificationService.showSuccess(
					operationId,
					`Successfully unlinked ${fileIds.length} files`,
				);

				await refreshFileTree();
				window.location.reload();
			} catch (error) {
				const operationId = `batch-unlink-${Date.now()}`;
				fileOperationNotificationService.showError(
					operationId,
					`Failed to unlink files: ${error.message}`,
				);

				if (
					error instanceof Error &&
					error.message !== "Unlink operation cancelled by user"
				) {
					console.error("Error in batch unlink:", error);
				}
				throw error;
			}
		},
		[changeDoc, doc, refreshFileTree],
	);

	const deleteFileOrDirectory = useCallback(
		async (id: string) => {
			await batchDeleteFiles([id]);
		},
		[batchDeleteFiles],
	);

	const getFileContent = useCallback(async (fileId: string) => {
		try {
			const file = await fileStorageService.getFile(fileId);
			return file?.content;
		} catch (error) {
			console.error("Error getting file content:", error);
			return undefined;
		}
	}, []);

	const getFile = useCallback(async (fileId: string) => {
		try {
			return await fileStorageService.getFile(fileId);
		} catch (error) {
			console.error("Error getting file:", error);
			return undefined;
		}
	}, []);

	const moveFileOrDirectory = useCallback(
		async (sourceId: string, targetPath: string) => {
			try {
				console.log(
					`moveFileOrDirectory: sourceId=${sourceId}, targetPath=${targetPath}`,
				);

				const sourceFile = await fileStorageService.getFile(sourceId);
				if (!sourceFile) {
					console.error("Source file not found");
					return;
				}

				console.log(
					`Moving ${sourceFile.name} from ${sourceFile.path} to directory ${targetPath}`,
				);

				// For move operations, we pass the target directory path
				// The service will construct the full new path
				const movedIds = await fileStorageService.batchMoveFiles([
					{
						fileId: sourceId,
						targetPath: targetPath,
					},
				]);

				console.log(`Move completed, new IDs:`, movedIds);
				await refreshFileTree();
			} catch (error) {
				console.error("Error in moveFileOrDirectory:", error);
				if (
					error instanceof Error &&
					error.message !== "File operation cancelled by user"
				) {
					console.error("Error moving file or directory:", error);
				}
			}
		},
		[refreshFileTree],
	);

	const renameFile = useCallback(
		async (fileId: string, newFullPath: string) => {
			try {
				console.log(`renameFile: fileId=${fileId}, newFullPath=${newFullPath}`);

				const originalFile = await fileStorageService.getFile(fileId);
				if (!originalFile) {
					throw new Error("Original file not found");
				}

				const oldPath = originalFile.path;

				if (oldPath === newFullPath.trim()) {
					return fileId;
				}

				console.log(
					`Renaming ${originalFile.name} from ${oldPath} to ${newFullPath}`,
				);

				// For rename operations, we pass the full new path
				const movedIds = await fileStorageService.batchMoveFiles(
					[
						{
							fileId,
							targetPath: newFullPath.trim(),
						},
					],
					{ showConflictDialog: true },
				);

				console.log(`Rename completed, new IDs:`, movedIds);

				// If no files were moved (cancelled), return original ID
				if (movedIds.length === 0) {
					return fileId;
				}

				const newFileId = movedIds[0];

				if (selectedFileId === fileId) {
					setSelectedFileId(newFileId);
				}

				await refreshFileTree();
				return newFileId;
			} catch (error) {
				console.error("Error in renameFile:", error);
				if (
					error instanceof Error &&
					error.message === "File operation cancelled by user"
				) {
					throw error;
				} else {
					console.error("Error renaming/moving file:", error);
					throw error;
				}
			}
		},
		[refreshFileTree, selectedFileId],
	);

	const updateFileContent = useCallback(
		async (fileId: string, content: string) => {
			try {
				const contentBuffer = stringToArrayBuffer(content);
				await fileStorageService.updateFileContent(fileId, contentBuffer);
				await refreshFileTree();
			} catch (error) {
				console.error("Error updating file content:", error);
			}
		},
		[refreshFileTree],
	);

	const contextValue = {
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
		updateFileContent,
		refreshFileTree,
		moveFileOrDirectory,
		extractZipFile,
		storeZipFile,
		enableFileSystemDragDrop,
		enableInternalDragDrop,
		batchDeleteFiles,
		batchMoveFiles,
		batchUnlinkFiles,
	};

	return (
		<FileTreeContext.Provider value={contextValue}>
			{children}
		</FileTreeContext.Provider>
	);
};
