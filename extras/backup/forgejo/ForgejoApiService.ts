// extras/backup/forgejo/ForgejoApiService.ts
interface ForgejoFile {
    name: string;
    path: string;
    content?: string;
    type: 'file' | 'dir';
}

interface ForgejoRepo {
    id: number;
    name: string;
    full_name: string;
    private: boolean;
    default_branch: string;
}

interface ForgejoTreeItem {
    path: string;
    mode: string;
    type: 'blob' | 'tree';
    sha: string;
}

interface ForgejoCommitAction {
    operation: 'create' | 'update' | 'delete';
    path: string;
    content?: string;
    encoding?: 'base64';
}

export class ForgejoApiService {
    private baseUrl: string = 'https://codeberg.org/api/v1';
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
            'Authorization': `token ${token}`,
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
                    `Forgejo API request to '${endpoint}' failed: ${response.statusText}. ${errorData.message || ''}`,
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
                headers: { 'Authorization': `token ${token}` },
                signal: controller.signal,
            });

            clearTimeout(timeoutId);
            return response.ok;
        } catch {
            return false;
        }
    }

    async getRepositories(token: string): Promise<ForgejoRepo[]> {
        return this._request<ForgejoRepo[]>(token, 'user/repos?limit=100');
    }

    async getRepositoryTree(
        token: string,
        owner: string,
        repo: string,
        path = '',
        ref = 'main',
    ): Promise<ForgejoFile[]> {
        return this._request<ForgejoFile[]>(
            token,
            `repos/${owner}/${repo}/contents/${path}?ref=${ref}`,
        );
    }

    async getFileContent(
        token: string,
        owner: string,
        repo: string,
        filePath: string,
        ref = 'main',
    ): Promise<string> {
        const data = await this._request<{ content: string; encoding: string }>(
            token,
            `repos/${owner}/${repo}/contents/${filePath}?ref=${ref}`,
        );
        if (data.encoding === 'base64') {
            return atob(data.content.replace(/\n/g, ''));
        }
        return data.content;
    }

    async createOrUpdateFiles(
        token: string,
        owner: string,
        repo: string,
        branch: string,
        commitMessage: string,
        actions: ForgejoCommitAction[],
    ): Promise<void> {
        const fileOperations = actions.map((action) => {
            const operation: any = {
                operation: action.operation,
                path: action.path,
            };

            if (action.operation !== 'delete') {
                operation.content = action.content;
                if (action.encoding) {
                    operation.encoding = action.encoding;
                }
            }

            return operation;
        });

        await this._request<void>(
            token,
            `repos/${owner}/${repo}/contents`,
            {
                method: 'POST',
                body: JSON.stringify({
                    branch,
                    message: commitMessage,
                    files: fileOperations,
                }),
            },
        );
    }

    async getRecursiveTree(
        token: string,
        owner: string,
        repo: string,
        ref = 'main',
    ): Promise<ForgejoTreeItem[]> {
        const data = await this._request<{ tree: ForgejoTreeItem[] }>(
            token,
            `repos/${owner}/${repo}/git/trees/${ref}?recursive=true`,
        );
        return data.tree;
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

export const forgejoApiService = new ForgejoApiService();