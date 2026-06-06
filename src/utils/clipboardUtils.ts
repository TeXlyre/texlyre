// src/utils/clipboardUtils.ts
import { nanoid } from 'nanoid';

import type { FileNode } from '../types/files';
import { fileStorageService } from '../services/FileStorageService';
import { isLatexFile, getFileExtension, getRelativePath } from './fileUtils.ts';
import { processTextSelection } from './fileCommentUtils.ts';

const UPLOADABLE_CLIPBOARD_TYPES = [
	'image/png',
	'image/jpeg',
	'image/gif',
	'image/webp',
	'application/pdf',
];

export async function readClipboardBlob(): Promise<Blob | null> {
	if (!navigator.clipboard?.read) return null;

	try {
		const items = await navigator.clipboard.read();
		for (const item of items) {
			const type = UPLOADABLE_CLIPBOARD_TYPES.find((candidate) =>
				item.types.includes(candidate),
			);
			if (type) return await item.getType(type);
		}
	} catch (error) {
		console.error('Failed to read clipboard:', error);
	}

	return null;
}

export async function uploadPastedFile(
	blob: Blob,
	currentFileId?: string,
): Promise<string> {
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
			isBinary: true,
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
						return uploadPath.startsWith('/')
							? uploadPath.slice(1)
							: uploadPath;
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

export async function copyCleanTextToClipboard(text: string): Promise<void> {
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
}

export function dataUrlToBlob(dataUrl: string): Blob | null {
	const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl.trim());
	if (!match) return null;

	const mimeType = match[1] || 'application/octet-stream';
	const isBase64 = !!match[2];
	const data = match[3];

	try {
		if (isBase64) {
			const binary = atob(data);
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
			return new Blob([bytes], { type: mimeType });
		}
		return new Blob([decodeURIComponent(data)], { type: mimeType });
	} catch (error) {
		console.error('Failed to decode data URL:', error);
		return null;
	}
}

export function extractUploadableBlob(event: ClipboardEvent): Blob | null {
	const clipboardData = event.clipboardData;
	if (!clipboardData) return null;

	const items = Array.from(clipboardData.items);
	const fileItem = items.find(
		(item) =>
			item.kind === 'file' &&
			(item.type.startsWith('image/') || item.type === 'application/pdf'),
	);

	if (fileItem) {
		const blob = fileItem.getAsFile();
		if (blob) return blob;
	}

	const html = clipboardData.getData('text/html');
	if (html) {
		const src = /<img\b[^>]*\bsrc=["']([^"']+)["']/i.exec(html)?.[1];
		if (src?.startsWith('data:')) return dataUrlToBlob(src);
	}

	const uriList = clipboardData.getData('text/uri-list');
	console.log('[paste] uri-list raw:', JSON.stringify(uriList)); // <-- temporary
	if (uriList) {
		const uri = uriList
			.split('\n')
			.map((line) => line.trim())
			.find((line) => line && !line.startsWith('#'));
		console.log('[paste] uri-list first:', JSON.stringify(uri)); // <-- temporary
		if (uri?.startsWith('data:')) return dataUrlToBlob(uri);
	}

	const text = clipboardData.getData('text/plain').trim();
	const dataUrlMatch = /data:image\/[^\s)"']+/.exec(text)?.[0];
	if (dataUrlMatch) return dataUrlToBlob(dataUrlMatch);

	return null;
}
