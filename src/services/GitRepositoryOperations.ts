// src/services/GitRepositoryOperations.ts
import { Buffer } from 'buffer';

import type { User } from '../types/auth';
import type { FileNode } from '../types/files';
import { isBinaryFile, toArrayBuffer } from '../utils/fileUtils';
import { DIR, GIT_DIR, WORKTREE_BASE_REF, getGit } from '../utils/gitUtils';
import { fileHandlerService } from './FileHandlerService';
import { fileStoreService } from './FileStoreService';
import { gitFileSystemService } from './GitFileSystemService';

export const DEFAULT_BRANCH = 'main';
export const DEFAULT_EMAIL = 'texlyre@local';

const globalWithBuffer = globalThis as typeof globalThis & {
	Buffer?: typeof Buffer;
};
globalWithBuffer.Buffer ??= Buffer;

export { DIR, GIT_DIR, WORKTREE_BASE_REF, getGit } from '../utils/gitUtils';

export type GitChangeType = 'added' | 'modified' | 'deleted';

export interface GitChange {
	path: string;
	type: GitChangeType;
}

export interface GitBranch {
	name: string;
	oid: string;
}

export interface GitHistoryEntry {
	oid: string;
	message: string;
	authorName: string;
	authorEmail: string;
	timestamp: number;
	fileChanges: GitChange[];
	parents: string[];
	branches: string[];
}

export interface GitProjectState {
	initialized: boolean;
	branch: string | null;
	headOid: string | null;
	worktreeBaseOid: string | null;
	changes: GitChange[];
	worktreeChanges: GitChange[];
	history: GitHistoryEntry[];
	branches: GitBranch[];
}

export interface GitRestoreResult {
	restoredOid: string;
	headOid: string | null;
	safetyCommitOid: string | null;
	safetyCommitMessage: string | null;
}

export interface GitMergeConflict {
	path: string;
	isBinary: boolean;
	baseContent: string | ArrayBuffer;
	localContent: string | ArrayBuffer;
	remoteContent: string | ArrayBuffer;
	baseExists: boolean;
	localExists: boolean;
	remoteExists: boolean;
}

export interface GitMergePlan {
	oursBranch: string;
	theirsBranch: string;
	oursOid: string;
	theirsOid: string;
	conflicts: GitMergeConflict[];
	allowUnrelatedHistories?: boolean;
}

export interface GitBranchMergeOptions {
	allowUnrelatedHistories?: boolean;
}

export type GitBranchMergeResult =
	| {
			status: 'merged';
			oid: string | null;
			alreadyMerged: boolean;
			fastForward: boolean;
			mergeCommit: boolean;
	  }
	| { status: 'conflicts'; plan: GitMergePlan };

export interface GitComparisonFile {
	path: string;
	type: GitChangeType;
	isBinary: boolean;
	leftContent: string | ArrayBuffer;
	rightContent: string | ArrayBuffer;
}

export interface GitComparison {
	leftOid: string;
	rightOid: string | null;
	files: GitComparisonFile[];
}

export type GitComparisonRef =
	| { kind: 'commit'; oid: string }
	| { kind: 'worktree' }
	| { kind: 'empty' };

export function authorForUser(user: User | null): {
	name: string;
	email: string;
} {
	return {
		name: user?.name?.trim() || user?.username?.trim() || 'TeXlyre User',
		email: user?.email?.trim() || DEFAULT_EMAIL,
	};
}

export function changeType(head: number, workdir: number): GitChangeType {
	if (head === 0 && workdir !== 0) return 'added';
	if (head !== 0 && workdir === 0) return 'deleted';
	return 'modified';
}

export function errorCode(error: unknown): string {
	return typeof error === 'object' && error && 'code' in error
		? String(error.code)
		: '';
}

export function comparisonContent(
	path: string,
	bytes: Uint8Array,
): string | ArrayBuffer {
	return isBinaryFile(path)
		? toArrayBuffer(new Uint8Array(bytes))
		: new TextDecoder().decode(bytes);
}

export class GitRepositoryOperations {
	protected repo(projectId: string) {
		const fileSystem = gitFileSystemService.get(projectId);
		return {
			fileSystem,
			options: {
				fs: fileSystem.fs,
				dir: DIR,
				gitdir: GIT_DIR,
			},
		};
	}

	protected async tryResolveRef(
		projectId: string,
		ref: string,
	): Promise<string | null> {
		const git = await getGit();
		const { options } = this.repo(projectId);
		try {
			return await git.resolveRef({ ...options, ref });
		} catch (error) {
			const code = errorCode(error);
			if (code === 'NotFoundError' || code === 'ResolveRefError') return null;
			throw error;
		}
	}

