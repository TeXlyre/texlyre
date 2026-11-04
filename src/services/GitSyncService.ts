import type { SecretsContextType } from '../contexts/SecretsContext';
import type {
	GitHistoryCredentialSource,
	GitRemoteConfig,
	GitRemoteCredentialRef,
	GitRemoteProvider,
} from '../types/gitRemote';
import { fileHandlerService } from './FileHandlerService';
import { fileStoreService } from './FileStoreService';
import { gitService } from './GitService';
import {
	GitRemoteObjectStore,
	WORKTREE_BASE_REF,
} from './GitRemoteObjectStore';
import type { ResolvedTransport } from './GitRemoteObjectStore';
import { getGit, safeRefPart } from '../utils/gitRemoteCommitUtils';

const REMOTE_STORAGE_PREFIX = 'texlyre-git-remote:';
type GitRemoteListener = (config: GitRemoteConfig | undefined) => void;
export interface GitFetchedRemote {
	providerName: string;
	repositoryLabel: string;
	remoteBranch: string;
	remoteOid: string;
	localOid: string;
	temporaryBranch: string;
}

type GitSecretLookup = Pick<SecretsContextType, 'hasSecret'>;
type GitSecretReader = Pick<SecretsContextType, 'getSecret'>;
type GitSecretWriter = Pick<SecretsContextType, 'getSecret' | 'setSecret'>;
type GitSecretRemover = Pick<SecretsContextType, 'removeSecret'>;
export type GitCredentialChoice = 'new' | GitHistoryCredentialSource;

export interface GitCredentialOption {
	id: GitCredentialChoice;
	label: string;
}

export interface GitPushSummary {
	providerName: string;
	repositoryLabel: string;
	localBranch: string;
	remoteBranch: string;
	previousLocalOid: string;
	canonicalOid: string;
	pushedCommits: number;
}

class GitSyncService extends GitRemoteObjectStore {
	private readonly listeners = new Map<string, Set<GitRemoteListener>>();

	getConfig(projectId: string): GitRemoteConfig | undefined {
		if (typeof localStorage === 'undefined') return undefined;
		try {
			const stored = localStorage.getItem(
				`${REMOTE_STORAGE_PREFIX}${projectId}`,
			);
			return stored ? (JSON.parse(stored) as GitRemoteConfig) : undefined;
		} catch {
			return undefined;
		}
	}

	addListener(projectId: string, listener: GitRemoteListener): () => void {
		const listeners =
			this.listeners.get(projectId) ?? new Set<GitRemoteListener>();
		listeners.add(listener);
		this.listeners.set(projectId, listeners);
		return () => {
			listeners.delete(listener);
			if (listeners.size === 0) this.listeners.delete(projectId);
		};
	}

	private setConfig(
		projectId: string,
		config: GitRemoteConfig | undefined,
	): void {
		const previous = this.getConfig(projectId);
		if (JSON.stringify(previous) === JSON.stringify(config)) return;
		if (typeof localStorage !== 'undefined') {
			const key = `${REMOTE_STORAGE_PREFIX}${projectId}`;
			if (config) localStorage.setItem(key, JSON.stringify(config));
			else localStorage.removeItem(key);
		}
		for (const listener of this.listeners.get(projectId) ?? []) {
			listener(config);
		}
	}

	private setSyncBase(
		projectId: string,
		syncBase: GitRemoteConfig['syncBase'] | undefined,
	): void {
		const config = this.getConfig(projectId);
		if (!config) return;
		this.setConfig(projectId, { ...config, syncBase });
	}
	private credentialRef(
		provider: GitRemoteProvider,
		source: GitHistoryCredentialSource,
	): GitRemoteCredentialRef {
		return source === 'history'
			? {
					pluginId: provider.historyPluginId,
					secretKey: provider.historyTokenSecretKey,
					scope: 'project',
				}
			: {
					pluginId: provider.backupPluginId,
					secretKey: provider.backupTokenSecretKey,
					scope: source === 'backup-project' ? 'project' : 'global',
				};
	}

	async getProviders(): Promise<GitRemoteProvider[]> {
		const { pluginRegistry } = await import('../plugins/PluginRegistry');
		return pluginRegistry.getGitRemoteProviders();
	}

