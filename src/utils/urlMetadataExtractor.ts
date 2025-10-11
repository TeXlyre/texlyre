// src/utils/urlMetadataExtractor.ts
interface PageMetadata {
    title: string | null;
    description: string | null;
    image: string | null;
    tags: string[];
    type: 'latex' | 'typst' | null;
    zipUrl: string;
}

const parseGitUrl = (url: string) => {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        const parts = urlObj.pathname.split('/').filter(Boolean);

        if (parts.length < 2) return null;

        return {
            hostname,
            owner: parts[0],
            repo: parts[1].replace(/\.git$/, '')
        };
    } catch {
        return null;
    }
};

const detectTypeFromLanguages = (languages: Record<string, number>): 'latex' | 'typst' | null => {
    const entries = Object.entries(languages);
    if (entries.length === 0) return null;

    const sorted = entries.sort((a, b) => b[1] - a[1]);
    const primaryLanguage = sorted[0][0].toLowerCase();

    if (primaryLanguage.includes('tex')) return 'latex';
    if (primaryLanguage.includes('typst')) return 'typst';

    return null;
};

const applyProxyToZipUrl = (zipUrl: string, proxyUrl: string | null): string => {
    if (!proxyUrl || !proxyUrl.trim()) return zipUrl;

    const trimmedProxy = proxyUrl.trim();
    // const normalizedProxy = trimmedProxy.endsWith('/') ? trimmedProxy.slice(0, -1) : trimmedProxy;

    return `${trimmedProxy}${zipUrl}`;
};

const fetchGitHubMetadata = async (owner: string, repo: string, proxyUrl: string | null): Promise<PageMetadata | null> => {
    try {
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
        if (!response.ok) return null;

        const data = await response.json();

        const languagesResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/languages`);
        const languages = languagesResponse.ok ? await languagesResponse.json() : {};

        const detectedType = detectTypeFromLanguages(languages);
        const socialImageUrl = `https://opengraph.githubassets.com/1/${owner}/${repo}`;
        const zipUrl = `https://github.com/${owner}/${repo}/archive/refs/heads/${data.default_branch}.zip`;

        return {
            title: data.name,
            description: data.description,
            image: socialImageUrl,
            tags: data.topics || [],
            type: detectedType,
            zipUrl: applyProxyToZipUrl(zipUrl, proxyUrl)
        };
    } catch {
        return null;
    }
};

const fetchGitLabMetadata = async (owner: string, repo: string, proxyUrl: string | null): Promise<PageMetadata | null> => {
    try {
        const projectPath = encodeURIComponent(`${owner}/${repo}`);
        const response = await fetch(`https://gitlab.com/api/v4/projects/${projectPath}`);
        if (!response.ok) return null;

        const data = await response.json();

        const languagesResponse = await fetch(`https://gitlab.com/api/v4/projects/${projectPath}/languages`);
        const languages = languagesResponse.ok ? await languagesResponse.json() : {};

        const detectedType = detectTypeFromLanguages(languages);
        const zipUrl = `https://gitlab.com/${owner}/${repo}/-/archive/${data.default_branch}/${repo}-${data.default_branch}.zip`;

        return {
            title: data.name,
            description: data.description,
            image: data.avatar_url,
            tags: data.topics || data.tag_list || [],
            type: detectedType,
            zipUrl: applyProxyToZipUrl(zipUrl, proxyUrl)
        };
    } catch {
        return null;
    }
};

const fetchGiteaMetadata = async (hostname: string, owner: string, repo: string, proxyUrl: string | null): Promise<PageMetadata | null> => {
    try {
        const response = await fetch(`https://${hostname}/api/v1/repos/${owner}/${repo}`);
        if (!response.ok) return null;

        const data = await response.json();

        const languagesResponse = await fetch(`https://${hostname}/api/v1/repos/${owner}/${repo}/languages`);
        const languages = languagesResponse.ok ? await languagesResponse.json() : {};

        const detectedType = detectTypeFromLanguages(languages);
        const zipUrl = `https://${hostname}/${owner}/${repo}/archive/${data.default_branch}.zip`;

        return {
            title: data.name,
            description: data.description,
            image: data.avatar_url || data.owner?.avatar_url,
            tags: data.topics || [],
            type: detectedType,
            zipUrl: applyProxyToZipUrl(zipUrl, proxyUrl)
        };
    } catch {
        return null;
    }
};

const detectGiteaInstance = async (hostname: string) => {
    try {
        const response = await fetch(`https://${hostname}/api/v1/version`, {
            method: 'HEAD'
        });
        return response.ok;
    } catch {
        return false;
    }
};

export const fetchPageMetadata = async (url: string, proxyUrl: string | null = null): Promise<PageMetadata> => {
    const parsed = parseGitUrl(url);

    if (parsed) {
        const { hostname, owner, repo } = parsed;
        let metadata = null;

        if (hostname === 'github.com') {
            metadata = await fetchGitHubMetadata(owner, repo, proxyUrl);
        } else if (hostname === 'gitlab.com') {
            metadata = await fetchGitLabMetadata(owner, repo, proxyUrl);
        } else if (hostname === 'codeberg.org') {
            metadata = await fetchGiteaMetadata(hostname, owner, repo, proxyUrl);
        } else {
            const isGitea = await detectGiteaInstance(hostname);
            if (isGitea) {
                metadata = await fetchGiteaMetadata(hostname, owner, repo, proxyUrl);
            }
        }

        if (metadata) return metadata;
    }

    return {
        title: null,
        description: null,
        image: null,
        tags: [],
        type: null,
        zipUrl: url
    };
};