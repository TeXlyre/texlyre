// src/services/FileStoreOperations.ts
import { type IDBPDatabase, openDB } from 'idb';
import { nanoid } from 'nanoid';

import { t } from '@/i18n';
import { createNamedLogger } from '@/logging';
import type { FileNode } from '../types/files';
import { isBinaryFile, toArrayBuffer } from '../utils/fileUtils';
import {
	type FileConflict,
	mergeResolutionService,
} from './MergeResolutionService';
import {
	FileOperationCancelledError,
	fileConflictPromptService,
} from './FileConflictPromptService';
import { fileHandlerService } from './FileHandlerService';
import { isQuotaExceededError, quotaService } from './QuotaService';

export const moduleLog = createNamedLogger('FileStoreService');

export interface FileStorageChange {
	kind: 'content' | 'structure';
	fileId?: string;
	filePath?: string;
	size?: number;
	lastModified?: number;
}

type FileStorageListener = (change: FileStorageChange) => void;
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
	emitChange(change: FileStorageChange = { kind: 'structure' }) {
		for (const listener of listeners) {
			listener(change);
		}

		if (change.kind === 'structure') {
			document.dispatchEvent(new CustomEvent('refresh-file-tree'));
		} else {
			document.dispatchEvent(
				new CustomEvent<FileStorageChange>('file-content-changed', {
					detail: change,
				}),
			);
		}
	},
};

export class FileStoreOperations {
	public db: IDBPDatabase | null = null;
	protected readonly DB_PREFIX = 'texlyre-project-';
	protected readonly FILES_STORE = 'files';
	protected readonly DB_VERSION = 1;
	protected projectId = '';
	protected contentCache: Map<string, string> = new Map();

	getCurrentProjectId(): string {
		return this.projectId;
	}

	protected requireDb(): IDBPDatabase {
		if (!this.db) {
			throw new Error(t('File storage is not initialized'));
		}
		return this.db;
	}

	setProjectId(projectId: string): void {
		this.projectId = projectId;
	}

