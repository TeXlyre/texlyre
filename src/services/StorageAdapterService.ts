// src/services/StorageAdapterService.ts
import JSZip from 'jszip';

import { UnifiedDataStructureService } from './DataStructureService';
import { isBinaryFile, toArrayBuffer } from '../utils/fileUtils';

export interface FileSystemAdapter {
	writeFile(
		path: string,
		content: string | ArrayBuffer | Uint8Array,
	): Promise<void>;
	readFile(path: string): Promise<string | ArrayBuffer>;
	createDirectory(path: string): Promise<void>;
	exists(path: string): Promise<boolean>;
	listDirectory(path: string): Promise<string[]>;
}

export class DirectoryAdapter implements FileSystemAdapter {
	constructor(private rootHandle: FileSystemDirectoryHandle) { }

	async writeFile(
		path: string,
		content: string | ArrayBuffer | Uint8Array,
	): Promise<void> {
		const { dir, fileName } = this.parsePath(path);
		const dirHandle = await this.getOrCreateDirectory(dir);
		const fileHandle = await dirHandle.getFileHandle(fileName, {
			create: true,
		});
		const writable = await fileHandle.createWritable();
		await writable.write(toArrayBuffer(content));
		await writable.close();
	}

	async readFile(path: string): Promise<string | ArrayBuffer> {
		const { dir, fileName } = this.parsePath(path);
		const dirHandle = await this.getDirectory(dir);
		const fileHandle = await dirHandle.getFileHandle(fileName);
		const file = await fileHandle.getFile();

		return !isBinaryFile(path) ? file.text() : file.arrayBuffer();
	}

	async createDirectory(path: string): Promise<void> {
		await this.getOrCreateDirectory(path);
	}

	async exists(path: string): Promise<boolean> {
		try {
			const { dir, fileName } = this.parsePath(path);
			const dirHandle = await this.getDirectory(dir);
			if (fileName) await dirHandle.getFileHandle(fileName);
			return true;
		} catch {
			return false;
		}
	}

	async listDirectory(path: string): Promise<string[]> {
		const dirHandle = await this.getDirectory(path);
		const entries: string[] = [];
		for await (const [name] of (dirHandle as any).entries()) {
			entries.push(name);
		}
		return entries;
	}

	private parsePath(path: string): { dir: string; fileName?: string } {
		const normalizedPath = path.replace(/^\/+/, '');
		const lastSlash = normalizedPath.lastIndexOf('/');

		if (lastSlash === -1) {
			return { dir: '', fileName: normalizedPath };
		}

		return {
			dir: normalizedPath.substring(0, lastSlash),
			fileName: normalizedPath.substring(lastSlash + 1),
		};
	}

	private async getDirectory(path: string): Promise<FileSystemDirectoryHandle> {
		if (!path) return this.rootHandle;

		const parts = path.split('/').filter((p) => p);
		let current = this.rootHandle;

		for (const part of parts) {
			current = await current.getDirectoryHandle(part);
		}

		return current;
	}

	private async getOrCreateDirectory(
		path: string,
	): Promise<FileSystemDirectoryHandle> {
		if (!path) return this.rootHandle;

		const parts = path.split('/').filter((p) => p);
		let current = this.rootHandle;

		for (const part of parts) {
			try {
				current = await current.getDirectoryHandle(part);
			} catch {
				current = await current.getDirectoryHandle(part, { create: true });
			}
		}

		return current;
	}
}

export class ZipAdapter implements FileSystemAdapter {
	private zip = new JSZip();

	async writeFile(
		path: string,
		content: string | ArrayBuffer | Uint8Array,
	): Promise<void> {
		this.zip.file(this.normalizePath(path), content);
	}

	async readFile(path: string): Promise<string | ArrayBuffer> {
		const normalizedPath = this.normalizePath(path);
		const file = this.zip.file(normalizedPath);
		if (!file) throw new Error(`File not found: ${normalizedPath}`);

		return !isBinaryFile(normalizedPath)
			? file.async('string')
			: file.async('arraybuffer');
	}

	async createDirectory(path: string): Promise<void> {
		const normalizedPath = this.normalizePath(path);
		if (normalizedPath) this.zip.folder(normalizedPath);
	}

	async exists(path: string): Promise<boolean> {
		const normalizedPath = this.normalizePath(path);

		if (this.zip.file(normalizedPath)) return true;

		const folderPath = normalizedPath.endsWith('/')
			? normalizedPath
			: `${normalizedPath}/`;
		let hasEntries = false;

		this.zip.forEach((relativePath) => {
			if (relativePath.startsWith(folderPath)) {
				hasEntries = true;
			}
		});

		return hasEntries;
	}

