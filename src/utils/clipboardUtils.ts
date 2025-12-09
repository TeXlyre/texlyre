// src/utils/clipboardUtils.ts
import { nanoid } from 'nanoid';

import type { FileNode } from '../types/files';
import { fileStorageService } from '../services/FileStorageService';
import { isLatexFile, getFileExtension, getRelativePath } from './fileUtils.ts';
import { processTextSelection } from './fileCommentUtils.ts';


export const uploadPastedFile = async (
	blob: Blob,
	currentFileId?: string
): Promise<string> => {
	const timestamp = Date.now();
	const ext = getFileExtension(blob.type);
	const filename = `pasted_${timestamp}.${ext}`;
	const uploadPath = `/images/${filename}`;

	try {
		await fileStorageService.createDirectoryPath('/images/placeholder.txt');

		const fileNode: FileNode = {
			id: nanoid(),
			name: filename,
			path: uploadPath,
			type: 'file',
			content: await blob.arrayBuffer(),
			lastModified: Date.now(),
			size: blob.size,
			mimeType: blob.type,
			isBinary: true
		};

		await fileStorageService.storeFile(fileNode, { showConflictDialog: false });
		document.dispatchEvent(new CustomEvent('refresh-file-tree'));

		if (currentFileId) {
			const currentFile = await fileStorageService.getFile(currentFileId);

			if (currentFile) {
				const relativePath = getRelativePath(currentFile.path, uploadPath);
				// We only need this special check for LaTeX due to the flattening of dir structure
				const isLatex = isLatexFile(currentFile.path);
				if (isLatex) {
					if (relativePath.startsWith('../')) {
						return uploadPath.startsWith('/') ? uploadPath.slice(1) : uploadPath;
					} else {
						return relativePath;
					}
				} else {
					return relativePath;
				}

			}
		}

		return uploadPath;
	} catch (error) {
		console.error('Error uploading pasted file:', error);
		throw error;
	}
}

export const copyCleanTextToClipboard = async (text: string): Promise<void> => {
	try {
		const cleanedText = processTextSelection(text);
		await navigator.clipboard.writeText(cleanedText);
	} catch (error) {
		console.error('Failed to copy to clipboard:', error);

		// Fallback for older browsers
		const textArea = document.createElement('textarea');
		textArea.value = processTextSelection(text);
		document.body.appendChild(textArea);
		textArea.select();
		try {
			document.execCommand('copy');
		} catch (fallbackError) {
			console.error('Fallback copy failed:', fallbackError);
		}
		document.body.removeChild(textArea);
	}
};
