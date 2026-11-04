// src/services/FileStoreService.ts
import { nanoid } from 'nanoid';

import { t } from '@/i18n';
import type { FileNode } from '../types/files';
import { fileConflictPromptService } from './FileConflictPromptService';
import { fileHandlerService } from './FileHandlerService';
import { quotaService } from './QuotaService';
import {
	FileStoreOperations,
	fileStorageEventEmitter,
	moduleLog,
} from './FileStoreOperations';

export { fileStorageEventEmitter } from './FileStoreOperations';
export type { FileStorageChange } from './FileStoreOperations';

class FileStoreService extends FileStoreOperations {
	async batchStoreFiles(
		files: FileNode[],
		options?: {
			showConflictDialog?: boolean;
			preserveTimestamp?: boolean;
			preserveDeletionStatus?: boolean;
		},
	): Promise<string[]> {
		if (!this.db) await this.initialize();

		await quotaService.ensureSpace(
			files.reduce((total, file) => total + this.getContentSize(file), 0),
		);

		const showDialog = options?.showConflictDialog ?? true;
		const preserveTimestamp = options?.preserveTimestamp ?? false;
		const preserveDeletionStatus = options?.preserveDeletionStatus ?? false;
		const storedIds: string[] = [];
		const filesToStore: FileNode[] = [];
		const existingByPath = new Map<string, FileNode | undefined>();

		const conflicts: { existing: FileNode; new: FileNode }[] = [];

		if (showDialog) {
			for (const file of files) {
				const existingFile = await this.getFileByPath(file.path, true);
				if (
					existingFile &&
					!existingFile.isDeleted &&
					existingFile.id !== file.id &&
					existingFile.type === 'file' &&
					file.type === 'file'
				) {
					conflicts.push({ existing: existingFile, new: file });
				}
			}
		}

		let batchResolution:
			| 'overwrite-all'
			| 'merge-all'
			| 'keep-both-all'
			| 'cancel-all'
			| null = null;
		let mergeAllResults: Map<string, FileNode> | null = null;

		for (let i = 0; i < files.length; i++) {
			const file = files[i];

			if (file.type === 'file' && file.content !== undefined) {
				file.size =
					typeof file.content === 'string'
						? new Blob([file.content]).size
						: file.content instanceof ArrayBuffer
							? file.content.byteLength
							: 0;
			}

			if (!preserveTimestamp) {
				file.lastModified = Date.now();
			}

			if (!preserveDeletionStatus) {
				file.isDeleted = false;
			}

			const existingFile = await this.getFileByPath(file.path, true);
			existingByPath.set(file.path, existingFile);

			file.createdAt =
				existingFile?.createdAt ?? file.createdAt ?? file.lastModified;

			if (existingFile) {
				if (
					showDialog &&
					!existingFile.isDeleted &&
					existingFile.id !== file.id &&
					existingFile.type === 'file' &&
					file.type === 'file'
				) {
					if (existingFile.documentId) {
						await this.validateLinkedFileOperation(existingFile, 'overwrite');
					}

					let resolution: string;

					if (batchResolution) {
						resolution = batchResolution.replace('-all', '');
					} else if (conflicts.length > 1) {
						const batchResult =
							await fileConflictPromptService.resolveBatchConflict(
								existingFile,
								file,
								conflicts.length,
								conflicts.findIndex(
									(c) => c.existing.path === existingFile.path,
								) + 1,
							);

						if (batchResult.endsWith('-all')) {
							batchResolution = batchResult as
								| 'overwrite-all'
								| 'merge-all'
								| 'keep-both-all'
								| 'cancel-all';
							resolution = batchResult.replace('-all', '');
						} else {
							resolution = batchResult;
						}
					} else {
						const singleResult =
							await fileConflictPromptService.resolveConflict(
								existingFile,
								file,
							);
						resolution = singleResult;
					}

					switch (resolution) {
						case 'cancel':
							if (batchResolution === 'cancel-all') {
								return storedIds;
							}
							continue;

						case 'keep-both': {
							const uniqueFile = await this.createUniqueFile(file);
							filesToStore.push(uniqueFile);
							break;
						}

						case 'merge': {
							if (batchResolution === 'merge-all') {
								if (!mergeAllResults) {
									const resolved = await this.resolveMergeAll(conflicts);
									if (!resolved) return storedIds;
									mergeAllResults = resolved;
								}
								const merged = mergeAllResults.get(file.path);
								if (!merged) continue;
								filesToStore.push(merged);
								break;
							}
							const merged = await this.resolveMerge(existingFile, file);
							if (!merged) continue;
							filesToStore.push(merged);
							break;
						}

						case 'overwrite':
							file.id = existingFile.id;
							filesToStore.push(file);
							break;
					}
				} else {
					file.id = existingFile.id;
					if (existingFile.isDeleted && !preserveDeletionStatus) {
						file.isDeleted = false;
					}
					filesToStore.push(file);
				}
			} else {
				filesToStore.push(file);
			}
		}

		if (filesToStore.length > 0) {
			await this.guardWrite(async () => {
				const tx = this.requireDb().transaction(this.FILES_STORE, 'readwrite');
				const store = tx.objectStore(this.FILES_STORE);

				for (const file of filesToStore) {
					await store.put(file);
					storedIds.push(file.id);
				}

				await tx.done;
			});
			await fileHandlerService.mirrorFiles(filesToStore);

			const structureChanged = filesToStore.some((file) => {
				const existing = existingByPath.get(file.path);
				return (
					!existing ||
					existing.id !== file.id ||
					existing.type !== 'file' ||
					file.type !== 'file' ||
					Boolean(existing.isDeleted) !== Boolean(file.isDeleted) ||
					existing.name !== file.name ||
					existing.documentId !== file.documentId ||
					existing.mimeType !== file.mimeType ||
					existing.isBinary !== file.isBinary ||
					existing.excludeFromSync !== file.excludeFromSync ||
					Boolean(existing.launchHandle) !== Boolean(file.launchHandle)
				);
			});

			if (structureChanged) {
				fileStorageEventEmitter.emitChange();
			} else {
				const changedFiles = filesToStore.filter(
					(file) => !file.excludeFromSync,
				);
				if (changedFiles.length > 0) {
					const changedFile =
						changedFiles.length === 1 ? changedFiles[0] : undefined;
					fileStorageEventEmitter.emitChange({
						kind: 'content',
						fileId: changedFile?.id,
						filePath: changedFile?.path,
						size: changedFile?.size,
						lastModified: changedFile?.lastModified,
					});
				}
			}
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
			if (!file || file.isDeleted) continue;

			if (file.documentId && !allowLinkedFileDelete) {
				linkedFiles.push(file);
			} else {
				filesToDelete.push(file);
			}
		}

		if (linkedFiles.length > 0) {
			for (const file of linkedFiles) {
				await this.validateLinkedFileOperation(file, 'delete');
			}
		}

		if (
			showDialog &&
			filesToDelete.length > 0 &&
			!filesToDelete.some((f) => f.documentId)
		) {
			const confirmation =
				await fileConflictPromptService.confirmBatchDelete(filesToDelete);
			if (confirmation === 'cancel') {
				throw new Error(t('Delete operation cancelled by user'));
			}
		}

		if (hardDelete) {
			const tx = this.requireDb().transaction(this.FILES_STORE, 'readwrite');
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

			const tx = this.requireDb().transaction(this.FILES_STORE, 'readwrite');
			const store = tx.objectStore(this.FILES_STORE);
			for (const file of filesToUpdate) {
				await store.put(file);
			}

			await tx.done;
		}

		await fileHandlerService.removeFromDisk(filesToDelete);
		fileStorageEventEmitter.emitChange();
	}