	private async getProvider(
		providerId: string,
	): Promise<GitRemoteProvider | null> {
		return (
			(await this.getProviders()).find(
				(provider) => provider.id === providerId,
			) ?? null
		);
	}

	async prepareConfiguredRemote(
		projectId: string,
		getSetting: (id: string) => { value?: unknown } | undefined,
	): Promise<GitRemoteConfig | undefined> {
		const current = this.getConfig(projectId);
		if (!current) return undefined;
		const provider = await this.getProvider(current.providerId);
		if (!provider) return current;

		provider.configure?.(getSetting);
		const next: GitRemoteConfig = {
			...current,
			providerName: current.providerName ?? provider.displayName,
			apiConfiguration:
				current.apiConfiguration ?? provider.getApiConfiguration?.(),
			credentialRef:
				current.credentialRef ??
				this.credentialRef(provider, current.credentialSource),
		};
		if (JSON.stringify(next) !== JSON.stringify(current)) {
			this.setConfig(projectId, next);
		}
		return next;
	}

	async getCredentialOptions(
		providerId: string,
		projectId: string,
		secrets: GitSecretLookup,
	): Promise<GitCredentialOption[]> {
		const provider = await this.getProvider(providerId);
		if (!provider) return [{ id: 'new', label: 'New credential' }];

		const options: GitCredentialOption[] = [
			{ id: 'new', label: 'New credential' },
		];
		if (
			projectId &&
			secrets.hasSecret(
				provider.historyPluginId,
				provider.historyTokenSecretKey,
				{ scope: 'project', projectId },
			)
		)
			options.push({ id: 'history', label: 'Git History credential' });
		if (
			projectId &&
			secrets.hasSecret(
				provider.backupPluginId,
				provider.backupTokenSecretKey,
				{ scope: 'project', projectId },
			)
		)
			options.push({
				id: 'backup-project',
				label: 'Backup credential (project)',
			});
		if (
			secrets.hasSecret(
				provider.backupPluginId,
				provider.backupTokenSecretKey,
				{ scope: 'global' },
			)
		)
			options.push({
				id: 'backup-global',
				label: 'Backup credential (global)',
			});
		return options;
	}

	async getCredentialToken(
		providerId: string,
		projectId: string,
		source: Exclude<GitCredentialChoice, 'new'>,
		secrets: GitSecretReader,
	): Promise<string | null> {
		const provider = await this.getProvider(providerId);
		if (!provider) return null;
		const ref = this.credentialRef(provider, source);
		return (
			(
				await secrets.getSecret(
					ref.pluginId,
					ref.secretKey,
					ref.scope === 'project'
						? { scope: 'project', projectId }
						: { scope: 'global' },
				)
			)?.value ?? null
		);
	}

	async connect(
		projectId: string,
		config: Omit<
			GitRemoteConfig,
			| 'credentialSource'
			| 'credentialRef'
			| 'providerName'
			| 'apiConfiguration'
			| 'syncBase'
		>,
		credential: { source: GitCredentialChoice; token: string },
		secrets: GitSecretWriter,
	): Promise<void> {
		const provider = await this.getProvider(config.providerId);
		if (!provider) throw new Error('Git remote provider is not available');

		let token = credential.token.trim();
		let credentialSource: GitHistoryCredentialSource;
		if (credential.source === 'new') {
			if (!token) throw new Error('A credential is required');
			credentialSource = 'history';
		} else {
			credentialSource = credential.source;
			token =
				(await this.getCredentialToken(
					provider.id,
					projectId,
					credential.source,
					secrets,
				)) ?? '';
		}

		if (!token || !(await provider.testConnection(token))) {
			throw new Error(`Could not authenticate with ${provider.displayName}`);
		}
		if (credential.source === 'new') {
			await secrets.setSecret(
				provider.historyPluginId,
				provider.historyTokenSecretKey,
				token,
				{
					scope: 'project',
					projectId,
					metadata: { purpose: 'git-history-remote' },
				},
			);
		}

		const previous = this.getConfig(projectId);
		let syncBase: GitRemoteConfig['syncBase'];
		if (
			previous?.providerId === config.providerId &&
			previous.repositoryId === config.repositoryId &&
			previous.syncBase
		) {
			const nextHead = await provider.historyTransport.getHead(
				token,
				config.repositoryId,
				config.branch,
			);
			if (nextHead === previous.syncBase.remoteOid) {
				syncBase = previous.syncBase;
			}
		}
		this.setConfig(projectId, {
			...config,
			providerName: provider.displayName,
			apiConfiguration: provider.getApiConfiguration?.(),
			credentialSource,
			credentialRef: this.credentialRef(provider, credentialSource),
			...(syncBase ? { syncBase } : {}),
		});
	}

