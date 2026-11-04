// src/services/GitFileSystemService.ts
import { toArrayBuffer } from '../utils/fileUtils';
import { ensurePermission } from './DiskHandleStore';
import { GitWorktreeOperations } from './GitWorktreeOperations';
import {
	moduleLog,
	GIT_DIR,
	SETTINGS_PREFIX,
	decideDiskSync,
	shouldPruneGitEntry,
	isPortableGitFile,
	normalizePath,
	isGitPath,
	toUint8Array,
	bytesFingerprint,
	fsError,
} from '../utils/gitFileSystemUtils';
import type {
	WritableData,
	EncodingOptions,
	GitDiskStatus,
} from '../utils/gitFileSystemUtils';

export type { GitDiskStatus } from '../utils/gitFileSystemUtils';

class GitFileSystem extends GitWorktreeOperations {
	async hasGitBackupObject(path: string): Promise<boolean> {
		return path.startsWith('objects/') && isPortableGitFile(path)
			? this.privateExists(`${GIT_DIR}/${path}`)
			: false;
	}

	private async writeGitBackupFile(
		path: string,
		bytes: Uint8Array,
	): Promise<void> {
		const parts = path.split('/');
		let parent = GIT_DIR;
		if (!(await this.privateExists(parent))) {
			await this.privateFs.promises.mkdir(parent);
		}
		for (const part of parts.slice(0, -1)) {
			parent += `/${part}`;
			if (!(await this.privateExists(parent))) {
				await this.privateFs.promises.mkdir(parent);
			}
		}
		await this.privateFs.promises.writeFile(
			`${GIT_DIR}/${path}`,
			bytes as never,
		);
	}

	async integrateGitBackup(files: Map<string, Uint8Array>): Promise<boolean> {
		if (
			!files.has('HEAD') ||
			[...files.keys()].some((path) => !isPortableGitFile(path))
		) {
			throw new Error('Invalid remote Git backup');
		}
		if (!(await this.privateExists(`${GIT_DIR}/HEAD`))) return false;

		let addedObjects = false;
		for (const [path, bytes] of files) {
			if (
				path.startsWith('objects/') &&
				!(await this.privateExists(`${GIT_DIR}/${path}`))
			) {
				await this.writeGitBackupFile(path, bytes);
				addedObjects = true;
			}
		}

		const refs = new Map<string, string>();
		const packed = files.get('packed-refs');
		if (packed) {
			for (const line of new TextDecoder().decode(packed).split('\n')) {
				const match = /^([0-9a-f]{40}) (refs\/(?:heads|tags)\/[^\s]+)$/.exec(
					line.trim(),
				);
				if (match && isPortableGitFile(match[2])) refs.set(match[2], match[1]);
			}
		}
		for (const [path, bytes] of files) {
			if (!/^refs\/(heads|tags)\/.+/.test(path)) continue;
			const oid = new TextDecoder().decode(bytes).trim();
			if (!/^[0-9a-f]{40}$/.test(oid))
				throw new Error('Invalid remote Git reference');
			refs.set(path, oid);
		}

		const git = await import('isomorphic-git');
		const options = { fs: this.fs, dir: '/', gitdir: GIT_DIR };
		const updates: Array<{
			ref: string;
			previous: string | null;
			oid: string;
		}> = [];
		const resolve = async (ref: string): Promise<string | null> => {
			try {
				return await git.resolveRef({ ...options, ref });
			} catch (error) {
				if (
					(error as { code?: string }).code === 'NotFoundError' ||
					(error as { code?: string }).code === 'ResolveRefError'
				)
					return null;
				throw error;
			}
		};
		for (const [ref, oid] of refs) {
			const previous = await resolve(ref);
			if (previous === oid) continue;
			if (previous) {
				if (!ref.startsWith('refs/heads/')) return false;
				const bases = await git.findMergeBase({
					...options,
					oids: [previous, oid],
				});
				if (bases.includes(oid)) continue;
				if (!bases.includes(previous)) return false;
			}
			updates.push({ ref, previous, oid });
		}
		for (const { ref, previous } of updates) {
			if ((await resolve(ref)) !== previous) return false;
		}
		for (const { ref, oid } of updates) {
			await git.writeRef({ ...options, ref, value: oid, force: true });
		}
		if (updates.length || addedObjects) {
			await this.privateFs.promises.flush();
			if (this.getSettings().storeGitOnDisk) await this.syncGitToDisk();
			if (updates.length) this.dispatchStorageChanged();
		}
		return true;
	}