	async cleanupDirectory(path: string): Promise<void> {
		try {
			const existing = await this.getAllFiles(true, false, false);
			const toCleanup = existing.filter(
				(f) => f.path.startsWith(`${path}/`) && !f.isDeleted,
			);
			if (toCleanup.length > 0) {
				await this.batchDeleteFiles(
					toCleanup.map((f) => f.id),
					{
						showDeleteDialog: false,
						hardDelete: true,
					},
				);
			}
		} catch (error) {
			moduleLog.error(`Error cleaning up ${path}:`, error);
		}
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
				moduleLog.error(`Failed to move file ${operation.fileId}:`, error);
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
			moduleLog.error(`Source file not found: ${operation.fileId}`);
			return null;
		}

		let newFullPath: string;
		let newName: string;

		if (operation.newName) {
			newName = operation.newName;
			newFullPath =
				operation.targetPath === '/'
					? `/${operation.newName}`
					: `${operation.targetPath}/${operation.newName}`;
		} else {
			const targetEndsWithFileName =
				operation.targetPath.endsWith(`/${sourceFile.name}`) ||
				operation.targetPath === `/${sourceFile.name}`;

			if (
				targetEndsWithFileName ||
				(operation.targetPath !== '/' &&
					!operation.targetPath.endsWith('/') &&
					operation.targetPath.includes('/'))
			) {
				newFullPath = operation.targetPath;
				newName = operation.targetPath.split('/').pop() || sourceFile.name;
			} else {
				newName = sourceFile.name;
				newFullPath =
					operation.targetPath === '/'
						? `/${sourceFile.name}`
						: `${operation.targetPath}/${sourceFile.name}`;
			}
		}

