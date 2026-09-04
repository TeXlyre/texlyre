// src/types/files.ts
export interface FileNode {
	id: string;
	name: string;
	path: string;
	type: 'file' | 'directory';
	content?: string | ArrayBuffer;
	children?: FileNode[];
	documentId?: string;
	isBinary?: boolean;
	mimeType?: string;
	createdAt?: number;
	lastModified: number;
	size?: number;
	isDeleted?: boolean;
	excludeFromSync?: boolean;
	launchHandle?: FileSystemFileHandle;
}

export interface DirectorySummary {
	files: number;
	directories: number;
	size: number;
}

export interface FilePropertiesInfo {
	name: string;
	path: string;
	type: string;
	size?: number;
	mimeType?: string;
	isBinary: boolean;
	documentId?: string;
	createdAt?: number;
	lastModified?: number;
	lineCount?: number;
	characterCount?: number;
	directorySummary?: DirectorySummary;
}

export interface FilePathCache {
	files: FileNode[];
	imageFiles: string[];
	videoFiles: string[];
	audioFiles: string[];
	bibFiles: string[];
	texFiles: string[];
	typstFiles: string[];
	allFiles: string[];
	lastUpdate: number;
}

export interface FileTreeContextType {
	fileTree: FileNode[];
	selectedFileId: string | null;
	isLoading: boolean;
	selectFile: (fileId: string | null) => void;
	uploadFiles: (
		files: FileList | File[],
		currentPath: string,
		targetDirectoryId?: string,
	) => Promise<void>;
	createDirectory: (name: string, path: string) => Promise<void>;
	deleteFileOrDirectory: (id: string) => Promise<void>;
	linkFileToDocument: (fileId: string, documentId?: string) => Promise<void>;
	unlinkFileFromDocument: (fileId: string) => Promise<void>;
	getFileContent: (fileId: string) => Promise<string | ArrayBuffer | undefined>;
	getFile: (fileId: string) => Promise<FileNode | undefined>;
	renameFile: (fileId: string, newFullPath: string) => Promise<string>;
	updateFileContent: (fileId: string, content: string) => Promise<void>;
	refreshFileTree: () => Promise<FileNode[]>;
	moveFileOrDirectory: (sourceId: string, targetPath: string) => Promise<void>;
	extractArchiveFile: (zipFile: File, targetPath: string) => Promise<void>;
	storeZipFile: (zipFile: File, targetPath: string) => Promise<void>;
	enableFileSystemDragDrop: boolean;
	enableInternalDragDrop: boolean;
	batchDeleteFiles: (fileIds: string[]) => Promise<void>;
	batchMoveFiles: (
		moveOperations: Array<{
			fileId: string;
			targetPath: string;
			newName?: string;
		}>,
	) => Promise<string[]>;
	batchUnlinkFiles: (fileIds: string[]) => Promise<void>;
	clearSelectedFile: () => void;
}
