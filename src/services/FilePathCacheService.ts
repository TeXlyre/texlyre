// src/services/FilePathCacheService.ts
import type { FileNode, FilePathCache } from "../types/files";
import { fileStorageEventEmitter } from "./FileStorageService";

type CacheUpdateCallback = (files: FileNode[]) => void;
type FilePathUpdateCallback = (filePath: string) => void;

class FilePathCacheService {
	private cachedFiles: FileNode[] = [];
	private lastCacheUpdate = 0;
	private cacheTimeout = 5000;
	private cacheUpdateTimeout: NodeJS.Timeout | null = null;
	private cacheUpdateCallbacks = new Set<CacheUpdateCallback>();
	private filePathUpdateCallbacks = new Set<FilePathUpdateCallback>();

	initialize() {
		fileStorageEventEmitter.onChange(() => {
			this.invalidateCache();
		});

		document.addEventListener('refresh-file-tree', () => {
			this.invalidateCache();
		});
	}

	onCacheUpdate(callback: CacheUpdateCallback) {
		this.cacheUpdateCallbacks.add(callback);
		if (this.cachedFiles.length > 0) {
			callback(this.cachedFiles);
		}
	}

	offCacheUpdate(callback: CacheUpdateCallback) {
		this.cacheUpdateCallbacks.delete(callback);
	}

	onFilePathUpdate(callback: FilePathUpdateCallback) {
		this.filePathUpdateCallbacks.add(callback);
	}

	offFilePathUpdate(callback: FilePathUpdateCallback) {
		this.filePathUpdateCallbacks.delete(callback);
	}

	updateCurrentFilePath(filePath: string) {
		this.filePathUpdateCallbacks.forEach(callback => {
			callback(filePath);
		});
	}

	buildCacheFromFiles(files: FileNode[]): FilePathCache {
		return {
			files,
			imageFiles: files
				.filter(f => f.type === "file" && this.isImageFile(f.name))
				.map(f => f.path),
			bibFiles: files
				.filter(f => f.type === "file" && f.name.endsWith('.bib'))
				.map(f => f.path),
			texFiles: files
				.filter(f => f.type === "file" && (f.name.endsWith('.tex') || f.name.endsWith('.sty') || f.name.endsWith('.cls')))
				.map(f => f.path),
			allFiles: files
				.filter(f => f.type === "file")
				.map(f => f.path),
			lastUpdate: Date.now(),
		};
	}

	getRelativePath(fromPath: string, toPath: string): string {
		if (!fromPath || fromPath === '/') {
			return toPath.startsWith('/') ? toPath.slice(1) : toPath;
		}

		const fromDir = fromPath.substring(0, fromPath.lastIndexOf('/')) || '/';
		const toDir = toPath.substring(0, toPath.lastIndexOf('/')) || '/';
		const toFileName = toPath.substring(toPath.lastIndexOf('/') + 1);

		if (fromDir === toDir) {
			return toFileName;
		}

		if (toPath.startsWith(fromDir + '/')) {
			return toPath.substring(fromDir.length + 1);
		}

		if (fromDir !== '/' && toDir === '/') {
			return toFileName;
		}

		return toPath.startsWith('/') ? toPath.slice(1) : toPath;
	}

	private isImageFile(filename: string): boolean {
		const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.pdf', '.eps', '.ps'];
		return imageExtensions.some(ext => filename.toLowerCase().endsWith(ext));
	}

	private invalidateCache() {
		clearTimeout(this.cacheUpdateTimeout);
		this.cacheUpdateTimeout = setTimeout(() => {
			this.updateCache();
		}, 500);
	}

	private notifyCacheUpdate() {
		this.cacheUpdateCallbacks.forEach(callback => {
			callback(this.cachedFiles);
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
		this.notifyCacheUpdate();
	}

	async getCachedFiles(): Promise<FileNode[]> {
		const now = Date.now();
		if (now - this.lastCacheUpdate > this.cacheTimeout || this.cachedFiles.length === 0) {
			await this.updateCache();
		}
		return this.cachedFiles;
	}

	cleanup() {
		this.cachedFiles = [];
		this.cacheUpdateCallbacks.clear();
		this.filePathUpdateCallbacks.clear();
		if (this.cacheUpdateTimeout) {
			clearTimeout(this.cacheUpdateTimeout);
			this.cacheUpdateTimeout = null;
		}
	}
}

export const filePathCacheService = new FilePathCacheService();