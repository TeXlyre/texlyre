// src/services/FileStorageService.ts
import { type IDBPDatabase, openDB } from "idb";
import { nanoid } from "nanoid";

import type { FileNode } from "../types/files";
import { fileConflictService } from "./FileConflictService";

type FileStorageListener = () => void;
const listeners: FileStorageListener[] = [];

export const fileStorageEventEmitter = {
	onChange(listener: FileStorageListener) {
		listeners.push(listener);
		return () => {
			const index = listeners.indexOf(listener);
			if (index > -1) {
				listeners.splice(index, 1);
			}
		};
	},
	emitChange() {
		for (const listener of listeners) {
			listener();
		}
	},
};

class FileStorageService {
	public db: IDBPDatabase | null = null;
	private readonly DB_PREFIX = "texlyre-project-";
	private readonly FILES_STORE = "files";
	private readonly DB_VERSION = 1;
	private projectId = "";
	private contentCache: Map<string, string> = new Map();

	getCurrentProjectId(): string {
		return this.projectId;
	}

	setProjectId(projectId: string): void {
		this.projectId = projectId;
	}

	async initialize(docUrl?: string): Promise<void> {
		try {
			if (docUrl) {
				const hash = docUrl.split(":").pop() || "";
				const newProjectId = hash;

				if (this.projectId !== newProjectId) {
					await this.cleanup();
					this.setProjectId(newProjectId);
				}
			}

			if (!this.projectId) {
				throw new Error("Project ID not set");
			}

			if (this.db && this.isConnectedToProject(this.projectId)) {
				return;
			}

			if (this.db) {
				this.db.close();
				this.db = null;
			}

			this.contentCache.clear();

			const dbName = `${this.DB_PREFIX}${this.projectId}`;

			this.db = await openDB(dbName, this.DB_VERSION, {
				upgrade: (db, _oldVersion) => {
					if (!db.objectStoreNames.contains(this.FILES_STORE)) {
						const store = db.createObjectStore(this.FILES_STORE, {
							keyPath: "id",
						});
						store.createIndex("path", "path", { unique: false });
					}
				},
			});

			console.log(
				`[FileStorageService] Initialized for project: ${this.projectId}`,
			);
		} catch (error) {
			console.error("Failed to initialize file storage:", error);
			throw error;
		}
	}

	async autoSanitizeDuplicates(): Promise<{
		removed: number;
		kept: number;
	} | null> {
		if (!this.db) await this.initialize();

		const allFiles = await this.getAllFiles(true);
		const pathGroups: Record<string, FileNode[]> = {};

		// Group files by path
		for (const file of allFiles) {
			if (!pathGroups[file.path]) {
				pathGroups[file.path] = [];
			}
			pathGroups[file.path].push(file);
		}

		// Check if there are any duplicates
		const duplicatePaths = Object.entries(pathGroups).filter(
			([_, files]) => files.length > 1,
		);

		if (duplicatePaths.length === 0) {
			return null; // No duplicates found
		}

		let removedCount = 0;
		let keptCount = 0;

		const tx = this.db!.transaction(this.FILES_STORE, "readwrite");
		const store = tx.objectStore(this.FILES_STORE);

		try {
			for (const [path, duplicates] of duplicatePaths) {
				const fileToKeep = this.selectBestDuplicate(duplicates);
				const filesToRemove = duplicates.filter((f) => f.id !== fileToKeep.id);

				console.log(
					`[FileStorageService] Auto-fixing ${duplicates.length} duplicates for path: ${path}`,
				);

				// Remove duplicates
				for (const duplicate of filesToRemove) {
					await store.delete(duplicate.id);
					removedCount++;
				}

				keptCount++;
			}

			await tx.done;
			fileStorageEventEmitter.emitChange();

			return { removed: removedCount, kept: keptCount };
		} catch (error) {
			tx.abort();
			console.error("Error during auto-sanitization:", error);
			throw error;
		}
	}

