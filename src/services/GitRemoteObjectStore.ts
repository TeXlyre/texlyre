import type {
	GitRemoteCommitChange,
	GitRemoteConfig,
	GitRemoteProvider,
} from '../types/gitRemote';
import { DIR, GIT_DIR, WORKTREE_BASE_REF } from '../utils/gitUtils';
import { gitFileSystemService } from './GitFileSystemService';
import { gitService } from './GitService';
import {
	getGit,
	compareGitTreeEntries,
	normalizeMode,
	signatureToRemote,
	signatureFromRemote,
	findExactRemoteCommitContent,
} from '../utils/gitRemoteCommitUtils';
import type {
	LocalCommitFile,
	LocalCommitObject,
	LocalPushCommit,
	TreeNode,
	GitTreeMode,
} from '../utils/gitRemoteCommitUtils';

export { DIR, GIT_DIR, WORKTREE_BASE_REF } from '../utils/gitUtils';

export interface ResolvedTransport {
	config: GitRemoteConfig;
	provider: GitRemoteProvider;
	token: string;
}

export class GitRemoteObjectStore {
	protected repo(projectId: string) {
		const fileSystem = gitFileSystemService.get(projectId);
		return {
			fileSystem,
			options: { fs: fileSystem.fs, dir: DIR, gitdir: GIT_DIR },
		};
	}

	protected async hasCommit(projectId: string, oid: string): Promise<boolean> {
		const git = await getGit();
		const { options } = this.repo(projectId);
		try {
			await git.readCommit({ ...options, oid });
			return true;
		} catch {
			return false;
		}
	}

	protected async hasBlob(projectId: string, oid: string): Promise<boolean> {
		const git = await getGit();
		const { options } = this.repo(projectId);
		try {
			const object = await git.readObject({
				...options,
				oid,
				format: 'content',
			});
			return object.type === 'blob';
		} catch {
			return false;
		}
	}

	protected async readLocalCommitMeta(projectId: string, oid: string) {
		const git = await getGit();
		const { options } = this.repo(projectId);
		const { commit } = await git.readCommit({ ...options, oid });
		return {
			oid,
			tree: commit.tree,
			parents: [...commit.parent],
			message: commit.message,
			author: signatureToRemote(commit.author),
			committer: signatureToRemote(commit.committer),
		};
	}

	protected async readLocalFiles(
		projectId: string,
		commitOid: string,
	): Promise<LocalCommitFile[]> {
		const git = await getGit();
		const { options } = this.repo(projectId);
		const { commit } = await git.readCommit({ ...options, oid: commitOid });
		const files: LocalCommitFile[] = [];

		const walk = async (treeOid: string, prefix = ''): Promise<void> => {
			const { tree } = await git.readTree({ ...options, oid: treeOid });
			for (const entry of tree) {
				const path = prefix ? `${prefix}/${entry.path}` : entry.path;
				if (entry.type === 'tree') {
					await walk(entry.oid, path);
					continue;
				}
				if (entry.type === 'commit') {
					throw new Error(
						`Git API synchronization does not support submodules (${path})`,
					);
				}
				files.push({ path, mode: entry.mode, oid: entry.oid });
			}
		};
		await walk(commit.tree);
		return files;
	}

	protected async readLocalBlob(
		projectId: string,
		oid: string,
	): Promise<Uint8Array> {
		const git = await getGit();
		const { options } = this.repo(projectId);
		const object = await git.readObject({ ...options, oid, format: 'content' });
		if (object.type !== 'blob') {
			throw new Error(`Expected Git blob ${oid}, got ${object.type}`);
		}
		return typeof object.object === 'string'
			? new TextEncoder().encode(object.object)
			: object.object;
	}

	protected async changesBetween(
		projectId: string,
		previous: LocalCommitFile[],
		current: LocalCommitFile[],
	): Promise<GitRemoteCommitChange[]> {
		const before = new Map(previous.map((file) => [file.path, file]));
		const after = new Map(current.map((file) => [file.path, file]));
		const paths = [...new Set([...before.keys(), ...after.keys()])].sort();
		const changes: GitRemoteCommitChange[] = [];
		for (const path of paths) {
			const oldFile = before.get(path);
			const newFile = after.get(path);
			if (!oldFile && newFile) {
				changes.push({
					path,
					type: 'create',
					mode: newFile.mode,
					content: await this.readLocalBlob(projectId, newFile.oid),
				});
				continue;
			}
			if (oldFile && !newFile) {
				changes.push({
					path,
					type: 'delete',
					mode: oldFile.mode,
					previousMode: oldFile.mode,
					previousOid: oldFile.oid,
				});
				continue;
			}
			if (
				oldFile &&
				newFile &&
				(oldFile.oid !== newFile.oid || oldFile.mode !== newFile.mode)
			) {
				changes.push({
					path,
					type: 'update',
					mode: newFile.mode,
					previousMode: oldFile.mode,
					previousOid: oldFile.oid,
					content: await this.readLocalBlob(projectId, newFile.oid),
				});
			}
		}
		return changes;
	}

