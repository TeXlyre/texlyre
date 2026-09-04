// src/services/FileHandlerService.ts
import { t } from '@/i18n';
import { createNamedLogger } from '@/logging';
import type { FileNode } from '../types/files';
import { mergeAnnotatedContent } from '../utils/annotationMerge';
import { stripAnnotationTagsWithSpans } from '../utils/annotationTagUtils';
import { stripAnnotations, hasAnnotations } from '../utils/fileCommentUtils';
import { isBinaryFile, isTemporaryFile } from '../utils/fileUtils';
import { mergeResolutionService } from './MergeResolutionService';
import { ensurePermission } from './DiskHandleStore';
import type { DirectoryTarget } from './WriteTargetService';

const moduleLog = createNamedLogger('FileHandlerService');

export interface LaunchedFile {
	name: string;
	type: string;
	buffer: ArrayBuffer;
	handle: FileSystemFileHandle;
}

export type DiskPullResult =
	| 'applied'
	| 'merged'
	| 'unchanged'
	| 'conflict'
	| 'unavailable';

export interface DiskSyncSummary {
	applied: string[];
	merged: string[];
	conflicted: string[];
	droppedAnnotations: number;
	appliedPaths?: string[];
	mergedPaths?: string[];
	conflictedPaths?: string[];
	annotationDrops?: Array<{ path: string; count: number }>;
}

interface PullOptions {
	knownModified?: number;
	promptOnAnnotationLoss?: boolean;
	onAnnotationsDropped?: (count: number) => void;
}

interface DiskTarget {
	stat(): Promise<number | null>;
	read(isBinary: boolean): Promise<string | ArrayBuffer>;
	write(content: string | ArrayBuffer): Promise<void>;
	remove?(): Promise<void>;
}

type LaunchListener = (files: LaunchedFile[]) => void;

interface SyncBaseline {
	disk: number;
	local: number;
}

const decodeText = (content?: string | ArrayBuffer): string | null => {
	if (typeof content === 'string') return content;
	if (content && typeof content === 'object' && 'byteLength' in content) {
		return new TextDecoder().decode(content as ArrayBuffer);
	}
	return null;
};

const handleTarget = (handle: FileSystemFileHandle): DiskTarget => ({
	async stat() {
		if (!(await ensurePermission(handle, 'read', false))) return null;
		return (await handle.getFile()).lastModified;
	},
	async read(isBinary) {
		const file = await handle.getFile();
		return isBinary ? file.arrayBuffer() : file.text();
	},
	async write(content) {
		if (!(await ensurePermission(handle, 'readwrite', false))) {
			throw new Error('Write permission was not granted');
		}
		const writable = await handle.createWritable();
		await writable.write(content);
		await writable.close();
	},
});

const workspaceTarget = (
	adapter: DirectoryTarget,
	path: string,
): DiskTarget => ({
	async stat() {
		return (await adapter.stat(path))?.lastModified ?? null;
	},
	read() {
		return adapter.readFile(path);
	},
	write(content) {
		return adapter.writeFile(path, content);
	},
	remove() {
		return adapter.deleteEntry(path);
	},
});

class FileHandlerService {
	private listeners: LaunchListener[] = [];
	private pending: LaunchedFile[] = [];
	private baselines = new Map<string, SyncBaseline>();
	private suppressed = new Set<string>();
	private linkedIds = new Set<string>();
	private launchLinkedIds = new Set<string>();
	private workspace: DirectoryTarget | null = null;
	private isMirroringSuppressed = false;
	private isInitialized = false;

	isSupported(): boolean {
		return typeof window !== 'undefined' && 'launchQueue' in window;
	}

	attachWorkspace(adapter: DirectoryTarget): void {
		this.workspace = adapter;
	}

	detachWorkspace(): void {
		this.workspace = null;
		this.baselines.clear();
		this.linkedIds.clear();
		this.launchLinkedIds.clear();
	}

	hasWorkspace(): boolean {
		return this.workspace !== null;
	}

	registerLink(fileId: string): void {
		this.linkedIds.add(fileId);
	}

	registerLaunchLink(fileId: string): void {
		this.linkedIds.add(fileId);
		this.launchLinkedIds.add(fileId);
	}

	setLaunchLinks(fileIds: string[]): void {
		this.launchLinkedIds = new Set(fileIds);
	}

