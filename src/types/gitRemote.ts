//src/types/gitRemotes.ts
export interface GitRemoteRepository {
	id: string;
	label: string;
	private?: boolean;
	defaultBranch?: string;
}

export interface GitRemoteBranch {
	name: string;
	protected?: boolean;
}

export type GitHistoryCredentialSource =
	| 'history'
	| 'backup-project'
	| 'backup-global';

export interface GitRemoteCredentialRef {
	pluginId: string;
	secretKey: string;
	scope: 'project' | 'global';
}

export interface GitRemoteApiConfiguration {
	endpoint: string;
	requestTimeout: number;
}

export interface GitRemoteSyncBase {
	localOid: string;
	remoteOid: string;
}

export interface GitRemoteConfig {
	providerId: string;
	providerName?: string;
	apiConfiguration?: GitRemoteApiConfiguration;
	repositoryId: string;
	repositoryLabel: string;
	branch: string;
	credentialSource: GitHistoryCredentialSource;
	credentialRef?: GitRemoteCredentialRef;
	syncBase?: GitRemoteSyncBase;
}

export interface GitRemoteSignature {
	name: string;
	email: string;
	date: string;
}

export type GitRemoteTreeEntryType = 'blob' | 'tree' | 'commit';

export interface GitRemoteTreeEntry {
	path: string;
	mode: string;
	type: GitRemoteTreeEntryType;
	oid: string;
}

export interface GitRemoteCommitObject {
	oid: string;
	message: string;
	parents: string[];
	author: GitRemoteSignature;
	committer: GitRemoteSignature;
	treeOid?: string;
	gpgsig?: string;
	unsignedPayload?: string;
}

export interface GitRemoteCommitChange {
	path: string;
	type: 'create' | 'update' | 'delete';
	mode?: string;
	previousMode?: string;
	previousOid?: string;
	content?: Uint8Array;
}

export interface GitRemoteCreateCommitInput {
	branch: string;
	parents: string[];
	expectedBranchHead: string | null;
	updateBranch: boolean;
	message: string;
	author: GitRemoteSignature;
	committer: GitRemoteSignature;
	changes: GitRemoteCommitChange[];
}

export interface GitRemoteHistoryTransport {
	preservesCommitOids: boolean;
	supportsMergeCommits: boolean;
	getHead(
		token: string,
		repositoryId: string,
		branch: string,
	): Promise<string | null>;
	getCommit(
		token: string,
		repositoryId: string,
		oid: string,
	): Promise<GitRemoteCommitObject>;
	getTree(
		token: string,
		repositoryId: string,
		commit: GitRemoteCommitObject,
	): Promise<GitRemoteTreeEntry[]>;
	getBlob(
		token: string,
		repositoryId: string,
		oid: string,
	): Promise<Uint8Array>;
	createCommit(
		token: string,
		repositoryId: string,
		input: GitRemoteCreateCommitInput,
	): Promise<GitRemoteCommitObject>;
}

export interface GitRemoteProvider {
	id: string;
	displayName: string;
	historyPluginId: string;
	historyTokenSecretKey: string;
	backupPluginId: string;
	backupTokenSecretKey: string;
	configure?(getSetting: (id: string) => { value?: unknown } | undefined): void;
	getApiConfiguration?(): GitRemoteApiConfiguration;
	applyApiConfiguration?(configuration: GitRemoteApiConfiguration): void;
	testConnection(token: string): Promise<boolean>;
	listRepositories(token: string): Promise<GitRemoteRepository[]>;
	listBranches(token: string, repositoryId: string): Promise<GitRemoteBranch[]>;
	createBranch?(
		token: string,
		repositoryId: string,
		branch: string,
		sourceRef: string,
	): Promise<void>;
	normalizeRepositoryInput?(input: string): string;
	historyTransport: GitRemoteHistoryTransport;
}
