// src/services/ConflictResolutionService.ts
import * as Y from 'yjs';
import { toArrayBuffer } from '../utils/fileUtils';
import { threeWayMerge } from '../utils/textDiffUtils';

const FILES_METADATA = '.texlyre_metadata.json';

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
		const metadataConflicts = conflicts.filter((c) =>
			c.path.endsWith(FILES_METADATA),
		);
		const yjsConflicts = conflicts.filter((c) => c.path.endsWith('.yjs'));

		const docIdToPaths = this.extractDocumentIdToPaths(metadataConflicts);
		const pathToDocId = new Map<string, string>();
		for (const [docId, paths] of docIdToPaths) {
			for (const p of paths) pathToDocId.set(p, docId);
		}

		const linkedTxtConflicts = conflicts.filter(
			(c) =>
				c.path.endsWith('.txt') &&
				docIdToPaths.has(this.basenameWithoutExt(c.path)),
		);

		const realConflicts = conflicts.filter(
			(c) =>
				!c.path.endsWith(FILES_METADATA) &&
				!c.path.endsWith('/metadata.json') &&
				!c.path.endsWith('.yjs') &&
				!linkedTxtConflicts.includes(c),
		);

		const derive = async (resolutions: Map<string, ConflictResolution>) => {
			this.deriveMetadataResolutions(metadataConflicts, resolutions);
			this.deriveLinkedTxtResolutions(
				linkedTxtConflicts,
				pathToDocId,
				resolutions,
			);
			await this.deriveYjsResolutions(yjsConflicts, resolutions);
		};

		if (realConflicts.length === 0) {
			const resolutions = new Map<string, ConflictResolution>();
			await derive(resolutions);
			return resolutions;
		}

		return new Promise((resolve) => {
			const request: ConflictResolutionRequest = {
				conflicts: realConflicts,
				resolve: async (resolutions) => {
					if (resolutions === null) {
						resolve(null);
						return;
					}
					await derive(resolutions);
					resolve(resolutions);
				},
			};
			this.listeners.forEach((listener) => listener(request));
		});
	}

	addListener(
		callback: (request: ConflictResolutionRequest) => void,
	): () => void {
		this.listeners.push(callback);
		return () => {
			this.listeners = this.listeners.filter((l) => l !== callback);
		};
	}

	private extractDocumentIdToPaths(
		metadataConflicts: FileConflict[],
	): Map<string, Set<string>> {
		const docIdToPaths = new Map<string, Set<string>>();

		for (const conflict of metadataConflicts) {
			if (!conflict.path.includes('/files/')) continue;
			const projectPrefix = conflict.path.replace(
				`/files/${FILES_METADATA}`,
				'/files',
			);

			const collect = (source: string | ArrayBuffer) => {
				try {
					const parsed = JSON.parse(this.toText(source));
					const arr: any[] = Array.isArray(parsed) ? parsed : [parsed];
					for (const entry of arr) {
						if (!entry.documentId || !entry.path) continue;
						const fullPath = `${projectPrefix}${entry.path}`;
						if (!docIdToPaths.has(entry.documentId)) {
							docIdToPaths.set(entry.documentId, new Set());
						}
						docIdToPaths.get(entry.documentId)!.add(fullPath);
					}
				} catch {
					// unparseable metadata, skip
				}
			};

			collect(conflict.localContent);
			collect(conflict.remoteContent);
		}

		return docIdToPaths;
	}

	private deriveLinkedTxtResolutions(
		linkedTxtConflicts: FileConflict[],
		pathToDocId: Map<string, string>,
		resolutions: Map<string, ConflictResolution>,
	): void {
		const docIdToResolvedPath = new Map<string, string>();
		for (const [path, docId] of pathToDocId) {
			if (resolutions.has(path)) docIdToResolvedPath.set(docId, path);
		}

		for (const txtConflict of linkedTxtConflicts) {
			const docId = this.basenameWithoutExt(txtConflict.path);
			const linkedFilePath = docIdToResolvedPath.get(docId);
			const fileResolution = linkedFilePath
				? resolutions.get(linkedFilePath)
				: undefined;

			if (!fileResolution) {
				resolutions.set(txtConflict.path, { action: 'keep-local' });
				continue;
			}

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
			if (!path.endsWith(FILES_METADATA) || !path.includes('/files/')) continue;
			if (resolution.action !== 'merged') continue;

			try {
				const arr = JSON.parse(this.toText((resolution as any).content));
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

	private deriveMetadataResolutions(
		metadataConflicts: FileConflict[],
		resolutions: Map<string, ConflictResolution>,
	): void {
		for (const conflict of metadataConflicts) {
			const pathPrefix = conflict.path.replace(`/${FILES_METADATA}`, '/');
			const relevantResolutions = [...resolutions.entries()].filter(([p]) =>
				p.startsWith(pathPrefix),
			);

			if (relevantResolutions.length === 0) {
				resolutions.set(conflict.path, { action: 'keep-local' });
				continue;
			}

			const allRemote = relevantResolutions.every(
				([, r]) => r.action === 'keep-remote',
			);
			if (allRemote) {
				resolutions.set(conflict.path, { action: 'keep-remote' });
				continue;
			}

			try {
				const localArr = this.parseMetadataArray(conflict.localContent);
				const remoteArr = this.parseMetadataArray(conflict.remoteContent);
				const remoteById = new Map(remoteArr.map((e) => [e.id ?? e.path, e]));

				const merged = localArr.map((localEntry) => {
					const key = localEntry.id ?? localEntry.path;
					const resolution = relevantResolutions.find(
						([p]) => p.endsWith(`/${localEntry.name}`) || p.includes(key),
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

			if (!txtResolution || txtResolution.action === 'keep-local') {
				resolutions.set(conflict.path, { action: 'keep-local' });
				continue;
			}
			if (txtResolution.action === 'keep-remote') {
				resolutions.set(conflict.path, { action: 'keep-remote' });
				continue;
			}
			if (txtResolution.action === 'merged') {
				const mergedText = this.toText(txtResolution.content);
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

	private parseMetadataArray(source: string | ArrayBuffer): any[] {
		const parsed = JSON.parse(this.toText(source));
		return Array.isArray(parsed) ? parsed : [parsed];
	}

	private toText(content: string | ArrayBuffer): string {
		return typeof content === 'string'
			? content
			: new TextDecoder().decode(content);
	}

	private basenameWithoutExt(path: string): string {
		const base = path.split('/').pop() ?? '';
		const dot = base.lastIndexOf('.');
		return dot === -1 ? base : base.slice(0, dot);
	}
}

export const conflictResolutionService = new ConflictResolutionService();
