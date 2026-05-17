// extras/backup/gitlab/GitLabAPIService.ts
interface GitLabFile {
    name: string;
    path: string;
    content?: string;
    type: 'blob' | 'tree';
}

interface GitLabProject {
    id: number;
    name: string;
    path_with_namespace: string;
    visibility: string;
    default_branch: string;
}

interface GitLabTreeItem {
    path: string;
    mode: string;
    type: 'blob' | 'tree';
    id: string;
}

interface GitLabCommitAction {
    action: 'create' | 'update' | 'delete';
    file_path: string;
    content?: string;
    encoding?: 'base64';
}

const encodeGitLabFilePath = (path: string): string =>
    encodeURIComponent(path.replace(/^\/+/, ''));

export class GitLabAPIService {
    private baseUrl: string = 'https://gitlab.com/api/v4';
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
            'PRIVATE-TOKEN': token,
            'Content-Type': 'application/json',
            ...options.headers,
        });

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
                    `GitLab API request to '${endpoint}' failed: ${response.statusText}. ${errorData.message || ''
                    }`,
                );
            }

            return response.status === 204 ? (null as T) : response.json();
        } catch (error) {
            clearTimeout(timeoutId);

            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error(
                    `Request timeout after ${this.requestTimeout / 1000} seconds`,
                );
            }

            throw error;
        }
    }

    async testConnection(token: string): Promise<boolean> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(
                () => controller.abort(),
                this.requestTimeout,
            );

            const response = await fetch(`${this.baseUrl}/user`, {
                headers: { 'PRIVATE-TOKEN': token },
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            return response.ok;
        } catch {
            return false;
        }
    }

    async getProjects(token: string): Promise<GitLabProject[]> {
        return this._request<GitLabProject[]>(
            token,
            'projects?membership=true&per_page=100',
        );
    }

    async getRepositoryTree(
        token: string,
        projectId: string,
        path = '',
        ref = 'main',
    ): Promise<GitLabFile[]> {
        const query = new URLSearchParams({
            path,
            ref,
            recursive: 'false',
        });

        return this._request<GitLabFile[]>(
            token,
            `projects/${encodeURIComponent(
                projectId,
            )}/repository/tree?${query.toString()}`,
        );
    }

    async getFileContent(
        token: string,
        projectId: string,
        filePath: string,
        ref = 'main',
    ): Promise<string> {
        const normalizedPath = filePath.replace(/^\/+/, '');

        const query = new URLSearchParams({
            ref,
        });

        const data = await this._request<{ content: string; encoding: string }>(
            token,
            `projects/${encodeURIComponent(
                projectId,
            )}/repository/files/${encodeGitLabFilePath(
                normalizedPath,
            )}?${query.toString()}`,
        );

        if (data.encoding === 'base64') {
            return atob(data.content.replace(/[\r\n]/g, ''));
        }

        return data.content;
    }

    async createCommit(
        token: string,
        projectId: string,
        branch: string,
        commitMessage: string,
        actions: GitLabCommitAction[],
    ): Promise<void> {
        await this._request<void>(
            token,
            `projects/${encodeURIComponent(projectId)}/repository/commits`,
            {
                method: 'POST',
                body: JSON.stringify({
                    branch,
                    commit_message: commitMessage,
                    actions,
                }),
            },
        );
    }

    async getRecursiveTree(
        token: string,
        projectId: string,
        ref = 'main',
    ): Promise<GitLabTreeItem[]> {
        const allItems: GitLabTreeItem[] = [];
        let page = 1;

        while (true) {
            const query = new URLSearchParams({
                recursive: 'true',
                ref,
                per_page: '100',
                page: String(page),
            });

            const items = await this._request<GitLabTreeItem[]>(
                token,
                `projects/${encodeURIComponent(
                    projectId,
                )}/repository/tree?${query.toString()}`,
            );

            allItems.push(...items);

            if (items.length < 100) break;

            page++;
        }

        return allItems;
    }

    async getBranchHeadSha(token: string, projectId: string, branch: string): Promise<string> {
        const data = await this._request<{ commit: { id: string } }>(
            token,
            `projects/${encodeURIComponent(projectId)}/repository/branches/${encodeURIComponent(branch)}?_=${Date.now()}`,
        );
        return data.commit.id;
    }

    async getFileContentAtRef(
        token: string,
        projectId: string,
        filePath: string,
        ref: string,
    ): Promise<string> {
        return this.getFileContent(token, projectId, filePath, ref);
    }

    async getBranches(
        token: string,
        projectId: string,
    ): Promise<{ name: string; protected: boolean }[]> {
        return this._request<{ name: string; protected: boolean }[]>(
            token,
            `projects/${encodeURIComponent(projectId)}/repository/branches`,
        );
    }
}

export const gitLabAPIService = new GitLabAPIService();
