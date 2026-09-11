import type { GitRemoteBranch, GitRemoteProvider } from '../types/gitRemote';

interface GitRemoteApiRequestOptions {
	providerName: string;
	baseUrl: string;
	token: string;
	endpoint: string;
	requestTimeout: number;
	authHeaders: (token: string) => Record<string, string>;
	options?: RequestInit;
}

export async function gitRemoteApiRequest<T>({
	providerName,
	baseUrl,
	token,
	endpoint,
	requestTimeout,
	authHeaders,
	options = {},
}: GitRemoteApiRequestOptions): Promise<T> {
	const headers = new Headers(authHeaders(token));
	if (options.body) headers.set('Content-Type', 'application/json');
	new Headers(options.headers).forEach((value, key) => {
		headers.set(key, value);
	});

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), requestTimeout * 1000);
	try {
		const response = await fetch(
			`${baseUrl.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`,
			{ ...options, headers, signal: controller.signal },
		);
		if (!response.ok) {
			const body = (await response.json().catch(() => ({}))) as {
				message?: string | Record<string, unknown>;
				error?: string;
			};
			const detail =
				typeof body.message === 'string'
					? body.message
					: body.error || response.statusText;
			const error = new Error(
				`${providerName} API request failed: ${detail || response.statusText}`,
			) as Error & { status?: number };
			error.status = response.status;
			throw error;
		}
		return response.status === 204 ? (undefined as T) : response.json();
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			throw new Error(
				`${providerName} API request timed out after ${requestTimeout} seconds`,
			);
		}
		throw error;
	} finally {
		clearTimeout(timeoutId);
	}
}

export function normalizeGitRepositoryInput(input: string): string {
	const trimmed = input.trim();
	if (!trimmed) return '';
	try {
		return new URL(trimmed).pathname.replace(/^\/+/, '').replace(/\.git$/, '');
	} catch {
		const ssh = trimmed.match(/^[^@\s]+@[^:\s]+:(.+)$/);
		return (ssh?.[1] ?? trimmed).replace(/^\/+/, '').replace(/\.git$/, '');
	}
}

export function gitRepositoryParts(
	repositoryId: string,
	providerName: string,
): [string, string] {
	const [owner, repo] = normalizeGitRepositoryInput(repositoryId).split('/');
	if (!owner || !repo) throw new Error(`Invalid ${providerName} repository`);
	return [owner, repo];
}

export function base64ToBytes(value: string): Uint8Array {
	const binary = atob(value.replace(/[\r\n]/g, ''));
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

export async function ensureGitRemoteBranch(
	provider: GitRemoteProvider,
	token: string,
	repositoryId: string,
	branch: string,
	branches: GitRemoteBranch[],
	preferredSource?: string,
): Promise<void> {
	const target = branch.trim();
	if (
		!target ||
		branches.some((item) => item.name === target) ||
		branches.length === 0
	) {
		return;
	}
	if (!provider.createBranch) {
		throw new Error(`${provider.displayName} cannot create remote branches`);
	}
	const source =
		branches.find((item) => item.name === preferredSource) ??
		branches.find((item) => item.name === 'main') ??
		branches.find((item) => item.name === 'master') ??
		branches[0];
	await provider.createBranch(token, repositoryId, target, source.name);
}
