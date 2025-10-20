// src/utils/fileCommentProcessor.ts
import type { FileNode } from '../types/files.ts';

interface ProcessorStats {
	total: number;
	cleaned: number;
	skipped: number;
}

interface ProcessorOptions {
	preserveContent?: boolean;
	inPlace?: boolean;
}

class FileCommentProcessor {
	private readonly COMMENT_DETECTION_REGEX = /<###(?:\s|%)*comment(?:\s|%)*id:/;

	hasComments(content: string | ArrayBuffer): boolean {
		if (content instanceof ArrayBuffer) {
			return this.hasBinaryComments(content);
		}
		return this.COMMENT_DETECTION_REGEX.test(content);
	}

	private hasBinaryComments(buffer: ArrayBuffer): boolean {
		const view = new Uint8Array(buffer);
		const backtick = 0x60;
		const openMarker = new TextEncoder().encode('<###');
		const commentMarker = new TextEncoder().encode('comment');
		const idMarker = new TextEncoder().encode('id:');
		const whitespaceChars = [0x20, 0x09, 0x0A, 0x0D];

		for (let i = 0; i <= view.length - openMarker.length; i++) {
			let pos = i;

			if (view[pos] === backtick) {
				pos++;
			}

			let match = true;
			for (let j = 0; j < openMarker.length; j++) {
				if (pos + j >= view.length || view[pos + j] !== openMarker[j]) {
					match = false;
					break;
				}
			}

			if (!match) continue;

			pos += openMarker.length;

			while (pos < view.length && whitespaceChars.includes(view[pos])) {
				pos++;
			}

			match = true;
			for (let j = 0; j < commentMarker.length; j++) {
				if (pos + j >= view.length || view[pos + j] !== commentMarker[j]) {
					match = false;
					break;
				}
			}

			if (!match) continue;
			pos += commentMarker.length;

			while (pos < view.length && whitespaceChars.includes(view[pos])) {
				pos++;
			}

			match = true;
			for (let j = 0; j < idMarker.length; j++) {
				if (pos + j >= view.length || view[pos + j] !== idMarker[j]) {
					match = false;
					break;
				}
			}

			if (match) return true;
		}

		return false;
	}

	cleanText(text: string): string {
		if (!this.hasComments(text)) {
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

			const backtickBefore = openTagStart > 0 &&
				cleanedText[openTagStart - 1] === '`';

			const openTagEnd = cleanedText.indexOf('###>', openTagStart);
			if (openTagEnd === -1) break;

			const backtickAfter = openTagEnd + 4 < cleanedText.length &&
				cleanedText[openTagEnd + 4] === '`';

			const closeTagRegex = new RegExp(`<\\/###(?:\\s|%)*comment(?:\\s|%)*id:(?:\\s|%)*${id}(?:\\s|%)*###>`, 'g');
			closeTagRegex.lastIndex = openTagEnd + 4;
			const closeMatch = closeTagRegex.exec(cleanedText);

			if (!closeMatch) {
				break;
			}

			const closeTagStart = closeMatch.index;
			const closeTagEnd = closeTagStart + closeMatch[0].length;

			const commentedTextStart = openTagEnd + 4 + (backtickAfter ? 1 : 0);
			const commentedTextEnd = closeTagStart - (backtickBefore &&
				cleanedText[closeTagStart - 1] === '`' ? 1 : 0);
			const commentedText = cleanedText.substring(
				commentedTextStart,
				commentedTextEnd,
			);

			const actualOpenTagStart = backtickBefore ? openTagStart - 1 : openTagStart;
			const actualCloseTagEnd = (backtickAfter && closeTagEnd < cleanedText.length &&
				cleanedText[closeTagEnd] === '`') ? closeTagEnd + 1 : closeTagEnd;

			cleanedText =
				cleanedText.substring(0, actualOpenTagStart) +
				commentedText +
				cleanedText.substring(actualCloseTagEnd);

			foundComments = true;
		}

		return cleanedText;
	}

	cleanContent(content: string | ArrayBuffer): string | ArrayBuffer {
		if (content instanceof ArrayBuffer) {
			const textContent = new TextDecoder().decode(content);
			if (!this.hasComments(textContent)) {
				return content;
			}
			const cleanedText = this.cleanText(textContent);
			return new TextEncoder().encode(cleanedText).buffer;
		}

		return this.cleanText(content);
	}

	processFile(fileNode: FileNode, options: ProcessorOptions = {}): FileNode {
		if (fileNode.type === 'directory' || fileNode.isBinary) {
			return fileNode;
		}

		if (!fileNode.content) {
			return fileNode;
		}

		if (!this.hasComments(fileNode.content)) {
			return fileNode;
		}

		const processedNode = options.inPlace ? fileNode : { ...fileNode };
		processedNode.content = this.cleanContent(fileNode.content);

		return processedNode;
	}

	processFiles(
		fileNodes: FileNode[],
		options: ProcessorOptions = {},
	): FileNode[] {
		return fileNodes.map((node) => this.processFile(node, options));
	}

	processFilesWithStats(
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

			if (this.hasComments(node.content)) {
				stats.cleaned++;
				return this.processFile(node, options);
			}
			stats.skipped++;
			return node;
		});

		return { processed, stats };
	}

	processTextSelection(text: string): string {
		return this.cleanText(text);
	}
}

export const fileCommentProcessor = new FileCommentProcessor();
