// src/types/files.ts
export interface FileNode {
	id: string;
	name: string;
	path: string;
	type: "file" | "directory";
	content?: string | ArrayBuffer;
	children?: FileNode[];
	documentId?: string;
	isBinary?: boolean;
	mimeType?: string;
	lastModified: number;
	size?: number;
	isDeleted?: boolean;
	excludeFromSync?: boolean;
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
	extractZipFile: (zipFile: File, targetPath: string) => Promise<void>;
	storeZipFile: (zipFile: File, targetPath: string) => Promise<void>;
	enableFileSystemDragDrop: boolean;
	enableInternalDragDrop: boolean;
	batchDeleteFiles: (fileIds: string[]) => Promise<void>;
	batchMoveFiles: (
		moveOperations: Array<{ fileId: string; targetPath: string }>,
	) => Promise<string[]>;
	batchUnlinkFiles: (fileIds: string[]) => Promise<void>;
}
