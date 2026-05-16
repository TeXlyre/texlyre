// src/services/ConflictResolutionService.ts
import { threeWayMerge } from '../utils/textDiffUtils';

export interface FileConflict {
    path: string;
    isBinary: boolean;
    baseContent?: string;
    localContent: string | ArrayBuffer;
    remoteContent: string | ArrayBuffer;
    previousRef?: string;
}

export type ConflictResolution =
    | { action: 'keep-local' }
    | { action: 'keep-remote' }
    | { action: 'merged'; content: string | ArrayBuffer };

export interface ConflictResolutionRequest {
    conflicts: FileConflict[];
    resolve: (resolutions: Map<string, ConflictResolution> | null) => void;
}

export type AutoMergeResult =
    | { resolved: true; content: string; unchanged?: boolean }
    | { resolved: false };

class ConflictResolutionService {
    private listeners: Array<(request: ConflictResolutionRequest) => void> = [];

    tryAutoMerge(
        base: string | undefined,
        local: string,
        remote: string,
        isBinary: boolean,
    ): AutoMergeResult {
        if (local === remote) {
            return { resolved: true, content: local, unchanged: base === local };
        }

        if (base !== undefined && base === local) {
            return { resolved: true, content: remote };
        }

        if (base !== undefined && base === remote) {
            return { resolved: true, content: local };
        }

        if (isBinary || base === undefined) {
            return { resolved: false };
        }

        const merged = threeWayMerge(base, local, remote);
        if (!merged.hasConflicts) {
            return { resolved: true, content: merged.merged };
        }

        return { resolved: false };
    }

    async resolveConflicts(
        conflicts: FileConflict[],
    ): Promise<Map<string, ConflictResolution> | null> {
        const metadataConflicts = conflicts.filter((c) => c.path.endsWith('metadata.json'));
        const realConflicts = conflicts.filter((c) => !c.path.endsWith('metadata.json'));

        if (realConflicts.length === 0) {
            const resolutions = new Map<string, ConflictResolution>();
            this.deriveMetadataResolutions(metadataConflicts, resolutions);
            return resolutions;
        }

        return new Promise((resolve) => {
            const request: ConflictResolutionRequest = {
                conflicts: realConflicts,
                resolve: (resolutions) => {
                    if (resolutions === null) { resolve(null); return; }
                    this.deriveMetadataResolutions(metadataConflicts, resolutions);
                    resolve(resolutions);
                },
            };
            this.listeners.forEach((listener) => listener(request));
        });
    }

    addListener(callback: (request: ConflictResolutionRequest) => void): () => void {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter((l) => l !== callback);
        };
    }

    private deriveMetadataResolutions(
        metadataConflicts: FileConflict[],
        resolutions: Map<string, ConflictResolution>,
    ): void {
        for (const conflict of metadataConflicts) {
            const pathPrefix = conflict.path.replace(/\/[^/]+\/metadata\.json$/, '/');
            const relevantResolutions = [...resolutions.entries()]
                .filter(([p]) => p.startsWith(pathPrefix));

            if (relevantResolutions.length === 0) {
                resolutions.set(conflict.path, { action: 'keep-local' });
                continue;
            }

            const allRemote = relevantResolutions.every(([, r]) => r.action === 'keep-remote');
            if (allRemote) {
                resolutions.set(conflict.path, { action: 'keep-remote' });
                continue;
            }

            try {
                const localMeta = JSON.parse(typeof conflict.localContent === 'string'
                    ? conflict.localContent
                    : new TextDecoder().decode(conflict.localContent));
                const remoteMeta = JSON.parse(typeof conflict.remoteContent === 'string'
                    ? conflict.remoteContent
                    : new TextDecoder().decode(conflict.remoteContent));

                const localArr: any[] = Array.isArray(localMeta) ? localMeta : [localMeta];
                const remoteArr: any[] = Array.isArray(remoteMeta) ? remoteMeta : [remoteMeta];

                const remoteById = new Map(remoteArr.map((e) => [e.id ?? e.path, e]));
                const merged = localArr.map((localEntry) => {
                    const key = localEntry.id ?? localEntry.path;
                    const resolution = relevantResolutions.find(([p]) =>
                        p.endsWith(`/${localEntry.name}`) || p.includes(key),
                    );
                    if (!resolution) return localEntry;
                    return resolution[1].action === 'keep-remote'
                        ? (remoteById.get(key) ?? localEntry)
                        : localEntry;
                });

                for (const [, remoteEntry] of remoteById) {
                    const key = remoteEntry.id ?? remoteEntry.path;
                    if (!merged.find((e) => (e.id ?? e.path) === key)) {
                        const resolution = relevantResolutions.find(([p]) =>
                            p.includes(key),
                        );
                        if (resolution?.[1].action !== 'keep-local') {
                            merged.push(remoteEntry);
                        }
                    }
                }

                resolutions.set(conflict.path, {
                    action: 'merged',
                    content: JSON.stringify(merged, null, 2),
                });
            } catch {
                resolutions.set(conflict.path, { action: 'keep-local' });
            }
        }
    }
}

export const conflictResolutionService = new ConflictResolutionService();