	protected async exportLocalCommit(
		projectId: string,
		oid: string,
	): Promise<LocalCommitObject> {
		const meta = await this.readLocalCommitMeta(projectId, oid);
		const files = await this.readLocalFiles(projectId, oid);
		const parentFiles = meta.parents[0]
			? await this.readLocalFiles(projectId, meta.parents[0])
			: [];
		return {
			...meta,
			files,
			changes: await this.changesBetween(projectId, parentFiles, files),
		};
	}

	protected async exportLocalCommitFromBase(
		projectId: string,
		oid: string,
		baseOid: string,
	): Promise<LocalCommitObject> {
		const meta = await this.readLocalCommitMeta(projectId, oid);
		const files = await this.readLocalFiles(projectId, oid);
		const baseFiles = await this.readLocalFiles(projectId, baseOid);
		return {
			...meta,
			parents: [baseOid],
			files,
			changes: await this.changesBetween(projectId, baseFiles, files),
		};
	}

	protected async localCommitIsAncestor(
		projectId: string,
		ancestorOid: string,
		descendantOid: string,
	): Promise<boolean> {
		if (ancestorOid === descendantOid) return true;
		const git = await getGit();
		const { options } = this.repo(projectId);
		const pending = [descendantOid];
		const seen = new Set<string>();
		while (pending.length > 0) {
			const oid = pending.pop()!;
			if (seen.has(oid)) continue;
			seen.add(oid);
			const { commit } = await git.readCommit({ ...options, oid });
			for (const parent of commit.parent) {
				if (parent === ancestorOid) return true;
				if (!seen.has(parent)) pending.push(parent);
			}
		}
		return false;
	}

	protected async missingCommits(
		projectId: string,
		headOid: string,
		localBaseOid: string | null,
		supportsMergeCommits: boolean,
		preservesCommitOids: boolean,
	): Promise<LocalPushCommit[]> {
		if (localBaseOid) {
			if (!(await this.hasCommit(projectId, localBaseOid))) {
				throw new Error(
					'The local synchronization base is no longer available. Pull the remote again before pushing.',
				);
			}
			if (
				!(await this.localCommitIsAncestor(projectId, localBaseOid, headOid))
			) {
				throw new Error(
					'Local history no longer descends from the last synchronized remote state. Pull before pushing.',
				);
			}
			if (localBaseOid === headOid) return [];
		}

		if (!supportsMergeCommits) {
			const reversed: LocalPushCommit[] = [];
			let current: string | null = headOid;
			while (current && current !== localBaseOid) {
				const commit = await this.readLocalCommitMeta(projectId, current);
				if (commit.parents.length > 1) {
					if (
						!preservesCommitOids &&
						localBaseOid &&
						commit.parents.includes(localBaseOid)
					) {
						reversed.push({ oid: current, flattenBaseOid: localBaseOid });
						current = localBaseOid;
						continue;
					}
					throw new Error(
						'This provider API cannot create a multi-parent Git commit without flattening history. Push a linear branch or merge on the remote instead.',
					);
				}
				reversed.push({ oid: current });
				current = commit.parents[0] ?? null;
			}
			if (localBaseOid && current !== localBaseOid) {
				throw new Error(
					'Local branch is not based on the last synchronized remote state. Pull first.',
				);
			}
			return reversed.reverse();
		}

		const ordered: LocalPushCommit[] = [];
		const seen = new Set<string>();
		const visit = async (oid: string): Promise<void> => {
			if (oid === localBaseOid || seen.has(oid)) return;
			seen.add(oid);
			const commit = await this.readLocalCommitMeta(projectId, oid);
			for (const parent of commit.parents) await visit(parent);
			ordered.push({ oid });
		};
		await visit(headOid);
		return ordered;
	}

	protected treeNode(): TreeNode {
		return { files: [], directories: new Map() };
	}

	protected addTreeEntry(
		root: TreeNode,
		entry: {
			path: string;
			mode: GitTreeMode;
			type: 'blob' | 'commit';
			oid: string;
		},
	): void {
		const parts = entry.path.split('/').filter(Boolean);
		if (parts.length === 0) return;
		let node = root;
		for (const part of parts.slice(0, -1)) {
			let child = node.directories.get(part);
			if (!child) {
				child = this.treeNode();
				node.directories.set(part, child);
			}
			node = child;
		}
		node.files.push({ ...entry, path: parts[parts.length - 1] });
	}

	protected async writeTreeNode(
		projectId: string,
		node: TreeNode,
	): Promise<string> {
		const git = await getGit();
		const { options } = this.repo(projectId);
		const tree: Array<{
			mode: GitTreeMode;
			path: string;
			oid: string;
			type: 'blob' | 'tree' | 'commit';
		}> = [...node.files];
		for (const [path, child] of node.directories) {
			tree.push({
				mode: '040000',
				path,
				oid: await this.writeTreeNode(projectId, child),
				type: 'tree',
			});
		}
		tree.sort(compareGitTreeEntries);
		return git.writeTree({ ...options, tree: tree as never });
	}

