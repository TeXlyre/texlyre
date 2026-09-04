// src/services/WriteTargetService.ts
import { createNamedLogger } from '@/logging';
import { UnifiedDataStructureService } from './BackupLayoutService';
import {
	ArchiveStore,
	type WritableArchiveFormat,
} from '../utils/archiveUtils';
import { isBinaryFile, toArrayBuffer } from '../utils/fileUtils';

const moduleLog = createNamedLogger('WriteTargetService');

export interface WriteTarget {
	writeFile(
		path: string,
		content: string | ArrayBuffer | Uint8Array,
	): Promise<void>;
	readFile(path: string): Promise<string | ArrayBuffer>;
	createDirectory(path: string): Promise<void>;
	exists(path: string): Promise<boolean>;
	listDirectory(path: string): Promise<string[]>;
}

export class DirectoryTarget implements WriteTarget {
	constructor(private rootHandle: FileSystemDirectoryHandle) {}

	async writeFile(
		path: string,
		content: string | ArrayBuffer | Uint8Array,
	): Promise<void> {
		const { dir, fileName } = this.parsePath(path);
		const dirHandle = await this.getOrCreateDirectory(dir);
		const data = toArrayBuffer(content);

		const attempt = async (): Promise<void> => {
			const fileHandle = await dirHandle.getFileHandle(fileName, {
				create: true,
			});
			const writable = await fileHandle.createWritable();
			try {
				await writable.write(data);
				await writable.close();
			} catch (error) {
				await writable.abort().catch(() => {});
				throw error;
			}
		};

		try {
			await attempt();
		} catch (error) {
			if (error instanceof DOMException && error.name === 'InvalidStateError') {
				await attempt();
				return;
			}
			throw error;
		}
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

	async listEntries(
		path: string,
	): Promise<Array<{ name: string; isDirectory: boolean }>> {
		const dirHandle = await this.getDirectory(path);
		const entries: Array<{ name: string; isDirectory: boolean }> = [];
		for await (const [name, handle] of (dirHandle as any).entries()) {
			entries.push({ name, isDirectory: handle.kind === 'directory' });
		}
		return entries;
	}

	async stat(
		path: string,
	): Promise<{ lastModified: number; size: number } | null> {
		try {
			const { dir, fileName } = this.parsePath(path);
			const dirHandle = await this.getDirectory(dir);
			const file = await (await dirHandle.getFileHandle(fileName)).getFile();
			return { lastModified: file.lastModified, size: file.size };
		} catch {
			return null;
		}
	}

	async deleteEntry(path: string): Promise<void> {
		const { dir, fileName } = this.parsePath(path);
		const dirHandle = await this.getDirectory(dir);
		await dirHandle.removeEntry(fileName, { recursive: true });
	}

	private parsePath(path: string): { dir: string; fileName: string } {
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

		const parts = path.split('/').filter(Boolean);
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

		const parts = path.split('/').filter(Boolean);
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

export class ZipTarget implements WriteTarget {
	private archive = new ArchiveStore();

	writeFile(
		path: string,
		content: string | ArrayBuffer | Uint8Array,
	): Promise<void> {
		return this.archive.writeFile(path, content);
	}

	readFile(path: string): Promise<string | ArrayBuffer> {
		return this.archive.readFile(path);
	}

	createDirectory(path: string): Promise<void> {
		return this.archive.createDirectory(path);
	}

	exists(path: string): Promise<boolean> {
		return this.archive.exists(path);
	}

	listDirectory(path: string): Promise<string[]> {
		return this.archive.listDirectory(path);
	}

	generateArchive(format: WritableArchiveFormat = 'zip'): Promise<Blob> {
		return this.archive.generateArchive(format);
	}

	generateZip(): Promise<Blob> {
		return this.generateArchive('zip');
	}

	loadFromBlob(blob: Blob): Promise<void> {
		return this.archive.loadFromBlob(blob);
	}
}

export class WriteTargetService {
	private unifiedService = new UnifiedDataStructureService();

	async writeUnifiedStructure(
		adapter: WriteTarget,
		data: {
			manifest: any;
			account: any;
			userData?: any;
			projects: any[];
			projectData: Map<string, any>;
		},
	): Promise<void> {
		const paths = this.unifiedService.getPaths();

		await adapter.writeFile(
			paths.MANIFEST,
			JSON.stringify(data.manifest, null, 2),
		);

		if (data.account) {
			await adapter.writeFile(
				paths.ACCOUNT,
				JSON.stringify(data.account, null, 2),
			);
		}

		if (data.userData) {
			await adapter.writeFile(
				'userdata.json',
				JSON.stringify(data.userData, null, 2),
			);
		}

		await adapter.writeFile(
			paths.PROJECTS,
			JSON.stringify(data.projects, null, 2),
		);

		for (const [projectId, projectData] of data.projectData) {
			await this.writeProjectData(adapter, projectId, projectData);
		}
	}

	async readUnifiedStructure(adapter: WriteTarget): Promise<{
		manifest: any;
		account: any;
		userData?: any;
		projects: any[];
		projectData: Map<string, any>;
	}> {
		const paths = this.unifiedService.getPaths();

		const [manifest, projects] = await Promise.all([
			this.readJsonFile(adapter, paths.MANIFEST),
			this.readJsonFile(adapter, paths.PROJECTS),
		]);

		let account = null;
		if (await adapter.exists(paths.ACCOUNT)) {
			try {
				account = await this.readJsonFile(adapter, paths.ACCOUNT);
			} catch (error) {
				moduleLog.warn('Could not read account.json, using null:', error);
			}
		}

		let userData = null;
		try {
			if (await adapter.exists('userdata.json')) {
				userData = await this.readJsonFile(adapter, 'userdata.json');
			}
		} catch (error) {
			moduleLog.warn('Could not read userdata.json:', error);
		}

		const projectData = new Map();

		for (const project of projects) {
			const data = await this.readProjectData(adapter, project.id);
			projectData.set(project.id, data);
		}

		return { manifest, account, userData, projects, projectData };
	}

	private async readJsonFile(adapter: WriteTarget, path: string): Promise<any> {
		return JSON.parse((await adapter.readFile(path)) as string);
	}

	private async writeProjectData(
		adapter: WriteTarget,
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
		adapter: WriteTarget,
		projectId: string,
		projectData: any,
	): Promise<void> {
		const docsPath = this.unifiedService.getDocumentsPath(projectId);
		await adapter.createDirectory(docsPath);

		await adapter.writeFile(
			this.unifiedService.getDocumentMetadataPath(projectId),
			JSON.stringify(projectData.documents, null, 2),
		);

		for (const doc of projectData.documents) {
			const docContent = projectData.documentContents.get(doc.id);
			if (!docContent) continue;

			const writePromises: Promise<void>[] = [];

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
		adapter: WriteTarget,
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

			const cleanPath = this.cleanRelativePath(file.path);
			const filePath = this.unifiedService.getFileContentPath(
				projectId,
				cleanPath,
			);
			const dirPath = filePath.substring(0, filePath.lastIndexOf('/'));

			if (dirPath && dirPath !== this.unifiedService.getFilesPath(projectId)) {
				await adapter.createDirectory(dirPath);
			}

			await adapter.writeFile(filePath, content);
		}
	}

	private async readProjectData(
		adapter: WriteTarget,
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
		adapter: WriteTarget,
		projectId: string,
	): Promise<[any[], Map<string, any>]> {
		const documents: any[] = [];
		const documentContents = new Map();

		try {
			const projectPath = this.unifiedService.getProjectPath(projectId);
			const docsPath = await this.findDocumentsPath(adapter, projectPath);

			if (!docsPath) return [documents, documentContents];

			const savedDocs = await this.readDocumentMetadata(
				adapter,
				projectId,
				docsPath,
			);

			for (const doc of savedDocs) {
				const [yjsPath, contentPath] = this.getDocumentPaths(docsPath, doc.id);

				try {
					const [yjsExists, contentExists] = await Promise.all([
						adapter.exists(yjsPath),
						adapter.exists(contentPath),
					]);

					if (!yjsExists) continue;

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
				} catch (error) {
					moduleLog.error(`Error reading document ${doc.id}:`, error);
				}
			}
		} catch (error) {
			moduleLog.error('Error reading documents:', error);
		}

		return [documents, documentContents];
	}

	private async findDocumentsPath(
		adapter: WriteTarget,
		projectPath: string,
	): Promise<string | null> {
		const directPaths = [`${projectPath}/documents`, projectPath];

		for (const path of directPaths) {
			try {
				const contents = await adapter.listDirectory(path);

				if (contents.some((name) => name.endsWith('.yjs'))) {
					return path;
				}
			} catch {}
		}

		return null;
	}

	private async readDocumentMetadata(
		adapter: WriteTarget,
		projectId: string,
		docsPath: string,
	): Promise<any[]> {
		const metadataPath = await this.resolveMetadataPath(
			adapter,
			this.unifiedService.getDocumentMetadataPath(projectId),
			this.unifiedService.getLegacyDocumentMetadataPath(projectId),
		);

		if (metadataPath) {
			return await this.readJsonFile(adapter, metadataPath);
		}

		return await this.inferDocumentMetadata(adapter, docsPath);
	}

	private async inferDocumentMetadata(
		adapter: WriteTarget,
		docsPath: string,
	): Promise<any[]> {
		const docFiles = await adapter.listDirectory(docsPath);

		return docFiles
			.filter((name) => name.endsWith('.yjs'))
			.map((name) => {
				const id = name.replace('.yjs', '');

				return {
					id,
					name: `Document ${id}`,
					lastModified: Date.now(),
					hasYjsState: true,
					hasReadableContent: true,
				};
			});
	}

	private getDocumentPaths(docsPath: string, docId: string): [string, string] {
		return [`${docsPath}/${docId}.yjs`, `${docsPath}/${docId}.txt`];
	}

	private async readFiles(
		adapter: WriteTarget,
		projectId: string,
	): Promise<[any[], Map<string, any>]> {
		const files: any[] = [];
		const fileContents = new Map();

		try {
			const metadataPath = await this.resolveMetadataPath(
				adapter,
				this.unifiedService.getFilesMetadataPath(projectId),
				this.unifiedService.getLegacyFilesMetadataPath(projectId),
			);

			if (!metadataPath) return [files, fileContents];

			const filesMetadata = await this.readJsonFile(adapter, metadataPath);
			files.push(...filesMetadata);

			for (const file of filesMetadata) {
				if (file.type !== 'file') continue;

				const cleanPath = this.cleanRelativePath(file.path);
				const contentPath = this.unifiedService.getFileContentPath(
					projectId,
					cleanPath,
				);

				if (await adapter.exists(contentPath)) {
					const content = await adapter.readFile(contentPath);
					fileContents.set(file.path, content);
				}
			}
		} catch (error) {
			moduleLog.error('Error reading files:', error);
		}

		return [files, fileContents];
	}

	private async resolveMetadataPath(
		adapter: WriteTarget,
		metadataPath: string,
		legacyMetadataPath: string,
	): Promise<string | null> {
		if (await adapter.exists(metadataPath)) return metadataPath;
		if (await adapter.exists(legacyMetadataPath)) return legacyMetadataPath;
		return null;
	}

	private cleanRelativePath(path: string): string {
		return path.startsWith('/') ? path.slice(1) : path;
	}
}
