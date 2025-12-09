// src/services/FilePathCacheService.ts
import type { FileNode, FilePathCache } from '../types/files';
import { isLatexFile, isTypstFile, isBibFile } from '../utils/fileUtils';
import { fileStorageEventEmitter } from './FileStorageService';

type CacheUpdateCallback = (files: FileNode[]) => void;
type FilePathUpdateCallback = (filePath: string) => void;
type BibliographyFilesCallback = (files: FileNode[]) => void;
type LabelsUpdateCallback = (labels: Map<string, string[]>) => void;

interface LabelCache {
	texLabels: Map<string, string[]>;
	typstLabels: Map<string, string[]>;
	lastUpdate: number;
}

class FilePathCacheService {
	private cachedFiles: FileNode[] = [];
	private lastCacheUpdate = 0;
	private cacheTimeout = 5000;
	private cacheUpdateTimeout: NodeJS.Timeout | null = null;
	private cacheUpdateCallbacks = new Set<CacheUpdateCallback>();
	private filePathUpdateCallbacks = new Set<FilePathUpdateCallback>();
	private bibliographyFileCallbacks = new Set<BibliographyFilesCallback>();
	private labelsUpdateCallbacks = new Set<LabelsUpdateCallback>();
	private labelCache: LabelCache = {
		texLabels: new Map(),
		typstLabels: new Map(),
		lastUpdate: 0,
	};

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

	onLabelsUpdate(callback: LabelsUpdateCallback) {
		this.labelsUpdateCallbacks.add(callback);
		if (this.labelCache.texLabels.size > 0 || this.labelCache.typstLabels.size > 0) {
			callback(this.labelCache.texLabels);
			callback(this.labelCache.typstLabels);
		}
	}

	offLabelsUpdate(callback: LabelsUpdateCallback) {
		this.labelsUpdateCallbacks.delete(callback);
	}

	getTexLabels(): Map<string, string[]> {
		return this.labelCache.texLabels;
	}

	getTypstLabels(): Map<string, string[]> {
		return this.labelCache.typstLabels;
	}

	getBibliographyFiles(): FileNode[] {
		return this.cachedFiles.filter(file =>
			file.type === 'file' &&
			isBibFile(file.name) &&
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
				} else if (isBibFile(node.name)) {
					cache.bibFiles.push(node.path);
				} else if (isLatexFile(node.name)) {
					cache.texFiles.push(node.path);
				} else if (isTypstFile(node.name)) {
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

	private extractTexLabels(content: string): string[] {
		const labels = new Set<string>();
		const patterns = [
			/\\label\{([^}]+)\}/g,
			/\\hypertarget\{([^}]+)\}/g,
		];

		for (const pattern of patterns) {
			let match;
			while ((match = pattern.exec(content)) !== null) {
				const label = match[1].trim();
				if (label) {
					labels.add(label);
				}
			}
		}

		return Array.from(labels);
	}

	private extractTypstLabels(content: string): string[] {
		const labels = new Set<string>();
		const pattern = /<([^>]+)>/g;
		let match;

		while ((match = pattern.exec(content)) !== null) {
			const label = match[1].trim();
			if (label && !label.includes(' ') && !label.includes('\n')) {
				labels.add(label);
			}
		}

		return Array.from(labels);
	}

	private async updateLabelsCache() {
		const texLabels = new Map<string, string[]>();
		const typstLabels = new Map<string, string[]>();

		for (const file of this.cachedFiles) {
			if (file.type !== 'file' || file.isDeleted || !file.content) {
				continue;
			}

			const content = typeof file.content === 'string'
				? file.content
				: new TextDecoder().decode(file.content);

			if (isLatexFile(file.name)) {
				const labels = this.extractTexLabels(content);
				if (labels.length > 0) {
					texLabels.set(file.path, labels);
				}
			} else if (isTypstFile(file.name)) {
				const labels = this.extractTypstLabels(content);
				if (labels.length > 0) {
					typstLabels.set(file.path, labels);
				}
			}
		}

		this.labelCache = {
			texLabels,
			typstLabels,
			lastUpdate: Date.now(),
		};

		this.labelsUpdateCallbacks.forEach(callback => {
			callback(texLabels);
			callback(typstLabels);
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
		await this.updateLabelsCache();
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
		this.labelsUpdateCallbacks.clear();
		this.labelCache = {
			texLabels: new Map(),
			typstLabels: new Map(),
			lastUpdate: 0,
		};
		if (this.cacheUpdateTimeout) {
			clearTimeout(this.cacheUpdateTimeout);
			this.cacheUpdateTimeout = null;
		}
	}
}

export const filePathCacheService = new FilePathCacheService();