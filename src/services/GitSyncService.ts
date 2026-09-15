import type { SecretsContextType } from '../contexts/SecretsContext';
import type {
	GitHistoryCredentialSource,
	GitRemoteCommitChange,
	GitRemoteCommitObject,
	GitRemoteConfig,
	GitRemoteCredentialRef,
	GitRemoteProvider,
	GitRemoteSignature,
} from '../types/gitRemote';
import { fileHandlerService } from './FileHandlerService';
import { fileStoreService } from './FileStoreService';
import { gitFileSystemService } from './GitFileSystemService';
import { gitService } from './GitService';

const DIR = '/';
const GIT_DIR = '/.git';
const WORKTREE_BASE_REF = 'refs/texlyre/worktree-base';
const REMOTE_STORAGE_PREFIX = 'texlyre-git-remote:';

type GitRemoteListener = (config: GitRemoteConfig | undefined) => void;

type GitTreeMode = '100644' | '100755' | '040000' | '160000' | '120000';

let gitPromise: Promise<typeof import('isomorphic-git')> | null = null;
const getGit = () => (gitPromise ??= import('isomorphic-git'));

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

interface ResolvedTransport {
	config: GitRemoteConfig;
	provider: GitRemoteProvider;
	token: string;
}

interface LocalCommitFile {
	path: string;
	mode: string;
	oid: string;
}

interface LocalCommitObject {
	oid: string;
	tree: string;
	parents: string[];
	message: string;
	author: GitRemoteSignature;
	committer: GitRemoteSignature;
	files: LocalCommitFile[];
	changes: GitRemoteCommitChange[];
}

interface LocalPushCommit {
	oid: string;
	flattenBaseOid?: string;
}

interface TreeNode {
	files: Array<{
		path: string;
		mode: GitTreeMode;
		type: 'blob' | 'commit';
		oid: string;
	}>;
	directories: Map<string, TreeNode>;
}

const safeRefPart = (value: string): string =>
	value
		.replace(/[^A-Za-z0-9._/-]+/g, '-')
		.replace(/\.{2,}/g, '.')
		.replace(/^[-/.]+|[-/.]+$/g, '') || 'remote';

const gitPathEncoder = new TextEncoder();
const compareGitTreeEntries = (
	left: { path: string; type: 'blob' | 'tree' | 'commit' },
	right: { path: string; type: 'blob' | 'tree' | 'commit' },
): number => {
	const leftBytes = gitPathEncoder.encode(
		left.type === 'tree' ? `${left.path}/` : left.path,
	);
	const rightBytes = gitPathEncoder.encode(
		right.type === 'tree' ? `${right.path}/` : right.path,
	);
	const length = Math.min(leftBytes.length, rightBytes.length);
	for (let index = 0; index < length; index += 1) {
		if (leftBytes[index] !== rightBytes[index]) {
			return leftBytes[index] - rightBytes[index];
		}
	}
	return leftBytes.length - rightBytes.length;
};

const normalizeMode = (mode: string): GitTreeMode => {
	if (
		mode === '100644' ||
		mode === '100755' ||
		mode === '040000' ||
		mode === '160000' ||
		mode === '120000'
	)
		return mode;
	throw new Error(`Unsupported Git tree mode: ${mode}`);
};

const signatureToRemote = (signature: {
	name: string;
	email: string;
	timestamp: number;
	timezoneOffset: number;
}): GitRemoteSignature => {
	const offsetMinutes = signature.timezoneOffset;
	const local = new Date((signature.timestamp - offsetMinutes * 60) * 1000);
	const pad = (value: number) => String(value).padStart(2, '0');
	const sign = offsetMinutes <= 0 ? '+' : '-';
	const absoluteOffset = Math.abs(offsetMinutes);
	const date = `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(
		local.getUTCDate(),
	)}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(
		local.getUTCSeconds(),
	)}${sign}${pad(Math.floor(absoluteOffset / 60))}:${pad(absoluteOffset % 60)}`;
	return { name: signature.name, email: signature.email, date };
};

