// src/extensions/codemirror/autocomplete/FilePathCompletionHandler.ts
import type {
	Completion,
	CompletionContext,
	CompletionResult,
} from '@codemirror/autocomplete';
import type { EditorView } from '@codemirror/view';

import type { FilePathCache } from '../../../types/files';
import {
	isLatexFile,
	isMarkdownFile,
	isTypstFile,
} from '../../../utils/fileUtils';
import { filePathCacheField } from '../PathAndBibAutocompleteExtension';
import {
	latexCommandPatterns,
	markdownCommandPatterns,
	typstCommandPatterns,
} from './patterns';

type PathFileType =
	| 'images'
	| 'videos'
	| 'audios'
	| 'tex'
	| 'typst'
	| 'bib'
	| 'data'
	| 'all';

type CommandPattern = {
	commands: readonly string[];
	pattern: RegExp;
	fileTypes: PathFileType;
	pathGroup?: number;
};

type PathMatch = {
	partialPath: string;
	from: number;
	fileTypes: PathFileType;
};

export class FilePathCompletionHandler {
	getCompletions(
		context: CompletionContext,
		currentFilePath: string,
	): CompletionResult | null {
		const match = this.findPathMatch(context, currentFilePath);
		if (!match) return null;

		const cache = context.state.field(filePathCacheField, false);
		if (!cache) return null;

		const candidatePaths = this.getCandidatePaths(cache, match.fileTypes);
		const options = this.createPathOptions(
			candidatePaths,
			currentFilePath,
			match.partialPath,
		);

		if (options.length === 0) return null;

		return {
			from: match.from,
			options,
			validFor: this.getValidFor(currentFilePath),
		};
	}

	private findPathMatch(
		context: CompletionContext,
		currentFilePath: string,
	): PathMatch | null {
		const patterns = this.getCommandPatternsForFile(currentFilePath);
		if (patterns.length === 0) return null;

		const line = context.state.doc.lineAt(context.pos);
		const lineText = line.text;
		const posInLine = context.pos - line.from;
		const textBeforeCursor = lineText.substring(0, posInLine);

		for (const patternConfig of patterns) {
			const match = this.matchCommandPattern(textBeforeCursor, patternConfig);
			if (!match) continue;

			const { partialPath, fromInLine } = match;

			if (
				isMarkdownFile(currentFilePath) &&
				this.shouldIgnoreMarkdownPathTarget(partialPath)
			) {
				return null;
			}

			return {
				partialPath,
				from: line.from + fromInLine,
				fileTypes: patternConfig.fileTypes,
			};
		}

		return null;
	}

	private getCommandPatternsForFile(
		currentFilePath: string,
	): readonly CommandPattern[] {
		if (isLatexFile(currentFilePath)) return latexCommandPatterns;
		if (isTypstFile(currentFilePath)) return typstCommandPatterns;
		if (isMarkdownFile(currentFilePath)) return markdownCommandPatterns;
		return [];
	}

	private matchCommandPattern(
		textBeforeCursor: string,
		patternConfig: CommandPattern,
	): { partialPath: string; fromInLine: number } | null {
		const { pattern, pathGroup } = patternConfig;
		const matches = Array.from(
			textBeforeCursor.matchAll(this.toGlobalRegExp(pattern)),
		);

		if (matches.length === 0) return null;

		for (let i = matches.length - 1; i >= 0; i--) {
			const match = matches[i];
			if (match.index === undefined) continue;

			if (pathGroup !== undefined) {
				const partialPath = match[pathGroup] ?? '';

				const groupStart = this.getCaptureGroupStart(
					textBeforeCursor,
					match,
					pathGroup,
				);

				if (groupStart === -1) continue;

				if (groupStart + partialPath.length !== textBeforeCursor.length) {
					continue;
				}

				return {
					partialPath,
					fromInLine: groupStart,
				};
			}

			// Typst command patterns intentionally stop at the opening quote.
			// Everything after the matched prefix up to the cursor is the partial path.
			const fromInLine = match.index + match[0].length;
			const partialPath = textBeforeCursor.substring(fromInLine);

			return {
				partialPath,
				fromInLine,
			};
		}

		return null;
	}

	private getCaptureGroupStart(
		text: string,
		match: RegExpMatchArray,
		groupIndex: number,
	): number {
		const fullMatch = match[0];
		const capturedValue = match[groupIndex];

		if (
			match.index === undefined ||
			capturedValue === undefined ||
			capturedValue === null
		) {
			return -1;
		}

		const offsetInsideMatch = fullMatch.lastIndexOf(capturedValue);
		if (offsetInsideMatch === -1) return -1;

		return match.index + offsetInsideMatch;
	}

	private toGlobalRegExp(pattern: RegExp): RegExp {
		const flags = pattern.flags.includes('g')
			? pattern.flags
			: `${pattern.flags}g`;

		return new RegExp(pattern.source, flags);
	}

