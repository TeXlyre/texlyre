// src/types/gitBackup.ts
import type { BackupActivity, BackupStatus } from './backup';

export interface GitBackupStatus extends BackupStatus {
	[key: string]: any;
}

export type GitBackupActivity = BackupActivity;

export interface GitBackupSettings {
	apiEndpoint?: string;
	defaultBranch?: string;
	defaultCommitMessage?: string;
	ignorePatterns?: string[];
	maxFileSize?: number;
	requestTimeout?: number;
	maxRetryAttempts?: number;
	activityHistoryLimit?: number;
	importAfterPush?: boolean;
}

export interface GitTreeItem {
	type: string;
	path?: string;
	sha?: string;
	id?: string;
}

export type GitBackupChange =
	| {
			type: 'create' | 'update';
			path: string;
			content: string | Uint8Array | ArrayBuffer;
			previousRef?: string;
	  }
	| {
			type: 'delete';
			path: string;
			previousRef?: string;
	  };

export interface GitBackupAdapter<TTarget> {
	displayName: string;
	pluginId: string;
	tokenSecretKey: string;
	targetSecretKey: string;
	statusTargetKey: string;
	tokenType: string;
	importIdPrefix: string;

	setBaseUrl?(url: string): void;
	setRequestTimeout?(timeout: number): void;

	testConnection(token: string): Promise<boolean>;
	listTargets(token: string): Promise<any[]>;

	parseTarget(...args: any[]): TTarget;
	targetFromStoredValue(value: string, metadata?: Record<string, any>): TTarget;
	getTargetLabel(target: TTarget): string;
	getTargetSecretValue(target: TTarget): string;
	getTargetMetadata(target: TTarget): Record<string, any>;

	getRecursiveTree(
		token: string,
		target: TTarget,
		branch: string,
	): Promise<GitTreeItem[]>;

	readFile(
		token: string,
		target: TTarget,
		ref: string,
		branch: string,
	): Promise<string>;

	getFileRefForPath?(item: GitTreeItem, path: string, branch: string): string;

	commitChanges(
		token: string,
		target: TTarget,
		branch: string,
		message: string,
		changes: GitBackupChange[],
	): Promise<void>;

	getLatestCommitSha?(
		token: string,
		target: TTarget,
		branch: string,
	): Promise<string>;

	readFileAtRef?(
		token: string,
		target: TTarget,
		path: string,
		ref: string,
	): Promise<string>;

	readFileBytesAtRef?(
		token: string,
		target: TTarget,
		path: string,
		ref: string,
	): Promise<ArrayBuffer>;
}

export interface ResolvedGitCredentials<TTarget> {
	token: string;
	target: TTarget;
	branch: string;
}

export interface GitBackupProjectFiles {
	metadataRef?: string;
	documentsMetadataRef?: string;
	filesMetadataRef?: string;
	documents: Map<string, { txtRef: string | null; yjsRef: string | null }>;
	files: Map<string, string>;
}

export interface LinkedBackupDocument {
	txtPath: string;
	yjsPath: string;
}

export interface GitBackupBuildOptions {
	maxFileSize: number;
	shouldIgnoreFile: (filePath: string) => boolean;
}

export type GitBackupActivityInput = Omit<
	GitBackupActivity,
	'id' | 'timestamp'
>;
