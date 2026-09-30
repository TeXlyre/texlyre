// src/services/GitService.ts
import { Buffer } from 'buffer';

import type { User } from '../types/auth';
import type { FileNode } from '../types/files';
import { isBinaryFile } from '../utils/fileUtils';
import { fileHandlerService } from './FileHandlerService';
import { fileStoreService } from './FileStoreService';
import { gitFileSystemService } from './GitFileSystemService';

const DIR = '/';
const GIT_DIR = '/.git';
const DEFAULT_BRANCH = 'main';
const DEFAULT_EMAIL = 'texlyre@local';
const WORKTREE_BASE_REF = 'refs/texlyre/worktree-base';

const globalWithBuffer = globalThis as typeof globalThis & {
	Buffer?: typeof Buffer;
};
globalWithBuffer.Buffer ??= Buffer;

let gitPromise: Promise<typeof import('isomorphic-git')> | null = null;
const getGit = () => (gitPromise ??= import('isomorphic-git'));

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

function authorForUser(user: User | null): { name: string; email: string } {
	return {
		name: user?.name?.trim() || user?.username?.trim() || 'TeXlyre User',
		email: user?.email?.trim() || DEFAULT_EMAIL,
	};
}

function changeType(head: number, workdir: number): GitChangeType {
	if (head === 0 && workdir !== 0) return 'added';
	if (head !== 0 && workdir === 0) return 'deleted';
	return 'modified';
}

function errorCode(error: unknown): string {
	return typeof error === 'object' && error && 'code' in error
		? String(error.code)
		: '';
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
	const copy = new Uint8Array(bytes.byteLength);
	copy.set(bytes);
	return copy.buffer;
}

function comparisonContent(
	path: string,
	bytes: Uint8Array,
): string | ArrayBuffer {
	return isBinaryFile(path)
		? toArrayBuffer(bytes)
		: new TextDecoder().decode(bytes);
}