	private selectBestDuplicate(duplicates: FileNode[]): FileNode {
		const nonDeleted = duplicates.filter((f) => !f.isDeleted);
		const candidates = nonDeleted.length > 0 ? nonDeleted : duplicates;

		return candidates.reduce((best, current) => {
			// Prefer non-deleted
			if (!best.isDeleted && current.isDeleted) return best;
			if (best.isDeleted && !current.isDeleted) return current;

			// Prefer files with content
			const bestHasContent =
				best.content &&
				((typeof best.content === "string" && best.content.length > 0) ||
					(best.content instanceof ArrayBuffer && best.content.byteLength > 0));
			const currentHasContent =
				current.content &&
				((typeof current.content === "string" && current.content.length > 0) ||
					(current.content instanceof ArrayBuffer &&
						current.content.byteLength > 0));

			if (bestHasContent && !currentHasContent) return best;
			if (!bestHasContent && currentHasContent) return current;

			// Prefer linked files
			if (best.documentId && !current.documentId) return best;
			if (!best.documentId && current.documentId) return current;

			// Prefer most recently modified
			return (current.lastModified || 0) > (best.lastModified || 0)
				? current
				: best;
		});
	}

	private async validateLinkedFileOperation(
		file: FileNode,
		operation: "delete" | "overwrite" | "rename",
	): Promise<boolean> {
		if (!file.documentId) return true;

		if (operation === "delete" || operation === "overwrite") {
			const confirmation = await fileConflictService.confirmLinkedFileAction(
				file,
				operation,
			);

			if (confirmation === "cancel") {
				throw new Error("File operation cancelled by user");
			}

			if (confirmation === "show-unlink-dialog") {
				const unlinkConfirmation =
					await fileConflictService.confirmUnlink(file);
				if (unlinkConfirmation === "confirm") {
					file.documentId = undefined;
					await this.storeFile(file, { showConflictDialog: false });
					return true;
				}
				throw new Error("File operation cancelled by user");
			}
		}

		return true;
	}

	async storeFile(
		file: FileNode,
		options?: { showConflictDialog?: boolean; preserveTimestamp?: boolean },
	): Promise<string> {
		if (!this.db) await this.initialize();

		const showDialog = options?.showConflictDialog ?? true;
		const preserveTimestamp = options?.preserveTimestamp ?? false;

		if (!file.isDeleted) {
			file.isDeleted = false;
		}

		if (!preserveTimestamp) {
			file.lastModified = Date.now();
		}

		const existingFile = await this.getFileByPath(file.path, true);

		if (showDialog) {
			if (existingFile && !existingFile.isDeleted) {
				if (existingFile.documentId) {
					await this.validateLinkedFileOperation(existingFile, "overwrite");
				}

				const resolution = await fileConflictService.resolveConflict(
					existingFile,
					file,
				);

				switch (resolution) {
					case "cancel":
						throw new Error("File operation cancelled by user");

					case "keep-both":
						file = await this.createUniqueFile(file);
						break;

					case "overwrite":
						await this.db?.delete(this.FILES_STORE, existingFile.id);
						break;
				}
			} else if (existingFile && existingFile.isDeleted) {
				file.id = existingFile.id;
				file.isDeleted = false;
			}
		} else if (existingFile) {
			file.id = existingFile.id;
			if (existingFile.isDeleted) {
				file.isDeleted = false;
			}
			await this.db?.delete(this.FILES_STORE, existingFile.id);
		}
		await this.db?.put(this.FILES_STORE, file);
		fileStorageEventEmitter.emitChange();
		return file.id;
	}

	async getFile(id: string): Promise<FileNode | undefined> {
		if (!this.db) await this.initialize();
		return this.db?.get(this.FILES_STORE, id);
	}