	async listDirectory(path: string): Promise<string[]> {
		const entries: string[] = [];
		const normalizedPath = this.normalizePath(path);
		const searchPath = normalizedPath
			? normalizedPath.endsWith('/')
				? normalizedPath
				: `${normalizedPath}/`
			: '';

		this.zip.forEach((relativePath) => {
			if (relativePath.startsWith(searchPath)) {
				const remaining = relativePath.substring(searchPath.length);
				const firstSlash = remaining.indexOf('/');
				const name =
					firstSlash === -1 ? remaining : remaining.substring(0, firstSlash);

				if (name && !entries.includes(name)) {
					entries.push(name);
				}
			}
		});

		return entries;
	}

	async generateZip(): Promise<Blob> {
		return this.zip.generateAsync({ type: 'blob' });
	}

	async loadFromBlob(blob: Blob): Promise<void> {
		this.zip = await JSZip.loadAsync(blob);
	}

	private normalizePath(path: string): string {
		return path.replace(/^\/+/, '').replace(/\/+/g, '/');
	}
}

export class StorageAdapterService {
	private unifiedService = new UnifiedDataStructureService();

	async writeUnifiedStructure(
		adapter: FileSystemAdapter,
		data: {
			manifest: any;
			account: any;
			userData?: any;
			projects: any[];
			projectData: Map<string, any>;
		},
	): Promise<void> {
		const paths = this.unifiedService.getPaths();

		// Write manifest
		await adapter.writeFile(paths.MANIFEST, JSON.stringify(data.manifest, null, 2));

		// Write account if exists
		if (data.account) {
			await adapter.writeFile(paths.ACCOUNT, JSON.stringify(data.account, null, 2));
		}

		// Write userData if exists
		if (data.userData) {
			await adapter.writeFile('userdata.json', JSON.stringify(data.userData, null, 2));
		}

		// Write projects
		await adapter.writeFile(paths.PROJECTS, JSON.stringify(data.projects, null, 2));

		// Write project data
		for (const [projectId, projectData] of data.projectData) {
			await this.writeProjectData(adapter, projectId, projectData);
		}
	}

	async readUnifiedStructure(
		adapter: FileSystemAdapter,
	): Promise<{
		manifest: any;
		account: any;
		userData?: any;
		projects: any[];
		projectData: Map<string, any>;
	}> {
		const paths = this.unifiedService.getPaths();

		// Read manifest and projects
		const [manifest, projects] = await Promise.all([
			this.readJsonFile(adapter, paths.MANIFEST),
			this.readJsonFile(adapter, paths.PROJECTS),
		]);

		// Read account if exists
		let account = null;
		if (await adapter.exists(paths.ACCOUNT)) {
			try {
				account = await this.readJsonFile(adapter, paths.ACCOUNT);
			} catch (error) {
				console.warn('Could not read account.json, using null:', error);
				account = null;
			}
		}

		// Read userData if exists
		let userData = null;
		try {
			if (await adapter.exists('userdata.json')) {
				userData = await this.readJsonFile(adapter, 'userdata.json');
			}
		} catch (error) {
			console.warn('Could not read userdata.json:', error);
		}

		// Read project data
		const projectData = new Map();
		for (const project of projects) {
			const data = await this.readProjectData(adapter, project.id);
			projectData.set(project.id, data);
		}

		return { manifest, account, userData, projects, projectData };
	}

	private async readJsonFile(
		adapter: FileSystemAdapter,
		path: string,
	): Promise<any> {
		return JSON.parse((await adapter.readFile(path)) as string);
	}

	private async writeProjectData(
		adapter: FileSystemAdapter,
		projectId: string,
		projectData: any,
	): Promise<void> {
		const projectPath = this.unifiedService.getProjectPath(projectId);
		await adapter.createDirectory(projectPath);

		await adapter.writeFile(
			this.unifiedService.getProjectMetadataPath(projectId),
			JSON.stringify(projectData.metadata, null, 2),
		);

		if (projectData.documents.length > 0) {
			await this.writeDocuments(adapter, projectId, projectData);
		}

		if (projectData.files.length > 0) {
			await this.writeFiles(adapter, projectId, projectData);
		}
	}

	private async writeDocuments(
		adapter: FileSystemAdapter,
		projectId: string,
		projectData: any,
	): Promise<void> {
		const docsPath = this.unifiedService.getDocumentsPath(projectId);
		await adapter.createDirectory(docsPath);

		await adapter.writeFile(
			`${docsPath}/metadata.json`,
			JSON.stringify(projectData.documents, null, 2),
		);

		for (const doc of projectData.documents) {
			const docContent = projectData.documentContents.get(doc.id);
			if (!docContent) continue;

			const writePromises = [];

			if (docContent.yjsState) {
				writePromises.push(
					adapter.writeFile(
						this.unifiedService.getDocumentYjsPath(projectId, doc.id),
						docContent.yjsState,
					),
				);
			}

			if (docContent.readableContent) {
				writePromises.push(
					adapter.writeFile(
						this.unifiedService.getDocumentContentPath(projectId, doc.id),
						docContent.readableContent,
					),
				);
			}

			await Promise.all(writePromises);
		}
	}

