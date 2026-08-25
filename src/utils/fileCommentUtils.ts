// src/utils/fileCommentUtils.ts
import type { FileNode } from '../types/files';
import {
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

const COMMENT_DETECTION_REGEX = /<###(?:\s|%)*comment(?:\s|%)*id:/;
const COMMENT_OPEN_MARKER = new TextEncoder().encode('<###');
const COMMENT_WORD_MARKER = new TextEncoder().encode('comment');
const COMMENT_ID_MARKER = new TextEncoder().encode('id:');

function hasBinaryComments(view: Uint8Array): boolean {
	const backtick = 0x60;
	const percent = 0x25;
	const whitespaceChars = [0x20, 0x09, 0x0a, 0x0d];

	const isSeparator = (byte: number) =>
		whitespaceChars.includes(byte) || byte === percent;

	const matchAt = (pos: number, marker: Uint8Array): boolean => {
		if (pos + marker.length > view.length) return false;
		for (let j = 0; j < marker.length; j++) {
			if (view[pos + j] !== marker[j]) return false;
		}
		return true;
	};

	const skipSeparators = (pos: number): number => {
		while (pos < view.length && isSeparator(view[pos])) pos++;
		return pos;
	};

	for (let i = 0; i < view.length; i++) {
		let pos = i;
		if (view[pos] === backtick) pos++;

		if (!matchAt(pos, COMMENT_OPEN_MARKER)) continue;
		pos += COMMENT_OPEN_MARKER.length;

		pos = skipSeparators(pos);
		if (!matchAt(pos, COMMENT_WORD_MARKER)) continue;
		pos += COMMENT_WORD_MARKER.length;

		pos = skipSeparators(pos);
		if (matchAt(pos, COMMENT_ID_MARKER)) return true;
	}

	return false;
}

export function hasComments(content: string | ArrayBuffer): boolean {
	if (typeof content !== 'string') {
		return hasBinaryComments(new Uint8Array(content as ArrayBuffer));
	}
	return COMMENT_DETECTION_REGEX.test(content);
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
	if (!hasBinaryComments(bytes)) {
		return bytes;
	}

	return new TextEncoder().encode(cleanText(new TextDecoder().decode(bytes)));
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