	async getFilesByIds(ids: string[]): Promise<FileNode[]> {
		if (!this.db) await this.initialize();
		if (!this.db) return [];

		const tx = this.db.transaction(this.FILES_STORE, "readonly");
		const store = tx.objectStore(this.FILES_STORE);
		const files: FileNode[] = [];

		await Promise.all(
			ids.map((id) =>
				store.get(id).then((file) => {
					if (file) {
						files.push(file);
					}
				}),
			),
		);

		return files;
	}

	async batchStoreFiles(
		files: FileNode[],
		options?: {
			showConflictDialog?: boolean;
			preserveTimestamp?: boolean;
			preserveDeletionStatus?: boolean;
		},
	): Promise<string[]> {
		if (!this.db) await this.initialize();

		const showDialog = options?.showConflictDialog ?? true;
		const preserveTimestamp = options?.preserveTimestamp ?? false;
		const preserveDeletionStatus = options?.preserveDeletionStatus ?? false;
		const storedIds: string[] = [];
		const filesToStore: FileNode[] = [];

		const conflicts: { existing: FileNode; new: FileNode }[] = [];

		if (showDialog) {
			for (const file of files) {
				const existingFile = await this.getFileByPath(file.path, true);
				if (
					existingFile &&
					!existingFile.isDeleted &&
					existingFile.id !== file.id
				) {
					conflicts.push({ existing: existingFile, new: file });
				}
			}
		}

		let batchResolution:
			| "overwrite-all"
			| "keep-both-all"
			| "cancel-all"
			| null = null;

		for (let i = 0; i < files.length; i++) {
			const file = files[i];

			if (!preserveTimestamp) {
				file.lastModified = Date.now();
			}

			if (!preserveDeletionStatus) {
				file.isDeleted = false;
			}

			const existingFile = await this.getFileByPath(file.path, true);

			if (existingFile) {
				if (
					showDialog &&
					!existingFile.isDeleted &&
					existingFile.id !== file.id
				) {
					if (existingFile.documentId) {
						await this.validateLinkedFileOperation(existingFile, "overwrite");
					}

					let resolution: string;

					if (batchResolution) {
						resolution = batchResolution.replace("-all", "");
					} else if (conflicts.length > 1) {
						const batchResult = await fileConflictService.resolveBatchConflict(
							existingFile,
							file,
							conflicts.length,
							conflicts.findIndex(
								(c) => c.existing.path === existingFile.path,
							) + 1,
						);

						if (batchResult.endsWith("-all")) {
							batchResolution = batchResult as
								| "overwrite-all"
								| "keep-both-all"
								| "cancel-all";
							resolution = batchResult.replace("-all", "");
						} else {
							resolution = batchResult;
						}
					} else {
						const singleResult = await fileConflictService.resolveConflict(
							existingFile,
							file,
						);
						resolution = singleResult;
					}

					switch (resolution) {
						case "cancel":
							if (batchResolution === "cancel-all") {
								return storedIds;
							}
							continue;

						case "keep-both":
							const uniqueFile = await this.createUniqueFile(file);
							filesToStore.push(uniqueFile);
							break;

						case "overwrite":
							file.id = existingFile.id;
							filesToStore.push(file);
							break;
					}
				} else {
					// Safe overwrite when showConflictDialog is false or file is deleted
					file.id = existingFile.id;
					if (existingFile.isDeleted && !preserveDeletionStatus) {
						file.isDeleted = false;
					}
					filesToStore.push(file);
				}
			} else {
				// New file, no conflicts
				filesToStore.push(file);
			}
		}

		if (filesToStore.length > 0) {
			const tx = this.db!.transaction(this.FILES_STORE, "readwrite");
			const store = tx.objectStore(this.FILES_STORE);

			for (const file of filesToStore) {
				await store.put(file);
				storedIds.push(file.id);
			}

			await tx.done;
			fileStorageEventEmitter.emitChange();
		}

		return storedIds;
	}

