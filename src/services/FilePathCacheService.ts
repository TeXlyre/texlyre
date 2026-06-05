// src/services/FilePathCacheService.ts
import type { FileNode, FilePathCache } from '../types/files';
import {
	isLatexFile,
	isTypstFile,
	isBibFile,
	isMarkdownFile,
	isTemporaryFile,
} from '../utils/fileUtils';
import { fileStorageEventEmitter } from './FileStorageService';

type CacheUpdateCallback = (files: FileNode[]) => void;
type FilePathUpdateCallback = (filePath: string) => void;
type BibliographyFilesCallback = (files: FileNode[]) => void;
type LabelsUpdateCallback = (labelsByFormat: LabelsByFormat) => void;

export type LabelFormat = 'tex' | 'typst' | 'markdown';
export type LabelsByFormat = Partial<
	Record<LabelFormat, Map<string, string[]>>
>;

interface LabelCache {
	labelsByFormat: LabelsByFormat;
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
		labelsByFormat: {
			tex: new Map(),
			typst: new Map(),
			markdown: new Map(),
		},
		lastUpdate: 0,
	};
	private labelContentCache = new Map<
		string,
		{
			lastModified: number;
			format: LabelFormat;
			labelsByFormat: Partial<Record<LabelFormat, string[]>>;
		}
	>();
	private readonly MAX_LABEL_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

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
		if (
			Object.values(this.labelCache.labelsByFormat).some(
				(labels) => labels && labels.size > 0,
			)
		) {
			callback(this.labelCache.labelsByFormat);
		}
	}

	offLabelsUpdate(callback: LabelsUpdateCallback) {
		this.labelsUpdateCallbacks.delete(callback);
	}

	getTexLabels(): Map<string, string[]> {
		return this.labelCache.labelsByFormat.tex ?? new Map();
	}

	getTypstLabels(): Map<string, string[]> {
		return this.labelCache.labelsByFormat.typst ?? new Map();
	}

	getMarkdownLabels(): Map<string, string[]> {
		return this.labelCache.labelsByFormat.markdown ?? new Map();
	}

	getLabelsByFormat(): LabelsByFormat {
		return this.labelCache.labelsByFormat;
	}

	getBibliographyFiles(): FileNode[] {
		return this.flattenFiles(this.cachedFiles).filter(
			(file) =>
				file.type === 'file' &&
				isBibFile(file.name) &&
				!file.isDeleted &&
				!isTemporaryFile(file.path),
		);
	}

	async getLinkedFilePath(documentId: string): Promise<string> {
		const cachedFiles = await this.getCachedFiles();
		const linkedFile = this.flattenFiles(cachedFiles).find(
			(file) => file.documentId === documentId,
		);
		return linkedFile?.path || '';
	}

	updateCurrentFilePath(filePath: string, documentId?: string) {
		if (!filePath && documentId) {
			this.getLinkedFilePath(documentId).then((linkedPath) => {
				if (linkedPath) {
					this.filePathUpdateCallbacks.forEach((callback) => {
						callback(linkedPath);
					});
				}
			});
		} else {
			this.filePathUpdateCallbacks.forEach((callback) => {
				callback(filePath);
			});
		}
	}

	buildCacheFromFiles(files: FileNode[]): FilePathCache {
		const imageExtensions = new Set([
			'png',
			'jpg',
			'jpeg',
			'gif',
			'bmp',
			'svg',
			'webp',
			'ico',
			'eps',
		]);
		const videoExtensions = new Set(['mp4', 'webm', 'ogv', 'mov']);
		const audioExtensions = new Set([
			'mp3',
			'ogg',
			'oga',
			'opus',
			'wav',
			'flac',
			'm4a',
		]);

		const cache: FilePathCache = {
			files: [],
			imageFiles: [],
			videoFiles: [],
			audioFiles: [],
			bibFiles: [],
			texFiles: [],
			typstFiles: [],
			allFiles: [],
			lastUpdate: Date.now(),
		};

		const processNode = (node: FileNode) => {
			if (
				node.type === 'file' &&
				!node.isDeleted &&
				!isTemporaryFile(node.path)
			) {
				const ext = node.name.split('.').pop()?.toLowerCase();

				cache.files.push(node);
				cache.allFiles.push(node.path);

				if (ext && imageExtensions.has(ext)) {
					cache.imageFiles.push(node.path);
				} else if (ext && videoExtensions.has(ext)) {
					cache.videoFiles.push(node.path);
				} else if (ext && audioExtensions.has(ext)) {
					cache.audioFiles.push(node.path);
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

	flattenFiles(files: FileNode[]): FileNode[] {
		const result: FileNode[] = [];

		const visit = (file: FileNode) => {
			result.push(file);

			if (file.children) {
				file.children.forEach(visit);
			}
		};

		files.forEach(visit);
		return result;
	}

	normalizePath(path: string): string {
		const trimmedPath = path.trim().replace(/\\/g, '/');
		const isAbsolute = trimmedPath.startsWith('/');
		const parts = trimmedPath.split('/').filter(Boolean);
		const normalizedParts: string[] = [];

		for (const part of parts) {
			if (part === '.') {
				continue;
			}

			if (part === '..') {
				normalizedParts.pop();
				continue;
			}

			normalizedParts.push(part);
		}

		return `${isAbsolute ? '/' : ''}${normalizedParts.join('/')}`;
	}

	resolveFilePath(fromPath: string, candidatePath: string): string {
		const trimmedPath = candidatePath.trim();

		if (trimmedPath.startsWith('/')) {
			return this.normalizePath(trimmedPath);
		}

		if (!fromPath) {
			return this.normalizePath(`/${trimmedPath}`);
		}

		const lastSlashIndex = fromPath.lastIndexOf('/');
		const currentDir =
			lastSlashIndex === -1 ? '' : fromPath.substring(0, lastSlashIndex);

		return this.normalizePath(`${currentDir}/${trimmedPath}`);
	}

	async findFileByPath(
		fromPath: string,
		candidatePath: string,
	): Promise<FileNode | null> {
		const resolvedPath = this.resolveFilePath(fromPath, candidatePath);
		const relativeResolvedPath = resolvedPath.replace(/^\/+/, '');
		const cachedFiles = this.flattenFiles(await this.getCachedFiles());

		return (
			cachedFiles.find((file) => {
				if (
					file.type !== 'file' ||
					file.isDeleted ||
					isTemporaryFile(file.path)
				) {
					return false;
				}

				const storedPath = this.normalizePath(file.path);

				return (
					storedPath === resolvedPath ||
					storedPath.endsWith(`/${relativeResolvedPath}`)
				);
			}) ?? null
		);
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

		if (toPath.startsWith(`${fromDir}/`)) {
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

		return `/${toPath.startsWith('/') ? toPath.slice(1) : toPath}`;
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
		this.cacheUpdateCallbacks.forEach((callback) => {
			callback(this.cachedFiles);
		});

		const bibFiles = this.getBibliographyFiles();
		this.bibliographyFileCallbacks.forEach((callback) => {
			callback(bibFiles);
		});
	}

	private extractTexLabels(content: string): string[] {
		const labels = new Set<string>();
		const patterns = [/\\label\{([^}]+)\}/g, /\\hypertarget\{([^}]+)\}/g];

		for (const pattern of patterns) {
			let match: RegExpExecArray | null;
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
		let match: RegExpExecArray | null;

		while ((match = pattern.exec(content)) !== null) {
			const label = match[1].trim();
			if (label && !label.includes(' ') && !label.includes('\n')) {
				labels.add(label);
			}
		}

		return Array.from(labels);
	}

	private getLabelFormat(fileName: string): LabelFormat | null {
		if (isLatexFile(fileName)) return 'tex';
		if (isTypstFile(fileName)) return 'typst';
		if (isMarkdownFile(fileName)) return 'markdown';
		return null;
	}

	private slugifyMarkdownHeading(heading: string): string {
		return heading
			.trim()
			.toLowerCase()
			.replace(/<[^>]*>/g, '')
			.replace(/[[\]()`*_~]/g, '')
			.replace(/[^a-z0-9\s-]/g, '')
			.replace(/\s+/g, '-')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '');
	}

	private extractMarkdownLabels(content: string): string[] {
		const labels = new Set<string>();
		const lines = content.split(/\r?\n/);
		let inFence = false;

		for (const line of lines) {
			if (/^\s*(```|~~~)/.test(line)) {
				inFence = !inFence;
				continue;
			}

			if (inFence) continue;

			const explicitAnchorPattern = /\{#([^}\s]+)\}/g;
			let anchorMatch: RegExpExecArray | null;
			while ((anchorMatch = explicitAnchorPattern.exec(line)) !== null) {
				labels.add(anchorMatch[1].trim());
			}

			const htmlAnchorPattern =
				/<a\s+[^>]*(?:id|name)=["']([^"']+)["'][^>]*>/gi;
			let htmlAnchorMatch: RegExpExecArray | null;
			while ((htmlAnchorMatch = htmlAnchorPattern.exec(line)) !== null) {
				labels.add(htmlAnchorMatch[1].trim());
			}

			const headingMatch = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
			if (headingMatch) {
				const heading = headingMatch[1].replace(/\s*\{#[^}]+\}\s*$/, '');
				const slug = this.slugifyMarkdownHeading(heading);
				if (slug) labels.add(slug);
			}
		}

		return Array.from(labels);
	}

	private extractLabelsForFormat(
		format: LabelFormat,
		content: string,
	): string[] {
		switch (format) {
			case 'tex':
				return this.extractTexLabels(content);
			case 'typst':
				return this.extractTypstLabels(content);
			case 'markdown':
				return this.extractMarkdownLabels(content);
			default:
				return [];
		}
	}

	private async updateLabelsCache() {
		const { fileStorageService } = await import('./FileStorageService');
		const labelsByFormat: Required<LabelsByFormat> = {
			tex: new Map(),
			typst: new Map(),
			markdown: new Map(),
		};

		for (const file of this.flattenFiles(this.cachedFiles)) {
			const format = this.getLabelFormat(file.name);

			if (
				file.type !== 'file' ||
				file.isDeleted ||
				isTemporaryFile(file.path) ||
				!format
			) {
				continue;
			}

			try {
				const cached = this.labelContentCache.get(file.id);
				if (
					cached &&
					cached.lastModified === (file.lastModified ?? 0) &&
					cached.format === format
				) {
					const cachedLabels = cached.labelsByFormat[format];
					if (cachedLabels && cachedLabels.length > 0) {
						labelsByFormat[format].set(file.path, cachedLabels);
					}
					continue;
				}

				if ((file.size ?? 0) > this.MAX_LABEL_FILE_SIZE) continue;

				const storedFile = await fileStorageService.getFile(file.id);
				if (!storedFile?.content) continue;

				const content =
					typeof storedFile.content === 'string'
						? storedFile.content
						: new TextDecoder().decode(storedFile.content);

				const labels = this.extractLabelsForFormat(format, content);
				const entry: {
					lastModified: number;
					format: LabelFormat;
					labelsByFormat: Partial<Record<LabelFormat, string[]>>;
				} = {
					lastModified: file.lastModified ?? 0,
					format,
					labelsByFormat: { [format]: labels },
				};

				if (labels.length > 0) {
					labelsByFormat[format].set(file.path, labels);
				}

				this.labelContentCache.set(file.id, entry);
			} catch (error) {
				console.warn(
					`Failed to read content for label extraction: ${file.path}`,
					error,
				);
			}
		}

		this.labelCache = {
			labelsByFormat,
			lastUpdate: Date.now(),
		};

		this.labelsUpdateCallbacks.forEach((callback) => {
			callback(labelsByFormat);
		});
	}

	async updateCache(files?: FileNode[]) {
		if (files) {
			this.cachedFiles = files;
		} else {
			const { fileStorageService } = await import('./FileStorageService');
			try {
				this.cachedFiles = await fileStorageService.getAllFiles(
					false,
					false,
					false,
				);
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
		if (
			now - this.lastCacheUpdate > this.cacheTimeout ||
			this.cachedFiles.length === 0
		) {
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
			labelsByFormat: {
				tex: new Map(),
				typst: new Map(),
				markdown: new Map(),
			},
			lastUpdate: 0,
		};
		this.labelContentCache.clear();
		if (this.cacheUpdateTimeout) {
			clearTimeout(this.cacheUpdateTimeout);
			this.cacheUpdateTimeout = null;
		}
	}
}

export const filePathCacheService = new FilePathCacheService();
