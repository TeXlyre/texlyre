// extras/backup/github/GitHubApiService.ts
interface GitHubFile {
	name: string;
	path: string;
	content?: string;
	sha?: string;
	type: 'file' | 'dir';
	download_url?: string;
}
interface GitHubRepo {
	name: string;
	full_name: string;
	private: boolean;
	default_branch: string;
}
interface GitHubTreeItem {
	path: string;
	mode: '100644' | '100755' | '040000' | '160000' | '120000';
	type: 'blob' | 'tree' | 'commit';
	sha: string | null;
	url?: string;
	size?: number;
}

export class GitHubApiService {
	private baseUrl: string = 'https://api.github.com';
	private requestTimeout: number = 30000;

	setBaseUrl(url: string): void {
		this.baseUrl = url.replace(/\/$/, '');
	}

	getBaseUrl(): string {
		return this.baseUrl;
	}

	setRequestTimeout(timeoutSeconds: number): void {
		this.requestTimeout = timeoutSeconds * 1000;
	}

	private async _request<T>(
		token: string,
		endpoint: string,
		options: RequestInit = {},
	): Promise<T> {
		const url = `${this.baseUrl}/${endpoint}`;
		const headers = new Headers({
			Authorization: `token ${token}`,
			Accept: 'application/vnd.github.v3+json',
			...options.headers,
		});
		if (options.body) headers.set('Content-Type', 'application/json');

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.requestTimeout);

		try {
			const response = await fetch(url, {
				...options,
				headers,
				signal: controller.signal,
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(
					`GitHub API request to '${endpoint}' failed: ${response.statusText}. ${errorData.message || ''}`,
				);
			}

			return response.status === 204 ? (null as T) : response.json();
		} catch (error) {
			clearTimeout(timeoutId);
			if (error instanceof Error && error.name === 'AbortError') {
				throw new Error(`Request timeout after ${this.requestTimeout / 1000} seconds`);
			}
			throw error;
		}
	}

	private _encodeContent(content: string | Uint8Array | ArrayBuffer): string {
		if (typeof content === 'string')
			return btoa(unescape(encodeURIComponent(content)));

		const uint8Array =
			content instanceof ArrayBuffer ? new Uint8Array(content) : content;
		let binaryString = '';
		for (let i = 0; i < uint8Array.length; i++) {
			binaryString += String.fromCharCode(uint8Array[i]);
		}
		return btoa(binaryString);
	}