	async disconnect(
		projectId: string,
		secrets: GitSecretRemover,
	): Promise<void> {
		const current = this.getConfig(projectId);
		if (current?.credentialSource === 'history') {
			if (current.credentialRef?.scope === 'project') {
				await secrets.removeSecret(
					current.credentialRef.pluginId,
					current.credentialRef.secretKey,
					{ scope: 'project', projectId },
				);
			} else {
				const provider = await this.getProvider(current.providerId);
				if (provider) {
					await secrets.removeSecret(
						provider.historyPluginId,
						provider.historyTokenSecretKey,
						{ scope: 'project', projectId },
					);
				}
			}
		}
		this.setConfig(projectId, undefined);
	}

	private async resolveTransport(
		projectId: string,
		secrets: GitSecretReader,
	): Promise<ResolvedTransport> {
		const config = this.getConfig(projectId);
		if (!config) throw new Error('Connect a Git remote before synchronizing');
		const provider = await this.getProvider(config.providerId);
		if (!provider) {
			throw new Error(
				`The ${config.providerName ?? config.providerId} Git Extra is not available`,
			);
		}
		const apiConfiguration =
			config.apiConfiguration ?? provider.getApiConfiguration?.();
		if (!apiConfiguration) {
			throw new Error(
				'Reconnect this Git remote once so its API settings can be saved.',
			);
		}
		provider.applyApiConfiguration?.(apiConfiguration);

		const credentialRef =
			config.credentialRef ??
			this.credentialRef(provider, config.credentialSource);
		const credential = await secrets.getSecret(
			credentialRef.pluginId,
			credentialRef.secretKey,
			credentialRef.scope === 'project'
				? { scope: 'project', projectId }
				: { scope: 'global' },
		);
		const token = credential?.value?.trim();
		if (!token)
			throw new Error('The saved Git remote credential is unavailable');
		return { config, provider, token };
	}

	async fetchForMerge(
		projectId: string,
		secrets: GitSecretReader,
	): Promise<GitFetchedRemote | null> {
		const transport = await this.resolveTransport(projectId, secrets);
		const remoteOid = await transport.provider.historyTransport.getHead(
			transport.token,
			transport.config.repositoryId,
			transport.config.branch,
		);
		if (!remoteOid) return null;

		if (!(await gitService.isInitialized(projectId))) {
			await gitService.initialize(projectId);
		}
		const localHead = await gitService.getHeadOid(projectId);
		if (localHead && (await gitService.getChanges(projectId)).length > 0) {
			throw new Error(
				'Commit or restore the current changes before pulling from a remote',
			);
		}
		const remoteToLocal = new Map<string, string>();
		if (transport.config.syncBase) {
			remoteToLocal.set(
				transport.config.syncBase.remoteOid,
				transport.config.syncBase.localOid,
			);
		}
		const localOid = await this.importRemoteCommit(
			projectId,
			transport,
			remoteOid,
			remoteToLocal,
		);

		const git = await getGit();
		const { fileSystem, options } = this.repo(projectId);
		const branchPart = safeRefPart(transport.config.branch);
		const preferredTemporaryBranch = `origin/${branchPart}`;
		const localBranches = await git.listBranches(options);
		const temporaryBranch = localBranches.includes(preferredTemporaryBranch)
			? `texlyre-remote/${branchPart}-${Date.now().toString(36)}-${Math.random()
					.toString(36)
					.slice(2, 7)}`
			: preferredTemporaryBranch;
		await git.branch({
			...options,
			ref: temporaryBranch,
			object: localOid,
			checkout: false,
		});
		await fileSystem.flush();
		return {
			providerName:
				transport.config.providerName ?? transport.config.providerId,
			repositoryLabel: transport.config.repositoryLabel,
			remoteBranch: transport.config.branch,
			remoteOid,
			localOid,
			temporaryBranch,
		};
	}

