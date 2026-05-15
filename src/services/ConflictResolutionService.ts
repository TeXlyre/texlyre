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
        return new Promise((resolve) => {
            const request: ConflictResolutionRequest = { conflicts, resolve };
            this.listeners.forEach((listener) => listener(request));
        });
    }

    addListener(callback: (request: ConflictResolutionRequest) => void): () => void {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter((l) => l !== callback);
        };
    }
}

export const conflictResolutionService = new ConflictResolutionService();