	async initialize(docUrl?: string): Promise<void> {
		try {
			if (docUrl) {
				const hash = docUrl.split(':').pop() || '';
				const newProjectId = hash;

				if (this.projectId !== newProjectId) {
					await this.cleanup();
					this.setProjectId(newProjectId);
				}
			}

			if (!this.projectId) {
				throw new Error(t('Project ID not set'));
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
							keyPath: 'id',
						});
						store.createIndex('path', 'path', { unique: false });
					}
				},
			});

			moduleLog.info(`Initialized for project: ${this.projectId}`);
		} catch (error) {
			moduleLog.error('Failed to initialize file storage:', error);
			throw error;
		}
	}

	protected getContentSize(file: FileNode): number {
		if (file.type !== 'file' || file.content === undefined) return 0;
		if (typeof file.size === 'number') return file.size;
		if (typeof file.content === 'string') return new Blob([file.content]).size;
		if (file.content instanceof ArrayBuffer) return file.content.byteLength;
		return 0;
	}

	protected async guardWrite<T>(operation: () => Promise<T>): Promise<T> {
		try {
			const result = await operation();
			quotaService.markStale();
			return result;
		} catch (error) {
			if (isQuotaExceededError(error)) {
				quotaService.markStale();
				throw new Error(t('Not enough browser storage to save these files'));
			}
			throw error;
		}
	}

	async autoSanitizeDuplicates(): Promise<{
		removed: number;
		kept: number;
	} | null> {
		if (!this.projectId) return null;
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

		const tx = this.requireDb().transaction(this.FILES_STORE, 'readwrite');
		const store = tx.objectStore(this.FILES_STORE);

		try {
			for (const [path, duplicates] of duplicatePaths) {
				const fileToKeep = this.selectBestDuplicate(duplicates);
				const filesToRemove = duplicates.filter((f) => f.id !== fileToKeep.id);

				moduleLog.info(
					`Auto-fixing ${duplicates.length} duplicates for path: ${path}`,
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
			moduleLog.error('Error during auto-sanitization:', error);
			throw error;
		}
	}

	protected selectBestDuplicate(duplicates: FileNode[]): FileNode {
		const nonDeleted = duplicates.filter((f) => !f.isDeleted);
		const candidates = nonDeleted.length > 0 ? nonDeleted : duplicates;

		return candidates.reduce((best, current) => {
			// Prefer non-deleted
			if (!best.isDeleted && current.isDeleted) return best;
			if (best.isDeleted && !current.isDeleted) return current;

			// Prefer files with content
			const bestHasContent =
				best.content &&
				((typeof best.content === 'string' && best.content.length > 0) ||
					(best.content instanceof ArrayBuffer && best.content.byteLength > 0));
			const currentHasContent =
				current.content &&
				((typeof current.content === 'string' && current.content.length > 0) ||
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

	protected async validateLinkedFileOperation(
		file: FileNode,
		operation: 'delete' | 'overwrite' | 'rename',
	): Promise<boolean> {
		if (!file.documentId) return true;

		if (operation === 'delete' || operation === 'overwrite') {
			const confirmation =
				await fileConflictPromptService.confirmLinkedFileAction(
					file,
					operation,
				);

			if (confirmation === 'cancel') {
				throw new FileOperationCancelledError();
			}

			if (confirmation === 'show-unlink-dialog') {
				const unlinkConfirmation =
					await fileConflictPromptService.confirmUnlink(file);
				if (unlinkConfirmation === 'confirm') {
					file.documentId = undefined;
					await this.storeFile(file, { showConflictDialog: false });
					return true;
				}
				throw new FileOperationCancelledError();
			}
		}

		return true;
	}

	protected async resolveMerge(
		existingFile: FileNode,
		newFile: FileNode,
	): Promise<FileNode | null> {
		const conflict: FileConflict = {
			path: newFile.path,
			isBinary: isBinaryFile(newFile.path),
			baseContent: undefined,
			localContent: newFile.content ?? '',
			remoteContent: existingFile.content ?? '',
		};
		const resolutions = await mergeResolutionService.resolveConflicts(
			[conflict],
			{ keepLocal: t('Keep New'), keepRemote: t('Keep Existing') },
		);
		if (!resolutions) return null;

		const resolution = resolutions.get(newFile.path);
		if (!resolution || resolution.action === 'keep-remote') return null;

		const merged: FileNode = { ...newFile, id: existingFile.id };
		if (resolution.action === 'merged') {
			merged.content = resolution.content;
			merged.size =
				typeof resolution.content === 'string'
					? new Blob([resolution.content]).size
					: toArrayBuffer(resolution.content).byteLength;
		}
		return merged;
	}

	protected async resolveMergeAll(
		pairs: { existing: FileNode; new: FileNode }[],
	): Promise<Map<string, FileNode> | null> {
		if (pairs.length === 0) return new Map();

		const conflicts: FileConflict[] = pairs.map((p) => ({
			path: p.new.path,
			isBinary: isBinaryFile(p.new.path),
			baseContent: undefined,
			localContent: p.new.content ?? '',
			remoteContent: p.existing.content ?? '',
		}));

		const resolutions = await mergeResolutionService.resolveConflicts(
			conflicts,
			{ keepLocal: t('Keep New'), keepRemote: t('Keep Existing') },
		);
		if (!resolutions) return null;

		const results = new Map<string, FileNode>();
		for (const { existing, new: newFile } of pairs) {
			const resolution = resolutions.get(newFile.path);
			if (!resolution || resolution.action === 'keep-remote') continue;

			const merged: FileNode = { ...newFile, id: existing.id };
			if (resolution.action === 'merged') {
				merged.content = resolution.content;
				merged.size =
					typeof resolution.content === 'string'
						? new Blob([resolution.content]).size
						: toArrayBuffer(resolution.content).byteLength;
			}
			results.set(newFile.path, merged);
		}
		return results;
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

		if (file.type === 'file' && file.content !== undefined) {
			file.size =
				typeof file.content === 'string'
					? new Blob([file.content]).size
					: file.content instanceof ArrayBuffer
						? file.content.byteLength
						: 0;
		}

		await quotaService.ensureSpace(this.getContentSize(file));

		if (!preserveTimestamp) {
			file.lastModified = Date.now();
		}

		const existingFile = await this.getFileByPath(file.path, true);

		file.createdAt =
			existingFile?.createdAt ?? file.createdAt ?? file.lastModified;

		if (showDialog) {
			if (
				existingFile &&
				!existingFile.isDeleted &&
				existingFile.type === 'file' &&
				file.type === 'file'
			) {
				if (existingFile.documentId) {
					await this.validateLinkedFileOperation(existingFile, 'overwrite');
				}

				const resolution = await fileConflictPromptService.resolveConflict(
					existingFile,
					file,
				);

				switch (resolution) {
					case 'cancel':
						throw new FileOperationCancelledError();

					case 'keep-both':
						file = await this.createUniqueFile(file);
						break;

					case 'merge': {
						const merged = await this.resolveMerge(existingFile, file);
						if (!merged) {
							throw new FileOperationCancelledError();
						}
						file = merged;
						await this.db?.delete(this.FILES_STORE, existingFile.id);
						break;
					}

					case 'overwrite':
						await this.db?.delete(this.FILES_STORE, existingFile.id);
						break;
				}
			} else if (existingFile && !existingFile.isDeleted) {
				file.id = existingFile.id;
			} else if (existingFile?.isDeleted) {
				file.id = existingFile.id;
				file.isDeleted = false;
			}
		} else if (existingFile) {
			file.id = existingFile.id;
			if (existingFile.isDeleted && file.isDeleted === undefined) {
				file.isDeleted = false;
			}
			await this.db?.delete(this.FILES_STORE, existingFile.id);
		}
		await this.guardWrite(async () => {
			await this.db?.put(this.FILES_STORE, file);
		});
		await fileHandlerService.mirrorFiles([file]);
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

		const tx = this.db.transaction(this.FILES_STORE, 'readonly');
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
		const index = this.requireDb()
			.transaction(this.FILES_STORE)
			.store.index('path');
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

	async getFilesByPath(
		pathPrefix: string,
		includeDeleted = false,
		options?: {
			fileExtension?: string;
			excludeDirectories?: boolean;
		},
	): Promise<FileNode[]> {
		if (!this.db) await this.initialize();

		const tx = this.requireDb().transaction(this.FILES_STORE);
		const index = tx.store.index('path');
		const files: FileNode[] = [];

		let cursor = await index.openCursor();
		while (cursor) {
			const file = cursor.value as FileNode;

			if (
				file.path.startsWith(pathPrefix) &&
				(includeDeleted || !file.isDeleted)
			) {
				if (options?.excludeDirectories && file.type === 'directory') {
					cursor = await cursor.continue();
					continue;
				}

				if (
					options?.fileExtension &&
					!file.path.endsWith(options.fileExtension)
				) {
					cursor = await cursor.continue();
					continue;
				}

				files.push(file);
			}

			cursor = await cursor.continue();
		}

		return files;
	}

	async getChildrenByPath(path: string): Promise<FileNode[]> {
		if (!this.db) await this.initialize();

		const tx = this.requireDb().transaction(this.FILES_STORE);
		const index = tx.store.index('path');
		const files: FileNode[] = [];

		let cursor = await index.openCursor();
		while (cursor) {
			const file = cursor.value as FileNode;
			const filePath = file.path;

			if (
				filePath.startsWith(path) &&
				filePath !== path &&
				!filePath.slice(path.length + 1).includes('/')
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
		includeContent = true,
	): Promise<FileNode[]> {
		if (!this.db) await this.initialize();
		const allFiles = await this.requireDb().getAll(this.FILES_STORE);

		let filteredFiles = allFiles;

		if (!includeDeleted) {
			filteredFiles = filteredFiles.filter((file) => !file.isDeleted);
		}

		if (excludeSyncIgnored) {
			filteredFiles = filteredFiles.filter((file) => !file.excludeFromSync);
		}

		if (!includeContent) {
			filteredFiles = filteredFiles.map(
				({ content, ...rest }) => rest as FileNode,
			);
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
		options: { preserveTimestamp?: boolean } = {},
	): Promise<FileNode | undefined> {
		if (!this.db) await this.initialize();
		const file = await this.getFile(id);
		if (!file) return undefined;

		const wasDeleted = Boolean(file.isDeleted);
		file.content = content;
		file.size =
			typeof content === 'string'
				? new Blob([content]).size
				: content.byteLength;

		if (!options.preserveTimestamp) {
			file.lastModified = Date.now();
		}

		const hasContent =
			(typeof content === 'string' && content.length > 0) ||
			(content instanceof ArrayBuffer && content.byteLength > 0);

		if (hasContent && file.isDeleted) {
			file.isDeleted = false;
		}

		await quotaService.ensureSpace(this.getContentSize(file));
		await this.guardWrite(async () => {
			await this.db?.put(this.FILES_STORE, file);
		});
		await fileHandlerService.mirrorFiles([file]);

		fileStorageEventEmitter.emitChange(
			wasDeleted !== Boolean(file.isDeleted)
				? { kind: 'structure' }
				: {
						kind: 'content',
						fileId: file.id,
						filePath: file.path,
						size: file.size,
						lastModified: file.lastModified,
					},
		);
		return file;
	}

	protected async createUniqueFile(file: FileNode): Promise<FileNode> {
		const baseName = file.name.replace(/\.[^/.]+$/, '');
		const extension = file.name.includes('.')
			? `.${file.name.split('.').pop()}`
			: '';
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
			createdAt: file.lastModified,
			launchHandle: undefined,
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
			await this.validateLinkedFileOperation(file, 'delete');
		}

		if (showDialog && !file.documentId) {
			const confirmation = await fileConflictPromptService.confirmDelete(file);
			if (confirmation === 'cancel') {
				throw new Error(t('Delete operation cancelled by user'));
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
		await fileHandlerService.removeFromDisk([file]);
		fileStorageEventEmitter.emitChange();
	}

	async createDirectoryPath(filePath: string): Promise<void> {
		const pathParts = filePath.split('/').filter((part) => part.length > 0);
		pathParts.pop();

		let currentPath = '';

		for (const part of pathParts) {
			currentPath += `/${part}`;

			const existingDir = await this.getFileByPath(currentPath);
			if (!existingDir) {
				const dirFile: FileNode = {
					id: nanoid(),
					name: part,
					path: currentPath,
					type: 'directory',
					lastModified: Date.now(),
					size: 0,
					isDeleted: false,
				};

				await this.storeFile(dirFile, { showConflictDialog: false });
				moduleLog.info(`Created directory: ${currentPath}`);
			} else if (existingDir.isDeleted) {
				existingDir.isDeleted = false;
				existingDir.lastModified = Date.now();
				await this.storeFile(existingDir, { showConflictDialog: false });
				moduleLog.info(`Restored directory: ${currentPath}`);
			}
		}
	}

	async buildFileTree(): Promise<FileNode[]> {
		const allFiles = await this.getAllFiles(true, false, false);
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
				createdAt: file.createdAt,
				lastModified: file.lastModified,
				size: file.size,
				isBinary: file.isBinary,
				mimeType: file.mimeType,
				launchHandle: file.launchHandle,
				children: file.type === 'directory' ? [] : undefined,
			};

			pathMap[file.path] = node;
		});

		files.forEach((file) => {
			const node = pathMap[file.path];

			if (file.path === '/') {
				tree.push(node);
				return;
			}

			const lastSlashIndex = file.path.lastIndexOf('/');
			const parentPath =
				lastSlashIndex === 0 ? '/' : file.path.substring(0, lastSlashIndex);

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
		this.projectId = '';
		moduleLog.info('Cleaned up connection');
	}

	async switchToProject(docUrl: string): Promise<void> {
		const hash = docUrl.split(':').pop() || '';
		const newProjectId = hash;

		if (this.projectId !== newProjectId) {
			moduleLog.info(
				`Switching from project ${this.projectId} to ${newProjectId}`,
			);
			await this.cleanup();
			await this.initialize(docUrl);
		}
	}

	isConnectedToProject(projectId: string): boolean {
		return this.projectId === projectId && this.db !== null;
	}
}