	private shouldIgnoreMarkdownPathTarget(partialPath: string): boolean {
		if (partialPath.startsWith('#')) return true;

		return /^(https?:|mailto:|tel:|ftp:|data:)/i.test(partialPath);
	}

	private getCandidatePaths(
		cache: FilePathCache,
		fileTypes: PathFileType,
	): string[] {
		switch (fileTypes) {
			case 'images':
				return cache.imageFiles;

			case 'videos':
				return cache.videoFiles;

			case 'audios':
				return cache.audioFiles;

			case 'tex':
				return cache.texFiles;

			case 'typst':
				return cache.typstFiles;

			case 'bib':
				return cache.bibFiles;

			case 'data':
				return cache.allFiles.filter((path) => this.isDataFile(path));

			case 'all':
			default:
				return cache.allFiles;
		}
	}

	private isDataFile(path: string): boolean {
		const extension = path.split('.').pop()?.toLowerCase();

		return (
			extension === 'csv' ||
			extension === 'json' ||
			extension === 'yaml' ||
			extension === 'yml' ||
			extension === 'toml' ||
			extension === 'xml' ||
			extension === 'cbor'
		);
	}

	private createPathOptions(
		paths: string[],
		currentFilePath: string,
		partialPath: string,
	): Completion[] {
		const normalizedPartial = partialPath.toLowerCase();

		return paths
			.map((path) => {
				const relativePath = this.getRelativePath(currentFilePath, path);
				const fileName = path.substring(path.lastIndexOf('/') + 1);

				return {
					path,
					relativePath,
					fileName,
				};
			})
			.filter(({ path, relativePath, fileName }) => {
				if (!partialPath) return true;

				const lowerPath = path.toLowerCase();
				const lowerRelativePath = relativePath.toLowerCase();
				const lowerFileName = fileName.toLowerCase();

				return (
					lowerRelativePath.includes(normalizedPartial) ||
					lowerFileName.includes(normalizedPartial) ||
					lowerPath.includes(normalizedPartial)
				);
			})
			.sort((a, b) => {
				const aScore = this.getPathScore(
					a.relativePath,
					a.fileName,
					partialPath,
				);
				const bScore = this.getPathScore(
					b.relativePath,
					b.fileName,
					partialPath,
				);

				if (aScore !== bScore) return bScore - aScore;

				return a.relativePath.localeCompare(b.relativePath);
			})
			.slice(0, 30)
			.map(({ path, relativePath, fileName }) => {
				return {
					label: relativePath,
					detail: fileName,
					info: path,
					apply: (
						view: EditorView,
						completion: Completion,
						from: number,
						to: number,
					) => {
						view.dispatch({
							changes: {
								from,
								to,
								insert: relativePath,
							},
							selection: {
								anchor: from + relativePath.length,
							},
						});
					},
					boost: this.getPathScore(relativePath, fileName, partialPath),
				};
			});
	}

	private getPathScore(
		relativePath: string,
		fileName: string,
		partialPath: string,
	): number {
		if (!partialPath) return 0;

		const partial = partialPath.toLowerCase();
		const relative = relativePath.toLowerCase();
		const name = fileName.toLowerCase();

		if (relative === partial) return 100;
		if (name === partial) return 90;
		if (relative.startsWith(partial)) return 80;
		if (name.startsWith(partial)) return 70;
		if (relative.includes(partial)) return 40;
		if (name.includes(partial)) return 30;

		return 0;
	}

	private getRelativePath(currentFilePath: string, targetPath: string): string {
		if (!currentFilePath) return targetPath;

		const currentDir = currentFilePath.includes('/')
			? currentFilePath.substring(0, currentFilePath.lastIndexOf('/'))
			: '';

		if (!currentDir) return targetPath;

		const fromParts = currentDir.split('/').filter(Boolean);
		const toParts = targetPath.split('/').filter(Boolean);

		let commonLength = 0;
		while (
			commonLength < fromParts.length &&
			commonLength < toParts.length &&
			fromParts[commonLength] === toParts[commonLength]
		) {
			commonLength++;
		}

		const upLevels = fromParts.length - commonLength;
		const relativeParts = [
			...Array(upLevels).fill('..'),
			...toParts.slice(commonLength),
		];

		const relativePath = relativeParts.join('/');

		if (!relativePath) {
			return targetPath.substring(targetPath.lastIndexOf('/') + 1);
		}

		if (!relativePath.startsWith('.') && !relativePath.startsWith('/')) {
			return relativePath;
		}

		return relativePath;
	}

	private getValidFor(currentFilePath: string): RegExp {
		if (isLatexFile(currentFilePath)) return /^[^}]*$/;
		if (isTypstFile(currentFilePath)) return /^[^")]*$/;
		if (isMarkdownFile(currentFilePath)) return /^[^)\s"']*$/;

		return /^[^\s]*$/;
	}
}
