// src/utils/gitBackupUtils.ts
import type {
	GitBackupAdapter,
	GitTreeItem,
	ResolvedGitCredentials,
} from '../types/gitBackup';
import { latin1ToBytes } from './fileUtils';

export function gitRemoteStringToBytes(content: string): Uint8Array {
	return latin1ToBytes(content);
}

export function gitContentToText(
	content: string | Uint8Array | ArrayBuffer,
): string {
	if (typeof content === 'string') return content;
	return new TextDecoder('utf-8').decode(content);
}

export async function readGitFileBytes<TTarget>(
	adapter: GitBackupAdapter<TTarget>,
	credentials: ResolvedGitCredentials<TTarget>,
	ref: string,
): Promise<Uint8Array> {
	const content = await adapter.readFile(
		credentials.token,
		credentials.target,
		ref,
		credentials.branch,
	);
	return gitRemoteStringToBytes(content);
}

export async function readGitFileText<TTarget>(
	adapter: GitBackupAdapter<TTarget>,
	credentials: ResolvedGitCredentials<TTarget>,
	ref: string,
): Promise<string> {
	return new TextDecoder('utf-8').decode(
		await readGitFileBytes(adapter, credentials, ref),
	);
}

export async function readGitFileAtRefBytesSafe<TTarget>(
	adapter: GitBackupAdapter<TTarget>,
	credentials: ResolvedGitCredentials<TTarget>,
	path: string,
	ref: string,
): Promise<Uint8Array | undefined> {
	try {
		if (adapter.readFileBytesAtRef) {
			return new Uint8Array(
				await adapter.readFileBytesAtRef(
					credentials.token,
					credentials.target,
					path,
					ref,
				),
			);
		}

		if (!adapter.readFileAtRef) return undefined;
		return gitRemoteStringToBytes(
			await adapter.readFileAtRef(
				credentials.token,
				credentials.target,
				path,
				ref,
			),
		);
	} catch {
		return undefined;
	}
}

export async function readGitFileAtRefTextSafe<TTarget>(
	adapter: GitBackupAdapter<TTarget>,
	credentials: ResolvedGitCredentials<TTarget>,
	path: string,
	ref: string,
): Promise<string | undefined> {
	const content = await readGitFileAtRefBytesSafe(
		adapter,
		credentials,
		path,
		ref,
	);
	return content === undefined
		? undefined
		: new TextDecoder('utf-8').decode(content);
}

export function getGitFileRef<TTarget>(
	adapter: GitBackupAdapter<TTarget>,
	item: GitTreeItem,
	path: string,
	branch: string,
): string {
	return (
		adapter.getFileRefForPath?.(item, path, branch) ||
		item.sha ||
		item.id ||
		path
	);
}
