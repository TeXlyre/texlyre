// src/utils/gitFileSystemUtils.ts
import { createNamedLogger } from '@/logging';
import { GIT_DIR } from './gitUtils';

export { GIT_DIR } from './gitUtils';

export const moduleLog = createNamedLogger('GitFileSystemService');

export const PROJECT_DB_PREFIX = 'texlyre-project-';
export const SETTINGS_PREFIX = 'texlyre-git-filesystem:';
export const BACKUP_DIRTY_PREFIX = 'texlyre-git-backup-dirty:';
export const BACKUP_CONFLICT_PREFIX = 'texlyre-git-backup-conflict:';
export const BACKUP_BASE_PREFIX = 'texlyre-git-backup-base:';

export type EncodingOptions =
	| string
	| { encoding?: string | null }
	| null
	| undefined;
export type WritableData = string | Uint8Array | ArrayBuffer;

export type GitFsStat = {
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

export interface GitFileSystemSettings {
	gitCleanAnnotations: boolean;
	storeGitOnDisk: boolean;
	backupGitToRemote: boolean;
}

export type GitDiskSyncAction =
	| 'none'
	| 'browser-to-disk'
	| 'disk-to-browser'
	| 'conflict';

export const DEFAULT_SETTINGS: GitFileSystemSettings = {
	gitCleanAnnotations: false,
	storeGitOnDisk: false,
	backupGitToRemote: false,
};

export const MANAGED_GIT_ROOT_FILES = new Set([
	'index',
	'packed-refs',
	'MERGE_HEAD',
	'MERGE_MSG',
	'ORIG_HEAD',
	'CHERRY_PICK_HEAD',
	'REVERT_HEAD',
]);

export function decideDiskSync(
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

export function shouldPruneGitEntry(
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

export function isPortableGitFile(path: string): boolean {
	if (
		path.includes('\\') ||
		path.split('/').some((part) => !part || part === '.' || part === '..')
	)
		return false;
	return (
		path === 'HEAD' ||
		path === 'packed-refs' ||
		path === 'shallow' ||
		/^refs\/(heads|tags)\/.+/.test(path) ||
		/^objects\/[a-f0-9]{2}\/[a-f0-9]{38}$/.test(path) ||
		/^objects\/pack\/pack-[a-f0-9]+\.(pack|idx|rev|bitmap)$/.test(path)
	);
}

export function normalizePath(path: string): string {
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

export function isGitPath(path: string): boolean {
	const normalized = normalizePath(path);
	return normalized === GIT_DIR || normalized.startsWith(`${GIT_DIR}/`);
}

export function getEncoding(options?: EncodingOptions): string | undefined {
	if (typeof options === 'string') return options;
	return options?.encoding ?? undefined;
}

export { toBytes as toUint8Array } from './binaryUtils';

export function bytesFingerprint(bytes: Uint8Array): string {
	let hash = 0x811c9dc5;
	for (const byte of bytes) {
		hash ^= byte;
		hash = Math.imul(hash, 0x01000193);
	}
	return `${bytes.byteLength}:${(hash >>> 0).toString(16)}`;
}

export function fsError(code: string, path: string): Error & { code: string } {
	const error = new Error(`${code}: ${path}`) as Error & { code: string };
	error.code = code;
	return error;
}

export function pathInode(path: string): number {
	let hash = 0;
	for (let i = 0; i < path.length; i += 1) {
		hash = (hash * 31 + path.charCodeAt(i)) >>> 0;
	}
	return hash || 1;
}

export function makeStat(
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