	protected async getVisibleProjectNodes(
		projectId: string,
	): Promise<FileNode[]> {
		if (fileStoreService.getCurrentProjectId() !== projectId) {
			await fileStoreService.initialize(`yjs:${projectId}`);
		}
		return fileStoreService.getAllFiles(false, false, false);
	}

	protected async applyWorktreeMutation<T>(
		projectId: string,
		action: () => Promise<T>,
	): Promise<T> {
		const before = await this.getVisibleProjectNodes(projectId);
		const result = await fileHandlerService.withoutMirroring(action);
		const after = await this.getVisibleProjectNodes(projectId);
		const afterPaths = new Set(after.map((file) => file.path));
		const removed = before.filter(
			(file) => file.type === 'file' && !afterPaths.has(file.path),
		);

		if (removed.length > 0) {
			await fileHandlerService.removeFromDisk(removed);
		}
		if (after.length > 0) {
			await fileHandlerService.mirrorFiles(after);
		}
		return result;
	}

	protected async setWorktreeBase(
		projectId: string,
		oid: string,
	): Promise<void> {
		const git = await getGit();
		const { fileSystem, options } = this.repo(projectId);
		await git.writeRef({
			...options,
			ref: WORKTREE_BASE_REF,
			value: oid,
			force: true,
		});
		await fileSystem.flush();
	}

	protected async worktreeMatchesRef(
		projectId: string,
		ref: string,
	): Promise<boolean> {
		const git = await getGit();
		const { options } = this.repo(projectId);
		try {
			const matrix = await git.statusMatrix({
				...options,
				ref,
				refresh: false,
			});
			return matrix.every(([, head, workdir]) => head === workdir);
		} catch (error) {
			const code = errorCode(error);
			if (code === 'NotFoundError' || code === 'ResolveRefError') return false;
			throw error;
		}
	}

	protected orderHistory(
		entries: Map<string, GitHistoryEntry>,
		headOid: string | null,
	): GitHistoryEntry[] {
		const childCounts = new Map<string, number>();
		for (const oid of entries.keys()) childCounts.set(oid, 0);
		for (const entry of entries.values()) {
			for (const parent of entry.parents) {
				if (entries.has(parent)) {
					childCounts.set(parent, (childCounts.get(parent) ?? 0) + 1);
				}
			}
		}

		const ready = [...entries.values()].filter(
			(entry) => (childCounts.get(entry.oid) ?? 0) === 0,
		);
		const ordered: GitHistoryEntry[] = [];
		const seen = new Set<string>();

		const sortReady = () => {
			ready.sort((a, b) => {
				if (a.oid === headOid) return -1;
				if (b.oid === headOid) return 1;
				return b.timestamp - a.timestamp;
			});
		};

		while (ready.length > 0) {
			sortReady();
			const entry = ready.shift();
			if (!entry || seen.has(entry.oid)) continue;
			seen.add(entry.oid);
			ordered.push(entry);

			for (const parent of entry.parents) {
				if (!entries.has(parent)) continue;
				const remaining = (childCounts.get(parent) ?? 0) - 1;
				childCounts.set(parent, remaining);
				if (remaining === 0) ready.push(entries.get(parent)!);
			}
		}

		for (const entry of entries.values()) {
			if (!seen.has(entry.oid)) ordered.push(entry);
		}
		return ordered;
	}

	protected async readCommitFileMap(
		projectId: string,
		oid: string,
	): Promise<Map<string, string>> {
		const git = await getGit();
		const { options } = this.repo(projectId);
		const { commit } = await git.readCommit({ ...options, oid });
		const files = new Map<string, string>();

		const walkTree = async (treeOid: string, prefix = ''): Promise<void> => {
			const { tree } = await git.readTree({ ...options, oid: treeOid });
			for (const entry of tree) {
				const path = prefix ? `${prefix}/${entry.path}` : entry.path;
				if (entry.type === 'tree') {
					await walkTree(entry.oid, path);
				} else if (entry.type === 'blob') {
					files.set(path, entry.oid);
				}
			}
		};

		await walkTree(commit.tree);
		return files;
	}

	protected async readCommitBlob(
		projectId: string,
		oid: string,
		path: string,
	): Promise<Uint8Array> {
		const git = await getGit();
		const { options } = this.repo(projectId);
		const { blob } = await git.readBlob({ ...options, oid, filepath: path });
		return blob;
	}

	async isInitialized(projectId: string): Promise<boolean> {
		const { fileSystem } = this.repo(projectId);
		try {
			await fileSystem.fs.promises.stat(`${GIT_DIR}/HEAD`);
			return true;
		} catch {
			return false;
		}
	}

	async initialize(projectId: string): Promise<void> {
		if (await this.isInitialized(projectId)) return;

		const git = await getGit();
		const { fileSystem, options } = this.repo(projectId);
		await git.init({ ...options, defaultBranch: DEFAULT_BRANCH });
		await fileSystem.flush();
	}