	async batchDeleteFiles(
		fileIds: string[],
		options?: {
			showDeleteDialog?: boolean;
			hardDelete?: boolean;
			allowLinkedFileDelete?: boolean;
		},
	): Promise<void> {
		if (!this.db) await this.initialize();

		const showDialog = options?.showDeleteDialog ?? true;
		const hardDelete = options?.hardDelete ?? false;
		const allowLinkedFileDelete = options?.allowLinkedFileDelete ?? false;

		const filesToDelete: FileNode[] = [];
		const linkedFiles: FileNode[] = [];

		for (const id of fileIds) {
			const file = await this.getFile(id);
			if (!file) continue;

			if (file.documentId && !allowLinkedFileDelete) {
				linkedFiles.push(file);
			} else {
				filesToDelete.push(file);
			}
		}

		if (linkedFiles.length > 0) {
			for (const file of linkedFiles) {
				await this.validateLinkedFileOperation(file, "delete");
			}
		}

		if (
			showDialog &&
			filesToDelete.length > 0 &&
			!filesToDelete.some((f) => f.documentId)
		) {
			const confirmation =
				await fileConflictService.confirmBatchDelete(filesToDelete);
			if (confirmation === "cancel") {
				throw new Error("Delete operation cancelled by user");
			}
		}

		if (hardDelete) {
			const tx = this.db!.transaction(this.FILES_STORE, "readwrite");
			const store = tx.objectStore(this.FILES_STORE);

			for (const file of filesToDelete) {
				await store.delete(file.id);
			}

			await tx.done;
		} else {
			const filesToUpdate = filesToDelete.map((file) => ({
				...file,
				isDeleted: true,
				content: undefined,
				lastModified: Date.now(),
				size: 0,
				documentId: allowLinkedFileDelete ? file.documentId : undefined,
			}));

			const tx = this.db!.transaction(this.FILES_STORE, "readwrite");
			const store = tx.objectStore(this.FILES_STORE);
			for (const file of filesToUpdate) {
				await store.put(file);
			}

			await tx.done;
		}

		fileStorageEventEmitter.emitChange();
	}

	async batchMoveFiles(
		moveOperations: Array<{
			fileId: string;
			targetPath: string;
			newName?: string;
		}>,
		options?: { showConflictDialog?: boolean },
	): Promise<string[]> {
		if (!this.db) await this.initialize();

		const showDialog = options?.showConflictDialog ?? true;
		const movedIds: string[] = [];

		for (const operation of moveOperations) {
			try {
				const movedId = await this.moveFile(operation, showDialog);
				if (movedId) {
					movedIds.push(movedId);
				}
			} catch (error) {
				console.error(`Failed to move file ${operation.fileId}:`, error);
			}
		}

		return movedIds;
	}

