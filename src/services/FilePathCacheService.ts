// src/services/FilePathCacheService.ts
import type { EditorView } from "codemirror";

import type { FileNode } from "../types/files";
import { fileStorageEventEmitter } from "./FileStorageService";
import { updateFilePathCache, setCurrentFilePath } from "../extensions/codemirror/FilePathAutocompleteExtension";

class FilePathCacheService {
	private cachedFiles: FileNode[] = [];
	private lastCacheUpdate = 0;
	private cacheTimeout = 5000;
	private editorViews = new Set<EditorView>();

	initialize() {
		// Listen for file storage changes
		fileStorageEventEmitter.onChange(() => {
			this.invalidateCache();
		});

		// Listen for file tree refresh events
		document.addEventListener('refresh-file-tree', () => {
			this.invalidateCache();
		});
	}

	registerEditorView(view: EditorView) {
		this.editorViews.add(view);

		if (this.cachedFiles.length > 0) {
			updateFilePathCache(view, this.cachedFiles);
		}
	}

	unregisterEditorView(view: EditorView) {
		this.editorViews.delete(view);
	}

	updateCurrentFilePath(filePath: string) {
		this.editorViews.forEach(view => {
			setCurrentFilePath(view, filePath);
		});
	}

	async updateCache(files?: FileNode[]) {
		if (files) {
			this.cachedFiles = files;
		} else {
			const { fileStorageService } = await import('./FileStorageService');
			try {
				this.cachedFiles = await fileStorageService.getAllFiles(false);
			} catch (error) {
				console.error('Error fetching files for path cache:', error);
				this.cachedFiles = [];
			}
		}

		this.lastCacheUpdate = Date.now();

		// Update all registered editor views
		this.editorViews.forEach(view => {
			updateFilePathCache(view, this.cachedFiles);
		});
	}

	private invalidateCache() {
		clearTimeout(this.cacheUpdateTimeout);
		this.cacheUpdateTimeout = setTimeout(() => {
			this.updateCache();
		}, 500);
	}

	private cacheUpdateTimeout: NodeJS.Timeout | null = null;

	async getCachedFiles(): Promise<FileNode[]> {
		const now = Date.now();
		if (now - this.lastCacheUpdate > this.cacheTimeout || this.cachedFiles.length === 0) {
			await this.updateCache();
		}
		return this.cachedFiles;
	}

	cleanup() {
		this.editorViews.clear();
		this.cachedFiles = [];
		if (this.cacheUpdateTimeout) {
			clearTimeout(this.cacheUpdateTimeout);
			this.cacheUpdateTimeout = null;
		}
	}
}

export const filePathCacheService = new FilePathCacheService();