	async discardFetched(
		projectId: string,
		temporaryBranch: string,
	): Promise<void> {
		const git = await getGit();
		const { fileSystem, options } = this.repo(projectId);
		try {
			await git.deleteBranch({ ...options, ref: temporaryBranch });
		} catch {
			// A completed merge might have already removed or replaced the ref.
		}
		await fileSystem.flush();
	}

	async adoptFetched(
		projectId: string,
		fetched: GitFetchedRemote,
	): Promise<void> {
		if (await gitService.getHeadOid(projectId)) {
			throw new Error('Remote adoption is only for an empty local Git history');
		}
		const git = await getGit();
		const { fileSystem, options } = this.repo(projectId);
		const currentBranch =
			(await gitService.getCurrentBranch(projectId)) ||
			fetched.remoteBranch ||
			'main';
		await git.writeRef({
			...options,
			ref: `refs/heads/${currentBranch}`,
			value: fetched.localOid,
			force: true,
		});
		await git.writeRef({
			...options,
			ref: 'HEAD',
			value: `refs/heads/${currentBranch}`,
			force: true,
			symbolic: true,
		});
		await git.checkout({
			...options,
			ref: currentBranch,
			force: true,
			nonBlocking: true,
		});
		await git.writeRef({
			...options,
			ref: WORKTREE_BASE_REF,
			value: fetched.localOid,
			force: true,
		});
		await fileSystem.flush();

		if (fileHandlerService.hasWorkspace()) {
			const files = await fileStoreService.getAllFiles(false, false, true);
			if (files.length > 0) await fileHandlerService.mirrorFiles(files);
		}
		document.dispatchEvent(new CustomEvent('refresh-file-tree'));
	}

	markFetchedSynced(projectId: string, fetched: GitFetchedRemote): void {
		this.setSyncBase(projectId, {
			localOid: fetched.localOid,
			remoteOid: fetched.remoteOid,
		});
	}