	async getCurrentBranch(projectId: string): Promise<string | null> {
		if (!(await this.isInitialized(projectId))) return null;

		const git = await getGit();
		const { options } = this.repo(projectId);
		const branch = await git.currentBranch({ ...options, test: true });
		return typeof branch === 'string' ? branch : null;
	}

	async getHeadOid(projectId: string): Promise<string | null> {
		if (!(await this.isInitialized(projectId))) return null;
		return this.tryResolveRef(projectId, 'HEAD');
	}

	async getBranches(projectId: string): Promise<GitBranch[]> {
		if (!(await this.isInitialized(projectId))) return [];

		const git = await getGit();
		const { options } = this.repo(projectId);
		const names = await git.listBranches(options);
		const branches = await Promise.all(
			names.map(async (name) => ({
				name,
				oid: (await this.tryResolveRef(projectId, `refs/heads/${name}`)) ?? '',
			})),
		);
		return branches.filter((branch) => branch.oid);
	}

	async getWorktreeBaseOid(projectId: string): Promise<string | null> {
		if (!(await this.isInitialized(projectId))) return null;

		const [storedBase, headOid] = await Promise.all([
			this.tryResolveRef(projectId, WORKTREE_BASE_REF),
			this.getHeadOid(projectId),
		]);
		if (!storedBase) return headOid;

		if (
			headOid &&
			storedBase !== headOid &&
			(await this.worktreeMatchesRef(projectId, headOid))
		) {
			await this.setWorktreeBase(projectId, headOid);
			return headOid;
		}

		return storedBase;
	}

	protected async getChangesFromRef(
		projectId: string,
		ref: string | null,
	): Promise<GitChange[]> {
		if (!(await this.isInitialized(projectId))) return [];

		const git = await getGit();
		const { options } = this.repo(projectId);
		const matrix = await git.statusMatrix(ref ? { ...options, ref } : options);

		return matrix
			.filter(([, head, workdir]) => head !== workdir)
			.map(([path, head, workdir]) => ({
				path,
				type: changeType(head, workdir),
			}));
	}

	async getChanges(projectId: string): Promise<GitChange[]> {
		return this.getChangesFromRef(projectId, await this.getHeadOid(projectId));
	}

	async getWorktreeChanges(projectId: string): Promise<GitChange[]> {
		return this.getChangesFromRef(
			projectId,
			await this.getWorktreeBaseOid(projectId),
		);
	}

	async getHistory(projectId: string, depth = 50): Promise<GitHistoryEntry[]> {
		if (!(await this.isInitialized(projectId))) return [];

		const git = await getGit();
		const { options } = this.repo(projectId);
		const [branches, headOid, currentBranch] = await Promise.all([
			this.getBranches(projectId),
			this.getHeadOid(projectId),
			this.getCurrentBranch(projectId),
		]);

		const branchNamesByOid = new Map<string, string[]>();
		for (const branch of branches) {
			branchNamesByOid.set(branch.oid, [
				...(branchNamesByOid.get(branch.oid) ?? []),
				branch.name,
			]);
		}

		const refs = branches.map((branch) => branch.name);
		if (!currentBranch || refs.length === 0) refs.unshift('HEAD');

		const entries = new Map<string, GitHistoryEntry>();
		for (const ref of [...new Set(refs)]) {
			try {
				const logEntries = await git.log({
					...options,
					ref,
					depth,
					includeChanges: true,
				});
				for (const entry of logEntries) {
					if (entries.has(entry.oid)) continue;
					const changes = (
						entry.commit as typeof entry.commit & {
							changes?: Array<[string | null, string | null, string | null]>;
						}
					).changes;
					entries.set(entry.oid, {
						oid: entry.oid,
						message: entry.commit.message.trim(),
						authorName: entry.commit.author.name,
						authorEmail: entry.commit.author.email,
						timestamp: entry.commit.author.timestamp * 1000,
						fileChanges: (changes ?? [])
							.filter(
								(change): change is [string | null, string | null, string] =>
									Boolean(change[2]),
							)
							.map(([newOid, oldOid, path]) => ({
								path,
								type: !oldOid ? 'added' : !newOid ? 'deleted' : 'modified',
							})),
						parents: [...entry.commit.parent],
						branches: branchNamesByOid.get(entry.oid) ?? [],
					});
				}
			} catch (error) {
				const code = errorCode(error);
				if (code !== 'NotFoundError' && code !== 'ResolveRefError') throw error;
			}
		}

		return this.orderHistory(entries, headOid);
	}