	private async writeFiles(
		adapter: FileSystemAdapter,
		projectId: string,
		projectData: any,
	): Promise<void> {
		await adapter.createDirectory(this.unifiedService.getFilesPath(projectId));

		await adapter.writeFile(
			this.unifiedService.getFilesMetadataPath(projectId),
			JSON.stringify(projectData.files, null, 2),
		);

		for (const file of projectData.files) {
			if (file.type !== 'file') continue;

			const content = projectData.fileContents.get(file.path);
			if (!content) continue;

			const cleanPath = file.path.startsWith('/') ? file.path.slice(1) : file.path;
			const filePath = this.unifiedService.getFileContentPath(projectId, cleanPath);
			const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));

			if (dirPath && dirPath !== this.unifiedService.getFilesPath(projectId)) {
				await adapter.createDirectory(dirPath);
			}

			await adapter.writeFile(filePath, content);
		}
	}

	private async readProjectData(
		adapter: FileSystemAdapter,
		projectId: string,
	): Promise<any> {
		const metadata = await this.readJsonFile(
			adapter,
			this.unifiedService.getProjectMetadataPath(projectId),
		);

		const [documents, documentContents] = await this.readDocuments(
			adapter,
			projectId,
		);
		const [files, fileContents] = await this.readFiles(adapter, projectId);

		return { metadata, documents, documentContents, files, fileContents };
	}

	private async readDocuments(
		adapter: FileSystemAdapter,
		projectId: string,
	): Promise<[any[], Map<string, any>]> {
		const documents: any[] = [];
		const documentContents = new Map();

		try {
			const projectPath = this.unifiedService.getProjectPath(projectId);
			const docsPath = await this.findDocumentsPath(adapter, projectPath);

			if (!docsPath) return [documents, documentContents];

			const savedDocs = await this.getDocumentMetadata(adapter, docsPath);

			for (const doc of savedDocs) {
				const [yjsPath, contentPath] = this.getDocumentPaths(docsPath, doc.id);

				try {
					const [yjsExists, contentExists] = await Promise.all([
						adapter.exists(yjsPath),
						adapter.exists(contentPath),
					]);

					if (yjsExists) {
						const [yjsState, readableContent] = await Promise.all([
							adapter
								.readFile(yjsPath)
								.then((data) => new Uint8Array(data as ArrayBuffer)),
							contentExists
								? (adapter.readFile(contentPath) as Promise<string>)
								: Promise.resolve(''),
						]);

						documents.push({ ...doc, hasReadableContent: !!readableContent });
						documentContents.set(doc.id, { yjsState, readableContent });
					}
				} catch (error) {
					console.error(`Error reading document ${doc.id}:`, error);
				}
			}
		} catch (error) {
			console.error('Error reading documents:', error);
		}

		return [documents, documentContents];
	}

	private async findDocumentsPath(
		adapter: FileSystemAdapter,
		projectPath: string,
	): Promise<string | null> {
		const directPaths = [`${projectPath}/documents`, projectPath];

		for (const path of directPaths) {
			try {
				const contents = await adapter.listDirectory(path);
				if (contents.some((name) => name.endsWith('.yjs'))) {
					return path;
				}
			} catch { }
		}

		return null;
	}

	private async getDocumentMetadata(
		adapter: FileSystemAdapter,
		docsPath: string,
	): Promise<any[]> {
		const metadataPath = `${docsPath}/metadata.json`;

		if (await adapter.exists(metadataPath)) {
			return await this.readJsonFile(adapter, metadataPath);
		}

		const docFiles = await adapter.listDirectory(docsPath);
		return docFiles
			.filter((name) => name.endsWith('.yjs'))
			.map((name) => ({
				id: name.replace('.yjs', ''),
				name: `Document ${name.replace('.yjs', '')}`,
				lastModified: Date.now(),
				hasYjsState: true,
				hasReadableContent: true,
			}));
	}

	private getDocumentPaths(docsPath: string, docId: string): [string, string] {
		return [`${docsPath}/${docId}.yjs`, `${docsPath}/${docId}.txt`];
	}

	private async readFiles(
		adapter: FileSystemAdapter,
		projectId: string,
	): Promise<[any[], Map<string, any>]> {
		const files: any[] = [];
		const fileContents = new Map();

		try {
			const filesMetadataPath =
				this.unifiedService.getFilesMetadataPath(projectId);

			if (await adapter.exists(filesMetadataPath)) {
				const filesMetadata = await this.readJsonFile(
					adapter,
					filesMetadataPath,
				);
				files.push(...filesMetadata);

				for (const file of filesMetadata) {
					if (file.type === 'file') {
						const cleanPath = file.path.startsWith('/') ? file.path.slice(1) : file.path;
						const contentPath = this.unifiedService.getFileContentPath(
							projectId,
							cleanPath,
						);

						if (await adapter.exists(contentPath)) {
							const content = await adapter.readFile(contentPath);
							fileContents.set(file.path, content);
						}
					}
				}
			}
		} catch (error) {
			console.error('Error reading files:', error);
		}

		return [files, fileContents];
	}
}