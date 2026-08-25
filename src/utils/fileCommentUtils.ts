// src/utils/fileCommentUtils.ts
import type { FileNode } from '../types/files';
import {
	hasAnnotationTags,
	stripAnnotationTagTokens,
	stripAnnotationTags,
} from './annotationTagUtils';

export interface ProcessorStats {
	total: number;
	cleaned: number;
	skipped: number;
}

export interface ProcessorOptions {
	preserveContent?: boolean;
	inPlace?: boolean;
}

export function hasComments(content: string | ArrayBuffer): boolean {
	return hasAnnotationTags(content);
}

export function cleanText(text: string): string {
	return stripAnnotationTags(text);
}

export function cleanContent(
	content: string | ArrayBuffer,
): string | ArrayBuffer {
	if (typeof content !== 'string') {
		const buffer = content as ArrayBuffer;
		const textContent = new TextDecoder().decode(buffer);
		if (!hasComments(textContent)) {
			return buffer;
		}
		const cleanedText = cleanText(textContent);
		return new TextEncoder().encode(cleanedText).buffer;
	}

	return cleanText(content);
}

export function cleanBytes(
	content: string | ArrayBuffer | Uint8Array,
): Uint8Array {
	if (typeof content === 'string') {
		return new TextEncoder().encode(cleanText(content));
	}

	const bytes =
		content instanceof Uint8Array ? content : new Uint8Array(content);
	const text = new TextDecoder().decode(bytes);
	if (!hasComments(text)) {
		return bytes;
	}

	return new TextEncoder().encode(cleanText(text));
}

export function processFile(
	fileNode: FileNode,
	options: ProcessorOptions = {},
): FileNode {
	if (fileNode.type === 'directory' || fileNode.isBinary) {
		return fileNode;
	}

	if (!fileNode.content) {
		return fileNode;
	}

	if (!hasComments(fileNode.content)) {
		return fileNode;
	}

	const processedNode = options.inPlace ? fileNode : { ...fileNode };
	processedNode.content = cleanContent(fileNode.content);

	return processedNode;
}

export function processFiles(
	fileNodes: FileNode[],
	options: ProcessorOptions = {},
): FileNode[] {
	return fileNodes.map((node) => processFile(node, options));
}

export function processFilesWithStats(
	fileNodes: FileNode[],
	options: ProcessorOptions = {},
): {
	processed: FileNode[];
	stats: ProcessorStats;
} {
	const stats: ProcessorStats = {
		total: fileNodes.length,
		cleaned: 0,
		skipped: 0,
	};

	const processed = fileNodes.map((node) => {
		if (node.type === 'directory' || node.isBinary || !node.content) {
			stats.skipped++;
			return node;
		}

		if (hasComments(node.content)) {
			stats.cleaned++;
			return processFile(node, options);
		}
		stats.skipped++;
		return node;
	});

	return { processed, stats };
}

export function processTextSelection(text: string): string {
	return stripAnnotationTagTokens(text);
}
