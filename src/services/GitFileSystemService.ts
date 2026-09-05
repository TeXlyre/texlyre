// src/services/GitFileSystemService.ts
import LightningFS from '@isomorphic-git/lightning-fs';
import { nanoid } from 'nanoid';

import { createNamedLogger } from '@/logging';
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
import { DiskHandleStore, ensurePermission } from './DiskHandleStore';
import { fileStoreService } from './FileStoreService';

const moduleLog = createNamedLogger('GitFileSystemService');

const GIT_DIR = '/.git';
const PROJECT_DB_PREFIX = 'texlyre-project-';
const SETTINGS_PREFIX = 'texlyre-git-filesystem:';

type EncodingOptions = string | { encoding?: string | null } | null | undefined;
type WritableData = string | Uint8Array | ArrayBuffer;

type GitFsStat = {
	type: 'file' | 'dir';
	mode: number;
	size: number;
	ino: number;
	mtimeMs: number;
	ctimeMs: number;
	uid: number;
	gid: number;
	dev: number;
	isFile: () => boolean;
	isDirectory: () => boolean;
	isSymbolicLink: () => boolean;
};

export interface GitDiskStatus {
	attached: boolean;
	hasGit: boolean;
	diskHead: string | null;
	browserHead: string | null;
	conflict: boolean;
}

interface GitFileSystemSettings {
	gitCleanAnnotations: boolean;
	storeGitOnDisk: boolean;
}

type GitDiskSyncAction =
	| 'none'
	| 'browser-to-disk'
	| 'disk-to-browser'
	| 'conflict';

const DEFAULT_SETTINGS: GitFileSystemSettings = {
	gitCleanAnnotations: false,
	storeGitOnDisk: false,
};

const MANAGED_GIT_ROOT_FILES = new Set([
	'index',
	'packed-refs',
	'MERGE_HEAD',
	'MERGE_MSG',
	'ORIG_HEAD',
	'CHERRY_PICK_HEAD',
	'REVERT_HEAD',
]);

function decideDiskSync(
	browserSignature: string,
	diskSignature: string,
	baselineSignature: string | null,
): GitDiskSyncAction {
	if (browserSignature === diskSignature) return 'none';
	if (diskSignature === 'none') return 'browser-to-disk';
	if (browserSignature === 'none') return 'disk-to-browser';
	if (baselineSignature !== null) {
		if (diskSignature === baselineSignature) return 'browser-to-disk';
		if (browserSignature === baselineSignature) return 'disk-to-browser';
	}
	return 'conflict';
}

function shouldPruneGitEntry(
	privateDirectoryPath: string,
	entryName: string,
): boolean {
	const path = privateDirectoryPath.replace(/\\/g, '/').replace(/\/$/, '');
	if (path === '/.git') return MANAGED_GIT_ROOT_FILES.has(entryName);
	if (path === '/.git/refs')
		return entryName === 'heads' || entryName === 'texlyre';
	if (
		path === '/.git/refs/heads' ||
		path.startsWith('/.git/refs/heads/') ||
		path === '/.git/refs/texlyre' ||
		path.startsWith('/.git/refs/texlyre/')
	)
		return true;
	if (path === '/.git/logs/refs') return entryName === 'heads';
	return (
		path === '/.git/logs/refs/heads' ||
		path.startsWith('/.git/logs/refs/heads/')
	);
}

function normalizePath(path: string): string {
	const segments: string[] = [];
	for (const segment of path.replace(/\\/g, '/').split('/')) {
		if (!segment || segment === '.') continue;
		if (segment === '..') {
			segments.pop();
			continue;
		}
		segments.push(segment);
	}
	return `/${segments.join('/')}`;
}

function isGitPath(path: string): boolean {
	const normalized = normalizePath(path);
	return normalized === GIT_DIR || normalized.startsWith(`${GIT_DIR}/`);
}

function getEncoding(options?: EncodingOptions): string | undefined {
	if (typeof options === 'string') return options;
	return options?.encoding ?? undefined;
}

function toUint8Array(data: WritableData): Uint8Array {
	if (typeof data === 'string') return new TextEncoder().encode(data);
	if (data instanceof Uint8Array) return data;
	return new Uint8Array(data);
}

function bytesFingerprint(bytes: Uint8Array): string {
	let hash = 0x811c9dc5;
	for (const byte of bytes) {
		hash ^= byte;
		hash = Math.imul(hash, 0x01000193);
	}
	return `${bytes.byteLength}:${(hash >>> 0).toString(16)}`;
}