	private async moveFile(
		operation: { fileId: string; targetPath: string; newName?: string },
		showDialog: boolean,
	): Promise<string | null> {
		const sourceFile = await this.getFile(operation.fileId);
		if (!sourceFile) {
			console.error(`Source file not found: ${operation.fileId}`);
			return null;
		}

		let newFullPath: string;
		let newName: string;

		if (operation.newName) {
			newName = operation.newName;
			newFullPath =
				operation.targetPath === "/"
					? `/${operation.newName}`
					: `${operation.targetPath}/${operation.newName}`;
		} else {
			const targetEndsWithFileName =
				operation.targetPath.endsWith(`/${sourceFile.name}`) ||
				operation.targetPath === `/${sourceFile.name}`;

			if (
				targetEndsWithFileName ||
				(operation.targetPath !== "/" &&
					!operation.targetPath.endsWith("/") &&
					operation.targetPath.includes("/"))
			) {
				newFullPath = operation.targetPath;
				newName = operation.targetPath.split("/").pop() || sourceFile.name;
			} else {
				newName = sourceFile.name;
				newFullPath =
					operation.targetPath === "/"
						? `/${sourceFile.name}`
						: `${operation.targetPath}/${sourceFile.name}`;
			}
		}

		if (sourceFile.path === newFullPath) {
			return sourceFile.id;
		}

		console.log(`Moving file from ${sourceFile.path} to ${newFullPath}`);

		const existingFile = await this.getFileByPath(newFullPath, true);
		const filesToDelete: string[] = [];

		if (
			showDialog &&
			existingFile &&
			!existingFile.isDeleted &&
			existingFile.id !== sourceFile.id
		) {
			if (existingFile.documentId) {
				await this.validateLinkedFileOperation(existingFile, "overwrite");
			}

			const resolution = await fileConflictService.resolveConflict(
				existingFile,
				{ ...sourceFile, path: newFullPath, name: newName },
			);

			switch (resolution) {
				case "cancel":
					return null;

				case "keep-both":
					const uniqueFile = await this.createUniqueFile({
						...sourceFile,
						path: newFullPath,
						name: newName,
					});
					newFullPath = uniqueFile.path;
					newName = uniqueFile.name;
					break;

				case "overwrite":
					filesToDelete.push(existingFile.id);
					break;
			}
		}

		const newFileId = nanoid();
		const newFile: FileNode = {
			...sourceFile,
			id: newFileId,
			path: newFullPath,
			name: newName,
			lastModified: Date.now(),
		};

		const childrenToMove: Array<{ oldId: string; newFile: FileNode }> = [];
		if (sourceFile.type === "directory") {
			const allFiles = await this.getAllFiles();
			const children = allFiles.filter((f) =>
				f.path.startsWith(sourceFile.path + "/"),
			);

			for (const child of children) {
				const relativePath = child.path.substring(sourceFile.path.length);
				const newChildPath = newFullPath + relativePath;
				const newChildId = nanoid();

				childrenToMove.push({
					oldId: child.id,
					newFile: {
						...child,
						id: newChildId,
						path: newChildPath,
						lastModified: Date.now(),
					},
				});
				filesToDelete.push(child.id);
			}
		}

		filesToDelete.push(sourceFile.id);

		const tx = this.db!.transaction(this.FILES_STORE, "readwrite");
		const store = tx.objectStore(this.FILES_STORE);

		try {
			await store.put(newFile);

			for (const childMove of childrenToMove) {
				await store.put(childMove.newFile);
			}

			await tx.done;

			await this.batchDeleteFiles(filesToDelete, {
				showDeleteDialog: false,
				hardDelete: false,
				allowLinkedFileDelete: true,
			});

			console.log(
				`Successfully moved file from ${sourceFile.path} to ${newFullPath}`,
			);

			return newFileId;
		} catch (error) {
			console.error(
				`Transaction failed for moving ${sourceFile.path} to ${newFullPath}:`,
				error,
			);
			tx.abort();
			throw error;
		}
	}

	async batchUnlinkFiles(
		fileIds: string[],
		options?: { showUnlinkDialog?: boolean },
	): Promise<void> {
		if (!this.db) await this.initialize();

		const showDialog = options?.showUnlinkDialog ?? true;
		const filesToUnlink: FileNode[] = [];

		for (const fileId of fileIds) {
			const file = await this.getFile(fileId);
			if (file?.documentId) {
				filesToUnlink.push(file);
			}
		}

		if (filesToUnlink.length === 0) return;

		if (showDialog) {
			const confirmation =
				await fileConflictService.confirmBatchUnlink(filesToUnlink);
			if (confirmation === "cancel") {
				throw new Error("Unlink operation cancelled by user");
			}
		}

		const tx = this.db!.transaction(this.FILES_STORE, "readwrite");
		const store = tx.objectStore(this.FILES_STORE);

		for (const file of filesToUnlink) {
			const updatedFile = {
				...file,
				documentId: undefined,
				lastModified: Date.now(),
			};
			await store.put(updatedFile);
		}

		await tx.done;
		fileStorageEventEmitter.emitChange();
	}