	async testConnection(token: string): Promise<boolean> {
		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(
				() => controller.abort(),
				this.requestTimeout,
			);

			const response = await fetch(`${this.baseUrl}/user`, {
				headers: { Authorization: `token ${token}` },
				signal: controller.signal,
			});

			clearTimeout(timeoutId);
			return response.ok;
		} catch {
			return false;
		}
	}

	async getRepositories(token: string): Promise<GitHubRepo[]> {
		return this._request<GitHubRepo[]>(token, 'user/repos?per_page=100');
	}

	async getRepositoryContents(
		token: string,
		owner: string,
		repo: string,
		path = '',
	): Promise<GitHubFile[]> {
		return this._request<GitHubFile[]>(
			token,
			`repos/${owner}/${repo}/contents/${path}`,
		);
	}

	async getFileContent(
		token: string,
		owner: string,
		repo: string,
		path: string,
	): Promise<string> {
		const data = await this._request<{ content: string }>(
			token,
			`repos/${owner}/${repo}/contents/${path}`,
		);
		return atob(data.content.replace(/\n/g, ''));
	}

	async createOrUpdateFile(
		token: string,
		owner: string,
		repo: string,
		path: string,
		content: string | Uint8Array | ArrayBuffer,
		message: string,
		sha?: string,
	): Promise<void> {
		const body = { message, content: this._encodeContent(content), sha };
		await this._request<void>(
			token,
			`repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
			{ method: 'PUT', body: JSON.stringify(body) },
		);
	}

	async deleteFile(
		token: string,
		owner: string,
		repo: string,
		path: string,
		message: string,
		sha: string,
		branch = 'main',
	): Promise<void> {
		await this._request<void>(
			token,
			`repos/${owner}/${repo}/contents/${path}`,
			{
				method: 'DELETE',
				body: JSON.stringify({ message, sha, branch }),
			},
		);
	}

	private async getLatestCommit(
		token: string,
		owner: string,
		repo: string,
		branch: string,
	): Promise<{ sha: string; treeSha: string }> {
		const data = await this._request<{
			commit: { sha: string; commit: { tree: { sha: string } } };
		}>(token, `repos/${owner}/${repo}/branches/${branch}`);
		return { sha: data.commit.sha, treeSha: data.commit.commit.tree.sha };
	}

	private async createBlob(
		token: string,
		owner: string,
		repo: string,
		content: string | Uint8Array | ArrayBuffer,
	): Promise<string> {
		const body = { content: this._encodeContent(content), encoding: 'base64' };
		const data = await this._request<{ sha: string }>(
			token,
			`repos/${owner}/${repo}/git/blobs`,
			{ method: 'POST', body: JSON.stringify(body) },
		);
		return data.sha;
	}

	private async createTree(
		token: string,
		owner: string,
		repo: string,
		baseTreeSha: string,
		treeItems: GitHubTreeItem[],
	): Promise<string> {
		const validatedItems = treeItems.filter((item) => {
			if (!item.path || item.path.includes('//') || item.path.startsWith('/')) {
				console.warn(`Invalid tree item path: ${item.path}`);
				return false;
			}
			if (item.type === 'blob' && item.sha === undefined) {
				console.warn(`Blob item missing sha: ${item.path}`);
				return false;
			}
			return true;
		});

		const body = { base_tree: baseTreeSha, tree: validatedItems };

		try {
			const data = await this._request<{ sha: string }>(
				token,
				`repos/${owner}/${repo}/git/trees`,
				{
					method: 'POST',
					body: JSON.stringify(body),
				},
			);
			return data.sha;
		} catch (error) {
			console.error('Tree creation failed with items:', validatedItems);
			throw error;
		}
	}

	private async createCommit(
		token: string,
		owner: string,
		repo: string,
		message: string,
		treeSha: string,
		parentSha: string,
	): Promise<string> {
		const body = { message, tree: treeSha, parents: [parentSha] };
		const data = await this._request<{ sha: string }>(
			token,
			`repos/${owner}/${repo}/git/commits`,
			{ method: 'POST', body: JSON.stringify(body) },
		);
		return data.sha;
	}

	private async updateReference(
		token: string,
		owner: string,
		repo: string,
		commitSha: string,
		branch: string,
	): Promise<void> {
		await this._request<void>(
			token,
			`repos/${owner}/${repo}/git/refs/heads/${branch}`,
			{ method: 'PATCH', body: JSON.stringify({ sha: commitSha }) },
		);
	}

	async createCommitFromFiles(
		token: string,
		owner: string,
		repo: string,
		commitMessage: string,
		files: { path: string; content: string | Uint8Array | ArrayBuffer }[],
		branch = 'main',
		deletions: { path: string }[] = [],
	): Promise<void> {
		const latestCommit = await this.getLatestCommit(token, owner, repo, branch);
		const treeItems: GitHubTreeItem[] = [];

		for (const file of files) {
			const cleanPath = file.path.replace(/^\/+/, '').replace(/\/+/g, '/');
			if (!cleanPath) continue;

			const blobSha = await this.createBlob(token, owner, repo, file.content);
			treeItems.push({
				path: cleanPath,
				mode: '100644' as const,
				type: 'blob' as const,
				sha: blobSha,
			});
		}

		if (deletions.length > 0) {
			const cleanDeletionPaths = deletions
				.map((d) => d.path.replace(/^\/+/, '').replace(/\/+/g, '/'))
				.filter((path) => path);

			const existingFiles = await this.getExistingFiles(
				token,
				owner,
				repo,
				branch,
				cleanDeletionPaths,
			);

			for (const path of existingFiles) {
				treeItems.push({
					path,
					mode: '100644' as const,
					type: 'blob' as const,
					sha: null,
				});
			}
		}

		if (treeItems.length === 0) return;

		const newTreeSha = await this.createTree(
			token,
			owner,
			repo,
			latestCommit.treeSha,
			treeItems,
		);
		const newCommitSha = await this.createCommit(
			token,
			owner,
			repo,
			commitMessage,
			newTreeSha,
			latestCommit.sha,
		);
		await this.updateReference(token, owner, repo, newCommitSha, branch);
	}

	private async getExistingFiles(
		token: string,
		owner: string,
		repo: string,
		branch: string,
		paths: string[],
	): Promise<Set<string>> {
		const tree = await this.getRecursiveTree(token, owner, repo, branch);
		const existingPaths = new Set(
			tree.filter((item) => item.type === 'blob').map((item) => item.path),
		);
		return new Set(paths.filter((path) => existingPaths.has(path)));
	}

	async getRecursiveTree(
		token: string,
		owner: string,
		repo: string,
		branch = 'main',
	): Promise<GitHubTreeItem[]> {
		const latestCommit = await this.getLatestCommit(token, owner, repo, branch);
		const data = await this._request<{ tree: GitHubTreeItem[] }>(
			token,
			`repos/${owner}/${repo}/git/trees/${latestCommit.treeSha}?recursive=true`,
		);
		return data.tree;
	}

	async getBlobContent(
		token: string,
		owner: string,
		repo: string,
		blobSha: string,
	): Promise<string> {
		const data = await this._request<{ content: string; encoding: string }>(
			token,
			`repos/${owner}/${repo}/git/blobs/${blobSha}`,
		);
		if (data.encoding !== 'base64')
			throw new Error(`Unsupported blob encoding: ${data.encoding}`);
		return atob(data.content.replace(/\n/g, ''));
	}

	async getBranches(
		token: string,
		owner: string,
		repo: string,
	): Promise<{ name: string; protected: boolean }[]> {
		const data = await this._request<{ name: string; protected: boolean }[]>(
			token,
			`repos/${owner}/${repo}/branches`,
		);
		return data;
	}
}

export const gitHubApiService = new GitHubApiService();