		if (sourceFile.path === newFullPath) {
			return sourceFile.id;
		}

		moduleLog.info(`Moving file from ${sourceFile.path} to ${newFullPath}`);

		const existingFile = await this.getFileByPath(newFullPath, true);
		const filesToDelete: string[] = [];

		if (
			showDialog &&
			existingFile &&
			!existingFile.isDeleted &&
			existingFile.id !== sourceFile.id
		) {
			if (existingFile.documentId) {
				await this.validateLinkedFileOperation(existingFile, 'overwrite');
			}

			const resolution = await fileConflictPromptService.resolveConflict(
				existingFile,
				{ ...sourceFile, path: newFullPath, name: newName },
			);

			switch (resolution) {
				case 'cancel':
					return null;

				case 'keep-both': {
					const uniqueFile = await this.createUniqueFile({
						...sourceFile,
						path: newFullPath,
						name: newName,
					});
					newFullPath = uniqueFile.path;
					newName = uniqueFile.name;
					break;
				}

				case 'overwrite':
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
			launchHandle: undefined,
		};

		const childrenToMove: Array<{ oldId: string; newFile: FileNode }> = [];
		if (sourceFile.type === 'directory') {
			const allFiles = await this.getAllFiles();
			const children = allFiles.filter((f) =>
				f.path.startsWith(`${sourceFile.path}/`),
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

		const tx = this.requireDb().transaction(this.FILES_STORE, 'readwrite');
		const store = tx.objectStore(this.FILES_STORE);

		try {
			await store.put(newFile);

			for (const childMove of childrenToMove) {
				await store.put(childMove.newFile);
			}

			await tx.done;

			await fileHandlerService.mirrorFiles([
				newFile,
				...childrenToMove.map((childMove) => childMove.newFile),
			]);

			await this.batchDeleteFiles(filesToDelete, {
				showDeleteDialog: false,
				hardDelete: false,
				allowLinkedFileDelete: true,
			});

			moduleLog.info(
				`Successfully moved file from ${sourceFile.path} to ${newFullPath}`,
			);

			return newFileId;
		} catch (error) {
			moduleLog.error(
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
				await fileConflictPromptService.confirmBatchUnlink(filesToUnlink);
			if (confirmation === 'cancel') {
				throw new Error('Unlink operation cancelled by user');
			}
		}

		const tx = this.requireDb().transaction(this.FILES_STORE, 'readwrite');
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
}

export const fileStoreService = new FileStoreService();