	async deleteFileByPath(
		filePath: string,
		options?: {
			showDeleteDialog?: boolean;
			hardDelete?: boolean;
			allowLinkedFileDelete?: boolean;
		},
	): Promise<void> {
		const file = await this.getFileByPath(filePath, true);
		if (file) {
			await this.deleteFile(file.id, options);
		}
	}

	async getFileByPath(
		path: string,
		includeDeleted = false,
	): Promise<FileNode | undefined> {
		if (!this.db) await this.initialize();
		const index = this.db?.transaction(this.FILES_STORE).store.index("path");
		let cursor = await index.openCursor(IDBKeyRange.only(path));

		while (cursor) {
			const file = cursor.value as FileNode;
			if (includeDeleted || !file.isDeleted) {
				return file;
			}
			cursor = await cursor.continue();
		}

		return undefined;
	}

	async getChildrenByPath(path: string): Promise<FileNode[]> {
		if (!this.db) await this.initialize();

		const tx = this.db?.transaction(this.FILES_STORE);
		const index = tx.store.index("path");
		const files: FileNode[] = [];

		let cursor = await index.openCursor();
		while (cursor) {
			const file = cursor.value as FileNode;
			const filePath = file.path;

			if (
				filePath.startsWith(path) &&
				filePath !== path &&
				!filePath.slice(path.length + 1).includes("/")
			) {
				files.push(file);
			}

			cursor = await cursor.continue();
		}

		return files;
	}

	async getAllFiles(
		includeDeleted = true,
		excludeSyncIgnored = false,
	): Promise<FileNode[]> {
		if (!this.db) await this.initialize();
		const allFiles = await this.db?.getAll(this.FILES_STORE);

		let filteredFiles = allFiles;

		if (!includeDeleted) {
			filteredFiles = filteredFiles.filter((file) => !file.isDeleted);
		}

		if (excludeSyncIgnored) {
			filteredFiles = filteredFiles.filter((file) => !file.excludeFromSync);
		}

		return filteredFiles;
	}

	getFileContentCache(id: string): string | undefined {
		return this.contentCache.get(id);
	}

	setFileContentCache(id: string, content: string): void {
		this.contentCache.set(id, content);
	}

	async updateFileContent(
		id: string,
		content: ArrayBuffer | string,
		options: { showConflictDialog?: boolean; preserveTimestamp?: boolean } = {},
	): Promise<void> {
		if (!this.db) await this.initialize();
		const file = await this.getFile(id);
		if (file) {
			file.content = content;

			if (!options.preserveTimestamp) {
				file.lastModified = Date.now();
			}

			const hasContent =
				content &&
				((typeof content === "string" && content.length > 0) ||
					(content instanceof ArrayBuffer && content.byteLength > 0));

			if (hasContent && file.isDeleted) {
				file.isDeleted = false;
			}

			const finalOptions = { showConflictDialog: false, ...options };
			await this.storeFile(file, finalOptions);
		}
	}

	private async createUniqueFile(file: FileNode): Promise<FileNode> {
		const baseName = file.name.replace(/\.[^/.]+$/, "");
		const extension = file.name.includes(".")
			? `.${file.name.split(".").pop()}`
			: "";
		let counter = 1;
		let newName = `${baseName} (${counter})${extension}`;
		let newPath = file.path.replace(file.name, newName);

		while (await this.getFileByPath(newPath)) {
			counter++;
			newName = `${baseName} (${counter})${extension}`;
			newPath = file.path.replace(file.name, newName);
		}

		return {
			...file,
			name: newName,
			path: newPath,
		};
	}