function fsError(code: string, path: string): Error & { code: string } {
	const error = new Error(`${code}: ${path}`) as Error & { code: string };
	error.code = code;
	return error;
}

function pathInode(path: string): number {
	let hash = 0;
	for (let i = 0; i < path.length; i += 1) {
		hash = (hash * 31 + path.charCodeAt(i)) >>> 0;
	}
	return hash || 1;
}

function makeStat(
	path: string,
	type: 'file' | 'dir',
	size: number,
	mtimeMs: number,
): GitFsStat {
	return {
		type,
		mode: type === 'dir' ? 0o777 : 0o666,
		size,
		ino: pathInode(path),
		mtimeMs,
		ctimeMs: mtimeMs,
		uid: 1,
		gid: 1,
		dev: 1,
		isFile: () => type === 'file',
		isDirectory: () => type === 'dir',
		isSymbolicLink: () => false,
	};
}

class GitFileSystem {
	private readonly privateFs: LightningFS;
	private readonly workspaceHandleStore =
		new DiskHandleStore<FileSystemDirectoryHandle>('texlyre-workspace-handles');
	private diskRoot: FileSystemDirectoryHandle | null = null;
	private diskBaselineSignature: string | null = null;
	private diskConflict = false;
	private diskSyncInProgress = false;

	constructor(private readonly projectId: string) {
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

	private updateSettings(settings: GitFileSystemSettings): void {
		const previous = this.getSettings();
		if (JSON.stringify(previous) === JSON.stringify(settings)) return;
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem(
				`${SETTINGS_PREFIX}${this.projectId}`,
				JSON.stringify(settings),
			);
		}
	}

	private isVisibleWorktreeNode(file: FileNode): boolean {
		return (
			!file.isDeleted &&
			!file.excludeFromSync &&
			!isTemporaryFile(file.path) &&
			!isGitPath(file.path)
		);
	}

	private async ensureProject(): Promise<void> {
		if (fileStoreService.getCurrentProjectId() !== this.projectId) {
			await fileStoreService.initialize(`yjs:${this.projectId}`);
		}
	}

	private async getWorktreeFile(path: string): Promise<FileNode | undefined> {
		await this.ensureProject();
		return fileStoreService.getFileByPath(normalizePath(path), true);
	}

	private getLiveDocumentText(file: FileNode): string | null {
		if (!file.documentId) return null;
		const container = collabService.getDocContainer(
			this.projectId,
			`yjs_${file.documentId}`,
		);
		return container?.doc.getText('codemirror').toString() ?? null;
	}

	private projectText(file: FileNode): string | null {
		const liveText = this.getLiveDocumentText(file);
		if (liveText !== null) return liveText;
		return typeof file.content === 'string' ? file.content : null;
	}

