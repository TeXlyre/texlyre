// src/services/ConflictResolutionService.ts
import * as Y from 'yjs';
import { toArrayBuffer } from '../utils/fileUtils';
import { threeWayMerge } from '../utils/textDiffUtils';

export interface FileConflict {
    path: string;
    isBinary: boolean;
    baseContent?: string;
    localContent: string | ArrayBuffer;
    remoteContent: string | ArrayBuffer;
    previousRef?: string;
    localMatchesRemote?: boolean;
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
            return { resolved: true, content: remote, unchanged: true };
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
        const resolutions = new Map<string, ConflictResolution>();

        for (const conflict of conflicts) {
            if (conflict.localMatchesRemote) {
                resolutions.set(conflict.path, { action: 'keep-remote' });
            }
        }

        const unresolvedConflicts = conflicts.filter((c) => !resolutions.has(c.path));

        const metadataConflicts = unresolvedConflicts.filter((c) => c.path.endsWith('metadata.json'));
        const yjsConflicts = unresolvedConflicts.filter((c) => c.path.endsWith('.yjs'));

        const linkedDocumentIds = this.extractLinkedDocumentIds(metadataConflicts);

        const linkedTxtConflicts = unresolvedConflicts.filter((c) =>
            c.path.endsWith('.txt') &&
            linkedDocumentIds.has(this.basenameWithoutExt(c.path)),
        );

        const realConflicts = unresolvedConflicts.filter(
            (c) =>
                !c.path.endsWith('metadata.json') &&
                !c.path.endsWith('.yjs') &&
                !linkedTxtConflicts.includes(c),
        );

        if (realConflicts.length === 0) {
            this.deriveMetadataResolutions(metadataConflicts, resolutions);
            this.deriveLinkedTxtResolutions(linkedTxtConflicts, conflicts, resolutions);
            await this.deriveYjsResolutions(yjsConflicts, resolutions);
            return resolutions;
        }

        return new Promise((resolve) => {
            const request: ConflictResolutionRequest = {
                conflicts: realConflicts,
                resolve: async (userResolutions) => {
                    if (userResolutions === null) {
                        resolve(null);
                        return;
                    }

                    for (const [path, resolution] of userResolutions.entries()) {
                        resolutions.set(path, resolution);
                    }

                    this.deriveMetadataResolutions(metadataConflicts, resolutions);
                    this.deriveLinkedTxtResolutions(linkedTxtConflicts, conflicts, resolutions);
                    await this.deriveYjsResolutions(yjsConflicts, resolutions);

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

    private extractLinkedDocumentIds(metadataConflicts: FileConflict[]): Set<string> {
        const documentIds = new Set<string>();

        for (const conflict of metadataConflicts) {
            if (!conflict.path.includes('/files/')) continue;

            try {
                const local = JSON.parse(typeof conflict.localContent === 'string'
                    ? conflict.localContent
                    : new TextDecoder().decode(conflict.localContent));
                const arr: any[] = Array.isArray(local) ? local : [local];
                for (const entry of arr) {
                    if (entry.documentId) documentIds.add(entry.documentId);
                }
            } catch {
                // unparseable metadata, skip
            }
        }

        return documentIds;
    }

    private deriveLinkedTxtResolutions(
        linkedTxtConflicts: FileConflict[],
        allConflicts: FileConflict[],
        resolutions: Map<string, ConflictResolution>,
    ): void {
        for (const txtConflict of linkedTxtConflicts) {
            const docId = this.basenameWithoutExt(txtConflict.path);
            const linkedFileConflict = allConflicts.find(
                (c) => !c.path.endsWith('metadata.json') &&
                    !c.path.endsWith('.yjs') &&
                    !c.path.endsWith('.txt') &&
                    resolutions.has(c.path) &&
                    this.conflictContentMatches(c, txtConflict),
            );

            if (!linkedFileConflict) {
                resolutions.set(txtConflict.path, { action: 'keep-local' });
                continue;
            }

            const fileResolution = resolutions.get(linkedFileConflict.path)!;

            if (fileResolution.action === 'keep-local') {
                resolutions.set(txtConflict.path, { action: 'keep-local' });
            } else if (fileResolution.action === 'keep-remote') {
                resolutions.set(txtConflict.path, { action: 'keep-remote' });
            } else if (fileResolution.action === 'merged') {
                resolutions.set(txtConflict.path, {
                    action: 'merged',
                    content: fileResolution.content,
                });
            }

            this.updateFilesMetadataForLinkedDoc(docId, fileResolution, resolutions);
        }
    }

    private updateFilesMetadataForLinkedDoc(
        docId: string,
        fileResolution: ConflictResolution,
        resolutions: Map<string, ConflictResolution>,
    ): void {
        for (const [path, resolution] of resolutions.entries()) {
            if (!path.endsWith('metadata.json') || !path.includes('/files/')) continue;
            if (resolution.action !== 'merged') continue;

            try {
                const arr = JSON.parse(typeof (resolution as any).content === 'string'
                    ? (resolution as any).content
                    : new TextDecoder().decode((resolution as any).content));

                const updated = arr.map((entry: any) => {
                    if (entry.documentId !== docId) return entry;
                    if (fileResolution.action === 'keep-remote') return entry;
                    return fileResolution.action === 'merged'
                        ? { ...entry, lastModified: Date.now() }
                        : entry;
                });

                resolutions.set(path, {
                    action: 'merged',
                    content: JSON.stringify(updated, null, 2),
                });
            } catch {
                // leave as-is
            }
        }
    }

    private conflictContentMatches(a: FileConflict, b: FileConflict): boolean {
        const aLocal = typeof a.localContent === 'string'
            ? a.localContent
            : new TextDecoder().decode(a.localContent);
        const bLocal = typeof b.localContent === 'string'
            ? b.localContent
            : new TextDecoder().decode(b.localContent);
        return aLocal === bLocal;
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

    private async deriveYjsResolutions(
        yjsConflicts: FileConflict[],
        resolutions: Map<string, ConflictResolution>,
    ): Promise<void> {
        for (const conflict of yjsConflicts) {
            const txtPath = conflict.path.replace(/\.yjs$/, '.txt');
            const txtResolution = resolutions.get(txtPath);

            if (!txtResolution) {
                resolutions.set(conflict.path, { action: 'keep-remote' });
                continue;
            }

            if (txtResolution.action === 'keep-local') {
                resolutions.set(conflict.path, { action: 'keep-local' });
                continue;
            }

            if (txtResolution.action === 'keep-remote') {
                resolutions.set(conflict.path, { action: 'keep-remote' });
                continue;
            }

            if (txtResolution.action === 'merged') {
                const mergedText = typeof txtResolution.content === 'string'
                    ? txtResolution.content
                    : new TextDecoder().decode(txtResolution.content);

                resolutions.set(conflict.path, {
                    action: 'merged',
                    content: this.yjsStateFromText(mergedText),
                });
            }
        }
    }

    private yjsStateFromText(text: string): ArrayBuffer {
        const doc = new Y.Doc();
        doc.getText('codemirror').insert(0, text);
        const state = Y.encodeStateAsUpdate(doc);
        doc.destroy();
        return toArrayBuffer(state);
    }

    private basenameWithoutExt(path: string): string {
        const base = path.split('/').pop() ?? '';
        const dot = base.lastIndexOf('.');
        return dot === -1 ? base : base.slice(0, dot);
    }
}

export const conflictResolutionService = new ConflictResolutionService();