class GitService {
	private repo(projectId: string) {
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

	private async tryResolveRef(
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

	private async getVisibleProjectNodes(projectId: string): Promise<FileNode[]> {
		if (fileStoreService.getCurrentProjectId() !== projectId) {
			await fileStoreService.initialize(`yjs:${projectId}`);
		}
		return fileStoreService.getAllFiles(false, false, false);
	}

	private async applyWorktreeMutation<T>(
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

	private async setWorktreeBase(projectId: string, oid: string): Promise<void> {
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

	private async worktreeMatchesRef(
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

	private orderHistory(
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

	private async readCommitFileMap(
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

	private async readCommitBlob(
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

	private async getChangesFromRef(
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

	private async stageAll(projectId: string): Promise<void> {
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

	private async getMergeConflict(
		projectId: string,
		path: string,
		baseOid: string | null,
		oursOid: string,
		theirsOid: string,
		baseMap: Map<string, string>,
		oursMap: Map<string, string>,
		theirsMap: Map<string, string>,
	): Promise<GitMergeConflict> {
		const baseExists = baseMap.has(path);
		const localExists = oursMap.has(path);
		const remoteExists = theirsMap.has(path);
		const empty = new Uint8Array();
		const [baseBytes, localBytes, remoteBytes] = await Promise.all([
			baseExists && baseOid
				? this.readCommitBlob(projectId, baseOid, path)
				: Promise.resolve(empty),
			localExists
				? this.readCommitBlob(projectId, oursOid, path)
				: Promise.resolve(empty),
			remoteExists
				? this.readCommitBlob(projectId, theirsOid, path)
				: Promise.resolve(empty),
		]);
		return {
			path,
			isBinary: isBinaryFile(path),
			baseContent: comparisonContent(path, baseBytes),
			localContent: comparisonContent(path, localBytes),
			remoteContent: comparisonContent(path, remoteBytes),
			baseExists,
			localExists,
			remoteExists,
		};
	}

	async mergeBranch(
		projectId: string,
		branchName: string,
		user: User | null,
		mergeOptions: GitBranchMergeOptions = {},
	): Promise<GitBranchMergeResult> {
		if (!(await this.isInitialized(projectId))) {
			throw new Error('Git is not initialized for this project');
		}
		if ((await this.getChanges(projectId)).length > 0) {
			throw new Error(
				'Commit or restore the current changes before merging branches',
			);
		}

		const [oursBranch, oursOid] = await Promise.all([
			this.getCurrentBranch(projectId),
			this.getHeadOid(projectId),
		]);
		if (!oursBranch || !oursOid)
			throw new Error('The current branch has no commit to merge into');
		if (branchName === oursBranch)
			throw new Error('Cannot merge a branch into itself');

		const git = await getGit();
		const { fileSystem, options } = this.repo(projectId);
		if (!(await git.listBranches(options)).includes(branchName)) {
			throw new Error(`Branch "${branchName}" does not exist`);
		}
		const theirsOid = await this.tryResolveRef(
			projectId,
			`refs/heads/${branchName}`,
		);
		if (!theirsOid) throw new Error(`Branch "${branchName}" has no commit`);

		const conflictPaths = new Set<string>();
		const probeMergeDriver = async ({
			path,
			contents,
		}: {
			path: string;
			contents: string[];
		}) => {
			conflictPaths.add(path);
			return { cleanMerge: false, mergedText: contents[1] ?? '' };
		};

		try {
			await git.merge({
				...options,
				ours: oursBranch,
				theirs: branchName,
				dryRun: true,
				abortOnConflict: true,
				allowUnrelatedHistories: Boolean(mergeOptions.allowUnrelatedHistories),
				author: authorForUser(user),
				mergeDriver: probeMergeDriver,
			});
		} catch (error) {
			if (conflictPaths.size === 0) throw error;

			const bases = await git.findMergeBase({
				...options,
				oids: [oursOid, theirsOid],
			});
			const baseOid = bases[0] ?? null;
			const [baseMap, oursMap, theirsMap] = await Promise.all([
				baseOid
					? this.readCommitFileMap(projectId, baseOid)
					: Promise.resolve(new Map<string, string>()),
				this.readCommitFileMap(projectId, oursOid),
				this.readCommitFileMap(projectId, theirsOid),
			]);
			const conflicts = await Promise.all(
				[...conflictPaths]
					.sort()
					.map((path) =>
						this.getMergeConflict(
							projectId,
							path,
							baseOid,
							oursOid,
							theirsOid,
							baseMap,
							oursMap,
							theirsMap,
						),
					),
			);
			return {
				status: 'conflicts',
				plan: {
					oursBranch,
					theirsBranch: branchName,
					oursOid,
					theirsOid,
					conflicts,
					allowUnrelatedHistories: Boolean(
						mergeOptions.allowUnrelatedHistories,
					),
				},
			};
		}

		if ((await this.getChanges(projectId)).length > 0) {
			throw new Error(
				'Project files changed while preparing the merge. Please try again.',
			);
		}
		if ((await this.getHeadOid(projectId)) !== oursOid) {
			throw new Error(
				'The current branch changed while preparing the merge. Please try again.',
			);
		}

		const mergeResult = await this.applyWorktreeMutation(projectId, () =>
			git.merge({
				...options,
				ours: oursBranch,
				theirs: branchName,
				abortOnConflict: true,
				allowUnrelatedHistories: Boolean(mergeOptions.allowUnrelatedHistories),
				author: authorForUser(user),
			}),
		);
		const headOid = mergeResult.oid ?? (await this.getHeadOid(projectId));
		if (headOid) await this.setWorktreeBase(projectId, headOid);
		await fileSystem.flush();
		document.dispatchEvent(new CustomEvent('refresh-file-tree'));
		return {
			status: 'merged',
			oid: headOid,
			alreadyMerged: Boolean(mergeResult.alreadyMerged),
			fastForward: Boolean(mergeResult.fastForward),
			mergeCommit: Boolean(mergeResult.mergeCommit),
		};
	}

	async completeBranchMerge(
		projectId: string,
		plan: GitMergePlan,
		resolvedText: Map<string, string>,
		user: User | null,
	): Promise<GitBranchMergeResult> {
		if ((await this.getChanges(projectId)).length > 0) {
			throw new Error(
				'Project files changed while resolving the merge. Please try again.',
			);
		}
		const [currentBranch, currentHead, currentTheirs] = await Promise.all([
			this.getCurrentBranch(projectId),
			this.getHeadOid(projectId),
			this.tryResolveRef(projectId, `refs/heads/${plan.theirsBranch}`),
		]);
		if (
			currentBranch !== plan.oursBranch ||
			currentHead !== plan.oursOid ||
			currentTheirs !== plan.theirsOid
		) {
			throw new Error(
				'A branch changed while resolving the merge. Please start the merge again.',
			);
		}

		const git = await getGit();
		const { fileSystem, options } = this.repo(projectId);
		const mergeResult = await this.applyWorktreeMutation(projectId, () =>
			git.merge({
				...options,
				ours: plan.oursBranch,
				theirs: plan.theirsBranch,
				abortOnConflict: true,
				allowUnrelatedHistories: Boolean(plan.allowUnrelatedHistories),
				author: authorForUser(user),
				mergeDriver: async ({
					path,
					contents,
				}: {
					path: string;
					contents: string[];
				}) => {
					const mergedText = resolvedText.get(path);
					if (mergedText === undefined) {
						return { cleanMerge: false, mergedText: contents[1] ?? '' };
					}
					return { cleanMerge: true, mergedText };
				},
			}),
		);
		const headOid = mergeResult.oid ?? (await this.getHeadOid(projectId));
		if (headOid) await this.setWorktreeBase(projectId, headOid);
		await fileSystem.flush();
		document.dispatchEvent(new CustomEvent('refresh-file-tree'));
		return {
			status: 'merged',
			oid: headOid,
			alreadyMerged: Boolean(mergeResult.alreadyMerged),
			fastForward: Boolean(mergeResult.fastForward),
			mergeCommit: Boolean(mergeResult.mergeCommit),
		};
	}

	async writeWorktreeFile(
		projectId: string,
		path: string,
		content: string,
	): Promise<void> {
		if (!(await this.isInitialized(projectId))) {
			throw new Error('Git is not initialized for this project');
		}
		const { fileSystem } = this.repo(projectId);
		await fileSystem.fs.promises.writeFile(
			`/${path.replace(/^\/+/, '')}`,
			content,
		);
		document.dispatchEvent(new CustomEvent('refresh-file-tree'));
	}

	private async resetPathsToHead(
		projectId: string,
		paths: string[],
	): Promise<void> {
		const headOid = await this.getHeadOid(projectId);
		if (!headOid) throw new Error('There is no HEAD commit to reset to');

		const targets = await Promise.all(
			paths.map(async (path) => ({
				path,
				content: await this.readComparisonRef(projectId, path, {
					kind: 'commit',
					oid: headOid,
				}),
			})),
		);
		const { fileSystem } = this.repo(projectId);

		await this.applyWorktreeMutation(projectId, async () => {
			for (const target of targets) {
				const normalized = `/${target.path.replace(/^\/+/, '')}`;
				if (target.content) {
					await fileSystem.fs.promises.writeFile(normalized, target.content);
					continue;
				}
				try {
					await fileSystem.fs.promises.unlink(normalized);
				} catch (error) {
					if (errorCode(error) !== 'ENOENT') throw error;
				}
			}
		});

		if (await this.worktreeMatchesRef(projectId, headOid)) {
			await this.setWorktreeBase(projectId, headOid);
		}
		document.dispatchEvent(new CustomEvent('refresh-file-tree'));
	}

	async resetFile(projectId: string, path: string): Promise<void> {
		if (!(await this.isInitialized(projectId))) {
			throw new Error('Git is not initialized for this project');
		}
		await this.resetPathsToHead(projectId, [path]);
	}

	async resetAll(projectId: string): Promise<void> {
		if (!(await this.isInitialized(projectId))) {
			throw new Error('Git is not initialized for this project');
		}
		const changes = await this.getChanges(projectId);
		if (changes.length === 0) return;
		await this.resetPathsToHead(
			projectId,
			changes.map((change) => change.path),
		);
	}

	async compare(
		projectId: string,
		leftOid: string,
		rightOid: string | null,
	): Promise<GitComparison> {
		if (!(await this.isInitialized(projectId))) {
			throw new Error('Git is not initialized for this project');
		}

		const git = await getGit();
		const { fileSystem, options } = this.repo(projectId);
		const files: GitComparisonFile[] = [];

		if (rightOid === null) {
			const matrix = await git.statusMatrix({
				...options,
				ref: leftOid,
				refresh: false,
			});
			for (const [path, left, right] of matrix) {
				if (left === right) continue;
				const leftBytes =
					left === 0
						? new Uint8Array()
						: await this.readCommitBlob(projectId, leftOid, path);
				const rightBytes =
					right === 0
						? new Uint8Array()
						: ((await fileSystem.fs.promises.readFile(
								`/${path}`,
							)) as Uint8Array);
				files.push({
					path,
					type: changeType(left, right),
					isBinary: isBinaryFile(path),
					leftContent: comparisonContent(path, leftBytes),
					rightContent: comparisonContent(path, rightBytes),
				});
			}
		} else {
			const [leftFiles, rightFiles] = await Promise.all([
				this.readCommitFileMap(projectId, leftOid),
				this.readCommitFileMap(projectId, rightOid),
			]);
			const paths = [
				...new Set([...leftFiles.keys(), ...rightFiles.keys()]),
			].sort();

			for (const path of paths) {
				const leftBlobOid = leftFiles.get(path);
				const rightBlobOid = rightFiles.get(path);
				if (leftBlobOid === rightBlobOid) continue;

				const [leftBytes, rightBytes] = await Promise.all([
					leftBlobOid
						? this.readCommitBlob(projectId, leftOid, path)
						: Promise.resolve(new Uint8Array()),
					rightBlobOid
						? this.readCommitBlob(projectId, rightOid, path)
						: Promise.resolve(new Uint8Array()),
				]);
				files.push({
					path,
					type: !leftBlobOid ? 'added' : !rightBlobOid ? 'deleted' : 'modified',
					isBinary: isBinaryFile(path),
					leftContent: comparisonContent(path, leftBytes),
					rightContent: comparisonContent(path, rightBytes),
				});
			}
		}

		return { leftOid, rightOid, files };
	}

	private async readComparisonRef(
		projectId: string,
		path: string,
		ref: GitComparisonRef,
	): Promise<Uint8Array | null> {
		if (ref.kind === 'empty') return null;

		if (ref.kind === 'commit') {
			try {
				return await this.readCommitBlob(projectId, ref.oid, path);
			} catch (error) {
				const code = errorCode(error);
				if (code === 'NotFoundError' || code === 'TreeOrBlobNotFoundError') {
					return null;
				}
				throw error;
			}
		}

		const { fileSystem } = this.repo(projectId);
		try {
			return (await fileSystem.fs.promises.readFile(`/${path}`)) as Uint8Array;
		} catch (error) {
			if (errorCode(error) === 'ENOENT') return null;
			throw error;
		}
	}

	async compareFile(
		projectId: string,
		path: string,
		left: GitComparisonRef,
		right: GitComparisonRef,
	): Promise<GitComparisonFile | null> {
		if (!(await this.isInitialized(projectId))) {
			throw new Error('Git is not initialized for this project');
		}

		const [leftBytes, rightBytes] = await Promise.all([
			this.readComparisonRef(projectId, path, left),
			this.readComparisonRef(projectId, path, right),
		]);
		if (!leftBytes && !rightBytes) return null;

		if (leftBytes && rightBytes) {
			if (leftBytes.byteLength === rightBytes.byteLength) {
				let identical = true;
				for (let i = 0; i < leftBytes.byteLength; i += 1) {
					if (leftBytes[i] !== rightBytes[i]) {
						identical = false;
						break;
					}
				}
				if (identical) return null;
			}
		}

		const type: GitChangeType = !leftBytes
			? 'added'
			: !rightBytes
				? 'deleted'
				: 'modified';
		const empty = new Uint8Array();
		return {
			path,
			type,
			isBinary: isBinaryFile(path),
			leftContent: comparisonContent(path, leftBytes ?? empty),
			rightContent: comparisonContent(path, rightBytes ?? empty),
		};
	}

	async getState(projectId: string): Promise<GitProjectState> {
		const initialized = await this.isInitialized(projectId);
		if (!initialized) {
			return {
				initialized: false,
				branch: null,
				headOid: null,
				worktreeBaseOid: null,
				changes: [],
				worktreeChanges: [],
				history: [],
				branches: [],
			};
		}

		const [
			branch,
			headOid,
			worktreeBaseOid,
			changes,
			worktreeChanges,
			history,
			branches,
		] = await Promise.all([
			this.getCurrentBranch(projectId),
			this.getHeadOid(projectId),
			this.getWorktreeBaseOid(projectId),
			this.getChanges(projectId),
			this.getWorktreeChanges(projectId),
			this.getHistory(projectId),
			this.getBranches(projectId),
		]);

		return {
			initialized: true,
			branch,
			headOid,
			worktreeBaseOid,
			changes,
			worktreeChanges,
			history,
			branches,
		};
	}
}

export const gitService = new GitService();
