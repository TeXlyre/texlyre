// src/services/FileCommentProcessor.ts
import type { FileNode } from "../types/files";

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
	private readonly COMMENT_DETECTION_REGEX = /<### comment id:/;

	hasComments(content: string | ArrayBuffer): boolean {
		if (content instanceof ArrayBuffer) {
			return this.hasBinaryComments(content);
		}
		return this.COMMENT_DETECTION_REGEX.test(content);
	}

	private hasBinaryComments(buffer: ArrayBuffer): boolean {
		const view = new Uint8Array(buffer);
		const marker = new TextEncoder().encode("<### comment id:");

		for (let i = 0; i <= view.length - marker.length; i++) {
			let found = true;
			for (let j = 0; j < marker.length; j++) {
				if (view[i + j] !== marker[j]) {
					found = false;
					break;
				}
			}
			if (found) return true;
		}
		return false;
	}

	cleanText(text: string): string {
		if (!this.hasComments(text)) {
			return text;
		}

		// Use the same manual parsing approach as CommentService to handle nested comments
		let cleanedText = text;
		let foundComments = true;

		// Keep processing until no more comments are found (handles nested comments)
		while (foundComments) {
			foundComments = false;
			let searchStart = 0;

			while (searchStart < cleanedText.length) {
				const openTagStart = cleanedText.indexOf(
					"<### comment id:",
					searchStart,
				);
				if (openTagStart === -1) break;

				const openTagEnd = cleanedText.indexOf("###>", openTagStart);
				if (openTagEnd === -1) break;

				const openTagContent = cleanedText.substring(
					openTagStart,
					openTagEnd + 4,
				);

				// Extract comment ID from the opening tag
				const idMatch = openTagContent.match(/id:\s*([\w-]+)/);
				if (!idMatch) {
					searchStart = openTagEnd + 4;
					continue;
				}

				const id = idMatch[1];
				const closeTagPattern = `</### comment id: ${id}`;
				const closeTagStart = cleanedText.indexOf(
					closeTagPattern,
					openTagEnd + 4,
				);

				if (closeTagStart === -1) {
					searchStart = openTagEnd + 4;
					continue;
				}

				const closeTagEnd = cleanedText.indexOf("###>", closeTagStart) + 4;
				if (closeTagEnd < closeTagStart) {
					searchStart = openTagEnd + 4;
					continue;
				}

				// Extract the commented text (content between tags)
				const commentedText = cleanedText.substring(
					openTagEnd + 4,
					closeTagStart,
				);

				// Replace the entire comment structure with just the commented text
				cleanedText =
					cleanedText.substring(0, openTagStart) +
					commentedText +
					cleanedText.substring(closeTagEnd);

				foundComments = true;
				// Start the next search from the beginning since positions have changed
				break;
			}
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
		if (fileNode.type === "directory" || fileNode.isBinary) {
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
			if (node.type === "directory" || node.isBinary || !node.content) {
				stats.skipped++;
				return node;
			}

			if (this.hasComments(node.content)) {
				stats.cleaned++;
				return this.processFile(node, options);
			} else {
				stats.skipped++;
				return node;
			}
		});

		return { processed, stats };
	}

	processTextSelection(text: string): string {
		return this.cleanText(text);
	}
}

export const fileCommentProcessor = new FileCommentProcessor();
