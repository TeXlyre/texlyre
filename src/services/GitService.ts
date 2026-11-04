// src/services/GitService.ts
import type { User } from '../types/auth';
import { isBinaryFile } from '../utils/fileUtils';
import {
	GitRepositoryOperations,
	getGit,
	authorForUser,
	changeType,
	errorCode,
	comparisonContent,
} from './GitRepositoryOperations';
import type {
	GitChangeType,
	GitProjectState,
	GitMergeConflict,
	GitMergePlan,
	GitBranchMergeOptions,
	GitBranchMergeResult,
	GitComparisonFile,
	GitComparison,
	GitComparisonRef,
} from './GitRepositoryOperations';

export type {
	GitChangeType,
	GitChange,
	GitBranch,
	GitHistoryEntry,
	GitProjectState,
	GitRestoreResult,
	GitMergeConflict,
	GitMergePlan,
	GitBranchMergeOptions,
	GitBranchMergeResult,
	GitComparisonFile,
	GitComparison,
	GitComparisonRef,
} from './GitRepositoryOperations';

class GitService extends GitRepositoryOperations {
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
