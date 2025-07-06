// src/services/FileConflictService.ts
import type { FileNode } from "../types/files";

export type ConflictResolution = "overwrite" | "keep-both" | "cancel";
export type BatchConflictResolution =
	| "overwrite"
	| "keep-both"
	| "cancel"
	| "overwrite-all"
	| "keep-both-all"
	| "cancel-all";
export type DeleteConfirmation = "confirm" | "cancel";
export type LinkConfirmation =
	| "link-with-copy"
	| "link-without-copy"
	| "cancel";
export type UnlinkConfirmation = "confirm" | "cancel";
export type LinkedFileConfirmation = "show-unlink-dialog" | "cancel";
export type BatchDeleteConfirmation = "confirm" | "cancel";
export type BatchUnlinkConfirmation = "confirm" | "cancel";

interface FileConflictEvent {
	type:
		| "conflict"
		| "delete"
		| "link"
		| "unlink"
		| "linked-file-action"
		| "batch-conflict"
		| "batch-delete"
		| "batch-unlink";
	existingFile?: FileNode;
	newFile?: FileNode;
	files?: FileNode[];
	action?: "rename" | "delete" | "overwrite";
	conflictCount?: number;
	currentIndex?: number;
	resolve: (
		resolution:
			| ConflictResolution
			| DeleteConfirmation
			| LinkConfirmation
			| UnlinkConfirmation
			| LinkedFileConfirmation
			| BatchConflictResolution
			| BatchDeleteConfirmation
			| BatchUnlinkConfirmation,
	) => void;
	reject: () => void;
}

class FileConflictService {
	private listeners: Array<(event: FileConflictEvent) => void> = [];

	async resolveConflict(
		existingFile: FileNode,
		newFile: FileNode,
	): Promise<ConflictResolution> {
		return new Promise((resolve, reject) => {
			const event: FileConflictEvent = {
				type: "conflict",
				existingFile,
				newFile,
				resolve: (resolution) => resolve(resolution as ConflictResolution),
				reject,
			};
			this.notifyListeners(event);
		});
	}

	async confirmDelete(file: FileNode): Promise<DeleteConfirmation> {
		return new Promise((resolve, reject) => {
			const event: FileConflictEvent = {
				type: "delete",
				existingFile: file,
				resolve: (resolution) => resolve(resolution as DeleteConfirmation),
				reject,
			};
			this.notifyListeners(event);
		});
	}

	async confirmLink(file: FileNode): Promise<LinkConfirmation> {
		return new Promise((resolve, reject) => {
			const event: FileConflictEvent = {
				type: "link",
				existingFile: file,
				resolve: (resolution) => resolve(resolution as LinkConfirmation),
				reject,
			};
			this.notifyListeners(event);
		});
	}

	async confirmUnlink(file: FileNode): Promise<UnlinkConfirmation> {
		return new Promise((resolve, reject) => {
			const event: FileConflictEvent = {
				type: "unlink",
				existingFile: file,
				resolve: (resolution) => resolve(resolution as UnlinkConfirmation),
				reject,
			};
			this.notifyListeners(event);
		});
	}

	async confirmLinkedFileAction(
		file: FileNode,
		action: "rename" | "delete" | "overwrite",
	): Promise<LinkedFileConfirmation> {
		return new Promise((resolve, reject) => {
			const event: FileConflictEvent = {
				type: "linked-file-action",
				existingFile: file,
				action,
				resolve: (resolution) => resolve(resolution as LinkedFileConfirmation),
				reject,
			};
			this.notifyListeners(event);
		});
	}

	async resolveBatchConflict(
		existingFile: FileNode,
		newFile: FileNode,
		conflictCount: number,
		currentIndex: number,
	): Promise<BatchConflictResolution> {
		return new Promise((resolve, reject) => {
			const event: FileConflictEvent = {
				type: "batch-conflict",
				existingFile,
				newFile,
				conflictCount,
				currentIndex,
				resolve: (resolution) => resolve(resolution as BatchConflictResolution),
				reject,
			};
			this.notifyListeners(event);
		});
	}

	async confirmBatchDelete(
		files: FileNode[],
	): Promise<BatchDeleteConfirmation> {
		return new Promise((resolve, reject) => {
			const event: FileConflictEvent = {
				type: "batch-delete",
				files,
				resolve: (resolution) => resolve(resolution as BatchDeleteConfirmation),
				reject,
			};
			this.notifyListeners(event);
		});
	}

	async confirmBatchUnlink(
		files: FileNode[],
	): Promise<BatchUnlinkConfirmation> {
		return new Promise((resolve, reject) => {
			const event: FileConflictEvent = {
				type: "batch-unlink",
				files,
				resolve: (resolution) => resolve(resolution as BatchUnlinkConfirmation),
				reject,
			};
			this.notifyListeners(event);
		});
	}

	addListener(callback: (event: FileConflictEvent) => void): () => void {
		this.listeners.push(callback);
		return () => {
			this.listeners = this.listeners.filter((l) => l !== callback);
		};
	}

	private notifyListeners(event: FileConflictEvent): void {
		this.listeners.forEach((listener) => listener(event));
	}
}

export const fileConflictService = new FileConflictService();