	async exportGitBackup(
		knownObjects: ReadonlySet<string> = new Set(),
	): Promise<{
		files: Map<string, Uint8Array>;
		reused: Set<string>;
	}> {
		const files = new Map<string, Uint8Array>();
		const reused = new Set<string>();
		if (!(await this.privateExists(`${GIT_DIR}/HEAD`))) {
			await this.attachStoredDisk();
		}
		if (!(await this.privateExists(`${GIT_DIR}/HEAD`)))
			return { files, reused };
		const visit = async (path: string): Promise<void> => {
			for (const name of (await this.privateFs.promises.readdir(
				path,
			)) as string[]) {
				const next = `${path}/${name}`;
				const relative = next.slice(GIT_DIR.length + 1);
				if (
					!['objects', 'refs'].some(
						(dir) => relative === dir || relative.startsWith(`${dir}/`),
					) &&
					!isPortableGitFile(relative)
				)
					continue;
				if (
					relative.startsWith('objects/') &&
					knownObjects.has(relative) &&
					isPortableGitFile(relative)
				) {
					reused.add(relative);
					continue;
				}
				const stat = await this.privateFs.promises.stat(next);
				if (stat.isDirectory()) await visit(next);
				else if (isPortableGitFile(relative)) {
					const bytes = await this.privateFs.promises.readFile(next);
					files.set(relative, toUint8Array(bytes as WritableData));
				}
			}
		};
		await visit(GIT_DIR);
		return { files, reused };
	}

	async canRestoreGitBackup(): Promise<boolean> {
		if (await this.privateExists(`${GIT_DIR}/HEAD`)) return false;
		const disk = await this.attachStoredDisk();
		return (
			!(await this.privateExists(`${GIT_DIR}/HEAD`)) &&
			!disk.hasGit &&
			!this.diskConflict
		);
	}

	async importGitBackup(files: Map<string, Uint8Array>): Promise<boolean> {
		if (await this.privateExists(`${GIT_DIR}/HEAD`)) return false;
		if (
			!files.has('HEAD') ||
			[...files.keys()].some((path) => !isPortableGitFile(path))
		) {
			throw new Error('Invalid remote Git backup');
		}
		if (!(await this.canRestoreGitBackup())) return false;
		try {
			for (const [path, bytes] of files) {
				await this.writeGitBackupFile(path, bytes);
			}
			await this.privateFs.promises.writeFile(
				`${GIT_DIR}/config`,
				'[core]\n\trepositoryformatversion = 0\n\tbare = false\n',
			);
			await this.privateFs.promises.flush();
		} catch (error) {
			await this.removePrivateTree(GIT_DIR);
			throw error;
		}
		if (this.getSettings().storeGitOnDisk) {
			await this.syncGitToDisk();
		}
		this.dispatchStorageChanged();
		return true;
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
			// No loose/detached refs is valid for a repository using packed refs only.
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
		this.markGitBackupDirty();
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
			this.markGitBackupDirty();
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

	getForRemoteBackup(projectId: string): GitFileSystem | null {
		const existing = this.fileSystems.get(projectId);
		if (existing)
			return existing.getSettings().backupGitToRemote ? existing : null;
		if (typeof localStorage === 'undefined') return null;
		try {
			const stored = localStorage.getItem(`${SETTINGS_PREFIX}${projectId}`);
			if (!stored || JSON.parse(stored).backupGitToRemote !== true) return null;
		} catch {
			return null;
		}
		return this.get(projectId);
	}

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
