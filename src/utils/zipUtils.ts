// src/utils/zipUtils.ts
import JSZip from 'jszip';
import { nanoid } from 'nanoid';

import type { FileNode } from '../types/files';
import { fileCommentProcessor } from './fileCommentProcessor';
import {
	getMimeType,
	getParentPath,
	isBinaryFile,
	joinPaths,
} from './fileUtils';

export const extractZip = async (
	zipFile: File,
	currentPath: string,
): Promise<FileNode[]> => {
	const zip = new JSZip();
	const content = await zipFile.arrayBuffer();
	const zipContents = await zip.loadAsync(content);
	const files: FileNode[] = [];

	const processPromises = Object.keys(zipContents.files).map(
		async (relativePath) => {
			const zipEntry = zipContents.files[relativePath];

			if (zipEntry.dir) return;

			const fullPath = joinPaths(currentPath, relativePath);
			const parentDir = getParentPath(fullPath);

			let currentDir = '';
			const pathSegments = parentDir.split('/').filter((segment) => segment);
			for (const segment of pathSegments) {
				if (!segment) continue;

				currentDir =
					currentDir === '' ? `/${segment}` : `${currentDir}/${segment}`;

				if (
					!files.some((f) => f.path === currentDir && f.type === 'directory')
				) {
					files.push({
						id: nanoid(),
						name: segment,
						path: currentDir,
						type: 'directory',
						lastModified: Date.now(),
					});
				}
			}

			const fileContent = await zipEntry.async('arraybuffer');
			const fileName = relativePath.split('/').pop() || '';
			const fileMimeType = getMimeType(fileName);
			const fileBinary = isBinaryFile(fileName);

			files.push({
				id: nanoid(),
				name: fileName,
				path: fullPath,
				type: 'file',
				content: fileContent,
				lastModified: Date.now(),
				size: fileContent.byteLength,
				mimeType: fileMimeType,
				isBinary: fileBinary,
			});
		},
	);

	await Promise.all(processPromises);
	return files;
};

export const batchExtractZip = async (
	zipFile: File,
	currentPath: string,
): Promise<{ files: FileNode[]; directories: FileNode[] }> => {
	const files = await extractZip(zipFile, currentPath);
	return {
		files: files.filter((f) => f.type === 'file'),
		directories: files.filter((f) => f.type === 'directory'),
	};
};

export const createZipFromFolder = async (
	folderNode: FileNode,
	getFileContent: (fileId: string) => Promise<string | ArrayBuffer | null>,
	_getFile: (fileId: string) => Promise<FileNode | null>,
): Promise<Blob> => {
	const zip = new JSZip();

	const collectFiles = async (node: FileNode, basePath = ''): Promise<void> => {
		if (node.type === 'file') {
			const content = await getFileContent(node.id);
			if (content !== null) {
				const cleanContent = fileCommentProcessor.cleanContent(content);
				const relativePath = basePath ? `${basePath}/${node.name}` : node.name;

				if (node.isBinary && cleanContent instanceof ArrayBuffer) {
					zip.file(relativePath, cleanContent);
				} else {
					const textContent =
						typeof cleanContent === 'string'
							? cleanContent
							: new TextDecoder().decode(cleanContent);
					zip.file(relativePath, textContent);
				}
			}
		} else if (node.type === 'directory' && node.children) {
			const currentPath = basePath ? `${basePath}/${node.name}` : node.name;

			for (const child of node.children) {
				await collectFiles(child, currentPath);
			}
		}
	};

	if (folderNode.children) {
		for (const child of folderNode.children) {
			await collectFiles(child);
		}
	}

	return await zip.generateAsync({ type: 'blob' });
};

export const downloadZipFile = (blob: Blob, filename: string): void => {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename.endsWith('.zip') ? filename : `${filename}.zip`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
};
