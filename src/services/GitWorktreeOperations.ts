// src/services/GitWorktreeOperations.ts
import LightningFS from '@isomorphic-git/lightning-fs';
import { nanoid } from 'nanoid';

import type { FileNode } from '../types/files';
import { mergeAnnotatedSources } from '../utils/annotationMergeUtils';
import { stripAnnotations } from '../utils/fileCommentUtils';
import {
	getMimeType,
	isBinaryFile,
	isTemporaryFile,
	toArrayBuffer,
} from '../utils/fileUtils';
import { collabService } from './CollabService';
import { DiskHandleStore } from './DiskHandleStore';
import { fileStoreService } from './FileStoreService';
import {
	PROJECT_DB_PREFIX,
	SETTINGS_PREFIX,
	BACKUP_DIRTY_PREFIX,
	BACKUP_CONFLICT_PREFIX,
	BACKUP_BASE_PREFIX,
	DEFAULT_SETTINGS,
	normalizePath,
	isGitPath,
	getEncoding,
	toUint8Array,
	fsError,
	makeStat,
} from '../utils/gitFileSystemUtils';
import type {
	GitFsStat,
	GitFileSystemSettings,
	WritableData,
	EncodingOptions,
} from '../utils/gitFileSystemUtils';

export class GitWorktreeOperations {
	protected readonly privateFs: LightningFS;
	protected readonly workspaceHandleStore =
		new DiskHandleStore<FileSystemDirectoryHandle>('texlyre-workspace-handles');
	protected diskRoot: FileSystemDirectoryHandle | null = null;
	protected diskBaselineSignature: string | null = null;
	protected diskConflict = false;
	protected diskSyncInProgress = false;

	constructor(protected readonly projectId: string) {
		this.privateFs = new LightningFS(`${PROJECT_DB_PREFIX}${projectId}-git`);
	}

