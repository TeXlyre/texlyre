// src/services/DataStructureService.ts
import type { User } from "../types/auth";
import type { FileNode } from "../types/files";
import type { Project } from "../types/projects";

export interface UnifiedManifest {
	version: string;
	lastSync: number;
	mode: "backup" | "export" | "import";
}

export interface ProjectMetadata {
	id: string;
	name: string;
	description: string;
	docUrl: string;
	createdAt: number;
	updatedAt: number;
	ownerId: string;
	tags: string[];
	isFavorite: boolean;
	lastSync?: number;
	exportedAt?: number;
}

export interface DocumentMetadata {
	id: string;
	name: string;
	lastModified: number;
	hasYjsState: boolean;
	hasReadableContent: boolean;
}

export interface FileMetadata {
	id: string;
	name: string;
	path: string;
	type: "file" | "directory";
	lastModified: number;
	size?: number;
	mimeType?: string;
	isBinary?: boolean;
	documentId?: string;
	content?: ArrayBuffer | string;
}

export interface DataStructureService {
	manifest: UnifiedManifest;
	account: User;
	projects: ProjectMetadata[];
	projectData: Map<
		string,
		{
			metadata: ProjectMetadata;
			documents: DocumentMetadata[];
			files: FileMetadata[];
			documentContents: Map<
				string,
				{ yjsState?: Uint8Array; readableContent?: string }
			>;
			fileContents: Map<string, ArrayBuffer | string>;
		}
	>;
}

export class UnifiedDataStructureService {
	private readonly VERSION = "1.0.0";
	private readonly PATHS = {
		MANIFEST: "manifest.json",
		ACCOUNT: "account.json",
		PROJECTS: "projects.json",
		PROJECTS_DIR: "projects",
		DOCUMENTS_DIR: "documents",
		FILES_DIR: "files",
		FILES_METADATA: "metadata.json",
	} as const;

	createManifest(mode: "backup" | "export" | "import"): UnifiedManifest {
		return {
			version: this.VERSION,
			lastSync: Date.now(),
			mode,
		};
	}

	getProjectPath(projectId: string): string {
		return `${this.PATHS.PROJECTS_DIR}/${projectId}`;
	}

	getProjectMetadataPath(projectId: string): string {
		return `${this.getProjectPath(projectId)}/metadata.json`;
	}

	getDocumentsPath(projectId: string): string {
		return `${this.getProjectPath(projectId)}/${this.PATHS.DOCUMENTS_DIR}`;
	}

	getDocumentYjsPath(projectId: string, docId: string): string {
		return `${this.getDocumentsPath(projectId)}/${docId}.yjs`;
	}

	getDocumentContentPath(projectId: string, docId: string): string {
		return `${this.getDocumentsPath(projectId)}/${docId}.txt`;
	}

	getFilesPath(projectId: string): string {
		return `${this.getProjectPath(projectId)}/${this.PATHS.FILES_DIR}`;
	}

	getFilesMetadataPath(projectId: string): string {
		return `${this.getFilesPath(projectId)}/${this.PATHS.FILES_METADATA}`;
	}

	getFileContentPath(projectId: string, relativePath: string): string {
		return `${this.getFilesPath(projectId)}/${relativePath}`;
	}

	convertProjectToMetadata(
		project: Project,
		mode: "backup" | "export",
	): ProjectMetadata {
		const metadata: ProjectMetadata = {
			id: project.id,
			name: project.name,
			description: project.description,
			docUrl: project.docUrl,
			createdAt: project.createdAt,
			updatedAt: project.updatedAt,
			ownerId: project.ownerId,
			tags: project.tags,
			isFavorite: project.isFavorite,
		};

		if (mode === "backup") {
			metadata.lastSync = Date.now();
		} else {
			metadata.exportedAt = Date.now();
		}

		return metadata;
	}

	convertMetadataToProject(metadata: ProjectMetadata): Project {
		return {
			id: metadata.id,
			name: metadata.name,
			description: metadata.description,
			docUrl: metadata.docUrl,
			createdAt: metadata.createdAt,
			updatedAt: metadata.updatedAt,
			ownerId: metadata.ownerId,
			tags: metadata.tags,
			isFavorite: metadata.isFavorite,
		};
	}

	convertFileToMetadata(file: FileNode): FileMetadata {
		return {
			id: file.id,
			name: file.name,
			path: file.path,
			type: file.type,
			lastModified: file.lastModified,
			size: file.size,
			mimeType: file.mimeType,
			isBinary: file.isBinary,
			documentId: file.documentId,
		};
	}

	validateStructure(data: Partial<DataStructureService>): boolean {
		return !!(
			data.manifest?.version &&
			data.account?.id &&
			data.projects &&
			Array.isArray(data.projects)
		);
	}

	getPaths() {
		return this.PATHS;
	}
}
