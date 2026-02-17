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
                    `GitLab API request to '${endpoint}' failed: ${response.statusText}. ${errorData.message || ''}`,
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
        return this._request<GitLabFile[]>(
            token,
            `projects/${encodeURIComponent(projectId)}/repository/tree?path=${path}&ref=${ref}&recursive=false`,
        );
    }

    async getFileContent(
        token: string,
        projectId: string,
        filePath: string,
        ref = 'main',
    ): Promise<string> {
        const data = await this._request<{ content: string; encoding: string }>(
            token,
            `projects/${encodeURIComponent(projectId)}/repository/files/${encodeURIComponent(filePath)}?ref=${ref}`,
        );
        if (data.encoding === 'base64') {
            return atob(data.content);
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
        return this._request<GitLabTreeItem[]>(
            token,
            `projects/${encodeURIComponent(projectId)}/repository/tree?recursive=true&ref=${ref}&per_page=100`,
        );
    }

    async getBranches(
        token: string,
        projectId: string,
    ): Promise<{ name: string; protected: boolean }[]> {
        const data = await this._request<{ name: string; protected: boolean }[]>(
            token,
            `projects/${encodeURIComponent(projectId)}/repository/branches`,
        );
        return data;
    }
}

export const gitLabAPIService = new GitLabAPIService();