// src/utils/fileCommentUtils.ts
import type { FileNode } from '../types/files';

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

function hasBinaryComments(buffer: ArrayBuffer): boolean {
	const view = new Uint8Array(buffer);
	const backtick = 0x60;
	const percent = 0x25;
	const openMarker = new TextEncoder().encode('<###');
	const commentMarker = new TextEncoder().encode('comment');
	const idMarker = new TextEncoder().encode('id:');
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

		if (!matchAt(pos, openMarker)) continue;
		pos += openMarker.length;

		pos = skipSeparators(pos);
		if (!matchAt(pos, commentMarker)) continue;
		pos += commentMarker.length;

		pos = skipSeparators(pos);
		if (matchAt(pos, idMarker)) return true;
	}

	return false;
}

export function hasComments(content: string | ArrayBuffer): boolean {
	if (typeof content !== 'string') {
		return hasBinaryComments(content as ArrayBuffer);
	}
	return COMMENT_DETECTION_REGEX.test(content);
}

export function cleanText(text: string): string {
	if (!hasComments(text)) {
		return text;
	}

	let cleanedText = text;
	let foundComments = true;

	const openTagRegex = /<###(?:\s|%)*comment(?:\s|%)*id:(?:\s|%)*(\w[\w-]*)/g;

	while (foundComments) {
		foundComments = false;

		openTagRegex.lastIndex = 0;
		const openMatch = openTagRegex.exec(cleanedText);

		if (!openMatch) break;

		const openTagStart = openMatch.index;
		const id = openMatch[1];

		const backtickBefore =
			openTagStart > 0 && cleanedText[openTagStart - 1] === '`';

		const openTagEnd = cleanedText.indexOf('###>', openTagStart);
		if (openTagEnd === -1) break;

		const backtickAfter =
			openTagEnd + 4 < cleanedText.length &&
			cleanedText[openTagEnd + 4] === '`';

		const closeTagRegex = new RegExp(
			`<\\/###(?:\\s|%)*comment(?:\\s|%)*id:(?:\\s|%)*${id}(?:\\s|%)*###>`,
			'g',
		);
		closeTagRegex.lastIndex = openTagEnd + 4;
		const closeMatch = closeTagRegex.exec(cleanedText);

		if (!closeMatch) {
			break;
		}

		const closeTagStart = closeMatch.index;
		const closeTagEnd = closeTagStart + closeMatch[0].length;

		const commentedTextStart = openTagEnd + 4 + (backtickAfter ? 1 : 0);
		const commentedTextEnd =
			closeTagStart -
			(backtickBefore && cleanedText[closeTagStart - 1] === '`' ? 1 : 0);
		const commentedText = cleanedText.substring(
			commentedTextStart,
			commentedTextEnd,
		);

		const actualOpenTagStart = backtickBefore ? openTagStart - 1 : openTagStart;
		const actualCloseTagEnd =
			backtickAfter &&
			closeTagEnd < cleanedText.length &&
			cleanedText[closeTagEnd] === '`'
				? closeTagEnd + 1
				: closeTagEnd;

		cleanedText =
			cleanedText.substring(0, actualOpenTagStart) +
			commentedText +
			cleanedText.substring(actualCloseTagEnd);

		foundComments = true;
	}

	return cleanedText;
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
	return cleanText(text);
}
