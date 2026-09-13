// src/services/MergeResolutionService.ts
import { mergeAnnotatedSources } from '../utils/annotationMergeUtils';
import { stripAnnotations, hasAnnotations } from '../utils/fileCommentUtils';
import { threeWayMerge } from '../utils/textDiffUtils';
import { yjsStateFromText } from '../utils/yjsUtils';

const FILES_METADATA = '.texlyre_metadata.json';

export interface FileConflict {
	path: string;
	isBinary: boolean;
	baseContent?: string;
	localContent: string | ArrayBuffer;
	remoteContent: string | ArrayBuffer;
	localViewContent?: string;
	remoteViewContent?: string;
	previousRef?: string;
	localAnnotationSpans?: Array<{ from: number; to: number }>;
	annotationSpans?: Array<{ from: number; to: number }>;
	changeType?: 'added' | 'modified' | 'deleted';
}

export type ConflictResolution =
	| { action: 'keep-local' }
	| { action: 'keep-remote' }
	| { action: 'merged'; content: string | ArrayBuffer };

export interface ConflictResolutionRequest {
	conflicts: FileConflict[];
	mode?: 'resolve' | 'compare' | 'edit';
	title?: string;
	labels?: {
		keepLocal?: string;
		keepRemote?: string;
		local?: string;
		remote?: string;
	};
	save?: (path: string, content: string) => Promise<void>;
	resolve: (resolutions: Map<string, ConflictResolution> | null) => void;
}

type AutoMergeResult =
	| { resolved: true; content: string; unchanged?: boolean }
	| { resolved: false };

class MergeResolutionService {
	private listeners: Array<(request: ConflictResolutionRequest) => void> = [];

	private emit(request: ConflictResolutionRequest): void {
		this.listeners.forEach((listener) => {
			listener(request);
		});
	}

	tryAutoMerge(
		base: string | undefined,
		local: string,
		remote: string,
		isBinary: boolean,
	): AutoMergeResult {
		if (isBinary) {
			if (local === remote) {
				return { resolved: true, content: local, unchanged: base === local };
			}
			if (base !== undefined && base === local) {
				return { resolved: true, content: remote };
			}
			if (base !== undefined && base === remote) {
				return { resolved: true, content: local };
			}
			return { resolved: false };
		}

		if (base === undefined) {
			if (local === remote) return { resolved: true, content: local };
			const cleanLocal = stripAnnotations(local) as string;
			const cleanRemote = stripAnnotations(remote) as string;
			if (cleanLocal !== cleanRemote) return { resolved: false };
			return {
				resolved: true,
				content: mergeAnnotatedSources([local, remote], cleanLocal).content,
			};
		}

		const cleanBase = stripAnnotations(base) as string;
		const cleanLocal = stripAnnotations(local) as string;
		const cleanRemote = stripAnnotations(remote) as string;
		let mergedText: string;
		if (cleanLocal === cleanRemote) mergedText = cleanLocal;
		else if (cleanBase === cleanLocal) mergedText = cleanRemote;
		else if (cleanBase === cleanRemote) mergedText = cleanLocal;
		else {
			const merged = threeWayMerge(cleanBase, cleanLocal, cleanRemote);
			if (merged.hasConflicts) return { resolved: false };
			mergedText = merged.merged;
		}

		const content = mergeAnnotatedSources([local, remote], mergedText).content;
		return {
			resolved: true,
			content,
			unchanged: cleanBase === mergedText && base === content,
		};
	}

	async compareFiles(
		conflicts: FileConflict[],
		labels?: { local?: string; remote?: string },
		title?: string,
	): Promise<void> {
		if (conflicts.length === 0) return;

		return new Promise((resolve) => {
			this.emit({
				conflicts,
				mode: 'compare',
				title,
				labels,
				resolve: () => resolve(),
			});
		});
	}

	async editFiles(
		conflicts: FileConflict[],
		labels: { local?: string; remote?: string } | undefined,
		title: string | undefined,
		save: (path: string, content: string) => Promise<void>,
	): Promise<void> {
		if (conflicts.length === 0) return;

		return new Promise((resolve) => {
			this.emit({
				conflicts,
				mode: 'edit',
				title,
				labels,
				save: async (path, content) => {
					const conflict = conflicts.find((item) => item.path === path);
					if (!conflict) throw new Error(`Unknown comparison file: ${path}`);
					await save(
						path,
						this.restoreAnnotationsForContent(conflict, content),
					);
				},
				resolve: () => resolve(),
			});
		});
	}

	restoreEditedContent(conflict: FileConflict, content: string): string {
		return this.restoreAnnotationsForContent(conflict, content);
	}

	async resolveConflicts(
		conflicts: FileConflict[],
		labels?: { keepLocal?: string; keepRemote?: string },
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
				labels,
				resolve: async (resolutions) => {
					if (resolutions === null) {
						resolve(null);
						return;
					}
					this.restoreMergedAnnotations(realConflicts, resolutions);
					await derive(resolutions);
					resolve(resolutions);
				},
			};
			this.emit(request);
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

	private restoreAnnotationsForContent(
		conflict: FileConflict,
		content: string,
	): string {
		if (
			conflict.isBinary ||
			(!conflict.localAnnotationSpans?.length &&
				!conflict.annotationSpans?.length)
		) {
			return content;
		}

		const sources = [
			this.toText(conflict.localContent),
			this.toText(conflict.remoteContent),
		];
		if (hasAnnotations(content)) sources.unshift(content);

		return mergeAnnotatedSources(sources, content).content;
	}

	private restoreMergedAnnotations(
		conflicts: FileConflict[],
		resolutions: Map<string, ConflictResolution>,
	): void {
		for (const conflict of conflicts) {
			if (
				conflict.isBinary ||
				(!conflict.localAnnotationSpans?.length &&
					!conflict.annotationSpans?.length)
			) {
				continue;
			}

			const resolution = resolutions.get(conflict.path);
			if (resolution?.action !== 'merged') continue;

			resolutions.set(conflict.path, {
				action: 'merged',
				content: this.restoreAnnotationsForContent(
					conflict,
					this.toText(resolution.content),
				),
			});
		}
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
					content: yjsStateFromText(mergedText),
				});
			}
		}
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

export const mergeResolutionService = new MergeResolutionService();
