// src/services/FilePathCacheService.ts
import type { FileNode, FilePathCache } from '../types/files';
import { fileStorageEventEmitter } from './FileStorageService';

type CacheUpdateCallback = (files: FileNode[]) => void;
type FilePathUpdateCallback = (filePath: string) => void;
type BibliographyFilesCallback = (files: FileNode[]) => void;

class FilePathCacheService {
	private cachedFiles: FileNode[] = [];
	private lastCacheUpdate = 0;
	private cacheTimeout = 5000;
	private cacheUpdateTimeout: NodeJS.Timeout | null = null;
	private cacheUpdateCallbacks = new Set<CacheUpdateCallback>();
	private filePathUpdateCallbacks = new Set<FilePathUpdateCallback>();
	private bibliographyFileCallbacks = new Set<BibliographyFilesCallback>();

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

	onBibliographyFilesUpdate(callback: BibliographyFilesCallback) {
		this.bibliographyFileCallbacks.add(callback);
		const bibFiles = this.getBibliographyFiles();
		if (bibFiles.length > 0) {
			callback(bibFiles);
		}
	}

	offBibliographyFilesUpdate(callback: BibliographyFilesCallback) {
		this.bibliographyFileCallbacks.delete(callback);
	}

	getBibliographyFiles(): FileNode[] {
		return this.cachedFiles.filter(file =>
			file.type === 'file' &&
			(file.name.endsWith('.bib') || file.name.endsWith('.bibtex')) &&
			!file.isDeleted
		);
	}

	async getLinkedFilePath(documentId: string): Promise<string> {
		const cachedFiles = await this.getCachedFiles();
		const linkedFile = cachedFiles.find(file => file.documentId === documentId);
		return linkedFile?.path || '';
	}

	updateCurrentFilePath(filePath: string, documentId?: string) {
		if (!filePath && documentId) {
			this.getLinkedFilePath(documentId).then(linkedPath => {
				if (linkedPath) {
					this.filePathUpdateCallbacks.forEach(callback => {
						callback(linkedPath);
					});
				}
			});
		} else {
			this.filePathUpdateCallbacks.forEach(callback => {
				callback(filePath);
			});
		}
	}

	buildCacheFromFiles(files: FileNode[]): FilePathCache {
		const imageExtensions = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg', 'webp', 'ico']);
		const bibExtensions = new Set(['bib', 'bibtex']);
		const texExtensions = new Set(['tex', 'latex']);
		const typstExtensions = new Set(['typ', 'typst']);

		const cache: FilePathCache = {
			files: [],
			imageFiles: [],
			bibFiles: [],
			texFiles: [],
			typstFiles: [],
			allFiles: [],
			lastUpdate: Date.now(),
		};

		const processNode = (node: FileNode) => {
			if (node.type === 'file') {
				const ext = node.name.split('.').pop()?.toLowerCase();

				cache.files.push(node);
				cache.allFiles.push(node.path);

				if (ext && imageExtensions.has(ext)) {
					cache.imageFiles.push(node.path);
				} else if (ext && bibExtensions.has(ext)) {
					cache.bibFiles.push(node.path);
				} else if (ext && texExtensions.has(ext)) {
					cache.texFiles.push(node.path);
				} else if (ext && typstExtensions.has(ext)) {
					cache.typstFiles.push(node.path);
				}
			}

			if (node.children) {
				node.children.forEach(processNode);
			}
		};

		files.forEach(processNode);
		return cache;
	}

	getLatexRelativePath(fromPath: string, toPath: string): string {
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

	getTypstRelativePath(fromPath: string, toPath: string): string {
		if (!fromPath || fromPath === '/') {
			return toPath.startsWith('/') ? toPath.slice(1) : toPath;
		}

		const fromDir = fromPath.substring(0, fromPath.lastIndexOf('/')) || '/';
		const toDir = toPath.substring(0, toPath.lastIndexOf('/')) || '/';
		const toFileName = toPath.substring(toPath.lastIndexOf('/') + 1);

		if (fromDir === toDir) {
			return toFileName;
		}

		return '/' + (toPath.startsWith('/') ? toPath.slice(1) : toPath);
	}

	private isImageFile(filename: string): boolean {
		const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.svg', '.pdf', '.eps', '.ps'];
		return imageExtensions.some(ext => filename.toLowerCase().endsWith(ext));
	}

	private invalidateCache() {
		if (this.cacheUpdateTimeout) {
			clearTimeout(this.cacheUpdateTimeout);
		}
		this.cacheUpdateTimeout = setTimeout(() => {
			this.updateCache();
		}, 500);
	}

	private notifyCacheUpdate() {
		this.cacheUpdateCallbacks.forEach(callback => {
			callback(this.cachedFiles);
		});

		const bibFiles = this.getBibliographyFiles();
		this.bibliographyFileCallbacks.forEach(callback => {
			callback(bibFiles);
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
		this.bibliographyFileCallbacks.clear();
		if (this.cacheUpdateTimeout) {
			clearTimeout(this.cacheUpdateTimeout);
			this.cacheUpdateTimeout = null;
		}
	}
}

export const filePathCacheService = new FilePathCacheService();