const signatureFromRemote = (
	signature: GitRemoteSignature,
	timezoneOffsetOverride?: number,
) => {
	const timestampMs = Date.parse(signature.date);
	if (!Number.isFinite(timestampMs)) {
		throw new Error(`Invalid Git commit date: ${signature.date}`);
	}
	let timezoneOffset = 0;
	const match = signature.date.match(/([+-])(\d{2}):?(\d{2})$/);
	if (match) {
		const minutes = Number(match[2]) * 60 + Number(match[3]);
		timezoneOffset = match[1] === '+' ? -minutes : minutes;
	}
	return {
		name: signature.name,
		email: signature.email,
		timestamp: Math.floor(timestampMs / 1000),
		timezoneOffset: timezoneOffsetOverride ?? timezoneOffset,
	};
};

const gitTimezone = (timezoneOffset: number): string => {
	const minutesEast = -timezoneOffset;
	const sign = minutesEast >= 0 ? '+' : '-';
	const absolute = Math.abs(minutesEast);
	return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}${String(
		absolute % 60,
	).padStart(2, '0')}`;
};

const signatureHeader = (
	name: string,
	email: string,
	timestamp: number,
	timezoneOffset: number,
): string => `${name} <${email}> ${timestamp} ${gitTimezone(timezoneOffset)}`;

const signatureHeaderValue = (
	signature: string,
	preserveTerminalNewline: boolean,
): string => {
	let normalized = signature.replace(/\r\n/g, '\n');
	if (!preserveTerminalNewline) normalized = normalized.trim();
	return `gpgsig ${normalized.replace(/\n/g, '\n ')}`;
};

const serializeStructuredCommit = (commit: {
	tree: string;
	parents: string[];
	author: ReturnType<typeof signatureFromRemote>;
	committer: ReturnType<typeof signatureFromRemote>;
	message: string;
	gpgsig?: string;
	preserveSignatureTerminalNewline?: boolean;
}): Uint8Array => {
	const lines = [`tree ${commit.tree}`];
	for (const parent of commit.parents) lines.push(`parent ${parent}`);
	lines.push(
		`author ${signatureHeader(
			commit.author.name,
			commit.author.email,
			commit.author.timestamp,
			commit.author.timezoneOffset,
		)}`,
	);
	lines.push(
		`committer ${signatureHeader(
			commit.committer.name,
			commit.committer.email,
			commit.committer.timestamp,
			commit.committer.timezoneOffset,
		)}`,
	);
	if (commit.gpgsig) {
		lines.push(
			signatureHeaderValue(
				commit.gpgsig,
				Boolean(commit.preserveSignatureTerminalNewline),
			),
		);
	}
	return new TextEncoder().encode(`${lines.join('\n')}\n\n${commit.message}`);
};

const serializeSignedPayload = (
	payload: string,
	signature: string,
	preserveSignatureTerminalNewline: boolean,
): Uint8Array | null => {
	const normalizedPayload = payload.replace(/\r\n/g, '\n');
	const separator = normalizedPayload.indexOf('\n\n');
	if (separator < 0) return null;
	const headers = normalizedPayload.slice(0, separator);
	const message = normalizedPayload.slice(separator + 2);
	const gpgsig = signatureHeaderValue(
		signature,
		preserveSignatureTerminalNewline,
	);
	return new TextEncoder().encode(`${headers}\n${gpgsig}\n\n${message}`);
};

const sha1GitObject = async (
	type: string,
	content: Uint8Array,
): Promise<string> => {
	const header = new TextEncoder().encode(`${type} ${content.byteLength}\0`);
	const wrapped = new Uint8Array(header.byteLength + content.byteLength);
	wrapped.set(header);
	wrapped.set(content, header.byteLength);
	const digest = await crypto.subtle.digest('SHA-1', wrapped);
	return Array.from(new Uint8Array(digest))
		.map((byte) => byte.toString(16).padStart(2, '0'))
		.join('');
};

const normalizedApiDate = (date: string): boolean => /Z$/i.test(date);
const REAL_WORLD_TIMEZONE_OFFSETS = Array.from(
	{ length: 113 },
	(_, index) => -14 * 60 + index * 15,
);

const uniqueMessages = (message: string): string[] => {
	const candidates = [message];
	if (message.endsWith('\n')) candidates.push(message.slice(0, -1));
	else candidates.push(`${message}\n`);
	return [...new Set(candidates)];
};

const findExactRemoteCommitContent = async (
	remote: GitRemoteCommitObject,
	tree: string,
): Promise<Uint8Array | null> => {
	const matches = async (
		content: Uint8Array | null,
	): Promise<Uint8Array | null> => {
		if (!content) return null;
		return (await sha1GitObject('commit', content)) === remote.oid
			? content
			: null;
	};

	if (remote.gpgsig && remote.unsignedPayload) {
		for (const preserveTerminalNewline of [true, false]) {
			const exact = await matches(
				serializeSignedPayload(
					remote.unsignedPayload,
					remote.gpgsig,
					preserveTerminalNewline,
				),
			);
			if (exact) return exact;
		}
	}

	const baseAuthor = signatureFromRemote(remote.author);
	const baseCommitter = signatureFromRemote(remote.committer);
	const authorOffsets = normalizedApiDate(remote.author.date)
		? REAL_WORLD_TIMEZONE_OFFSETS
		: [baseAuthor.timezoneOffset];
	const committerOffsets = normalizedApiDate(remote.committer.date)
		? REAL_WORLD_TIMEZONE_OFFSETS
		: [baseCommitter.timezoneOffset];
	const messages = uniqueMessages(remote.message);
	const signatureTerminalNewlines = remote.gpgsig ? [true, false] : [false];

	const candidate = async (
		authorOffset: number,
		committerOffset: number,
	): Promise<Uint8Array | null> => {
		const author = signatureFromRemote(remote.author, authorOffset);
		const committer = signatureFromRemote(remote.committer, committerOffset);
		for (const message of messages) {
			for (const preserveSignatureTerminalNewline of signatureTerminalNewlines) {
				const exact = await matches(
					serializeStructuredCommit({
						tree,
						parents: remote.parents,
						author,
						committer,
						message,
						gpgsig: remote.gpgsig,
						preserveSignatureTerminalNewline,
					}),
				);
				if (exact) return exact;
			}
		}
		return null;
	};

	if (
		normalizedApiDate(remote.author.date) &&
		normalizedApiDate(remote.committer.date)
	) {
		for (const offset of REAL_WORLD_TIMEZONE_OFFSETS) {
			const exact = await candidate(offset, offset);
			if (exact) return exact;
		}
	}

	const candidates: Array<[number, number]> = [];
	for (const authorOffset of authorOffsets) {
		for (const committerOffset of committerOffsets) {
			if (authorOffset !== committerOffset)
				candidates.push([authorOffset, committerOffset]);
		}
	}
	for (let index = 0; index < candidates.length; index += 32) {
		const results = await Promise.all(
			candidates
				.slice(index, index + 32)
				.map(([authorOffset, committerOffset]) =>
					candidate(authorOffset, committerOffset),
				),
		);
		const exact = results.find((content) => content !== null);
		if (exact) return exact;
	}
	return null;
};

class GitSyncService {
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
	private repo(projectId: string) {
		const fileSystem = gitFileSystemService.get(projectId);
		return {
			fileSystem,
			options: { fs: fileSystem.fs, dir: DIR, gitdir: GIT_DIR },
		};
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

	private async hasCommit(projectId: string, oid: string): Promise<boolean> {
		const git = await getGit();
		const { options } = this.repo(projectId);
		try {
			await git.readCommit({ ...options, oid });
			return true;
		} catch {
			return false;
		}
	}

	private async hasBlob(projectId: string, oid: string): Promise<boolean> {
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

	private async readLocalCommitMeta(projectId: string, oid: string) {
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

	private async readLocalFiles(
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

	private async readLocalBlob(
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

	private async changesBetween(
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

	private async exportLocalCommit(
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

	private async exportLocalCommitFromBase(
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

	private async localCommitIsAncestor(
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

	private async missingCommits(
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

	private treeNode(): TreeNode {
		return { files: [], directories: new Map() };
	}

	private addTreeEntry(
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

	private async writeTreeNode(
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

	private async importRemoteCommit(
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

	private async rewriteCurrentBranch(
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