	protected async importRemoteCommit(
		projectId: string,
		transport: ResolvedTransport,
		oid: string,
		remoteToLocal = new Map<string, string>(),
		active = new Set<string>(),
	): Promise<string> {
		const mapped = remoteToLocal.get(oid);
		if (mapped && (await this.hasCommit(projectId, mapped))) return mapped;

		const syncBase = transport.config.syncBase;
		if (
			syncBase?.remoteOid === oid &&
			(await this.hasCommit(projectId, syncBase.localOid))
		) {
			remoteToLocal.set(oid, syncBase.localOid);
			return syncBase.localOid;
		}
		if (
			transport.provider.historyTransport.preservesCommitOids &&
			(await this.hasCommit(projectId, oid))
		) {
			remoteToLocal.set(oid, oid);
			return oid;
		}
		if (active.has(oid))
			throw new Error(`Remote Git history contains a cycle at ${oid}`);
		active.add(oid);

		const { provider, config, token } = transport;
		const remote = await provider.historyTransport.getCommit(
			token,
			config.repositoryId,
			oid,
		);
		const localParents: string[] = [];
		for (const parent of remote.parents) {
			localParents.push(
				await this.importRemoteCommit(
					projectId,
					transport,
					parent,
					remoteToLocal,
					active,
				),
			);
		}

		const git = await getGit();
		const { options } = this.repo(projectId);
		const entries = await provider.historyTransport.getTree(
			token,
			config.repositoryId,
			remote,
		);
		const root = this.treeNode();
		for (const entry of entries) {
			if (entry.type === 'tree') continue;
			const mode = normalizeMode(entry.mode);
			if (entry.type === 'commit' || mode === '160000') {
				this.addTreeEntry(root, {
					path: entry.path,
					mode: '160000',
					type: 'commit',
					oid: entry.oid,
				});
				continue;
			}
			if (!(await this.hasBlob(projectId, entry.oid))) {
				const content = await provider.historyTransport.getBlob(
					token,
					config.repositoryId,
					entry.oid,
				);
				const localBlobOid = await git.writeBlob({ ...options, blob: content });
				if (localBlobOid !== entry.oid) {
					throw new Error(
						`Remote blob ${entry.oid} could not be reproduced locally (got ${localBlobOid})`,
					);
				}
			}
			this.addTreeEntry(root, {
				path: entry.path,
				mode,
				type: 'blob',
				oid: entry.oid,
			});
		}
		const treeOid = await this.writeTreeNode(projectId, root);
		if (
			provider.historyTransport.preservesCommitOids &&
			remote.treeOid &&
			treeOid !== remote.treeOid
		) {
			throw new Error(
				`Remote tree ${remote.treeOid} could not be reproduced locally (got ${treeOid})`,
			);
		}

		if (!provider.historyTransport.preservesCommitOids) {
			const localOid = await git.writeCommit({
				...options,
				commit: {
					tree: treeOid,
					parent: localParents,
					author: signatureFromRemote(remote.author),
					committer: signatureFromRemote(remote.committer),
					message: remote.message,
				},
			});
			remoteToLocal.set(remote.oid, localOid);
			active.delete(oid);
			return localOid;
		}

		if (!remote.unsignedPayload) {
			const directOid = await git.writeCommit({
				...options,
				commit: {
					tree: treeOid,
					parent: localParents,
					author: signatureFromRemote(remote.author),
					committer: signatureFromRemote(remote.committer),
					message: remote.message,
					...(remote.gpgsig ? { gpgsig: remote.gpgsig } : {}),
				},
			});
			if (directOid === remote.oid) {
				remoteToLocal.set(remote.oid, remote.oid);
				active.delete(oid);
				return remote.oid;
			}
		}

		const exactContent = await findExactRemoteCommitContent(remote, treeOid);
		if (!exactContent) {
			throw new Error(
				`Remote commit ${remote.oid} cannot be reconstructed exactly from the provider API. The provider omitted Git object metadata that is required to preserve its commit ID.`,
			);
		}
		const localOid = await git.writeObject({
			...options,
			type: 'commit',
			format: 'content',
			object: exactContent,
		});
		if (localOid !== remote.oid) {
			throw new Error(
				`Remote commit ${remote.oid} was reconstructed but isomorphic-git wrote ${localOid}. TeXlyre will not alias different Git object IDs.`,
			);
		}
		remoteToLocal.set(remote.oid, remote.oid);
		active.delete(oid);
		return remote.oid;
	}

	protected async rewriteCurrentBranch(
		projectId: string,
		branch: string,
		oldHead: string,
		newHead: string,
	): Promise<void> {
		if (oldHead === newHead) return;
		const git = await getGit();
		const { fileSystem, options } = this.repo(projectId);
		const worktreeBase = await gitService.getWorktreeBaseOid(projectId);
		await git.writeRef({
			...options,
			ref: `refs/heads/${branch}`,
			value: newHead,
			force: true,
		});
		if (worktreeBase === oldHead) {
			await git.writeRef({
				...options,
				ref: WORKTREE_BASE_REF,
				value: newHead,
				force: true,
			});
		}
		await fileSystem.flush();
		document.dispatchEvent(new CustomEvent('git-history-changed'));
	}
}