	async deleteFile(
		id: string,
		options?: {
			showDeleteDialog?: boolean;
			hardDelete?: boolean;
			allowLinkedFileDelete?: boolean;
		},
	): Promise<void> {
		if (!this.db) await this.initialize();

		const showDialog = options?.showDeleteDialog ?? true;
		const hardDelete = options?.hardDelete ?? false;
		const allowLinkedFileDelete = options?.allowLinkedFileDelete ?? false;

		const file = await this.getFile(id);
		if (!file) return;

		if (file.documentId && !allowLinkedFileDelete) {
			await this.validateLinkedFileOperation(file, "delete");
		}

		if (showDialog && !file.documentId) {
			const confirmation = await fileConflictService.confirmDelete(file);
			if (confirmation === "cancel") {
				throw new Error("Delete operation cancelled by user");
			}
		}

		if (hardDelete) {
			await this.db?.delete(this.FILES_STORE, id);
		} else {
			file.isDeleted = true;
			file.content = undefined;
			if (!allowLinkedFileDelete) {
				// TODO (fabawi): Disable auto unlinking for now
				// file.documentId = undefined;
			}
			file.lastModified = Date.now();
			file.size = 0;
			await this.db?.put(this.FILES_STORE, file);
		}
		fileStorageEventEmitter.emitChange();
	}

	async createDirectoryPath(filePath: string): Promise<void> {
		const pathParts = filePath.split("/").filter((part) => part.length > 0);
		pathParts.pop();

		let currentPath = "";

		for (const part of pathParts) {
			currentPath += `/${part}`;

			const existingDir = await this.getFileByPath(currentPath);
			if (!existingDir) {
				const dirFile: FileNode = {
					id: nanoid(),
					name: part,
					path: currentPath,
					type: "directory",
					lastModified: Date.now(),
					size: 0,
					isDeleted: false,
				};

				await this.storeFile(dirFile, { showConflictDialog: false });
				console.log(`[FileStorageService] Created directory: ${currentPath}`);
			} else if (existingDir.isDeleted) {
				existingDir.isDeleted = false;
				existingDir.lastModified = Date.now();
				await this.storeFile(existingDir, { showConflictDialog: false });
				console.log(`[FileStorageService] Restored directory: ${currentPath}`);
			}
		}
	}

	async buildFileTree(): Promise<FileNode[]> {
		const allFiles = await this.getAllFiles();
		const files = allFiles.filter((file) => !file.isDeleted);

		const tree: FileNode[] = [];
		const pathMap: Record<string, FileNode> = {};

		files.forEach((file) => {
			const node: FileNode = {
				id: file.id,
				name: file.name,
				path: file.path,
				type: file.type,
				documentId: file.documentId,
				lastModified: file.lastModified,
				size: file.size,
				isBinary: file.isBinary,
				mimeType: file.mimeType,
				children: file.type === "directory" ? [] : undefined,
			};

			pathMap[file.path] = node;
		});

		files.forEach((file) => {
			const node = pathMap[file.path];

			if (file.path === "/") {
				tree.push(node);
				return;
			}

			const lastSlashIndex = file.path.lastIndexOf("/");
			const parentPath =
				lastSlashIndex === 0 ? "/" : file.path.substring(0, lastSlashIndex);

			const parentNode = pathMap[parentPath];
			if (parentNode?.children) {
				parentNode.children.push(node);
			} else {
				tree.push(node);
			}
		});

		return tree;
	}

	cleanup(): void {
		if (this.db) {
			this.db.close();
			this.db = null;
		}
		this.contentCache.clear();
		this.projectId = "";
		console.log(`[FileStorageService] Cleaned up connection`);
	}

	async switchToProject(docUrl: string): Promise<void> {
		const hash = docUrl.split(":").pop() || "";
		const newProjectId = hash;

		if (this.projectId !== newProjectId) {
			console.log(
				`[FileStorageService] Switching from project ${this.projectId} to ${newProjectId}`,
			);
			await this.cleanup();
			await this.initialize(docUrl);
		}
	}

	isConnectedToProject(projectId: string): boolean {
		return this.projectId === projectId && this.db !== null;
	}
}

export const fileStorageService = new FileStorageService();