	getSettings(): GitFileSystemSettings {
		if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };
		try {
			const stored = localStorage.getItem(
				`${SETTINGS_PREFIX}${this.projectId}`,
			);
			return stored
				? { ...DEFAULT_SETTINGS, ...JSON.parse(stored) }
				: { ...DEFAULT_SETTINGS };
		} catch {
			return { ...DEFAULT_SETTINGS };
		}
	}

	setGitCleanAnnotations(clean: boolean): void {
		this.updateSettings({ ...this.getSettings(), gitCleanAnnotations: clean });
	}

	linkGitToDisk(): void {
		this.updateSettings({ ...this.getSettings(), storeGitOnDisk: true });
	}

	unlinkGitFromDisk(): void {
		this.updateSettings({ ...this.getSettings(), storeGitOnDisk: false });
	}

	setRemoteGitBackup(enabled: boolean): void {
		this.updateSettings({ ...this.getSettings(), backupGitToRemote: enabled });
		if (enabled) this.markGitBackupDirty();
		else this.setGitBackupConflict(false);
	}

	hasGitBackupConflict(): boolean {
		return (
			typeof localStorage !== 'undefined' &&
			localStorage.getItem(`${BACKUP_CONFLICT_PREFIX}${this.projectId}`) ===
				'true'
		);
	}

	setGitBackupConflict(conflict: boolean): void {
		if (typeof localStorage === 'undefined') return;
		if (conflict) {
			localStorage.setItem(
				`${BACKUP_CONFLICT_PREFIX}${this.projectId}`,
				'true',
			);
		} else
			localStorage.removeItem(`${BACKUP_CONFLICT_PREFIX}${this.projectId}`);
	}

	getGitBackupBase(): string | null {
		return typeof localStorage === 'undefined'
			? null
			: localStorage.getItem(`${BACKUP_BASE_PREFIX}${this.projectId}`);
	}

	getGitBackupDirty(): string | null {
		if (
			!this.getSettings().backupGitToRemote ||
			typeof localStorage === 'undefined'
		) {
			return null;
		}
		return localStorage.getItem(`${BACKUP_DIRTY_PREFIX}${this.projectId}`);
	}

	markGitBackupSynced(marker: string, signature: string): void {
		localStorage.setItem(`${BACKUP_BASE_PREFIX}${this.projectId}`, signature);
		if (this.getGitBackupDirty() === marker) {
			this.setGitBackupConflict(false);
			localStorage.removeItem(`${BACKUP_DIRTY_PREFIX}${this.projectId}`);
		}
	}

	adoptGitBackup(signature: string): void {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(`${BACKUP_BASE_PREFIX}${this.projectId}`, signature);
		}
		this.setGitBackupConflict(false);
	}

	protected markGitBackupDirty(): void {
		if (!this.getSettings().backupGitToRemote) return;
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(`${BACKUP_DIRTY_PREFIX}${this.projectId}`, nanoid());
		}
		if (typeof document !== 'undefined') {
			document.dispatchEvent(
				new CustomEvent('git-backup-changed', {
					detail: { projectId: this.projectId },
				}),
			);
		}
	}

	protected updateSettings(settings: GitFileSystemSettings): void {
		const previous = this.getSettings();
		if (JSON.stringify(previous) === JSON.stringify(settings)) return;
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(
				`${SETTINGS_PREFIX}${this.projectId}`,
				JSON.stringify(settings),
			);
		}
	}

	protected isVisibleWorktreeNode(file: FileNode): boolean {
		return (
			!file.isDeleted &&
			!file.excludeFromSync &&
			!isTemporaryFile(file.path) &&
			!isGitPath(file.path)
		);
	}

	protected async ensureProject(): Promise<void> {
		if (fileStoreService.getCurrentProjectId() !== this.projectId) {
			await fileStoreService.initialize(`yjs:${this.projectId}`);
		}
	}

	protected async getWorktreeFile(path: string): Promise<FileNode | undefined> {
		await this.ensureProject();
		return fileStoreService.getFileByPath(normalizePath(path), true);
	}

	protected getLiveDocumentText(file: FileNode): string | null {
		if (!file.documentId) return null;
		const container = collabService.getDocContainer(
			this.projectId,
			`yjs_${file.documentId}`,
		);
		return container?.doc.getText('codemirror').toString() ?? null;
	}

	protected projectText(file: FileNode): string | null {
		const liveText = this.getLiveDocumentText(file);
		if (liveText !== null) return liveText;
		return typeof file.content === 'string' ? file.content : null;
	}

	protected projectBytes(file: FileNode): Uint8Array {
		const text = this.projectText(file);
		if (text !== null) {
			const projected = this.getSettings().gitCleanAnnotations
				? (stripAnnotations(text) as string)
				: text;
			return new TextEncoder().encode(projected);
		}
		return file.content instanceof ArrayBuffer
			? new Uint8Array(file.content)
			: new Uint8Array();
	}

	protected async readWorktreeFile(
		path: string,
		options?: EncodingOptions,
	): Promise<string | Uint8Array> {
		const normalized = normalizePath(path);
		const file = await this.getWorktreeFile(normalized);
		if (!file || !this.isVisibleWorktreeNode(file)) {
			throw fsError('ENOENT', normalized);
		}
		if (file.type !== 'file') throw fsError('EISDIR', normalized);

		const bytes = this.projectBytes(file);
		return getEncoding(options) ? new TextDecoder().decode(bytes) : bytes;
	}

	protected async ensureWorktreeDirectory(path: string): Promise<void> {
		const normalized = normalizePath(path);
		if (normalized === '/') return;

		await this.ensureProject();
		const segments = normalized.split('/').filter(Boolean);
		let current = '';

		for (const segment of segments) {
			current += `/${segment}`;
			const existing = await fileStoreService.getFileByPath(current, true);
			if (existing && !existing.isDeleted) {
				if (existing.type !== 'directory') throw fsError('ENOTDIR', current);
				continue;
			}

			const directory: FileNode = existing
				? { ...existing, isDeleted: false, lastModified: Date.now() }
				: {
						id: nanoid(),
						name: segment,
						path: current,
						type: 'directory',
						lastModified: Date.now(),
					};

			await fileStoreService.storeFile(directory, {
				showConflictDialog: false,
			});
		}
	}

	protected async writeWorktreeFile(
		path: string,
		data: WritableData,
	): Promise<void> {
		const normalized = normalizePath(path);
		const fileName = normalized.split('/').pop();
		if (!fileName) throw fsError('EISDIR', normalized);
		if (isGitPath(normalized)) throw fsError('EINVAL', normalized);

		await this.ensureProject();
		const parentPath = normalized.slice(0, normalized.lastIndexOf('/')) || '/';
		await this.ensureWorktreeDirectory(parentPath);

		const incomingBytes = toUint8Array(data);
		const binary = isBinaryFile(normalized);
		const existing = await fileStoreService.getFileByPath(normalized, true);

		if (existing && existing.type === 'directory' && !existing.isDeleted) {
			throw fsError('EISDIR', normalized);
		}

		let content: string | ArrayBuffer;
		if (binary) {
			content = toArrayBuffer(incomingBytes);
		} else {
			const incoming = new TextDecoder().decode(incomingBytes);
			const existingText = existing ? this.projectText(existing) : null;
			content =
				this.getSettings().gitCleanAnnotations && existingText !== null
					? mergeAnnotatedSources([existingText, incoming], incoming).content
					: incoming;
		}

		const storedBytes =
			typeof content === 'string'
				? new TextEncoder().encode(content)
				: new Uint8Array(content);
		const file: FileNode = existing
			? {
					...existing,
					name: fileName,
					path: normalized,
					content,
					isDeleted: false,
					isBinary: binary,
					mimeType: getMimeType(fileName),
					lastModified: Date.now(),
					size: storedBytes.byteLength,
				}
			: {
					id: nanoid(),
					name: fileName,
					path: normalized,
					type: 'file',
					content,
					isBinary: binary,
					mimeType: getMimeType(fileName),
					lastModified: Date.now(),
					size: storedBytes.byteLength,
				};

		await fileStoreService.storeFile(file, { showConflictDialog: false });

		if (file.documentId && !binary) {
			await collabService.updateDocumentContent(
				this.projectId,
				file.documentId,
				() => content as string,
			);
		}
	}

	protected async unlinkWorktree(path: string): Promise<void> {
		const normalized = normalizePath(path);
		const file = await this.getWorktreeFile(normalized);
		if (!file || file.isDeleted) throw fsError('ENOENT', normalized);
		if (file.type !== 'file') throw fsError('EISDIR', normalized);

		await fileStoreService.deleteFileByPath(normalized, {
			showDeleteDialog: false,
			hardDelete: false,
			allowLinkedFileDelete: true,
		});
	}

	protected async readdirWorktree(path: string): Promise<string[]> {
		const normalized = normalizePath(path);
		await this.ensureProject();

		if (normalized !== '/') {
			const directory = await fileStoreService.getFileByPath(normalized, true);
			if (!directory || directory.isDeleted)
				throw fsError('ENOENT', normalized);
			if (directory.type !== 'directory') throw fsError('ENOTDIR', normalized);
		}

		return (await fileStoreService.getChildrenByPath(normalized))
			.filter((file) => this.isVisibleWorktreeNode(file))
			.map((file) => file.name);
	}

	protected async statWorktree(path: string): Promise<GitFsStat> {
		const normalized = normalizePath(path);
		if (normalized === '/') return makeStat('/', 'dir', 0, Date.now());

		const file = await this.getWorktreeFile(normalized);
		if (!file || !this.isVisibleWorktreeNode(file)) {
			throw fsError('ENOENT', normalized);
		}

		if (file.type === 'directory') {
			return makeStat(normalized, 'dir', 0, file.lastModified || Date.now());
		}

		return makeStat(
			normalized,
			'file',
			this.projectBytes(file).byteLength,
			this.getLiveDocumentText(file) !== null
				? Date.now()
				: file.lastModified || Date.now(),
		);
	}

	protected async rmdirWorktree(path: string): Promise<void> {
		const normalized = normalizePath(path);
		if (normalized === '/') throw fsError('EBUSY', normalized);

		const directory = await this.getWorktreeFile(normalized);
		if (!directory || directory.isDeleted) throw fsError('ENOENT', normalized);
		if (directory.type !== 'directory') throw fsError('ENOTDIR', normalized);

		const children = (
			await fileStoreService.getChildrenByPath(normalized)
		).filter((file) => !file.isDeleted);
		if (children.length > 0) throw fsError('ENOTEMPTY', normalized);

		await fileStoreService.deleteFileByPath(normalized, {
			showDeleteDialog: false,
			hardDelete: false,
			allowLinkedFileDelete: true,
		});
	}

	protected async renameWorktree(from: string, to: string): Promise<void> {
		const sourcePath = normalizePath(from);
		const targetPath = normalizePath(to);
		const source = await this.getWorktreeFile(sourcePath);
		if (!source || source.isDeleted) throw fsError('ENOENT', sourcePath);

		const targetParent =
			targetPath.slice(0, targetPath.lastIndexOf('/')) || '/';
		await this.ensureWorktreeDirectory(targetParent);
		const moved = await fileStoreService.batchMoveFiles(
			[{ fileId: source.id, targetPath }],
			{ showConflictDialog: false },
		);
		if (moved.length === 0) throw fsError('EIO', sourcePath);
	}
}