	async push(
		projectId: string,
		secrets: GitSecretReader,
	): Promise<GitPushSummary> {
		if (!(await gitService.isInitialized(projectId))) {
			throw new Error('Initialize Git History before pushing to a remote');
		}
		const localBranch = await gitService.getCurrentBranch(projectId);
		const headOid = await gitService.getHeadOid(projectId);
		if (!localBranch || !headOid)
			throw new Error('Create a local commit before pushing');

		const transport = await this.resolveTransport(projectId, secrets);
		const remoteHead = await transport.provider.historyTransport.getHead(
			transport.token,
			transport.config.repositoryId,
			transport.config.branch,
		);

		const syncBase = transport.config.syncBase;
		let localBaseOid: string | null = null;
		if (syncBase) {
			if (remoteHead !== syncBase.remoteOid) {
				throw new Error(
					'Remote branch changed since the last synchronization. Pull first.',
				);
			}
			localBaseOid = syncBase.localOid;
		} else if (remoteHead) {
			if (await this.hasCommit(projectId, remoteHead))
				localBaseOid = remoteHead;
			else {
				throw new Error(
					'Pull this remote once before pushing so TeXlyre can establish a synchronization base.',
				);
			}
		}

		const missing = await this.missingCommits(
			projectId,
			headOid,
			localBaseOid,
			transport.provider.historyTransport.supportsMergeCommits,
			transport.provider.historyTransport.preservesCommitOids,
		);
		if (missing.length === 0) {
			if (!syncBase && remoteHead && localBaseOid) {
				this.setSyncBase(projectId, {
					localOid: localBaseOid,
					remoteOid: remoteHead,
				});
			}
			return {
				providerName:
					transport.config.providerName ?? transport.config.providerId,
				repositoryLabel: transport.config.repositoryLabel,
				localBranch,
				remoteBranch: transport.config.branch,
				previousLocalOid: headOid,
				canonicalOid: headOid,
				pushedCommits: 0,
			};
		}

		const remoteByLocal = new Map<string, string>();
		const remoteToLocal = new Map<string, string>();
		const canonicalLocalByOriginal = new Map<string, string>();
		if (localBaseOid && remoteHead) {
			remoteByLocal.set(localBaseOid, remoteHead);
			remoteToLocal.set(remoteHead, localBaseOid);
		}

		let expectedRemoteHead = remoteHead;
		for (let index = 0; index < missing.length; index += 1) {
			const { oid: localOid, flattenBaseOid } = missing[index];
			const local = flattenBaseOid
				? await this.exportLocalCommitFromBase(
						projectId,
						localOid,
						flattenBaseOid,
					)
				: await this.exportLocalCommit(projectId, localOid);
			const parents = local.parents.map((parent) => {
				const remoteParent = remoteByLocal.get(parent);
				if (remoteParent) return remoteParent;
				if (transport.provider.historyTransport.preservesCommitOids)
					return parent;
				throw new Error(
					'Local history contains a parent that is outside the synchronized remote graph. Pull first.',
				);
			});
			const created = await transport.provider.historyTransport.createCommit(
				transport.token,
				transport.config.repositoryId,
				{
					branch: transport.config.branch,
					parents,
					expectedBranchHead: transport.provider.historyTransport
						.supportsMergeCommits
						? expectedRemoteHead
						: (parents[0] ?? null),
					updateBranch: transport.provider.historyTransport.supportsMergeCommits
						? remoteHead === null || index === missing.length - 1
						: true,
					message: local.message,
					author: local.author,
					committer: local.committer,
					changes: local.changes,
				},
			);
			if (
				created.parents.length !== parents.length ||
				created.parents.some(
					(parent, parentIndex) => parent !== parents[parentIndex],
				)
			) {
				throw new Error(
					'Remote branch changed while the push was being created. Pull before pushing again.',
				);
			}

			const canonicalLocalOid = await this.importRemoteCommit(
				projectId,
				transport,
				created.oid,
				remoteToLocal,
			);
			const canonical = await this.readLocalCommitMeta(
				projectId,
				canonicalLocalOid,
			);
			if (canonical.tree !== local.tree) {
				throw new Error(
					'The provider changed the pushed file tree. TeXlyre will not replace the local commit with a different snapshot.',
				);
			}
			remoteByLocal.set(localOid, created.oid);
			remoteToLocal.set(created.oid, canonicalLocalOid);
			canonicalLocalByOriginal.set(localOid, canonicalLocalOid);
			if (remoteHead === null) expectedRemoteHead = created.oid;
		}

		const canonicalOid = canonicalLocalByOriginal.get(headOid);
		const canonicalRemoteOid = remoteByLocal.get(headOid);
		if (!canonicalOid || !canonicalRemoteOid) {
			throw new Error('Remote did not return the pushed HEAD commit');
		}
		const confirmedRemoteHead =
			await transport.provider.historyTransport.getHead(
				transport.token,
				transport.config.repositoryId,
				transport.config.branch,
			);
		if (confirmedRemoteHead !== canonicalRemoteOid) {
			throw new Error(
				'Remote branch changed before the push completed. Pull before pushing again.',
			);
		}

		const flattenedSynchronizedMerge = missing.some(
			(commit) => commit.flattenBaseOid !== undefined,
		);
		const synchronizedLocalOid = flattenedSynchronizedMerge
			? headOid
			: canonicalOid;
		if (!flattenedSynchronizedMerge) {
			await this.rewriteCurrentBranch(
				projectId,
				localBranch,
				headOid,
				canonicalOid,
			);
		}
		this.setSyncBase(projectId, {
			localOid: synchronizedLocalOid,
			remoteOid: canonicalRemoteOid,
		});
		return {
			providerName:
				transport.config.providerName ?? transport.config.providerId,
			repositoryLabel: transport.config.repositoryLabel,
			localBranch,
			remoteBranch: transport.config.branch,
			previousLocalOid: headOid,
			canonicalOid: synchronizedLocalOid,
			pushedCommits: missing.length,
		};
	}
}

export const gitSyncService = new GitSyncService();