	protected async stageAll(projectId: string): Promise<void> {
		const git = await getGit();
		const { options } = this.repo(projectId);
		const matrix = await git.statusMatrix(options);
		const changed = matrix.filter(
			([, head, workdir, stage]) => head !== workdir || head !== stage,
		);

		for (const [filepath, , workdir] of changed) {
			if (workdir === 0) {
				await git.remove({ ...options, filepath });
			} else {
				await git.add({ ...options, filepath });
			}
		}
	}

	async commit(
		projectId: string,
		message: string,
		user: User | null,
	): Promise<string> {
		if (!(await this.isInitialized(projectId))) {
			await this.initialize(projectId);
		}

		const trimmedMessage = message.trim();
		if (!trimmedMessage) throw new Error('Commit message is required');
		if ((await this.getChanges(projectId)).length === 0) {
			throw new Error('There are no changes to commit');
		}

		const git = await getGit();
		const { fileSystem, options } = this.repo(projectId);
		await this.stageAll(projectId);
		const oid = await git.commit({
			...options,
			message: trimmedMessage,
			author: authorForUser(user),
		});
		await this.setWorktreeBase(projectId, oid);
		await fileSystem.flush();
		return oid;
	}

	async restore(
		projectId: string,
		oid: string,
		user: User | null,
	): Promise<GitRestoreResult> {
		if (!(await this.isInitialized(projectId))) {
			throw new Error('Git is not initialized for this project');
		}

		let safetyCommitOid: string | null = null;
		let safetyCommitMessage: string | null = null;
		if ((await this.getWorktreeChanges(projectId)).length > 0) {
			safetyCommitMessage = `Save edits before restore to ${oid.slice(0, 7)}`;
			safetyCommitOid = await this.commit(projectId, safetyCommitMessage, user);
		}

		if ((await this.getWorktreeChanges(projectId)).length > 0) {
			throw new Error(
				'Project files changed while preparing the restore. Please try again.',
			);
		}

		const git = await getGit();
		const { fileSystem, options } = this.repo(projectId);
		await this.applyWorktreeMutation(projectId, () =>
			git.checkout({
				...options,
				ref: oid,
				noUpdateHead: true,
				force: true,
				nonBlocking: true,
			}),
		);
		await this.setWorktreeBase(projectId, oid);
		await fileSystem.flush();
		document.dispatchEvent(new CustomEvent('refresh-file-tree'));

		return {
			restoredOid: oid,
			headOid: await this.getHeadOid(projectId),
			safetyCommitOid,
			safetyCommitMessage,
		};
	}

	async createBranch(projectId: string, name: string): Promise<void> {
		if (!(await this.isInitialized(projectId))) {
			throw new Error('Git is not initialized for this project');
		}
		const branchName = name.trim();
		if (!branchName) throw new Error('Branch name is required');

		const git = await getGit();
		const { fileSystem, options } = this.repo(projectId);
		if ((await git.listBranches(options)).includes(branchName)) {
			throw new Error(`Branch "${branchName}" already exists`);
		}
		if (!(await this.getHeadOid(projectId))) {
			throw new Error('Create the first commit before creating a branch');
		}

		await git.branch({ ...options, ref: branchName, checkout: false });
		await fileSystem.flush();
	}

	async deleteBranch(projectId: string, name: string): Promise<void> {
		if (!(await this.isInitialized(projectId))) {
			throw new Error('Git is not initialized for this project');
		}
		const branchName = name.trim();
		const currentBranch = await this.getCurrentBranch(projectId);
		if (branchName === currentBranch) {
			throw new Error(
				'Switch to another branch before deleting the current branch',
			);
		}

		const git = await getGit();
		const { fileSystem, options } = this.repo(projectId);
		if (!(await git.listBranches(options)).includes(branchName)) {
			throw new Error(`Branch "${branchName}" does not exist`);
		}

		await git.deleteBranch({ ...options, ref: branchName });
		await fileSystem.flush();
	}

	async checkout(projectId: string, ref: string): Promise<void> {
		if (!(await this.isInitialized(projectId))) {
			throw new Error('Git is not initialized for this project');
		}
		if ((await this.getChanges(projectId)).length > 0) {
			throw new Error(
				'Commit or restore the current changes before switching branches',
			);
		}

		const git = await getGit();
		const { fileSystem, options } = this.repo(projectId);
		if (!(await git.listBranches(options)).includes(ref)) {
			throw new Error(`Branch "${ref}" does not exist`);
		}
		if ((await this.getChanges(projectId)).length > 0) {
			throw new Error(
				'Project files changed while preparing the branch switch. Please try again.',
			);
		}

		await this.applyWorktreeMutation(projectId, () =>
			git.checkout({ ...options, ref, nonBlocking: true }),
		);
		const headOid = await this.getHeadOid(projectId);
		if (headOid) await this.setWorktreeBase(projectId, headOid);
		await fileSystem.flush();
		document.dispatchEvent(new CustomEvent('refresh-file-tree'));
	}
}