	getLaunchLinkedIds(): string[] {
		return [...this.launchLinkedIds];
	}

	unregisterLink(fileId: string): void {
		this.linkedIds.delete(fileId);
		this.launchLinkedIds.delete(fileId);
		this.baselines.delete(fileId);
	}

	resetLinks(fileIds: string[]): void {
		this.linkedIds = new Set(fileIds);
	}

	getLinkedIds(): string[] {
		return [...this.linkedIds];
	}

	isLinked(file: FileNode): boolean {
		return this.resolveTarget(file) !== null;
	}

	initialize(): void {
		if (this.isInitialized || !this.isSupported()) return;
		this.isInitialized = true;

		window.launchQueue?.setConsumer((params) => {
			void this.consume(params);
		});
	}

	addLaunchListener(listener: LaunchListener): () => void {
		this.listeners.push(listener);

		if (this.pending.length > 0) {
			const buffered = this.pending;
			this.pending = [];
			listener(buffered);
		}

		return () => {
			this.listeners = this.listeners.filter((l) => l !== listener);
		};
	}

	async ensureWritable(handle: FileSystemFileHandle): Promise<boolean> {
		return ensurePermission(handle, 'readwrite');
	}

	async mergeWithView(
		file: FileNode,
		incoming: string,
	): Promise<string | null> {
		const local = decodeText(file.content) ?? '';
		const stripped = stripAnnotationTagsWithSpans(local);

		const resolutions = await mergeResolutionService.resolveConflicts(
			[
				{
					path: file.path,
					isBinary: isBinaryFile(file.path),
					baseContent: undefined,
					localContent: incoming,
					remoteContent: local,
					remoteViewContent: stripped.content,
					annotationSpans: stripped.spans,
				},
			],
			{ keepLocal: t('Keep Folder'), keepRemote: t('Keep TeXlyre') },
		);

		const resolution = resolutions?.get(file.path);
		if (!resolution || resolution.action === 'keep-remote') return null;

		return resolution.action === 'merged' &&
			typeof resolution.content === 'string'
			? resolution.content
			: incoming;
	}

	async writeBack(
		file: FileNode,
		content: string | ArrayBuffer,
	): Promise<boolean> {
		const target = this.resolveTarget(file);
		if (!target || this.suppressed.has(file.id)) return false;
		if (this.isMirroringSuppressed) return false;

		try {
			await target.write(stripAnnotations(content));

			const lastModified = await target.stat();
			if (lastModified !== null) {
				this.baselines.set(file.id, {
					disk: lastModified,
					local: file.lastModified,
				});
			}
			this.linkedIds.add(file.id);
			return true;
		} catch (error) {
			moduleLog.error(`Failed to write ${file.path} back to disk:`, error);
			return false;
		}
	}

	async pullIfChanged(
		file: FileNode,
		apply: (content: string | ArrayBuffer) => Promise<void>,
		options: PullOptions = {},
	): Promise<DiskPullResult> {
		const target = this.resolveTarget(file);
		if (!target) return 'unavailable';

		try {
			const lastModified = options.knownModified ?? (await target.stat());
			if (lastModified === null) return 'unavailable';

			const baseline = this.baselines.get(file.id) ?? {
				disk: lastModified,
				local: file.lastModified,
			};

			if (lastModified <= baseline.disk) {
				this.baselines.set(file.id, baseline);
				return 'unchanged';
			}
			if (file.lastModified > baseline.local) return 'conflict';

			const isBinary = Boolean(file.isBinary);
			const incoming = await target.read(isBinary);
			let content = incoming;
			let merged = false;
			const localText = isBinary ? null : decodeText(file.content);

			if (
				typeof incoming === 'string' &&
				localText !== null &&
				hasAnnotations(localText)
			) {
				const result = mergeAnnotatedContent(localText, incoming);
				merged = true;

				if (result.dropped > 0 && options.promptOnAnnotationLoss) {
					const reviewed = await this.mergeWithView(file, incoming);
					if (reviewed === null) return 'conflict';
					content = reviewed;
				} else {
					content = result.content;
					if (result.dropped > 0) {
						options.onAnnotationsDropped?.(result.dropped);
					}
				}
			}

			this.suppressed.add(file.id);
			try {
				await apply(content);
			} finally {
				this.suppressed.delete(file.id);
			}

			this.baselines.set(file.id, { disk: lastModified, local: Date.now() });

			if (merged) {
				await this.writeBack({ ...file, lastModified: Date.now() }, content);
				return 'merged';
			}

			return 'applied';
		} catch (error) {
			moduleLog.error(`Failed to read ${file.path} from disk:`, error);
			return 'unavailable';
		}
	}