	private projectBytes(file: FileNode): Uint8Array {
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

	private async readWorktreeFile(
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

	private async ensureWorktreeDirectory(path: string): Promise<void> {
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

	private async writeWorktreeFile(
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

	private async unlinkWorktree(path: string): Promise<void> {
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

	private async readdirWorktree(path: string): Promise<string[]> {
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

	private async statWorktree(path: string): Promise<GitFsStat> {
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

	private async rmdirWorktree(path: string): Promise<void> {
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

	private async renameWorktree(from: string, to: string): Promise<void> {
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

	private async privateExists(path: string): Promise<boolean> {
		try {
			await this.privateFs.promises.stat(path);
			return true;
		} catch {
			return false;
		}
	}

	private async readPrivateText(path: string): Promise<string | null> {
		try {
			const value = await this.privateFs.promises.readFile(path);
			return typeof value === 'string'
				? value
				: new TextDecoder().decode(value as Uint8Array);
		} catch {
			return null;
		}
	}

	private async getDiskGitDirectory(
		create = false,
	): Promise<FileSystemDirectoryHandle | null> {
		if (!this.diskRoot) return null;
		try {
			return await this.diskRoot.getDirectoryHandle('.git', { create });
		} catch {
			return null;
		}
	}

	private async readDiskText(
		path: string,
		root?: FileSystemDirectoryHandle,
	): Promise<string | null> {
		try {
			const parts = path.split('/').filter(Boolean);
			const fileName = parts.pop();
			if (!fileName) return null;
			let directory = root ?? (await this.getDiskGitDirectory());
			if (!directory) return null;
			for (const part of parts) {
				directory = await directory.getDirectoryHandle(part);
			}
			return (await (await directory.getFileHandle(fileName)).getFile()).text();
		} catch {
			return null;
		}
	}

	private async readDiskBytes(
		path: string,
		root?: FileSystemDirectoryHandle,
	): Promise<Uint8Array | null> {
		try {
			const parts = path.split('/').filter(Boolean);
			const fileName = parts.pop();
			if (!fileName) return null;
			let directory = root ?? (await this.getDiskGitDirectory());
			if (!directory) return null;
			for (const part of parts) {
				directory = await directory.getDirectoryHandle(part);
			}
			const file = await (await directory.getFileHandle(fileName)).getFile();
			return new Uint8Array(await file.arrayBuffer());
		} catch {
			return null;
		}
	}

	private async resolveHead(
		readText: (path: string) => Promise<string | null>,
	): Promise<string | null> {
		const head = (await readText('HEAD'))?.trim();
		if (!head) return null;
		if (!head.startsWith('ref:')) {
			return /^[0-9a-f]{40}$/i.test(head) ? head : null;
		}

		const ref = head.slice(4).trim();
		const loose = (await readText(ref))?.trim();
		if (loose && /^[0-9a-f]{40}$/i.test(loose)) return loose;

		const packed = await readText('packed-refs');
		if (!packed) return null;
		for (const line of packed.split('\n')) {
			if (!line || line.startsWith('#') || line.startsWith('^')) continue;
			const [oid, name] = line.trim().split(/\s+/, 2);
			if (name === ref && /^[0-9a-f]{40}$/i.test(oid)) return oid;
		}
		return null;
	}

	private async getPrivateHead(): Promise<string | null> {
		return this.resolveHead((path) =>
			this.readPrivateText(`${GIT_DIR}/${path}`),
		);
	}

	private async getDiskHead(): Promise<string | null> {
		return this.resolveHead((path) => this.readDiskText(path));
	}

	private async collectPrivateRefs(
		path: string,
		prefix: string,
		into: string[],
	): Promise<void> {
		let names: string[];
		try {
			names = (await this.privateFs.promises.readdir(path)) as string[];
		} catch {
			return;
		}
		for (const name of names.sort()) {
			const childPath = `${path}/${name}`;
			const logical = prefix ? `${prefix}/${name}` : name;
			const stat = await this.privateFs.promises.stat(childPath);
			if (stat.isDirectory()) {
				await this.collectPrivateRefs(childPath, logical, into);
			} else {
				into.push(
					`${logical}:${(await this.readPrivateText(childPath))?.trim() ?? ''}`,
				);
			}
		}
	}

	private async collectDiskRefs(
		directory: FileSystemDirectoryHandle,
		prefix: string,
		into: string[],
	): Promise<void> {
		const entries: Array<[string, FileSystemHandle]> = [];
		for await (const entry of (directory as any).entries()) entries.push(entry);
		entries.sort(([a], [b]) => a.localeCompare(b));
		for (const [name, handle] of entries) {
			const logical = prefix ? `${prefix}/${name}` : name;
			if (handle.kind === 'directory') {
				await this.collectDiskRefs(
					handle as FileSystemDirectoryHandle,
					logical,
					into,
				);
			} else {
				const file = await (handle as FileSystemFileHandle).getFile();
				into.push(`${logical}:${(await file.text()).trim()}`);
			}
		}
	}

	private async privateSignature(): Promise<string> {
		if (!(await this.privateExists(`${GIT_DIR}/HEAD`))) return 'none';
		const refs: string[] = [];
		await this.collectPrivateRefs(`${GIT_DIR}/refs`, 'refs', refs);
		const head = (await this.readPrivateText(`${GIT_DIR}/HEAD`))?.trim() ?? '';
		const packed =
			(await this.readPrivateText(`${GIT_DIR}/packed-refs`))?.trim() ?? '';
		const config = (await this.readPrivateText(`${GIT_DIR}/config`)) ?? '';
		const rawIndex = await this.privateFs.promises
			.readFile(`${GIT_DIR}/index`)
			.catch(() => null);
		const index = rawIndex
			? bytesFingerprint(
					typeof rawIndex === 'string'
						? new TextEncoder().encode(rawIndex)
						: new Uint8Array(rawIndex as Uint8Array),
				)
			: '';
		return JSON.stringify([head, packed, config, index, ...refs]);
	}

	private async diskSignature(): Promise<string> {
		const gitDirectory = await this.getDiskGitDirectory();
		if (!gitDirectory || !(await this.readDiskText('HEAD', gitDirectory)))
			return 'none';
		const refs: string[] = [];
		try {
			const refsDirectory = await gitDirectory.getDirectoryHandle('refs');
			await this.collectDiskRefs(refsDirectory, 'refs', refs);
		} catch {
			// No loose refs is valid for a repository using packed refs only.
		}
		const head = (await this.readDiskText('HEAD', gitDirectory))?.trim() ?? '';
		const packed =
			(await this.readDiskText('packed-refs', gitDirectory))?.trim() ?? '';
		const config = (await this.readDiskText('config', gitDirectory)) ?? '';
		const rawIndex = await this.readDiskBytes('index', gitDirectory);
		const index = rawIndex ? bytesFingerprint(rawIndex) : '';
		return JSON.stringify([head, packed, config, index, ...refs]);
	}

	private async removePrivateTree(path: string): Promise<void> {
		if (!(await this.privateExists(path))) return;
		const stat = await this.privateFs.promises.stat(path);
		if (!stat.isDirectory()) {
			await this.privateFs.promises.unlink(path);
			return;
		}
		for (const name of (await this.privateFs.promises.readdir(
			path,
		)) as string[]) {
			await this.removePrivateTree(`${path}/${name}`);
		}
		await this.privateFs.promises.rmdir(path);
	}

	private async copyDiskDirectoryToPrivate(
		directory: FileSystemDirectoryHandle,
		privatePath: string,
	): Promise<void> {
		if (!(await this.privateExists(privatePath))) {
			await this.privateFs.promises.mkdir(privatePath);
		}
		for await (const [name, handle] of (directory as any).entries()) {
			if (name.endsWith('.lock')) continue;
			const target = `${privatePath}/${name}`;
			if (handle.kind === 'directory') {
				await this.copyDiskDirectoryToPrivate(
					handle as FileSystemDirectoryHandle,
					target,
				);
				continue;
			}
			const bytes = new Uint8Array(
				await (await (handle as FileSystemFileHandle).getFile()).arrayBuffer(),
			);
			await this.privateFs.promises.writeFile(target, bytes as never);
		}
	}

	private async copyDiskToPrivate(): Promise<void> {
		const gitDirectory = await this.getDiskGitDirectory();
		if (!gitDirectory) return;
		await this.removePrivateTree(GIT_DIR);
		await this.privateFs.promises.mkdir(GIT_DIR);
		await this.copyDiskDirectoryToPrivate(gitDirectory, GIT_DIR);
		await this.privateFs.promises.flush();
	}

	private async writeDiskFile(
		directory: FileSystemDirectoryHandle,
		name: string,
		bytes: Uint8Array,
	): Promise<void> {
		const fileHandle = await directory.getFileHandle(name, { create: true });
		const writable = await fileHandle.createWritable();
		try {
			await writable.write(toArrayBuffer(bytes));
			await writable.close();
		} catch (error) {
			await writable.abort().catch(() => {});
			throw error;
		}
	}

	private async mirrorPrivateDirectoryToDisk(
		privatePath: string,
		diskDirectory: FileSystemDirectoryHandle,
	): Promise<void> {
		const privateNames = new Set(
			((await this.privateFs.promises.readdir(privatePath)) as string[]).filter(
				(name) =>
					!name.endsWith('.lock') &&
					!(
						privatePath === GIT_DIR && ['hooks', 'info', 'logs'].includes(name)
					),
			),
		);
		const diskEntries: Array<[string, FileSystemHandle]> = [];
		for await (const entry of (diskDirectory as any).entries()) {
			diskEntries.push(entry);
		}
		for (const [name] of diskEntries) {
			if (name.endsWith('.lock')) continue;
			if (!privateNames.has(name) && shouldPruneGitEntry(privatePath, name)) {
				await diskDirectory.removeEntry(name, { recursive: true });
			}
		}

		for (const name of privateNames) {
			const source = `${privatePath}/${name}`;
			const stat = await this.privateFs.promises.stat(source);
			if (stat.isDirectory()) {
				const child = await diskDirectory.getDirectoryHandle(name, {
					create: true,
				});
				await this.mirrorPrivateDirectoryToDisk(source, child);
				continue;
			}
			const raw = await this.privateFs.promises.readFile(source);
			const bytes =
				typeof raw === 'string'
					? new TextEncoder().encode(raw)
					: new Uint8Array(raw as Uint8Array);
			await this.writeDiskFile(diskDirectory, name, bytes);
		}
	}

	private async copyPrivateToDisk(): Promise<void> {
		if (!(await this.privateExists(`${GIT_DIR}/HEAD`))) return;
		const gitDirectory = await this.getDiskGitDirectory(true);
		if (!gitDirectory) return;
		await this.mirrorPrivateDirectoryToDisk(GIT_DIR, gitDirectory);
	}

	private dispatchStorageChanged(): void {
		if (typeof document !== 'undefined') {
			document.dispatchEvent(
				new CustomEvent('git-storage-changed', {
					detail: { projectId: this.projectId },
				}),
			);
		}
	}

	async attachStoredDisk(): Promise<GitDiskStatus> {
		const handle = await this.workspaceHandleStore.load(this.projectId);
		if (!handle || !(await ensurePermission(handle, 'readwrite', false))) {
			if (this.diskRoot) this.detachDisk();
			return this.getDiskStatus();
		}

		if (this.diskRoot) {
			try {
				const same = await (
					this.diskRoot as FileSystemDirectoryHandle & {
						isSameEntry?: (other: FileSystemHandle) => Promise<boolean>;
					}
				).isSameEntry?.(handle);
				if (same) return this.getDiskStatus();
			} catch {
				// If identity cannot be checked, reattach conservatively.
			}
		}
		return this.attachDisk(handle);
	}

	async attachDisk(root: FileSystemDirectoryHandle): Promise<GitDiskStatus> {
		if (this.diskRoot) {
			try {
				const same = await (
					this.diskRoot as FileSystemDirectoryHandle & {
						isSameEntry?: (other: FileSystemHandle) => Promise<boolean>;
					}
				).isSameEntry?.(root);
				if (same) return this.getDiskStatus();
			} catch {
				// Continue with a fresh attachment.
			}
		}

		this.diskRoot = root;
		this.diskConflict = false;
		this.diskBaselineSignature = null;

		const diskSignature = await this.diskSignature();
		const privateSignature = await this.privateSignature();
		const diskHasGit = diskSignature !== 'none';
		const browserHead = await this.getPrivateHead();
		const diskHead = await this.getDiskHead();

		if (diskHasGit && !browserHead) {
			await this.copyDiskToPrivate();
			this.diskBaselineSignature = await this.diskSignature();
		} else if (diskHasGit && browserHead) {
			if (diskSignature === privateSignature) {
				this.diskBaselineSignature = diskSignature;
			} else {
				this.diskConflict = true;
			}
		} else if (
			!diskHasGit &&
			browserHead &&
			this.getSettings().storeGitOnDisk
		) {
			await this.copyPrivateToDisk();
			this.diskBaselineSignature = await this.privateSignature();
		}

		this.dispatchStorageChanged();
		return this.getDiskStatus();
	}

	detachDisk(): void {
		this.diskRoot = null;
		this.diskBaselineSignature = null;
		this.diskConflict = false;
		this.dispatchStorageChanged();
	}

	async getDiskStatus(): Promise<GitDiskStatus> {
		const hasGit = (await this.diskSignature()) !== 'none';
		return {
			attached: this.diskRoot !== null,
			hasGit,
			diskHead: hasGit ? await this.getDiskHead() : null,
			browserHead: await this.getPrivateHead(),
			conflict: this.diskConflict,
		};
	}

	async syncGitToDisk(): Promise<GitDiskStatus> {
		if (
			!this.diskRoot ||
			!this.getSettings().storeGitOnDisk ||
			this.diskSyncInProgress
		) {
			return this.getDiskStatus();
		}
		if (this.diskConflict) return this.getDiskStatus();

		this.diskSyncInProgress = true;
		try {
			const privateSignature = await this.privateSignature();
			const diskSignature = await this.diskSignature();
			const action = decideDiskSync(
				privateSignature,
				diskSignature,
				this.diskBaselineSignature,
			);

			if (action === 'none') {
				this.diskBaselineSignature = privateSignature;
				return this.getDiskStatus();
			}
			if (action === 'browser-to-disk') {
				await this.copyPrivateToDisk();
				this.diskBaselineSignature = await this.privateSignature();
				this.dispatchStorageChanged();
				return this.getDiskStatus();
			}
			if (action === 'disk-to-browser') {
				await this.copyDiskToPrivate();
				this.diskBaselineSignature = await this.diskSignature();
				this.dispatchStorageChanged();
				return this.getDiskStatus();
			}

			this.diskConflict = true;
			this.dispatchStorageChanged();
			return this.getDiskStatus();
		} finally {
			this.diskSyncInProgress = false;
		}
	}

	async resolveDiskConflict(
		choice: 'disk' | 'browser',
	): Promise<GitDiskStatus> {
		if (!this.diskRoot) return this.getDiskStatus();
		if (choice === 'disk') await this.copyDiskToPrivate();
		else await this.copyPrivateToDisk();
		this.diskConflict = false;
		this.diskBaselineSignature = await this.privateSignature();
		this.dispatchStorageChanged();
		return this.getDiskStatus();
	}

	readonly fs = {
		promises: {
			readFile: async (path: string, options?: EncodingOptions) => {
				const normalized = normalizePath(path);
				if (isGitPath(normalized)) {
					return this.privateFs.promises.readFile(normalized, options as never);
				}
				return this.readWorktreeFile(normalized, options);
			},
			writeFile: async (
				path: string,
				data: WritableData,
				options?: EncodingOptions,
			) => {
				const normalized = normalizePath(path);
				if (isGitPath(normalized)) {
					await this.privateFs.promises.writeFile(
						normalized,
						data as never,
						options as never,
					);
					return;
				}
				await this.writeWorktreeFile(normalized, data);
			},
			unlink: async (path: string) => {
				const normalized = normalizePath(path);
				if (isGitPath(normalized)) {
					await this.privateFs.promises.unlink(normalized);
					return;
				}
				await this.unlinkWorktree(normalized);
			},
			readdir: async (path: string) => {
				const normalized = normalizePath(path);
				if (isGitPath(normalized)) {
					return this.privateFs.promises.readdir(normalized);
				}

				const entries = await this.readdirWorktree(normalized);
				if (normalized === '/' && (await this.privateExists(GIT_DIR))) {
					return entries.includes('.git') ? entries : [...entries, '.git'];
				}
				return entries;
			},
			mkdir: async (path: string, options?: unknown) => {
				const normalized = normalizePath(path);
				if (normalized === '/') return;
				if (isGitPath(normalized)) {
					await this.privateFs.promises.mkdir(normalized, options as never);
					return;
				}
				await this.ensureWorktreeDirectory(normalized);
			},
			rmdir: async (path: string) => {
				const normalized = normalizePath(path);
				if (isGitPath(normalized)) {
					await this.privateFs.promises.rmdir(normalized);
					return;
				}
				await this.rmdirWorktree(normalized);
			},
			rename: async (from: string, to: string) => {
				const source = normalizePath(from);
				const target = normalizePath(to);
				if (isGitPath(source) !== isGitPath(target)) {
					throw fsError('EXDEV', `${source} -> ${target}`);
				}
				if (isGitPath(source)) {
					await this.privateFs.promises.rename(source, target);
					return;
				}
				await this.renameWorktree(source, target);
			},
			stat: async (path: string, options?: unknown) => {
				const normalized = normalizePath(path);
				if (isGitPath(normalized)) {
					return this.privateFs.promises.stat(normalized, options as never);
				}
				return this.statWorktree(normalized);
			},
			lstat: async (path: string, options?: unknown) => {
				const normalized = normalizePath(path);
				if (isGitPath(normalized)) {
					return this.privateFs.promises.lstat(normalized, options as never);
				}
				return this.statWorktree(normalized);
			},
			readlink: async (path: string) => {
				const normalized = normalizePath(path);
				if (isGitPath(normalized)) {
					return this.privateFs.promises.readlink(normalized);
				}
				throw fsError('EINVAL', normalized);
			},
			symlink: async (target: string, path: string) => {
				const normalized = normalizePath(path);
				if (isGitPath(normalized)) {
					await this.privateFs.promises.symlink(target, normalized);
					return;
				}
				throw fsError('ENOTSUP', normalized);
			},
		},
	};

	async flush(): Promise<void> {
		try {
			await this.privateFs.promises.flush();
			if (this.getSettings().storeGitOnDisk) {
				await this.syncGitToDisk();
			}
		} catch (error) {
			moduleLog.warn('Failed to flush local Git storage:', error);
		}
	}
}

class GitFileSystemService {
	private readonly fileSystems = new Map<string, GitFileSystem>();

	get(projectId: string): GitFileSystem {
		let fileSystem = this.fileSystems.get(projectId);
		if (!fileSystem) {
			fileSystem = new GitFileSystem(projectId);
			this.fileSystems.set(projectId, fileSystem);
		}
		return fileSystem;
	}
}

export const gitFileSystemService = new GitFileSystemService();