	async syncFromDisk(
		files: FileNode[],
		apply: (file: FileNode, content: string | ArrayBuffer) => Promise<void>,
		knownModified?: Map<string, number>,
	): Promise<DiskSyncSummary> {
		const summary: DiskSyncSummary = {
			applied: [],
			merged: [],
			conflicted: [],
			droppedAnnotations: 0,
			appliedPaths: [],
			mergedPaths: [],
			conflictedPaths: [],
			annotationDrops: [],
		};

		for (const file of files) {
			const result = await this.pullIfChanged(
				file,
				(content) => apply(file, content),
				{
					knownModified: knownModified?.get(file.path),
					promptOnAnnotationLoss: true,
					onAnnotationsDropped: (count) => {
						summary.droppedAnnotations += count;
						summary.annotationDrops?.push({ path: file.path, count });
					},
				},
			);

			if (result === 'applied') {
				summary.applied.push(file.name);
				summary.appliedPaths?.push(file.path);
			} else if (result === 'merged') {
				summary.merged.push(file.name);
				summary.mergedPaths?.push(file.path);
			} else if (result === 'conflict') {
				summary.conflicted.push(file.name);
				summary.conflictedPaths?.push(file.path);
			} else if (result === 'unavailable' && !this.workspace) {
				this.unregisterLink(file.id);
			}
		}

		return summary;
	}

	async mirrorFiles(files: FileNode[]): Promise<void> {
		if (this.isMirroringSuppressed) return;

		for (const file of files) {
			if (file.type === 'directory') {
				await this.ensureDirectory(file);
				continue;
			}
			if (!this.shouldMirror(file)) continue;
			await this.writeBack(file, file.content as string | ArrayBuffer);
		}
	}

	private async ensureDirectory(file: FileNode): Promise<void> {
		if (!this.workspace || file.isDeleted || isTemporaryFile(file.path)) return;

		try {
			await this.workspace.createDirectory(file.path);
		} catch (error) {
			moduleLog.error(`Failed to create ${file.path} on disk:`, error);
		}
	}

	async removeFromDisk(files: FileNode[]): Promise<void> {
		if (this.isMirroringSuppressed) return;

		for (const file of files) {
			const target = this.resolveTarget(file);
			if (!target?.remove) continue;

			try {
				await target.remove();
				this.unregisterLink(file.id);
			} catch (error) {
				moduleLog.error(`Failed to remove ${file.path} from disk:`, error);
			}
		}
	}

	async withoutMirroring<T>(action: () => Promise<T>): Promise<T> {
		this.isMirroringSuppressed = true;
		try {
			return await action();
		} finally {
			this.isMirroringSuppressed = false;
		}
	}

	shouldMirror(file: FileNode): boolean {
		if (file.type !== 'file' || file.content === undefined) return false;
		if (file.isDeleted) return false;
		if (this.workspace) return !isTemporaryFile(file.path);
		return Boolean(file.launchHandle);
	}

	private resolveTarget(file: FileNode): DiskTarget | null {
		if (file.launchHandle) return handleTarget(file.launchHandle);
		if (this.workspace && !isTemporaryFile(file.path)) {
			return workspaceTarget(this.workspace, file.path);
		}
		return null;
	}

	private async consume(params: LaunchParams): Promise<void> {
		const launched: LaunchedFile[] = [];

		for (const handle of params.files ?? []) {
			try {
				const file = await handle.getFile();
				launched.push({
					name: file.name,
					type: file.type,
					buffer: await file.arrayBuffer(),
					handle,
				});
			} catch (error) {
				moduleLog.error(`Failed to read launched file ${handle.name}:`, error);
			}
		}

		if (launched.length === 0) return;

		if (this.listeners.length === 0) {
			this.pending = launched;
			return;
		}

		for (const listener of this.listeners) {
			listener(launched);
		}
	}
}

export const fileHandlerService = new FileHandlerService();
